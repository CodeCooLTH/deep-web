import crypto from "crypto";

/**
 * invite-link.ts — pure lib สำหรับ generate slug + build URL ของ Shop Staff
 * Invite Link (feature 00012)
 *
 * ห้าม import prisma / มี side effect ตอน import — ไฟล์นี้ต้อง client-safe
 * (ใช้ได้ทั้ง service layer ฝั่ง server และ UI ฝั่ง client เพื่อ preview URL)
 */

// charset [A-Za-z0-9] — URL-safe ตรงตาม spec ของ feature (ต่างจาก sms-code.service
// ที่ตัด 0/O/1/I เพื่อลดสับสนตาแมวตอน "พิมพ์" code; invite slug ผู้ใช้ "คลิกลิงก์"
// ไม่ได้พิมพ์เอง จึงไม่ต้องตัดตัวอักษรสับสนออก — ใช้ full 62-symbol charset)
const SLUG_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SLUG_LENGTH = 12;

/**
 * สุ่ม 12-char slug จาก charset [A-Za-z0-9] ด้วย crypto.randomBytes
 * (mirror pattern ของ src/services/sms-code.service.ts generateSecureCode —
 * ห้ามใช้ Math.random() หรือ sequential id)
 *
 * 62 symbols ไม่ลงตัวกับ 256 (256 % 62 != 0) → ใช้ rejection sampling กัน modulo
 * bias แทนการทำ byte % 62 ตรง ๆ (sms-code.service ใช้ 32 symbols ซึ่งลงตัวพอดี
 * 256/32=8 จึงไม่ต้อง reject — ต่างจากที่นี่)
 */
export function generateInviteSlug(): string {
  // ค่า threshold สูงสุดที่ยังกระจายสม่ำเสมอ: floor(256/62)*62 - 1 = 4*62-1 = 247
  // byte ที่ > 247 (248-255) ถูกทิ้ง (reject) แล้วสุ่มใหม่ กัน symbol แรก ๆ ได้เปรียบ
  const REJECT_THRESHOLD = Math.floor(256 / SLUG_CHARSET.length) * SLUG_CHARSET.length;

  let slug = "";
  while (slug.length < SLUG_LENGTH) {
    // สุ่มทีละ batch เพื่อลดจำนวนรอบ crypto.randomBytes (ส่วนใหญ่ผ่านรอบเดียว)
    const bytes = crypto.randomBytes(SLUG_LENGTH - slug.length);
    for (let i = 0; i < bytes.length && slug.length < SLUG_LENGTH; i++) {
      const byte = bytes[i];
      if (byte >= REJECT_THRESHOLD) continue; // reject — bias
      slug += SLUG_CHARSET[byte % SLUG_CHARSET.length];
    }
  }
  return slug;
}

/**
 * ประกอบ invite URL เต็มรูปแบบ `<base>/i/<slug>`
 *
 * ลำดับ resolve base (mirror pattern buyerBase() ใน
 * src/app/(paces)/admin/(dashboard)/orders/page.tsx):
 * 1. env NEXT_PUBLIC_BUYER_URL (main domain — ตั้งใน .env.local dev / .env.production)
 * 2. dev default `http://deepth.local:4000` (NODE_ENV !== 'production')
 * 3. prod default `https://deepthailand.app`
 *
 * หมายเหตุ: invite URL อยู่บน main domain ตาม plan Task 1.2 — proxy.ts (Task 3.4)
 * เป็นผู้ redirect ไป seller subdomain ต่อ ไม่ใช่หน้าที่ของฟังก์ชันนี้
 */
export function buildInviteUrl(slug: string): string {
  const envUrl = process.env.NEXT_PUBLIC_BUYER_URL;
  // .trim() กัน env ที่มี trailing newline/space; ตัด trailing slash ซ้ำ
  const base = envUrl
    ? envUrl.trim().replace(/\/+$/, "")
    : process.env.NODE_ENV !== "production"
      ? "http://deepth.local:4000"
      : "https://deepthailand.app";
  return `${base}/i/${slug}`;
}

export type InviteExpiryKey = "24h" | "7d" | "30d";

interface InviteExpiryOption {
  key: InviteExpiryKey;
  ms: number;
  label: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** ตัวเลือกอายุลิงก์เชิญ — label ภาษาไทยสำหรับ dropdown ฝั่ง UI (Task 4.x) */
export const INVITE_EXPIRY_OPTIONS: readonly InviteExpiryOption[] = [
  { key: "24h", ms: 24 * HOUR_MS, label: "24 ชั่วโมง" },
  { key: "7d", ms: 7 * DAY_MS, label: "7 วัน" },
  { key: "30d", ms: 30 * DAY_MS, label: "30 วัน" },
] as const;

/** default ตาม plan Task 1.2 */
export const DEFAULT_INVITE_EXPIRY_KEY: InviteExpiryKey = "7d";

/** แปลง expiry key → Date จริง (now + ms) — ใช้ตอนสร้าง ShopInviteLink.expiresAt */
export function expiryKeyToDate(key: InviteExpiryKey): Date {
  const option = INVITE_EXPIRY_OPTIONS.find((o) => o.key === key);
  if (!option) {
    throw new Error(`invalid invite expiry key: ${key}`);
  }
  return new Date(Date.now() + option.ms);
}
