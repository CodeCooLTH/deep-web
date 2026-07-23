import { NextRequest } from "next/server";
import * as v from "valibot";
import { AssignHousekeeperSchema, SetHousekeepingStatusSchema } from "@/lib/validations";
import { requireLodgingShop, jsonNoStore } from "@/lib/shop-api-guard";
import {
  assignHousekeeper,
  setHousekeepingStatus,
  HousekeeperNotFoundError,
  BookingCancelledError,
  InvalidHousekeepingStatusError,
} from "@/services/housekeeping.service";
import { BookingNotFoundError } from "@/services/booking.service";

/**
 * PATCH /api/shops/current/bookings/[token]/housekeeping (API.md #13)
 * body { housekeeperId } = มอบหมาย/ยกเลิกมอบหมาย, body { status } = อัปเดตสถานะงาน
 */
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await requireLodgingShop();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => null);

  try {
    // แยก 2 การกระทำด้วยรูป body — status มาก็อัปเดตสถานะ, ไม่งั้นถือเป็นมอบหมาย
    if (body && "status" in body) {
      const parsed = v.safeParse(SetHousekeepingStatusSchema, body);
      if (!parsed.success) return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
      const updated = await setHousekeepingStatus(ctx.shopId, token, parsed.output.status);
      return jsonNoStore({ housekeepingStatus: updated.housekeepingStatus });
    }
    const parsed = v.safeParse(AssignHousekeeperSchema, body ?? {});
    if (!parsed.success) return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
    const updated = await assignHousekeeper(ctx.shopId, token, parsed.output.housekeeperId);
    return jsonNoStore({ housekeeperId: updated.housekeeperId, housekeepingStatus: updated.housekeepingStatus });
  } catch (e: unknown) {
    if (e instanceof BookingCancelledError) return jsonNoStore({ error: "BOOKING_CANCELLED" }, { status: 409 });
    if (e instanceof HousekeeperNotFoundError) return jsonNoStore({ error: "HOUSEKEEPER_NOT_FOUND" }, { status: 404 });
    if (e instanceof InvalidHousekeepingStatusError) return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
    if (e instanceof BookingNotFoundError) return jsonNoStore({ error: "NOT_FOUND" }, { status: 404 });
    console.error("[PATCH bookings/:token/housekeeping] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
