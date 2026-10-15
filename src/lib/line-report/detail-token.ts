import { createHash, randomBytes } from 'node:crypto'

/** token ลิงก์หน้าสรุปสาธารณะ — สุ่ม 128 บิต เก็บเฉพาะ hash ในฐาน (ลิงก์ = ใครถือก็เปิดได้ จึงห้ามเดาได้) */
export function newDetailToken(): { token: string; hash: string } {
  const token = randomBytes(16).toString('base64url')
  return { token, hash: hashDetailToken(token) }
}

export const hashDetailToken = (token: string): string => createHash('sha256').update(token).digest('hex')

/** 16 ไบต์ base64url = 22 ตัวพอดี — ตัดคำขอขยะก่อนแตะฐาน */
export const isWellFormedToken = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{22}$/.test(s)
