// Generic SMS send primitive สำหรับส่งข้อความ arbitrary (ไม่ใช่ OTP-template)
// mirror ขนาน sendOtpViaSms ใน otp.ts — ใช้ apitel.co HTTP API shape เดิมทุกอย่าง
// ข้อแตกต่าง 2 อย่าง: (1) รับ text อิสระแทน OTP template, (2) ไม่มี ttl field (OTP-specific)

import { toE164Thai } from "@/lib/otp";

// ─── OQ-5: In-memory hourly SMS rate-limit per shop ────────────────────────
//
// globalThis singleton — Next.js route handlers คนละ module instance
// ถ้าใช้ module-level Map ตรง ๆ → rate-limit ไม่ share ข้าม request (bypass ได้)
// pattern เดียวกับ otpRequestTimestamps ใน otp.ts (บรรทัด 10-26)
//
// AR-2 (accepted risk MVP): per-instance, multi-instance prod ต้องใช้ Redis (Phase 2)
const globalForSms = globalThis as unknown as {
  smsRequestTimestamps?: Map<string, number[]>;
};

const smsRequestTimestamps =
  globalForSms.smsRequestTimestamps ??
  (globalForSms.smsRequestTimestamps = new Map<string, number[]>());

/**
 * consumeSmsQuota — ตรวจ + consume 1 slot ของ per-shop hourly SMS rate-limit
 *
 * Return true = ผ่าน (ยังส่งได้), false = เกิน quota → caller ตอบ 429
 *
 * OQ-5 spec: 20 SMS/ชม. ต่อ shop (กัน loop/abuse burst), in-memory globalThis singleton
 * window = 3600_000 ms (1 ชั่วโมงเลื่อน sliding window เหมือน OTP)
 *
 * @param shopId - shop.id ของ seller (key สำหรับ bucket)
 */
export function consumeSmsQuota(
  shopId: string,
  max = 20,
  windowMs = 3_600_000,
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const prev = smsRequestTimestamps.get(shopId) ?? [];
  // trim timestamps เก่าที่หมด window แล้ว
  const recent = prev.filter((t) => t > cutoff);

  if (recent.length >= max) {
    smsRequestTimestamps.set(shopId, recent); // เก็บ trimmed list
    return false; // เกิน quota
  }

  recent.push(now);
  smsRequestTimestamps.set(shopId, recent);
  return true; // ผ่าน
}

/**
 * ส่ง SMS ข้อความ arbitrary ผ่าน apitel.co
 *
 * ทำไมแยกจาก sendOtpViaSms:
 * - OTP ใช้ template ตายตัว + ttl field (TTL 600s)
 * - generic SMS ส่ง text อิสระ ไม่มี OTP TTL concept
 * - ทั้งสองต้องไม่ entangle กัน — แยก function = แยก concern ชัด
 *
 * RC-8: ห้าม log `text` หรือ phone เต็มใด ๆ — log ได้แค่ HTTP status
 */
export async function sendSms(phone: string, text: string): Promise<void> {
  const apiKey = process.env.APITEL_API_KEY;
  const apiSecret = process.env.APITEL_API_SECRET;

  if (!apiKey || !apiSecret) {
    // ไม่ throw รายละเอียด env — แค่บอกว่า provider ยังไม่ configure
    throw new Error("APITEL_NOT_CONFIGURED");
  }

  // sender: omit → apitel ใช้ default account sender
  // ทำไม: retro 2026-05-16-real-sms-otp-apitel RC2 — hardcode sender ใด ๆ
  // อาจไม่ผ่าน apitel approve แล้วได้ 400 {"errors":{"from":"Sender Name Invalid"}}
  // ใช้ APITEL_SENDER_NAME env (optional) เหมือน sendOtpViaSms
  const sender = process.env.APITEL_SENDER_NAME?.trim();
  const baseUrl = process.env.APITEL_BASE_URL || "https://api.apitel.co/sms";

  // แปลง local Thai format → E.164 (reuse ที่ proven แล้วใน otp.ts)
  // throws "INVALID_THAI_PHONE" ถ้า format ไม่ถูก — route caller ควร validate ก่อน
  const to = toE164Thai(phone);

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to,
      ...(sender ? { from: sender } : {}),
      // RC-8: ไม่ log text — อาจมี order link หรือ PII บางส่วน
      text,
      apiKey,
      apiSecret,
      // ttl ถูก omit โดยตั้งใจ — OTP-specific field ไม่เกี่ยวกับ generic SMS
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    // log เฉพาะ HTTP status — ไม่อ่าน body เพื่อกัน secret echo ในอนาคต
    // RC-8: ห้าม log phone ทุกรูปแบบ (แม้แค่ 4 หลักท้าย + prefix +668 ก็แคบเหลือ 10K
    // subscriber = PII) — pattern เดียวกับ otp.ts::sendOtpViaSms
    console.error(`[apitel] sendSms failed: HTTP ${res.status}`);
    throw new Error(`APITEL_HTTP_${res.status}`);
  }
}
