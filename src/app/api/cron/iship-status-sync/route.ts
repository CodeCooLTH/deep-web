import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { syncShipmentStatuses } from "@/services/iship.service";

/**
 * GET /api/cron/iship-status-sync — Vercel Cron ทุก 15 นาที (server-to-server เท่านั้น)
 * feature 00022 · SRS §22.6
 *
 * ทำไมต้องมี: ก่อนหน้านี้ `syncShipmentStatuses` มีทางเข้าเดียวคือ **เกาะจังหวะที่มีคนเปิด
 * กล่องข้อความ** (`inbox/page.tsx` + `GET /api/chat/conversations`) ⇒ ร้านที่ไม่เปิดแชทเลย
 * สถานะพัสดุไม่เคยอัปเดต และร้านที่เปิดแชทวันละครั้งก็ได้ข้อมูลวันละครั้ง — ทั้งที่ตัว service
 * กันความถี่ตัวเองไว้ 15 นาทีอยู่แล้ว คือมันพร้อมถูกเรียกถี่กว่านั้นมาตั้งแต่แรก
 *
 * 🛑 cron ตัวนี้ **ไม่ได้แก้** ปัญหาพัสดุที่หลุดหน้าต่าง `query_orders` 6 วัน — อันนั้นเป็นเรื่อง
 * *ขอบเขตข้อมูลที่ขอ* ไม่ใช่ *ความถี่ที่ถาม* แก้ด้วย `pickStaleParcelsForLookup` (SRS §22.3)
 * ถ้าวันหนึ่งมีคนถอดตัวนั้นออกแล้วคิดว่า "มี cron แล้วนี่" สถานะจะกลับไปค้างเหมือนเดิมทันที
 *
 * ไม่ใช้ `force: true` โดยเจตนา — ให้ throttle 15 นาทีของ service เป็นเจ้าของความถี่ที่เดียว
 * ร้านที่เพิ่ง sync ไปจากการเปิดแชทจะถูกข้ามในรอบนี้ (คืน 0) ซึ่งถูกแล้ว ไม่ใช่การพลาด
 *
 * Auth: Authorization: Bearer {CRON_SECRET} — pattern เดียวกับ cron อีก 7 ตัวในโปรเจกต์
 * (proxy.ts ยกเว้น /api/cron/* จาก CSRF Origin-check อยู่แล้ว)
 */

/**
 * เพดานร้านต่อรอบ — คุมเวลาทำงานให้จบก่อน maxDuration
 *
 * 1 ร้าน = 1 คำขอ `query_orders` + ไม่เกิน 8 คำขอ `get_order` (STALE_LOOKUP_MAX_PER_ROUND)
 * เรียงจากร้านที่ค้างนานที่สุดก่อน ⇒ ถ้าร้านเกินเพดาน ร้านที่เหลือได้คิวในรอบถัดไปเสมอ
 * ไม่มีร้านไหนอดถาวร (ตัวเรียงคือ `statusSyncedAt` ซึ่ง service เป็นคนอัปเดตให้เอง)
 */
const MAX_SHOPS_PER_RUN = 40;

export const maxDuration = 120;

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
    const accounts = await prisma.shopShippingAccount.findMany({
      where: { status: "ACTIVE" },
      // ร้านที่ยังไม่เคย sync เลยต้องมาก่อน — Postgres เรียง NULL ไว้ท้ายสุดใน ASC ตามค่าตั้งต้น
      // ซึ่งจะทำให้ร้านที่เพิ่งเชื่อม iShip เป็นกลุ่มสุดท้ายที่ได้คิว (กลับหัวกับที่ควรเป็น)
      orderBy: { statusSyncedAt: { sort: "asc", nulls: "first" } },
      take: MAX_SHOPS_PER_RUN,
      select: { shopId: true },
    });

    let shopsChanged = 0;
    let rowsChanged = 0;
    let failed = 0;

    for (const { shopId } of accounts) {
      try {
        const changed = await syncShipmentStatuses(shopId);
        if (changed > 0) {
          shopsChanged += 1;
          rowsChanged += changed;
        }
      } catch (e) {
        // ร้านเดียวล้มต้องไม่ล้มทั้งรอบ — ร้านที่เหลือยังต้องได้อัปเดต
        failed += 1;
        console.error(
          "[iship-cron] sync ล้มเหลว",
          shopId,
          e instanceof Error ? e.message : e,
        );
      }
    }

    const result = { shops: accounts.length, shopsChanged, rowsChanged, failed };
    // log ไว้เสมอ — งานเบื้องหลังที่ไม่มีใครดูผลลัพธ์คืองานที่พังแล้วไม่มีใครรู้
    console.log("[iship-cron] เสร็จรอบ", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[iship-cron] ล้มทั้งรอบ", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
