/**
 * bind-code.ts — โค้ดผูกกลุ่ม 8 ตัว Crockford base32 (TFR-LGS-04/06) · เก็บเฉพาะ HMAC ไม่เก็บค่าดิบ
 * key derive จาก NEXTAUTH_SECRET (ไม่เพิ่ม env — SDS TD-002) · fail-closed ถ้าไม่ตั้ง (แบบ mobile-ticket.ts)
 * อ่าน secret ตอนเรียก ไม่ throw ตอน import — ไม่ให้ build/เทสที่ไม่เกี่ยวพังทั้งโมดูล
 */
import crypto from 'crypto'

export const BIND_CODE_TTL_MS = 10 * 60 * 1000

/** Crockford base32 (ไม่มี I L O U) · 8 ตัว ≈ 1.1e12 — ปิดช่องเดาข้ามหลายกลุ่ม (security H-1) */
export const BIND_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const BIND_CODE_LENGTH = 8
export const BIND_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/

/** สุ่มด้วย CSPRNG ทีละตัวอักษร · คืนรูปมาตรฐาน (ไม่มีขีด) — ใช้ `formatBindCode` ตอนแสดง */
export function generateBindCode(): string {
  let out = ''
  for (let i = 0; i < BIND_CODE_LENGTH; i++) out += BIND_CODE_ALPHABET[crypto.randomInt(0, BIND_CODE_ALPHABET.length)]
  return out
}

/** รูปที่แสดงให้ผู้ใช้: XXXX-XXXX */
export function formatBindCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/** ตัด `-`/ช่องว่าง · ตัวพิมพ์ใหญ่ · O→0, I/L→1 (Crockford) — ไม่ตรวจความถูกต้อง (ใช้ BIND_CODE_PATTERN) */
export function normalizeBindCode(input: string): string {
  return input.replace(/[-\s]/g, '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')
}

export function hashBindCode(code: string): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('[line-report] NEXTAUTH_SECRET ไม่ได้ตั้งค่า — fail-closed')
  const key = crypto.createHmac('sha256', secret).update('line-report:bind-code:v1').digest()
  // hash บนรูป normalize เสมอ — ผู้เรียกจะส่งรูปไหนมาก็ได้ค่าเดียวกัน
  return crypto.createHmac('sha256', key).update(normalizeBindCode(code)).digest('hex')
}
