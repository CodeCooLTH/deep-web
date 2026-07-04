import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renewOrLockEntitlement } from "@/services/inventory-entitlement.service";

// กัน Vercel Hobby default timeout (10s) — batch renewal อาจใช้เวลานานกว่านั้นถ้า shop เยอะ
export const maxDuration = 60;

/**
 * GET /api/cron/inventory-renewal — Vercel Cron trigger รายวัน (server-to-server เท่านั้น)
 *
 * 🛑 ต้องเป็น GET: Vercel Cron ยิง GET request เสมอ — ถ้า export แค่ POST จะได้ 405
 *    (cron ไม่เคยรันจริง) จึง export ทั้ง GET (Vercel cron) + POST alias (manual trigger เผื่อ)
 * Auth: Authorization: Bearer {CRON_SECRET} เท่านั้น — Vercel ส่ง header นี้อัตโนมัติเมื่อ CRON_SECRET ตั้งไว้
 * ดู API.md §4.3 / SDS.md §4.2 / TD-002 (proxy.ts exclude /api/cron/* จาก CSRF Origin-check)
 */
export async function GET(request: Request) {
  // 🛑 SECURITY (จาก security review S-6): CRON_SECRET env ต้องตั้งค่าไว้เสมอ
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

  // query shop ที่ครบกำหนด renewal (ACTIVE + nextRenewalAt <= now)
  const dueEntitlements = await prisma.inventoryEntitlement.findMany({
    where: { status: "ACTIVE", nextRenewalAt: { lte: new Date() } },
    select: { shopId: true },
  });

  let renewed = 0;
  let locked = 0;
  let errors = 0;

  // per-shop isolation — try/catch แยกทีละ shop กัน error ของ shop เดียวทำ shop อื่น fail ไปด้วย
  for (const { shopId } of dueEntitlements) {
    try {
      const result = await renewOrLockEntitlement(shopId);
      if (result === "RENEWED") renewed += 1;
      else if (result === "LOCKED") locked += 1;
      // 'SKIPPED' ไม่นับใน renewed/locked/errors (idempotent no-op)
    } catch (e) {
      errors += 1;
      // log ไว้ให้ Controller/DevOps ตรวจ — ไม่มี UI ฝั่งนี้ (server-to-server cron)
      console.error(`[cron/inventory-renewal] shopId=${shopId} error:`, e);
    }
  }

  return NextResponse.json({
    processed: dueEntitlements.length,
    renewed,
    locked,
    errors,
  });
}

// POST alias — Vercel Cron ใช้ GET; คง POST เผื่อ manual/backward-compat trigger
export const POST = GET
