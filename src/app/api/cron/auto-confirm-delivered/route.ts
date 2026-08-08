import { NextResponse } from "next/server";

import { autoConfirmDelivered } from "@/services/order-auto-confirm.service";

// batch สูงสุด 500 ใบต่อรอบ + recalc trust ต่อใบ — เผื่อเวลามากกว่า default 10s ของ Hobby
export const maxDuration = 60;

/**
 * GET /api/cron/auto-confirm-delivered — Vercel Cron รายวัน (server-to-server เท่านั้น)
 * feature 00039 (FR-OSM-01 / TFR-005)
 *
 * ปิดคำสั่งซื้อที่ขนส่งยืนยันว่าส่งถึงแล้วและพ้นระยะให้ผู้ซื้อทักท้วง 7 วัน
 *
 * Auth: Authorization: Bearer {CRON_SECRET} เท่านั้น — pattern เดียวกับ cron อีก 5 ตัวในโปรเจกต์
 * (proxy.ts ยกเว้น /api/cron/* จาก CSRF Origin-check อยู่แล้ว)
 */
export async function GET(request: Request) {
  // 🛑 env ว่าง = ปฏิเสธทันที ห้ามปล่อยให้ `Bearer undefined` ผ่านตอน deploy ลืมตั้ง env
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const authHeader = request.headers.get("authorization");
  // เทียบสตริงเต็ม ไม่ parse บางส่วน
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await autoConfirmDelivered();
    // log ไว้เสมอ — งานเบื้องหลังที่ไม่มีใครดูผลลัพธ์คืองานที่พังแล้วไม่มีใครรู้
    console.log("[auto-confirm] เสร็จรอบ", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[auto-confirm] ล้มทั้งรอบ", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
