import { NextResponse } from "next/server";
import { runFlashStatusSyncCron } from "@/services/flash-status.service";

/**
 * GET /api/cron/flash-status-sync — Vercel Cron ทุก 5 นาที (feature 00084 · API §4.20)
 * โครงเดียวกับ iship-status-sync; throttle/เพดานร้านต่อรอบอยู่ใน service (FLASH_POLL)
 */
export const maxDuration = 120;

export async function GET(request: Request) {
  // env ว่าง = ปฏิเสธ ห้ามปล่อย `Bearer undefined` ผ่าน
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runFlashStatusSyncCron());
  } catch (err) {
    console.error("[flash-cron] ล้มทั้งรอบ", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
