import { NextResponse } from "next/server";

import { autoConfirmPickup } from "@/services/order-pickup-auto-confirm.service";

// batch สูงสุด 500 ใบต่อรอบ — เผื่อเวลามากกว่า default 10s ของ Hobby (มิเรอร์ auto-confirm-delivered)
export const maxDuration = 60;

/**
 * GET /api/cron/auto-confirm-pickup — Vercel Cron ทุก 6 ชม. (server-to-server เท่านั้น)
 * feature 00062 (FR-PKP-04, U10)
 *
 * ปิดคำสั่งซื้อนัดรับที่ร้านกด "มอบสินค้าแล้ว" และพ้น grace period PICKUP_AUTOCONFIRM_HOURS
 * (order-pickup.ts) โดยไม่มีข้อพิพาทค้าง
 *
 * Auth: Authorization: Bearer {CRON_SECRET} เท่านั้น — pattern เดียวกับ auto-confirm-delivered/route.ts เป๊ะ
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
    const result = await autoConfirmPickup();
    // log ไว้เสมอ — งานเบื้องหลังที่ไม่มีใครดูผลลัพธ์คืองานที่พังแล้วไม่มีใครรู้
    console.log("[auto-confirm-pickup] เสร็จรอบ", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[auto-confirm-pickup] ล้มทั้งรอบ", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
