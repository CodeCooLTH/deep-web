import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import * as v from "valibot";
import { AppointmentOutcomeSchema } from "@/lib/validations";
import { jsonNoStore } from "@/lib/shop-api-guard";
import { requireShopCapability } from "@/lib/shop-capability";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";
import { memberCanCloseJob } from "@/lib/shop-permissions";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import { serviceJobErrorResponse } from "@/lib/service-job-api";
import { closeServiceJob } from "@/services/service-job.service";

/**
 * POST /api/orders/[token]/appointment/outcome — ทำเครื่องหมาย "ให้บริการแล้ว" / "ไม่มาตามนัด"
 *
 * feature 00024 Service Appointment Booking (API.md §4.8 / FR-RSV-09)
 *
 * IMPORTANT: endpoint นี้ห้ามแตะ Order.status (BR-RSV-33) และห้ามกระทบ Trust Score (BR-RSV-35)
 *
 * feature 00073 — ตั้งแต่นี้ = "ปิดงาน" แบบไม่บันทึกเงิน (ปุ่มเดิมในหน้างาน/บอร์ดนัด/แชท ยังยิงที่นี่)
 * ⇒ ได้วันปิดงานเหมือนกด "ปิดงาน" ทุกประการ · ไม่มาตามนัด = เก็บมัดจำ (ค่าตั้งต้น มติ D1)
 * ทางเต็ม (รับเงิน/คืนมัดจำ) อยู่ที่ POST /api/orders/[token]/close
 */

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  /**
   * `?shopId=` — ปุ่ม "เข้ารับบริการ" ถูกกดจากกล่องแชทตั้งแต่ feature 00050 ซึ่งเปิดเธรดของ
   * ร้าน B ได้ขณะ active อยู่ร้าน A (BR-UNI-07) ⇒ ถ้าเชื่อ `activeShopId` อย่างเดียว
   * `setAppointmentOutcome` จะหาออเดอร์ไม่เจอแล้วผู้ใช้ได้ปุ่มที่กดกี่ครั้งก็ไม่ผ่าน
   * ไม่ส่งมา = พฤติกรรมเดิมทุกประการ (หน้า `/orders/[token]` และปฏิทินยังเรียกแบบเดิม)
   */
  const gate = await requireShopCapability(await getServerSession(authOptions), "O4", { shopId: request.nextUrl.searchParams.get("shopId") });
  if (!gate.ok) return gate.response;
  const ctx = gate;
  // 00086 S-5 (FR-005) — ทางปิดงานที่ 2 (ไม่มีเงิน) ต้องกั้นเท่ากับ /close: ร้านบริการ = เจ้าของ/ผู้จัดการ/ธง canCloseJob
  // ร้าน/ธงมาจากแถวที่ด่านเพิ่ง resolve (ร้านเดียวกับ ctx.shopId ที่ส่งเข้า closeServiceJob)
  if (!memberCanCloseJob(ctx.active.shop, ctx.roles, ctx.active)) return forbiddenRoleResponse();

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(AppointmentOutcomeSchema, body ?? {});
  if (!parsed.success) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const result = await closeServiceJob({
      shopId: ctx.shopId,
      orderToken: token,
      actorUserId: ctx.userId,
      // 00086 — ด่านช่างล้วน (งานของตัวเอง + ทำเสร็จแล้ว) อยู่ใน closeServiceJob ⇒ ทางปิดงานทั้งสองทางกั้นเท่ากัน
      actorRoles: ctx.roles,
      outcome: parsed.output.outcome === "NO_SHOW" ? "NO_SHOW" : "SERVED",
      deposit: "KEEP",
    });
    return jsonNoStore({ appointmentStatus: result.appointmentStatus, serviceClosedAt: result.serviceClosedAt });
  } catch (e: unknown) {
    const mapped = serviceJobErrorResponse(e) ?? appointmentErrorResponse(e);
    if (mapped) return mapped;
    console.error(
      "[POST /api/orders/[token]/appointment/outcome] shopId:",
      ctx.shopId,
      e instanceof Error ? e.message : e,
    );
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
