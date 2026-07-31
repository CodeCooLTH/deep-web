import { NextRequest } from "next/server";
import * as v from "valibot";
import { SetAppointmentSchema } from "@/lib/validations";
import { requireShopMember, jsonNoStore } from "@/lib/shop-api-guard";
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
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

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
