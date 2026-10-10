import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import * as v from "valibot";
import { SetAppointmentSchema } from "@/lib/validations";
import { jsonNoStore } from "@/lib/shop-api-guard";
import { requireShopCapability } from "@/lib/shop-capability";
import { prisma } from "@/lib/prisma";
import { canEditOrderAs } from "@/lib/order-role-rules";
import { isOrderUnpaid } from "@/lib/order-payment-state";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import { setOrRescheduleAppointment } from "@/services/appointment.service";

/**
 * PATCH /api/orders/[token]/appointment — ตั้งนัดให้ออเดอร์ที่ยังไม่มีนัด หรือเลื่อนนัดที่มีอยู่
 *
 * feature 00024 Service Appointment Booking (API.md §4.7 / FR-RSV-08)
 *
 * สิทธิ์: ฝั่งร้าน — เท่ากับสิทธิ์จัดการออเดอร์ที่ผู้ใช้มีอยู่ (BR-RSV-25)
 * อยู่ใต้ /api/orders/[token]/ เดียวกับ action ของลูกค้า ตาม precedent ที่มีอยู่แล้ว
 * (ship = ร้าน, confirm = ลูกค้า) — แยกกันด้วย authz ไม่ใช่ด้วยพาธ
 *
 * IMPORTANT: การเลื่อนทุกครั้งเขียนแถวประวัติสะสมเสมอ ไม่ทับของเดิม (BR-RSV-30)
 */

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
    /**
   * `?shopId=` — ถูกเรียกจากกล่องแชทตั้งแต่ feature 00050 ซึ่งเปิดเธรดของร้าน B ได้ขณะ
   * active อยู่ร้าน A (BR-UNI-07) ⇒ ถ้าเชื่อ `activeShopId` อย่างเดียวจะหาไม่เจอแล้วผู้ใช้
   * ได้ปุ่มที่กดกี่ครั้งก็ไม่ผ่าน · ไม่ส่งมา = พฤติกรรมเดิมทุกประการ
   */
  const gate = await requireShopCapability(await getServerSession(authOptions), "O3", { shopId: request.nextUrl.searchParams.get("shopId") });
  if (!gate.ok) return gate.response;
  const ctx = gate;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(SetAppointmentSchema, body ?? {});
  if (!parsed.success) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const start = new Date(parsed.output.start);
  const end = new Date(parsed.output.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    // C-7: เลื่อนนัด = แก้บิล — BILLING ล้วนทำได้เฉพาะบริการที่ยังไม่ชำระ (เงื่อนไขเดียวกับ updateOrder / หน้าแก้ไข)
    // ไม่พบออเดอร์ = ปล่อยให้ service ตอบ 404 ตามเดิม
    const o = await prisma.order.findFirst({
      where: { publicToken: token, shopId: ctx.shopId },
      select: {
        type: true, totalAmount: true, paymentConfirmedAt: true, codReceivedAt: true,
        payments: { select: { kind: true, amount: true, voidedAt: true } },
      },
    });
    if (o && !canEditOrderAs(gate.roles, { type: o.type, unpaid: isOrderUnpaid(o) })) return forbiddenRoleResponse();

    const result = await setOrRescheduleAppointment({
      shopId: ctx.shopId,
      orderToken: token,
      input: { resourceId: parsed.output.resourceId, start, end },
      actorUserId: ctx.userId,
      reason: parsed.output.reason ?? null,
    });

    return jsonNoStore({
      appointment: {
        resource: result.resource,
        start: result.serviceStart?.toISOString() ?? null,
        end: result.serviceEnd?.toISOString() ?? null,
        appointmentStatus: result.appointmentStatus,
        rescheduleCount: result.rescheduleCount,
      },
    });
  } catch (e: unknown) {
    const mapped = appointmentErrorResponse(e);
    if (mapped) return mapped;
    console.error(
      "[PATCH /api/orders/[token]/appointment] shopId:",
      ctx.shopId,
      e instanceof Error ? e.message : e,
    );
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
