import { NextRequest } from "next/server";
import * as v from "valibot";
import { BookingQuoteSchema } from "@/lib/validations";
import { requireLodgingShop, jsonNoStore } from "@/lib/shop-api-guard";
import {
  quoteBooking,
  BookingRoomNotFoundError,
  InvalidDateRangeError,
} from "@/services/booking.service";

/**
 * POST /api/shops/current/bookings/quote — คำนวณจำนวนคืน/ยอดรวม/มัดจำ (API.md #6)
 * ไม่เขียนฐานข้อมูล ไม่ล็อกคิว — ใช้ให้เจ้าของเห็นยอดก่อนกดสร้างจริง
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ctx = await requireLodgingShop();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(BookingQuoteSchema, body ?? {});
  if (!parsed.success) return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });

  try {
    const q = await quoteBooking(ctx.shopId, parsed.output.roomId, parsed.output.checkIn, parsed.output.checkOut);
    return jsonNoStore({
      nights: q.nights,
      pricePerNight: q.pricePerNight,
      totalAmount: q.totalAmount,
      depositMode: q.depositMode,
      depositValue: q.depositValue,
      depositAmount: q.depositAmount,
    });
  } catch (e: unknown) {
    if (e instanceof BookingRoomNotFoundError) return jsonNoStore({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    if (e instanceof InvalidDateRangeError) return jsonNoStore({ error: "INVALID_DATE_RANGE" }, { status: 400 });
    console.error("[POST bookings/quote] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
