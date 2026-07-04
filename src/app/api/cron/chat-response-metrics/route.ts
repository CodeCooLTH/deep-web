import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyShopChatMetrics } from "@/services/chat-metrics.service";

// กัน Vercel Hobby default timeout (10s) — batch recompute ทุกร้าน active อาจใช้เวลานานกว่านั้นถ้าร้านเยอะ
export const maxDuration = 60;

/**
 * GET /api/cron/chat-response-metrics — Vercel Cron trigger รายวัน (server-to-server เท่านั้น)
 * (feature 00011 ext #2 response-rate-metric.md, S-24)
 *
 * Auth: Authorization: Bearer {CRON_SECRET} เท่านั้น — ไม่มี session/JWT
 * loop ร้าน active (deletedAt=null — ไม่รวม soft-deleted/purged) → recompute response-rate/response-time
 * จาก Deep Chat data (Conversation/ChatMessage) → denormalize ลง Shop 4 field (FR-RESP-07)
 * ดู API.md / SDS.md ของ feature 00011 ext #2 + TD-002 (proxy.ts exclude /api/cron/* จาก CSRF Origin-check)
 */
export async function GET(request: Request) {
  // 🛑 SECURITY (จาก security review S-6 pattern เดิม): CRON_SECRET env ต้องตั้งค่าไว้เสมอ
  // ถ้า env ว่าง/undefined ต้อง reject ทันที — ห้ามปล่อยให้ header===undefined
  // เทียบกับ `Bearer undefined` แล้วผ่าน (auth bypass เมื่อ deploy ลืมตั้ง env)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // ไม่ leak รายละเอียดใด ๆ ใน response — ตอบเหมือนกรณี header ไม่ตรงทุกประการ
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const authHeader = request.headers.get("authorization");
  // เทียบแบบ exact string เต็ม ("Bearer " + secret) — ไม่ตัด/parse บางส่วน กัน bypass
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ร้าน active ทั้งหมด — deletedAt=null ครอบคลุมทั้ง soft-deleted และ purged (purge เซ็ต deletedAt
  // ไว้ก่อนเสมอ ดู Shop.purgedAt schema comment)
  const activeShops = await prisma.shop.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  let ok = 0;
  let failed = 0;

  // per-shop isolation — try/catch แยกทีละร้าน กัน error ของร้านเดียวทำร้านอื่น fail ไปด้วย
  for (const { id: shopId } of activeShops) {
    try {
      await applyShopChatMetrics(shopId);
      ok += 1;
    } catch (e) {
      failed += 1;
      // log ไว้ให้ Controller/DevOps ตรวจ — ไม่มี UI ฝั่งนี้ (server-to-server cron)
      console.error(`[cron/chat-response-metrics] shopId=${shopId} error:`, e);
    }
  }

  return NextResponse.json({
    processed: activeShops.length,
    ok,
    failed,
  });
}
