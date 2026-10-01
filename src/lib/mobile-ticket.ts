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
/**
 * `nh` = sha256(nonce) — ผูกตั๋วกับผู้ถือ nonce (OAuth ผ่าน Custom Tab บน Android · 2026-10-01)
 * ตั๋วขากลับเดินทางผ่าน `deepseller://` ซึ่งแอปอื่นจดทะเบียน scheme ซ้ำแล้วดักได้ ⇒ ตั๋วที่มี `nh`
 * แลกได้เฉพาะคนที่ถือ nonce (อยู่ใน localStorage ของ WebView เท่านั้น) — หลักเดียวกับ PKCE
 * อยู่ในส่วนที่ HMAC เซ็นแล้ว ⇒ ถอดออกไม่ได้ และไม่ต้องเพิ่มคอลัมน์
 */
export type TicketPayload = { tid: string; uid: string; purpose: TicketPurpose; exp: number; nh?: string }

export function hashNonce(nonce: string): string {
  return crypto.createHash('sha256').update(nonce).digest('base64url')
}

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
    if (payload.nh !== undefined && typeof payload.nh !== 'string') return null
    return payload
  } catch {
    return null
  }
}

/** สร้าง ticket ใหม่: insert DB row + คืน signed token. */
export async function createMobileTicket(
  userId: string,
  purpose: TicketPurpose,
  opts?: { nonce?: string },
): Promise<string> {
  const tid = crypto.randomUUID()
  const exp = Date.now() + TTL_MS
  await prisma.mobileAuthTicket.create({
    data: { id: tid, userId, purpose, expiresAt: new Date(exp) },
  })
  const nh = opts?.nonce ? hashNonce(opts.nonce) : undefined
  return signTicket({ tid, uid: userId, purpose, exp, ...(nh ? { nh } : {}) })
}

/** ตั๋วที่ผูก nonce ต้องมาพร้อม nonce ที่ตรง · ตั๋วที่ไม่ผูก ผ่านเสมอ (pure — แยกไว้ให้เทสได้) */
export function nonceMatches(payload: TicketPayload, nonce: string | null | undefined): boolean {
  if (!payload.nh) return true
  if (!nonce) return false
  const a = Buffer.from(hashNonce(nonce))
  const b = Buffer.from(payload.nh)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * เผา ticket (single-use): verify HMAC → atomic update usedAt (เฉพาะแถวที่ยังไม่ใช้+ไม่หมดอายุ).
 * คืน userId ถ้าสำเร็จ, null ถ้า verify ไม่ผ่าน / ใช้ไปแล้ว / หมดอายุ / race แพ้.
 */
export async function burnMobileTicket(
  token: string | null | undefined,
  purpose: TicketPurpose,
  nonce?: string | null,
): Promise<string | null> {
  const payload = verifyTicket(token, purpose)
  if (!payload) return null
  /* เช็คก่อนเผา — คนที่ดักได้แต่ตั๋วจะเผาตั๋วทิ้งไม่ได้ด้วย (เจ้าของจริงยังแลกได้ภายใน 60 วิ) */
  if (!nonceMatches(payload, nonce)) return null
  const res = await prisma.mobileAuthTicket.updateMany({
    where: { id: payload.tid, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })
  if (res.count !== 1) return null // ใช้ไปแล้ว / หมดอายุ / race
  return payload.uid
}
