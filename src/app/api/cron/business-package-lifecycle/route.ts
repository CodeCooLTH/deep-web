import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renewOrLockBusinessPackage } from "@/services/business-package.service";
import { autoSoftDeleteLapsedShops, purgeExpiredShops } from "@/services/business-shop.service";

// กัน Vercel Hobby default timeout (10s) — batch renewal/lifecycle อาจใช้เวลานานกว่านั้นถ้า owner/shop เยอะ
export const maxDuration = 60;

/**
 * POST /api/cron/business-package-lifecycle — Vercel Cron trigger รายวัน (server-to-server เท่านั้น)
 *
 * Auth: Authorization: Bearer {CRON_SECRET} เท่านั้น — ไม่มี session/JWT
 * 3 phase ในคำขอเดียว: renewal → auto-soft-delete (grace หมดอายุ) → purge (tombstone retention หมดอายุ)
 * ดู SDS.md §3.4 / API.md §4.16 / TD-002 (proxy.ts exclude /api/cron/* จาก CSRF Origin-check)
 */
// 🛑 GET: Vercel Cron ยิง GET เสมอ — export แค่ POST = 405 (cron ไม่รันจริง); export ทั้ง GET+POST alias
export async function GET(request: Request) {
  // 🛑 SECURITY: CRON_SECRET env ต้องตั้งค่าไว้เสมอ
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

  // Phase 1: renewal — query subscription ที่ครบกำหนด (ACTIVE + nextRenewalAt <= now)
  const due = await prisma.businessPackageSubscription.findMany({
    where: { status: "ACTIVE", nextRenewalAt: { lte: new Date() } },
    select: { ownerId: true },
  });

  let renewed = 0;
  let locked = 0;
  let renewalErrors = 0;

  // per-owner isolation — try/catch แยกทีละ owner กัน error ของ owner เดียวทำ owner อื่น fail ไปด้วย
  for (const { ownerId } of due) {
    try {
      const result = await renewOrLockBusinessPackage(ownerId);
      if (result === "RENEWED") renewed += 1;
      else if (result === "LOCKED") locked += 1;
      // 'SKIPPED' ไม่นับใน renewed/locked/errors (idempotent no-op)
    } catch (e) {
      renewalErrors += 1;
      // log ไว้ให้ Controller/DevOps ตรวจ — ไม่มี UI ฝั่งนี้ (server-to-server cron)
      console.error(`[cron/business-package-lifecycle] renewal ownerId=${ownerId} error:`, e);
    }
  }

  // Phase 2: auto soft-delete — shop ที่ lock ด้วยเหตุ grace-eligible เกิน grace period
  const autoSoftDelete = await autoSoftDeleteLapsedShops();

  // Phase 3: purge — tombstone shop ที่ retention หมดอายุ (ห้าม physical DELETE)
  const purge = await purgeExpiredShops();

  return NextResponse.json({
    renewal: { processed: due.length, renewed, locked, errors: renewalErrors },
    autoSoftDelete,
    purge,
  });
}

// POST alias — Vercel Cron ใช้ GET; คง POST เผื่อ manual trigger
export const POST = GET
