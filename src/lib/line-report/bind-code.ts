/**
 * bind-code.ts — โค้ดผูกกลุ่ม 6 หลัก (TFR-LGS-04/06) · เก็บเฉพาะ HMAC ไม่เก็บค่าดิบ
 * key derive จาก NEXTAUTH_SECRET (ไม่เพิ่ม env — SDS TD-002) · fail-closed ถ้าไม่ตั้ง (แบบ mobile-ticket.ts)
 * อ่าน secret ตอนเรียก ไม่ throw ตอน import — ไม่ให้ build/เทสที่ไม่เกี่ยวพังทั้งโมดูล
 */
import crypto from 'crypto'

export const BIND_CODE_TTL_MS = 10 * 60 * 1000

/** สุ่มด้วย CSPRNG แล้ว pad 6 หลัก (ขึ้นต้น 0 ได้) */
export function generateBindCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashBindCode(code: string): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('[line-report] NEXTAUTH_SECRET ไม่ได้ตั้งค่า — fail-closed')
  const key = crypto.createHmac('sha256', secret).update('line-report:bind-code:v1').digest()
  return crypto.createHmac('sha256', key).update(code).digest('hex')
}
