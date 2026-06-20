/**
 * Scam identifier — normalize / HMAC hash / mask
 *
 * เลขบัตรประชาชน + เลขบัญชี เป็นข้อมูลอ่อนไหวสูง (PDPA) → เก็บเป็น HMAC เท่านั้น
 * ไม่เก็บ/ไม่ส่งกลับ/ไม่โชว์ค่าจริง. ค้นแบบ exact-match เทียบ hash
 * (keyed HMAC → ไล่สุ่มเลขไม่ไหว + ไม่มี endpoint enumerate)
 */
import crypto from 'crypto'

import type { IdentifierType } from '@/lib/scam-constants'

export type { IdentifierType } from '@/lib/scam-constants'
export { IDENTIFIER_TYPES, IDENTIFIER_LABELS } from '@/lib/scam-constants'

const SECRET = process.env.NEXTAUTH_SECRET
if (!SECRET) {
  throw new Error('[scam-identifier] NEXTAUTH_SECRET ไม่ได้ตั้งค่า — fail-closed')
}

/** normalize ตามชนิด — ผลลัพธ์ใช้ทั้ง hash และเทียบค้นหา จึงต้อง deterministic */
export function normalizeIdentifier(type: IdentifierType, raw: string): string {
  const s = raw.trim()
  switch (type) {
    case 'PHONE':
    case 'NATIONAL_ID':
    case 'BANK_ACCOUNT':
      return s.replace(/\D/g, '') // ตัวเลขล้วน
    case 'NAME':
      return s.toLowerCase().replace(/\s+/g, ' ') // ตัด space ซ้ำ + lowercase
  }
}

/** HMAC-SHA256 ของค่าที่ normalize แล้ว (prefix ด้วย type กัน cross-type collision) */
export function hashIdentifier(type: IdentifierType, raw: string): string {
  const norm = normalizeIdentifier(type, raw)

  return crypto.createHmac('sha256', SECRET!).update(`${type}:${norm}`).digest('base64url')
}

/** ค่าที่แสดงผลได้แบบ mask — ไม่เปิดเผยค่าเต็ม */
export function maskIdentifier(type: IdentifierType, raw: string): string {
  const s = raw.trim()

  switch (type) {
    case 'PHONE': {
      const d = s.replace(/\D/g, '')

      return d.length >= 4 ? `${d.slice(0, 2)}x-xxx-xx${d.slice(-2)}` : 'xxxx'
    }
    case 'NATIONAL_ID': {
      const d = s.replace(/\D/g, '')

      return d.length >= 4 ? `บัตรลงท้าย ${d.slice(-4)}` : 'บัตร xxxx'
    }
    case 'BANK_ACCOUNT': {
      const d = s.replace(/\D/g, '')

      return d.length >= 4 ? `บัญชีลงท้าย ${d.slice(-4)}` : 'บัญชี xxxx'
    }
    case 'NAME': {
      const tokens = s.split(/\s+/).filter(Boolean)

      if (tokens.length >= 2) return `${tokens[0]} ${tokens[1].charAt(0)}.`

      return tokens[0] ?? ''
    }
  }
}
