// In-memory OTP store (MVP — replace with Redis in production)
const otpStore = new Map<string, { otp: string; expiresAt: number; attempts: number }>();

// In-memory rate-limit bucket per contact (MVP — replace with Redis/Upstash)
// PRD NFR-2.7: "OTP rate limit: 3 ครั้ง / 10 นาที ต่อเบอร์โทร"
const otpRequestTimestamps = new Map<string, number[]>();

/**
 * ตรวจว่า contact นี้ยังส่ง OTP ได้อยู่ไหม ภายใต้ quota.
 * Return true = ผ่าน (consume 1 slot), false = เกิน quota
 *
 * ทุกเบอร์ติด rate limit เท่ากัน รวมถึง TEST_ACCOUNTS — เพราะส่ง SMS จริงทุก env
 */
export function consumeOtpRequestQuota(
  contact: string,
  max = 3,
  windowMs = 10 * 60 * 1000,
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const prev = otpRequestTimestamps.get(contact) ?? [];
  const recent = prev.filter((t) => t > cutoff);

  if (recent.length >= max) {
    otpRequestTimestamps.set(contact, recent); // trim stale
    return false;
  }

  recent.push(now);
  otpRequestTimestamps.set(contact, recent);
  return true;
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function storeOtp(contact: string): string {
  const otp = generateOtp();
  otpStore.set(contact, {
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    attempts: 0,
  });
  return otp;
}

// Test account bypass — remove in production.
// Used to log in without DB/SMS for smoke-testing the UI flow.
export const TEST_ACCOUNT = {
  phone: '0920791649',
  otp: '123456',
  id: 'test-user-0920791649',
  displayName: 'ผู้ใช้ทดสอบ',
  username: 'testuser',
} as const;

const TEST_ACCOUNTS: Record<string, string> = {
  [TEST_ACCOUNT.phone]: TEST_ACCOUNT.otp,
  '0000000001': '123456', // 2nd seller test account — BT Premium สุขสวัสดิ์
};

/**
 * แปลงเบอร์โทรไทย local format → E.164
 * input ที่ถูกต้อง: ^0[0-9]{9}$ (10 หลัก ขึ้นต้น 0)
 * เช่น "0812345678" → "+66812345678"
 * ถ้าไม่ match → throw เพื่อกัน bug ชั้นสอง (route guard ควรกรองก่อนแล้ว)
 */
export function toE164Thai(phone: string): string {
  if (!/^0[0-9]{9}$/.test(phone)) {
    throw new Error("INVALID_THAI_PHONE");
  }
  return "+66" + phone.slice(1);
}

/**
 * ส่ง OTP ผ่าน apitel.co SMS API
 * ห้าม log otp / apiKey / apiSecret ที่ใด — กฎ security hard rule
 * ส่งจริงทุก env รวมถึง TEST_ACCOUNTS (ไม่มี bypass)
 */
export async function sendOtpViaSms(phone: string, otp: string): Promise<void> {
  const apiKey = process.env.APITEL_API_KEY;
  const apiSecret = process.env.APITEL_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("APITEL_NOT_CONFIGURED");
  }

  // sender ต้องเป็นชื่อที่ apitel approve บน account นั้น ๆ — ถ้าส่งชื่อที่ไม่
  // approve apitel ตอบ 400 {"errors":{"from":"Sender Name Invalid"}}.
  // เว้นว่าง = omit field from → apitel ใช้ default sender ของ account
  // (ห้าม hardcode fallback ชื่อใด ๆ — เคยใช้ "ATSMS" แล้วเป็นชื่อที่ไม่ approve)
  const sender = process.env.APITEL_SENDER_NAME?.trim();
  const baseUrl = process.env.APITEL_BASE_URL || "https://api.apitel.co/sms";
  const to = toE164Thai(phone);

  // ข้อความไทย ≤70 ตัวอักษร (Unicode SMS = 1 segment ที่ 70 chars)
  // "รหัส OTP ของคุณคือ " = 19, otp = 6, " (ใช้ได้ 10 นาที) - Deep" = 24 → รวม 49 chars
  const text = `รหัส OTP ของคุณคือ ${otp} (ใช้ได้ 10 นาที) - Deep`;

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to,
      ...(sender ? { from: sender } : {}),
      text,
      ttl: 600,
      apiKey,
      apiSecret,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    // log เฉพาะ HTTP status — ไม่อ่าน body เพื่อกัน secret echo ในอนาคต
    console.error(`[apitel] SMS failed: HTTP ${res.status}`);
    throw new Error(`APITEL_HTTP_${res.status}`);
  }
}

export function verifyOtp(contact: string, otp: string): boolean {
  if (TEST_ACCOUNTS[contact] && otp === TEST_ACCOUNTS[contact]) return true;

  const stored = otpStore.get(contact);
  if (!stored) return false;
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(contact);
    return false;
  }
  if (stored.attempts >= 3) {
    otpStore.delete(contact);
    return false;
  }
  stored.attempts++;
  if (stored.otp !== otp) return false;
  otpStore.delete(contact);
  return true;
}
