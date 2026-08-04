import { NextResponse } from "next/server";
import { purgeExpiredAccounts } from "@/services/account-deletion.service";

// กัน Vercel Hobby default timeout (10s) — batch อาจโตขึ้นตามจำนวนบัญชีที่ครบกำหนดในวันเดียวกัน
export const maxDuration = 60;

/**
 * GET|POST /api/cron/account-purge — Vercel Cron รายวัน (server-to-server เท่านั้น)
 *
 * ล้าง PII ของบัญชีที่ผู้ใช้กดลบแล้วและพ้น 30 วัน (App Store Guideline 5.1.1(v))
 * — ไม่ลบแถว User เพราะ onDelete:Cascade 85 จุดจะลากข้อมูลคู่ค้าหายไปด้วย
 *   รายละเอียดอยู่ที่ purgeExpiredAccounts()
 *
 * Base: src/app/api/cron/business-package-lifecycle/route.ts (auth + response shape เดียวกัน)
 * Spec: docs/superpowers/specs/2026-08-04-account-deletion-design.md §11
 *
 * ตารางเวลา (vercel.json): 23:00 — หลัง business-package-lifecycle (20:00) โดยตั้งใจ
 * ร้านถูก purge ก่อน แล้วเจ้าของค่อยถูก purge ตาม ไม่เกิดสภาพ "เจ้าของหายแต่ร้านยังอยู่"
 *
 * Auth: Authorization: Bearer {CRON_SECRET} เท่านั้น — ไม่มี session/JWT
 * (proxy.ts ยกเว้น /api/cron/* จาก CSRF Origin-check เพราะไม่มี cookie จึงไม่มี CSRF surface)
 */
// 🛑 Vercel Cron ยิง GET เสมอ — export แค่ POST = 405 (cron ไม่รันจริง); export ทั้งคู่
export async function GET(request: Request) {
  // 🛑 SECURITY: env ว่าง/undefined ต้อง reject ทันที ห้ามปล่อยให้ header===undefined
  // เทียบกับ `Bearer undefined` แล้วผ่าน (auth bypass เมื่อ deploy ลืมตั้ง env)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const authHeader = request.headers.get("authorization");
  // เทียบ string เต็ม ไม่ parse บางส่วน — กัน bypass
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await purgeExpiredAccounts();
    // ไม่ log/ตอบกลับ PII ใด ๆ — มีแต่ตัวเลขสรุป (RC-8)
    console.log(
      `[cron] account-purge processed=${result.processed} purged=${result.purged} errors=${result.errors}`,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron] account-purge failed", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export const POST = GET;
