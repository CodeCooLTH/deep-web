/**
 * Single-use ticket สำหรับ mobile session handoff.
 * ชั้น HMAC (pure) ตาม pattern lib/app-token.ts — เซ็นด้วย NEXTAUTH_SECRET, timing-safe, fail-closed.
 * ชั้น DB (create/burn) อยู่ท้ายไฟล์ — บังคับ single-use ด้วย atomic update.
 */
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

const SECRET = process.env.NEXTAUTH_SECRET
if (!SECRET) {
  throw new Error('[mobile-ticket] NEXTAUTH_SECRET ไม่ได้ตั้งค่า — fail-closed')
}

const TTL_MS = 60 * 1000 // 60 วินาที

export type TicketPurpose = 'enter' | 'exchange'
export type TicketPayload = { tid: string; uid: string; purpose: TicketPurpose; exp: number }

/** เซ็น payload → `base64url(payload).HMAC` */
export function signTicket(payload: TicketPayload): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET!).update(b64).digest('base64url')
  return `${b64}.${sig}`
}

/** verify HMAC + exp + purpose (pure, ไม่แตะ DB). ทุก error path → null. */
export function verifyTicket(
  token: string | null | undefined,
  expectedPurpose: TicketPurpose,
): TicketPayload | null {
  if (!token) return null
  try {
    const dot = token.indexOf('.')
    if (dot === -1) return null
    const b64 = token.slice(0, dot)
    const sigProvided = token.slice(dot + 1)
    const expectedSig = crypto.createHmac('sha256', SECRET!).update(b64).digest('base64url')
    const a = Buffer.from(sigProvided)
    const b = Buffer.from(expectedSig)
    if (a.length !== b.length) return null
    if (!crypto.timingSafeEqual(a, b)) return null

    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as TicketPayload
    if (typeof payload.tid !== 'string' || !payload.tid) return null
    if (typeof payload.uid !== 'string' || !payload.uid) return null
    if (payload.purpose !== expectedPurpose) return null
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

/** สร้าง ticket ใหม่: insert DB row + คืน signed token. */
export async function createMobileTicket(userId: string, purpose: TicketPurpose): Promise<string> {
  const tid = crypto.randomUUID()
  const exp = Date.now() + TTL_MS
  await prisma.mobileAuthTicket.create({
    data: { id: tid, userId, purpose, expiresAt: new Date(exp) },
  })
  return signTicket({ tid, uid: userId, purpose, exp })
}

/**
 * เผา ticket (single-use): verify HMAC → atomic update usedAt (เฉพาะแถวที่ยังไม่ใช้+ไม่หมดอายุ).
 * คืน userId ถ้าสำเร็จ, null ถ้า verify ไม่ผ่าน / ใช้ไปแล้ว / หมดอายุ / race แพ้.
 */
export async function burnMobileTicket(
  token: string | null | undefined,
  purpose: TicketPurpose,
): Promise<string | null> {
  const payload = verifyTicket(token, purpose)
  if (!payload) return null
  const res = await prisma.mobileAuthTicket.updateMany({
    where: { id: payload.tid, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })
  if (res.count !== 1) return null // ใช้ไปแล้ว / หมดอายุ / race
  return payload.uid
}
