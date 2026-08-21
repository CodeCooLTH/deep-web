// OTP store = **DB-backed** (`OtpCode` table) — shared ข้าม serverless instance.
// เดิมเก็บ in-memory (globalThis Map) → บน Vercel serverless `send`/`verify` วิ่งคนละ lambda
// → verifyOtp ไม่เจอ OTP → 401 ทั้งที่กรอกถูก (bug prod 2026-06-16, ยืนยันจาก Vercel logs).
// DB shared ทุก instance → แก้ที่ต้นเหตุ. codeHash = SHA-256 (hash at rest), single-use.
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { MOBILE_PHONE_RE } from '@/lib/phone'

// rate-limit ยังเป็น in-memory globalThis (per-instance) — บน serverless = looser (3×N instance)
// ไม่ใช่บั๊กหลัก (signup ใช้ได้); ย้ายไป DB/Redis ทีหลังถ้าต้องเข้มจริง. PRD NFR-2.7.
const globalForOtp = globalThis as unknown as {
  otpRequestTimestamps?: Map<string, number[]>;
};

const otpRequestTimestamps =
  globalForOtp.otpRequestTimestamps ??
  (globalForOtp.otpRequestTimestamps = new Map<string, number[]>());

// SHA-256 ของ OTP — เก็บใน OtpCode.codeHash (ไม่เก็บ plain). fast hash พอสำหรับ OTP 6 หลัก อายุสั้น single-use
function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

/**
 * ตรวจว่า contact นี้ยังส่ง OTP ได้อยู่ไหม ภายใต้ quota.
 * Return true = ผ่าน (consume 1 slot), false = เกิน quota
 *
 * TEST_ACCOUNTS ยกเว้น rate-limit เพราะไม่ส่ง SMS จริง (bypass แล้ว) — กัน QA tests ติด quota
 */
export function consumeOtpRequestQuota(
  contact: string,
  max = 3,
  windowMs = 10 * 60 * 1000,
): boolean {
  // TEST_ACCOUNTS ไม่ส่ง SMS จริง → ยกเว้น rate-limit เพื่อให้ QA tests รันซ้ำได้ใน window เดียวกัน
  if (isTestAccount(contact)) return true;

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

export async function storeOtp(contact: string): Promise<string> {
  const otp = generateOtp();
  const codeHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  // 1 contact = 1 active OTP → upsert (ส่งใหม่ทับของเดิม + reset attempts)
  await prisma.otpCode.upsert({
    where: { contact },
    create: { contact, codeHash, expiresAt, attempts: 0 },
    update: { codeHash, expiresAt, attempts: 0 },
  });
  return otp;
}

// Test account verify-bypass — ใน production ต้องว่างเปล่าเสมอ (safepay-security mandate)
// prod = {} → bypass ตาย: verifyOtp `TEST_ACCOUNTS[contact]` = undefined, isTestAccount `contact in {}` = false
// dev/QA (NODE_ENV !== 'production') = บัญชีทดสอบครบ ไม่กระทบ workflow การทดสอบ
// 0920791649 ถูกถอดออกแล้ว (user request 2026-05-16) — ตอนนี้เป็นเบอร์ปกติ ส่ง SMS จริง
const TEST_ACCOUNTS: Record<string, string> = process.env.NODE_ENV === 'production'
  ? {}
  : {
      '0000000001': '123456', // seller test account — BT Premium สุขสวัสดิ์
      '0000000002': '123456', // QA test phone 2 — B-06 (ป้องกัน rate-limit collision กับ 0000000009)
      '0000000003': '123456', // QA test phone 3 — B-05
      '0000000004': '123456', // QA test phone 4 — A-07 (แยกจาก B-05/B-06)
      '0000000005': '123456', // QA test phone 5 — A-07 (current free slot; ย้ายได้ถ้า rate-limited)
      '0000000006': '123456', // QA test phone 6 — B-05 (fallback slot)
      '0000000009': '123456', // onboarding QA — เบอร์เปล่าสำหรับทดสอบ signup→onboarding (จำลอง SMS, ไม่มีบัญชีจริง)
    };

/**
 * ตรวจว่า contact นี้อยู่ใน TEST_ACCOUNTS หรือไม่
 * ใช้แทนการ export TEST_ACCOUNTS ตรง ๆ — กัน route handler อื่น
 * อ่าน OTP ที่ตายตัวได้โดยตรง (least-privilege)
 * กฎเดียวกับ verifyOtp: ไม่มี env-guard — unconditional (ดู note สำหรับ security)
 */
export function isTestAccount(contact: string): boolean {
  return contact in TEST_ACCOUNTS;
}

/**
 * แปลงเบอร์โทรไทย local format → E.164
 * input ที่ถูกต้อง: MOBILE_PHONE_RE (มือถือ 10 หลัก ขึ้นต้น 06/08/09)
 * เช่น "0812345678" → "+66812345678"
 * ถ้าไม่ match → throw เพื่อกัน bug ชั้นสอง (route guard ควรกรองก่อนแล้ว)
 */
export function toE164Thai(phone: string): string {
  if (!MOBILE_PHONE_RE.test(phone)) {
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

export async function verifyOtp(contact: string, otp: string): Promise<boolean> {
  // test-account bypass (dev/QA) — ไม่แตะ DB
  if (TEST_ACCOUNTS[contact] && otp === TEST_ACCOUNTS[contact]) return true;

  const stored = await prisma.otpCode.findUnique({ where: { contact } });
  if (!stored) return false;
  if (Date.now() > stored.expiresAt.getTime()) {
    await prisma.otpCode.delete({ where: { contact } }).catch(() => {});
    return false;
  }
  if (stored.attempts >= 3) {
    await prisma.otpCode.delete({ where: { contact } }).catch(() => {});
    return false;
  }
  // นับ attempt ก่อนเทียบ (กัน brute) — ครบ 3 รอบถัดไปจะโดน guard ข้างบน
  await prisma.otpCode.update({ where: { contact }, data: { attempts: { increment: 1 } } });
  if (stored.codeHash !== hashOtp(otp)) return false;
  // ถูก → single-use ลบทิ้ง
  await prisma.otpCode.delete({ where: { contact } }).catch(() => {});
  return true;
}
