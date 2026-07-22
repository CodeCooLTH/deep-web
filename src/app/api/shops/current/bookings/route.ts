import { NextRequest } from "next/server";
import * as v from "valibot";
import { CreateBookingSchema } from "@/lib/validations";
import { requireLodgingShop, jsonNoStore } from "@/lib/shop-api-guard";
import {
  createBooking,
  serializeBooking,
  RoomUnavailableError,
  BookingRoomNotFoundError,
  RoomInactiveError,
  InvalidDateRangeError,
  DepositExceedsTotalError,
} from "@/services/booking.service";

/**
 * POST /api/shops/current/bookings — สร้างการจอง + ล็อกคิวทันที (API.md #7)
 *
 * IMPORTANT: ทุก error ที่ service โยนได้ต้องมี catch ที่นี่ครบ มิฉะนั้นตกเป็น 500
 * โดยเฉพาะ RoomUnavailableError ที่ต้องเป็น 409 พร้อมบอกช่วงวันที่ชน
 * (บทเรียน feat 00003 OutOfStockError — feedback_service_error_route_mapping)
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ctx = await requireLodgingShop();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(CreateBookingSchema, body ?? {});
  if (!parsed.success) return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });

  try {
    const order = await createBooking(ctx.shopId, parsed.output);
    return jsonNoStore(serializeBooking(order), { status: 201 });
  } catch (e: unknown) {
    if (e instanceof RoomUnavailableError) {
      // ส่งช่วงวันที่ชนกลับไปด้วย เพื่อให้ผู้ใช้แก้ได้ทันทีโดยไม่ต้องเปิดปฏิทินหาเอง
      return jsonNoStore({ error: "ROOM_UNAVAILABLE", conflict: e.conflict }, { status: 409 });
    }
    if (e instanceof BookingRoomNotFoundError) return jsonNoStore({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    if (e instanceof RoomInactiveError) return jsonNoStore({ error: "ROOM_INACTIVE" }, { status: 400 });
    if (e instanceof InvalidDateRangeError) return jsonNoStore({ error: "INVALID_DATE_RANGE" }, { status: 400 });
    if (e instanceof DepositExceedsTotalError) return jsonNoStore({ error: "DEPOSIT_EXCEEDS_TOTAL" }, { status: 400 });
    console.error("[POST bookings] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
