// feature 00092 — ตัวห่อ API: แปลง AudienceError เป็น HTTP (ด่าน X9 อยู่ในแต่ละ route เอง · no-store ใช้ตัวเดียวกับ 00089)
import type { NextResponse } from "next/server";
import { json } from "@/lib/meta-capi/route-helpers";
import { AudienceError, type AudienceErrorCode } from "@/services/meta-audience-settings.service";

export { json, parseBody } from "@/lib/meta-capi/route-helpers";

const STATUS: Record<AudienceErrorCode, number> = {
  FEATURE_DISABLED: 404, // ฟีเจอร์ปิด = ทำเหมือนไม่มีหน้านี้
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  TOKEN_INVALID: 400,
  AD_ACCOUNT_INVALID: 400,
  NOT_CONNECTED: 409,
  CONNECTION_STOPPED: 409,
  PENDING_EXPIRED: 400,
};

export async function audienceRun(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (e) {
    if (e instanceof AudienceError) {
      return json({ error: e.code === "FEATURE_DISABLED" ? "ไม่พบหน้านี้" : e.message, code: e.code }, STATUS[e.code]);
    }
    console.error("[meta-audience api]", e instanceof Error ? e.message : String(e)); // ไม่ log body/token
    return json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, 500);
  }
}
