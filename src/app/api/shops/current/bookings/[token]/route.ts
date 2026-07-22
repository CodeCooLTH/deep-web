import { NextRequest } from "next/server";
import * as v from "valibot";
import { UpdateBookingSchema } from "@/lib/validations";
import { requireLodgingShop, jsonNoStore } from "@/lib/shop-api-guard";
import {
  updateBooking,
  serializeBooking,
  RoomUnavailableError,
  BookingNotFoundError,
  BookingNotEditableError,
  DepositLockedError,
  DepositExceedsTotalError,
  InvalidDateRangeError,
} from "@/services/booking.service";

/** PATCH /api/shops/current/bookings/[token] — แก้มัดจำ/ช่วงวัน ก่อนผู้จองแนบสลิป (API.md #8) */
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await requireLodgingShop();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(UpdateBookingSchema, body ?? {});
  if (!parsed.success) return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });

  try {
    const order = await updateBooking(ctx.shopId, token, parsed.output);
    return jsonNoStore(serializeBooking(order));
  } catch (e: unknown) {
    if (e instanceof DepositLockedError) return jsonNoStore({ error: "DEPOSIT_LOCKED" }, { status: 409 });
    if (e instanceof RoomUnavailableError) {
      return jsonNoStore({ error: "ROOM_UNAVAILABLE", conflict: e.conflict }, { status: 409 });
    }
    if (e instanceof BookingNotEditableError) return jsonNoStore({ error: "BOOKING_NOT_EDITABLE" }, { status: 409 });
    if (e instanceof BookingNotFoundError) return jsonNoStore({ error: "NOT_FOUND" }, { status: 404 });
    if (e instanceof DepositExceedsTotalError) return jsonNoStore({ error: "DEPOSIT_EXCEEDS_TOTAL" }, { status: 400 });
    if (e instanceof InvalidDateRangeError) return jsonNoStore({ error: "INVALID_DATE_RANGE" }, { status: 400 });
    console.error("[PATCH bookings/:token] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
