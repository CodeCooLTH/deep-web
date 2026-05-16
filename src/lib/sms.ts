// Generic SMS send primitive สำหรับส่งข้อความ arbitrary (ไม่ใช่ OTP-template)
// mirror ขนาน sendOtpViaSms ใน otp.ts — ใช้ apitel.co HTTP API shape เดิมทุกอย่าง
// ข้อแตกต่าง 2 อย่าง: (1) รับ text อิสระแทน OTP template, (2) ไม่มี ttl field (OTP-specific)

import { toE164Thai } from "@/lib/otp";

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
