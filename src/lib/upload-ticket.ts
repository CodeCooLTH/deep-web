/**
 * upload-ticket — HMAC claim ที่ผูก "fileId ที่เพิ่งจ่ายไป" กับ "คนที่ขอ" (2026-08-10)
 *
 * ทำไมต้องมี: ตั้งแต่ upload ยิงตรงเข้า storage แล้ว server ไม่ได้เห็นไฟล์ตอนอัปโหลดอีก
 * จึงต้องมีขั้น `POST /api/uploads/commit` มาอ่านขนาดจริงด้วย HEAD แล้วตัดสิน — และขั้นนั้น
 * รับ `fileId` มาจาก client. ถ้าไม่ผูกอะไรไว้เลย ใครที่ล็อกอินอยู่จะ commit **fileId ของคนอื่น**
 * ได้ ซึ่งอันตรายกว่าที่เห็น เพราะ commit ที่พบว่าไฟล์เกินเพดานจะ **ลบไฟล์นั้นทิ้ง** —
 * กลายเป็นช่องให้ลบไฟล์ของร้านอื่นด้วยการเดา/สุ่ม key (fileId เป็น uuid เดายาก แต่หลุดไปกับ
 * ลิงก์/HTML/log ได้ตลอด และ "เดายาก" ไม่ใช่ authorization)
 *
 * claim ยังพก `purpose`/`maxSize`/`conversationId` ไปด้วย เพื่อให้ commit ตัดสินด้วยเงื่อนไข
 * **ชุดเดียวกับที่ ticket อนุมัติ** ไม่ใช่ชุดที่ client เลือกส่งมาใหม่ตอน commit
 * (ไม่งั้นขอ ticket แบบ purpose='CHAT' แล้ว commit อ้าง purpose='IMAGE' เพื่อเลี่ยงกฎช่องทางได้)
 *
 * Fail-closed แบบเดียวกับ `account-merge-ticket.ts`: ไม่มี SECRET → throw ตอน load,
 * ทุก error path → null, timingSafeEqual, exp ฝังใน payload
 */
import crypto from 'crypto'
import type { UploadPurpose } from '@/lib/upload-policy'

const SECRET = process.env.NEXTAUTH_SECRET
if (!SECRET) {
  throw new Error('[upload-ticket] NEXTAUTH_SECRET ไม่ได้ตั้งค่า — fail-closed')
}

// domain separation — token ของที่นี่เอาไปใช้กับ link-intent/account-merge ไม่ได้ และกลับกัน
const DOMAIN = 'upload-ticket.v1'

/** อายุ claim — ต้องยาวพอให้อัปโหลดไฟล์ 25MB บนเน็ตมือถือช้า ๆ จนจบ แล้วยังเรียก commit ทัน */
export const TICKET_TTL_SECONDS = 15 * 60

export interface UploadClaim {
  fileId: string
  userId: string
  purpose: UploadPurpose
  /** เพดานที่อนุมัติไว้ตอนจ่าย ticket — commit เทียบขนาดจริงกับค่านี้ ไม่ไปอ่านตารางใหม่ */
  maxSize: number
  /** เธรดที่ไฟล์นี้จะไปแนบ (เฉพาะ purpose CHAT) — commit ใช้ตรวจกฎช่องทางซ้ำกับขนาดจริง */
  conversationId?: string
  exp: number
}

export function signUploadTicket(claim: Omit<UploadClaim, 'exp'>): string {
  const payload: UploadClaim = { ...claim, exp: Date.now() + TICKET_TTL_SECONDS * 1000 }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET!).update(`${DOMAIN}.${payloadB64}`).digest('base64url')
  return `${payloadB64}.${sig}`
}

export function verifyUploadTicket(token: string): UploadClaim | null {
  if (!token) return null
  try {
    const dot = token.indexOf('.')
    if (dot === -1) return null

    const payloadB64 = token.slice(0, dot)
    const sigProvided = token.slice(dot + 1)

    const expectedSig = crypto
      .createHmac('sha256', SECRET!)
      .update(`${DOMAIN}.${payloadB64}`)
      .digest('base64url')

    const provided = Buffer.from(sigProvided)
    const expected = Buffer.from(expectedSig)
    if (provided.length !== expected.length) return null
    if (!crypto.timingSafeEqual(provided, expected)) return null

    // parse หลัง verify signature แล้วเท่านั้น
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as UploadClaim

    if (typeof payload.fileId !== 'string' || !payload.fileId) return null
    if (typeof payload.userId !== 'string' || !payload.userId) return null
    if (typeof payload.purpose !== 'string' || !payload.purpose) return null
    if (typeof payload.maxSize !== 'number' || !(payload.maxSize > 0)) return null
    if (payload.conversationId !== undefined && typeof payload.conversationId !== 'string') return null
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null

    return payload
  } catch {
    return null
  }
}
