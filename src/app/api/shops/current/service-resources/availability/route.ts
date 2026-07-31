import { NextRequest } from "next/server";
import { requireShopMember, jsonNoStore } from "@/lib/shop-api-guard";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import { getResourceAvailability } from "@/services/appointment.service";

/**
 * GET /api/shops/current/service-resources/availability — ช่วงที่ถูกจองแล้วของทรัพยากรหนึ่งหน่วย
 *
 * feature 00024 Service Appointment Booking (API.md §4.4 / TFR-005)
 *
 * Query: resourceId (บังคับ), from (ISO), to (ISO)
 *
 * IMPORTANT: ผลลัพธ์ใช้ "แสดงผลเท่านั้น" ไม่ใช่กลไกตัดสิน — ระหว่างที่ผู้ใช้ดูอยู่
 * อาจมีคนจองแทรกเข้ามาได้เสมอ ตัวตัดสินคือ EXCLUDE constraint ตอนบันทึกจริง
 * (BR-RSV-18) ห้ามให้ UI ใช้ค่านี้ตัดสินใจแทนการเรียก API บันทึก
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  const sp = request.nextUrl.searchParams;
  const resourceId = sp.get("resourceId");
  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");
  if (!resourceId || !fromRaw || !toRaw) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const result = await getResourceAvailability({
      shopId: ctx.shopId,
      resourceId,
      from,
      to,
    });
    return jsonNoStore({
      resourceId: result.resourceId,
      capacity: result.capacity,
      busy: result.busy.map((b) => ({
        start: b.start.toISOString(),
        end: b.end.toISOString(),
      })),
    });
  } catch (e: unknown) {
    const mapped = appointmentErrorResponse(e);
    if (mapped) return mapped;
    console.error(
      "[GET /api/shops/current/service-resources/availability] shopId:",
      ctx.shopId,
      e instanceof Error ? e.message : e,
    );
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
