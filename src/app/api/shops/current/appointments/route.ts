import { NextRequest } from "next/server";
import { requireShopMember, jsonNoStore } from "@/lib/shop-api-guard";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import { listAppointments } from "@/services/appointment.service";

/**
 * GET /api/shops/current/appointments — ปฏิทินคิวของร้าน
 *
 * feature 00024 Service Appointment Booking (API.md §4.5 / FR-RSV-04)
 *
 * Query: from (ISO, บังคับ), to (ISO, บังคับ), resourceId (ไม่บังคับ)
 *
 * IMPORTANT: หน้าปฏิทินอยู่ใต้ client layout → ทุก field ที่คืนไปถูก serialize เข้า
 * flight payload ทั้งหมด service จึงคืนเฉพาะที่ปฏิทินใช้จริง (ไม่มีเบอร์/อีเมลลูกค้า)
 * (บทเรียน feedback_rsc_pii_neutralize_at_source)
 *
 * 🛑 คำขอนี้ครอบ **ทั้งเดือน** — ห้ามเติมเบอร์/รูปลูกค้าลงที่นี่เด็ดขาด ไม่ว่าจอไหนจะขอ
 * เพราะมันแปลว่าเบอร์ลูกค้าทั้งเดือน (ร้านที่ยุ่ง 100–200 เบอร์) นอนอยู่ใน flight payload
 * เพื่อแสดงผลวันเดียว. ต้องการข้อมูลติดต่อ → `GET …/appointments/day?date=` ซึ่งรับได้ทีละวัน
 * (TFR-010 ฉบับแก้ 2026-08-11 · API.md §4.5b)
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  const sp = request.nextUrl.searchParams;
  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");
  if (!fromRaw || !toRaw) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const items = await listAppointments({
      shopId: ctx.shopId,
      from,
      to,
      resourceId: sp.get("resourceId"),
    });
    return jsonNoStore({
      items: items.map((i) => ({
        ...i,
        start: i.start.toISOString(),
        end: i.end.toISOString(),
      })),
    });
  } catch (e: unknown) {
    const mapped = appointmentErrorResponse(e);
    if (mapped) return mapped;
    console.error(
      "[GET /api/shops/current/appointments] shopId:",
      ctx.shopId,
      e instanceof Error ? e.message : e,
    );
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
