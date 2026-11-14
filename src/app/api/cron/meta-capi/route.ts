import { NextResponse } from "next/server";
import { sweepCartAbandoned, sweepMetaCapi } from "@/services/meta-capi.service";

export const maxDuration = 60;

/**
 * GET /api/cron/meta-capi — Vercel Cron ทุก 1 นาที (feature 00089 FR-011)
 * ส่งคิวเหตุการณ์ไป Meta Conversions API · บันทึกการส่งเก็บถาวร ไม่ลบ (มติ user 2026-11-14)
 * แยกจาก chat-outbox โดยตั้งใจ: CAPI ล้ม/ช้าต้องไม่ดึงคิวแชทลงไปด้วย
 */
export async function GET(request: Request) {
  // SECURITY: env ว่าง = reject ทันที ห้ามเทียบกับ "Bearer undefined"
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // ตัวส่งก่อนเสมอ — ตัวกวาด CartAbandoned ช้า/ล้มต้องไม่ทำให้คิวทั้งหมดหยุด (แถวที่มันเพิ่มส่งรอบถัดไป)
  const summary = await sweepMetaCapi();
  let cartAbandoned: number | "error" = 0;
  try {
    cartAbandoned = await sweepCartAbandoned();
  } catch (e) {
    cartAbandoned = "error";
    console.error("[meta-capi-sweep] sweepCartAbandoned ล้มเหลว (ตัวส่งไม่กระทบ)", e instanceof Error ? e.message : String(e));
  }
  console.log("[meta-capi-sweep]", JSON.stringify({ ...summary, cartAbandoned }));
  return NextResponse.json({ ok: true, ...summary, cartAbandoned });
}
