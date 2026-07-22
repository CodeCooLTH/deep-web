import { NextRequest } from "next/server";
import { requireLodgingShop, jsonNoStore } from "@/lib/shop-api-guard";
import {
  confirmBooking,
  serializeBooking,
  BookingNotFoundError,
  BookingNotEditableError,
  SlipRequiredError,
} from "@/services/booking.service";

/**
 * POST /api/shops/current/bookings/[token]/confirm — เจ้าของยืนยันหลังตรวจสลิป (API.md #9)
 *
 * IMPORTANT: นี่คือทางเดียวที่ยืนยันการจองได้ — /api/orders/[token]/confirm เดิม
 * (ที่ผู้ซื้อเป็นคนกด) ถูก guard ให้ปฏิเสธ type=BOOKING แล้ว มิฉะนั้นผู้จองจะยืนยัน
 * การจองตัวเองได้โดยไม่ต้องโอนเงิน (TFR-006)
 */
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await requireLodgingShop();
  if ("error" in ctx) return ctx.error;

  try {
    const order = await confirmBooking(ctx.shopId, token);
    return jsonNoStore(serializeBooking(order));
  } catch (e: unknown) {
    if (e instanceof SlipRequiredError) return jsonNoStore({ error: "SLIP_REQUIRED" }, { status: 409 });
    if (e instanceof BookingNotEditableError) return jsonNoStore({ error: "INVALID_TRANSITION" }, { status: 409 });
    if (e instanceof BookingNotFoundError) return jsonNoStore({ error: "NOT_FOUND" }, { status: 404 });
    console.error("[POST bookings/:token/confirm] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
