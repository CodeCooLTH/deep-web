import { NextResponse } from "next/server";
import { sweepStuckJobs } from "@/services/auto-reply.service";
import { deleteOldLogs } from "@/services/auto-reply-log.service";
import { prisma } from "@/lib/prisma";

// งานกวาดอาจแตะหลายร้าน — กัน default timeout เหมือน cron ตัวอื่นของโปรเจกต์
export const maxDuration = 60;

/**
 * GET /api/cron/auto-reply-sweeper — Vercel Cron รายวัน (feature 00023, S-09)
 *
 * WARNING: นี่คือ **ชั้นที่ 4 (ชั้นสุดท้าย)** ของการกู้คืน ไม่ใช่กลไกหลัก (SDS TD-001)
 * cron ของโปรเจกต์นี้เป็นรายวันตามที่เจ้าของระบบตัดสิน กลไกหลักคือ:
 *   ชั้น 1 after() ทันที · ชั้น 2 retry ในตัว 3 ครั้ง · ชั้น 3 opportunistic sweep
 *   (ทุก webhook ของร้านนั้น + ทุกครั้งที่แอดมินเปิดกล่องข้อความ)
 * งานที่ตกมาถึงตรงนี้ควรมีน้อยมาก — ถ้าตัวเลข recovered สูงผิดปกติแปลว่ามีบั๊กที่ชั้นบน
 *
 * รวม 3 งานไว้ route เดียวเพราะโควตา cron ต่อ plan มีจำกัด และทั้ง 4 งานเป็น idempotent
 * แยก try/catch ต่อ phase ตาม pattern ของ business-package-lifecycle
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

  const result: Record<string, unknown> = {};

  // phase 1 — กวาดงานค้าง (ชั้นสุดท้าย)
  try {
    result.sweep = await sweepStuckJobs({ limit: 100 });
  } catch (e) {
    result.sweepError = e instanceof Error ? e.message : String(e);
    console.error("[auto-reply-sweeper] กวาดงานค้างล้มเหลว", result.sweepError);
  }

  // 🛑 phase 2 เดิม (ปิดโหมดทดสอบที่หมดอายุ) ถูกลบ 2026-07-29 — โหมดทดสอบไม่ใช่สวิตช์
  // ระดับร้านอีกต่อไป จึงไม่มี "ลืมปิดแล้วทั้งร้านเงียบ" ให้ต้องกู้ ชุดที่ค้าง TEST อยู่
  // กระทบแค่ตัวมันเอง (ดู AutoReplyKeyword.status)

  // phase 3 — retention ของบันทึก 90 วัน (DATABASE.md §6)
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 3600_000);
    result.deletedLogs = await deleteOldLogs(cutoff);
  } catch (e) {
    result.logRetentionError = e instanceof Error ? e.message : String(e);
    console.error("[auto-reply-sweeper] ลบบันทึกเก่าล้มเหลว", result.logRetentionError);
  }

  // phase 4 — retention ของงาน: DONE > 7 วัน, FAILED > 30 วัน (เก็บ FAILED นานกว่าเพื่อวินิจฉัย)
  try {
    const now = Date.now();
    const [done, failed] = await Promise.all([
      prisma.autoReplyJob.deleteMany({
        where: { status: "DONE", updatedAt: { lt: new Date(now - 7 * 24 * 3600_000) } },
      }),
      prisma.autoReplyJob.deleteMany({
        where: { status: "FAILED", updatedAt: { lt: new Date(now - 30 * 24 * 3600_000) } },
      }),
    ]);
    result.deletedJobs = { done: done.count, failed: failed.count };
  } catch (e) {
    result.jobRetentionError = e instanceof Error ? e.message : String(e);
    console.error("[auto-reply-sweeper] ลบงานเก่าล้มเหลว", result.jobRetentionError);
  }

  return NextResponse.json({ ok: true, ...result });
}
