import { NextRequest } from "next/server";
import * as v from "valibot";
import { AvailabilityQuerySchema } from "@/lib/validations";
import { requireLodgingShop, jsonNoStore } from "@/lib/shop-api-guard";
import { getAvailability, parseDateOnly } from "@/services/booking.service";

/**
 * GET /api/shops/current/rooms/availability — ปฏิทินว่าง/ไม่ว่าง (API.md #5)
 *
 * ช่วงวันที่กันคิวคือ [checkIn, checkOut) — ผู้เรียกต้องเรนเดอร์ว่าวันเช็คเอาท์ "ว่าง"
 * (BR-LODG-31) จอง 5-8 กันวันที่ 5,6,7 เท่านั้น
 *
 * PII: คืนชื่อผู้จองเท่านั้น ไม่คืนเบอร์โทรบนหน้าปฏิทิน
 */
export const dynamic = "force-dynamic";

const MAX_RANGE_DAYS = 92;

export async function GET(request: NextRequest) {
  const ctx = await requireLodgingShop();
  if ("error" in ctx) return ctx.error;

  const sp = request.nextUrl.searchParams;
  const parsed = v.safeParse(AvailabilityQuerySchema, {
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    ...(sp.get("roomId") ? { roomId: sp.get("roomId") } : {}),
  });
  if (!parsed.success) return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });

  const { from, to, roomId } = parsed.output;
  const days = (parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / 86_400_000;
  // จำกัดช่วงเพื่อไม่ให้ query ดึงทั้งปีมาเรนเดอร์ทีเดียว
  if (days <= 0 || days > MAX_RANGE_DAYS) {
    return jsonNoStore({ error: "INVALID_DATE_RANGE" }, { status: 400 });
  }

  try {
    const rooms = await getAvailability(ctx.shopId, from, to, roomId);
    return jsonNoStore({ rooms });
  } catch (e: unknown) {
    console.error("[GET rooms/availability] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
