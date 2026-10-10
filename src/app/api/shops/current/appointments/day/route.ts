import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/shop-api-guard";
import { requireShopCapability } from "@/lib/shop-capability";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import { thaiDateBounds } from "@/lib/appointment-day";
import { listAppointmentsForDay } from "@/services/appointment.service";
import { can, moneyLevel } from "@/lib/shop-permissions";
import { toNoMoneyAppointmentDay } from "@/lib/order-view-by-level";

/**
 * GET /api/shops/current/appointments/day — นัดของ "หนึ่งวัน" พร้อมข้อมูลติดต่อลูกค้า
 *
 * feature 00024 ส่วนขยาย 2026-08-11 (การ์ดคิวงานรายวัน: ช่องทางที่มา · รูปลูกค้า · เบอร์โทร)
 *
 * Query: date (YYYY-MM-DD ตามปฏิทินไทย, บังคับ), resourceId (ไม่บังคับ)
 *
 * 🛑 ทำไมรับ `date` ไม่ใช่ `from`/`to` แบบ endpoint พี่ของมัน: endpoint นี้คืน **เบอร์ลูกค้า**
 * การรับช่วงเวลาอิสระแปลว่าใครก็ขอทั้งปีในคำขอเดียวได้ การรับวันเดียวทำให้เพดานถูกบังคับด้วย
 * *รูปร่างของ input* ไม่ใช่ด้วยความตั้งใจของผู้เรียก (เพดานที่บังคับไม่ได้ = เพดานที่ไม่มีอยู่จริง —
 * บทเรียน upload-body-size-limit.md)
 *
 * 🛑 TFR-010 ฉบับแก้ 2026-08-11: หน้า /queues อยู่ใต้ client layout → ทุก field ที่คืนไปถูก
 * serialize เข้า flight payload. เดิมข้อกำหนดคือ "ปฏิทินไม่ต้องการเบอร์" ซึ่งเลิกจริงแล้วเมื่อ
 * การ์ดรายวันต้องให้ผู้ขายโทรหาลูกค้าได้ — สิ่งที่ยังบังคับเต็มคือ **ตัดที่ server boundary**:
 * อีเมลยังไม่คืน และคำขอระดับเดือน (route แม่) ยังไม่มีเบอร์เหมือนเดิม
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireShopCapability(await getServerSession(authOptions), "Q1");
  if (!gate.ok) return gate.response;
  const ctx = gate;

  const sp = request.nextUrl.searchParams;
  const date = sp.get("date");
  if (!date) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  // ขอบวันตามปฏิทินไทยจาก SSOT เดียวกับที่ไทล์ "นัดวันนี้" ใช้ — ห้ามตัดวันเองที่นี่
  const bounds = thaiDateBounds(date);
  if (!bounds) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const items = await listAppointmentsForDay({
      shopId: ctx.shopId,
      from: bounds.from,
      to: bounds.to,
      resourceId: sp.get("resourceId"),
    });
    // ช่าง (ระดับเงิน NONE): ไม่ส่งยอด/มัดจำ · ห้องแชทเฉพาะผู้มี H1 (00071 P3 · S-15)
    const noMoney = moneyLevel(gate.roles) === "NONE";
    const canChat = can(gate.roles, "H1");
    return jsonNoStore({
      items: items.map((i) => {
        const row = {
          ...i,
          createdAt: i.createdAt.toISOString(),
          start: i.start.toISOString(),
          end: i.end.toISOString(),
        };
        if (noMoney) return toNoMoneyAppointmentDay(row, { canChat });
        // ไม่มี H1 = ไม่มีปุ่มทักแชท (BILLING ก็เช่นกัน) — null คือ "ไม่มีเธรดให้เปิด" ตาม type ฝั่งจอ
        return canChat ? row : { ...row, conversationId: null };
      }),
    });
  } catch (e: unknown) {
    const mapped = appointmentErrorResponse(e);
    if (mapped) return mapped;
    console.error(
      "[GET /api/shops/current/appointments/day] shopId:",
      ctx.shopId,
      e instanceof Error ? e.message : e,
    );
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
