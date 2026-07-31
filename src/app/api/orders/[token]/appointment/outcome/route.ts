import { NextRequest } from "next/server";
import * as v from "valibot";
import { AppointmentOutcomeSchema } from "@/lib/validations";
import { requireShopMember, jsonNoStore } from "@/lib/shop-api-guard";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import { setAppointmentOutcome } from "@/services/appointment.service";

/**
 * POST /api/orders/[token]/appointment/outcome — ทำเครื่องหมาย "ให้บริการแล้ว" / "ไม่มาตามนัด"
 *
 * feature 00024 Service Appointment Booking (API.md §4.8 / FR-RSV-09)
 *
 * IMPORTANT: endpoint นี้ห้ามแตะ Order.status (BR-RSV-33) และห้ามกระทบ Trust Score
 * (BR-RSV-35) — การไม่มาตามนัดถูกบันทึกเป็นข้อมูลเฉย ๆ ไม่หักคะแนนลูกค้า
 * ถ้าร้านต้องการยกเลิกออเดอร์ด้วย ต้องกดยกเลิกออเดอร์แยกต่างหากตามนโยบายร้าน
 */

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(AppointmentOutcomeSchema, body ?? {});
  if (!parsed.success) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const result = await setAppointmentOutcome({
      shopId: ctx.shopId,
      orderToken: token,
      outcome: parsed.output.outcome,
    });
    return jsonNoStore({ appointmentStatus: result.appointmentStatus });
  } catch (e: unknown) {
    const mapped = appointmentErrorResponse(e);
    if (mapped) return mapped;
    console.error(
      "[POST /api/orders/[token]/appointment/outcome] shopId:",
      ctx.shopId,
      e instanceof Error ? e.message : e,
    );
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
