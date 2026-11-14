import { NextResponse } from "next/server";
import { sweepMetaAudience } from "@/services/meta-audience.service";

export const maxDuration = 60;

/**
 * GET /api/cron/meta-audience — Vercel Cron ทุก 5 นาที (feature 00092 FR-006)
 * ส่งรายชื่อลูกค้าที่ซื้อแล้วเข้า Custom Audience เป็นชุด · แยกจาก meta-capi: ล้ม/ช้าต้องไม่ดึงกันและกัน
 */
export async function GET(request: Request) {
  // SECURITY: env ว่าง = reject ทันที ห้ามเทียบกับ "Bearer undefined"
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await sweepMetaAudience();
  console.log("[meta-audience-sweep]", JSON.stringify(summary));
  return NextResponse.json({ ok: true, ...summary });
}
