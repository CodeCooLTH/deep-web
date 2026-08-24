import { NextResponse } from "next/server";
import { sweepOutbox } from "@/services/chat-outbox.service";

// ตัวกวาดอาจต้องระบายหลายห้องในรอบเดียว — กัน default timeout เหมือน cron ตัวอื่นของโปรเจกต์
export const maxDuration = 60;

/**
 * GET /api/cron/chat-outbox — Vercel Cron ทุก 1 นาที
 * (CR 2026-08-23 ของ feature 00018 — `EXTENSIONS-2026-08-23-outbound-queue.md`)
 *
 * 🛑 นี่คือ **ตัวการันตีของทั้งฟีเจอร์ ไม่ใช่งานเสริม** — ต่างจาก cron ตัวอื่นในโฟลเดอร์นี้ที่เป็น
 * "ชั้นสุดท้ายที่ไม่ควรมีงานตกมาถึง" เพราะเส้นทางคิวขาออก **ไม่มี auto-retry** (D-2): ยิงครั้งเดียว
 * ต่อแถว. แถวที่ `after()` ไม่ได้รัน (ผู้ขายกดส่งแล้วปิดแอป = อาการเดียวกับบั๊กต้นเรื่อง) จะค้าง
 * `QUEUED` ตลอดกาลถ้าไม่มีใครมาหยิบ — จอหมุน "กำลังส่ง" ถาวร กดลองใหม่ไม่ได้ (ปุ่มมีเฉพาะสถานะ
 * FAILED) กดยกเลิกไม่ได้ และกติกา "claim ค้างเกินเพดาน → ปิดเป็น FAILED" ก็อยู่ใน `sweepOutbox`
 * ตัวเดียวกันนี้ ⇒ ไม่มีวันกลายเป็น FAILED ให้กดซ้ำได้ด้วย
 *
 * ทำไมทุก 1 นาที (ต่างจาก cron รายวันตัวอื่น): ไม่มี auto-retry มาช่วยกลบความช้า และเพดาน claim
 * ค้างคือ `STALE_CLAIM_MS` = 3 นาที — ความถี่ที่ห่างกว่านั้นทำให้แถวที่ค้างจริงถูกปล่อยทิ้งนานกว่า
 * เพดานของตัวเอง (ถ้าต้องถอยเป็นทุก 2 นาที ต้องขยับ `STALE_CLAIM_MS` เป็น 5 นาทีคู่กัน — D-8)
 *
 * ชั้นอื่นของกลไกเดียวกัน: ชั้น 1 `after()` ทันทีหลังตอบ client · ชั้น 2 กวาดฉวยโอกาสตอน webhook
 * ของ Meta/LINE เข้า (`owner: 'sweep'`)
 */
export async function GET(request: Request) {
  // SECURITY: env ว่าง = reject ทันที ห้ามปล่อยให้เทียบกับ "Bearer undefined" แล้วผ่าน
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // limit = จำนวน **ห้อง** ไม่ใช่จำนวนข้อความ (แต่ละห้องถูกระบายจนหมดคิวของห้องนั้น)
  const { rooms, sent, failed, stale } = await sweepOutbox({ owner: "cron", limit: 50 });
  const summary = { rooms, sent, failed, stale };

  // 🛑 log ตัวเลขทุกรอบเสมอ แม้เป็นศูนย์ — ค่า `stale` ที่สูงผิดปกติแปลว่ามีคนตายกลางทางบ่อย
  // ซึ่งเป็น **สัญญาณของบั๊กชั้นบน** (after() ถูกตัดกลางคัน/ฟังก์ชันหมดอายุ) ไม่ใช่แค่สถิติ
  // และค่า `sent` ที่ไม่เป็นศูนย์เรื่อย ๆ แปลว่าชั้น 1/ชั้น 2 ไม่ได้ทำงานตามที่ออกแบบไว้
  //
  // log/คืนเฉพาะ **ตัวเลข** ไม่ใช่ `staleRows` ทั้งก้อน — ในนั้นมี conversationId/shopId ราย
  // แถวซึ่งมีไว้ให้ผู้เรียกในโปรเซสเดียวกันแจ้งเตือนต่อ (Task 9) ไม่ใช่ของที่ควรไหลออก HTTP
  console.log("[chat-outbox]", JSON.stringify(summary));

  return NextResponse.json(summary);
}
