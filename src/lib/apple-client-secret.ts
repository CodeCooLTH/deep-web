import { createPrivateKey, sign } from 'node:crypto'

/**
 * apple-client-secret — สร้าง "client secret" ของ Sign in with Apple
 *
 * ที่มา: App Store rejection 2026-08-04 (Guideline 4.8) — แอปมีล็อกอิน Facebook/LINE แต่ไม่มี
 * ตัวเลือกที่เก็บข้อมูลน้อยและซ่อนอีเมลได้ ต้องเพิ่ม Sign in with Apple
 *
 * 🛑 Apple ไม่ให้ "client secret" เป็นสตริงตายตัวเหมือน OAuth เจ้าอื่น — ต้องเซ็น **JWT ES256**
 * ด้วย private key (.p8) ที่โหลดได้ครั้งเดียวตอนสร้าง Key ในหน้า Apple Developer
 *
 * ── ทำไมสร้างสด ไม่เก็บ JWT ที่เซ็นไว้แล้วเป็น env var ──────────────────────
 * JWT ตัวนี้ **หมดอายุ** (Apple ให้สูงสุด 6 เดือน) ถ้าเก็บเป็นค่าคงที่ วันหนึ่งมันจะหมดอายุแล้ว
 * **ล็อกอิน Apple พังเงียบ ๆ** โดยไม่มีใครรู้จนกว่าจะมีคนบ่น — และคนที่มาแก้ทีหลังจะไม่รู้ว่า
 * ต้องไปสร้างใหม่ยังไง (เอกสารอยู่คนละที่กับโค้ด) การเซ็นสดจาก .p8 ทำให้ระบบต่ออายุตัวเองเสมอ
 *
 * ── ทำไมไม่ใช้ไลบรารี JWT ────────────────────────────────────────────────
 * Node เซ็น ES256 ได้เองแบบ **synchronous** ผ่าน node:crypto ซึ่งจำเป็น เพราะ NextAuth v4 รับ
 * `clientSecret` เป็นสตริงตอนประกอบ authOptions (ตอน module load) ไม่รองรับ async
 *
 * 🛑 `dsaEncoding: 'ieee-p1363'` ห้ามลืม — ค่า default ของ Node คือ DER ซึ่ง JOSE ไม่รับ
 * ลายเซ็นจะถูกปฏิเสธที่ฝั่ง Apple ด้วย error ที่ไม่บอกสาเหตุ (invalid_client เฉย ๆ)
 */

/** เพดานอายุที่ Apple ยอมรับ = 6 เดือน (15777000 วินาที) — เกินนี้ Apple ปฏิเสธทันที */
const MAX_LIFETIME_SEC = 15777000

/** ผู้รับของ JWT ตามสเปกของ Apple — ค่าคงที่ ห้ามเปลี่ยน */
const APPLE_AUDIENCE = 'https://appleid.apple.com'

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export interface AppleClientSecretInput {
  /** Team ID ของบัญชีนักพัฒนา (มุมขวาบนหน้า Apple Developer) */
  teamId: string
  /** Key ID ของ .p8 ที่สร้างไว้ */
  keyId: string
  /** **Services ID** ไม่ใช่ bundle id ของแอป — ตัวที่ลงทะเบียนไว้สำหรับ Web Authentication */
  clientId: string
  /** เนื้อไฟล์ .p8 ทั้งก้อน รวมบรรทัด BEGIN/END */
  privateKey: string
  /** เวลาปัจจุบันเป็นวินาที — รับเข้ามาเพื่อให้เทสกำหนดเองได้ */
  nowSec?: number
}

/**
 * คืน JWT ที่ใช้เป็น client secret ของ Apple
 *
 * throw เมื่อ private key ใช้ไม่ได้ — ตั้งใจให้ดัง ไม่กลืน: ผู้เรียก (auth.ts) จับแล้วเลือกที่จะ
 * **ไม่เปิด provider นี้เลย** ดีกว่าปล่อยให้ปุ่ม Apple โผล่แล้วกดไม่ได้ ซึ่งอ่านเหมือนระบบพัง
 */
export function createAppleClientSecret(input: AppleClientSecretInput): string {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000)

  const header = { alg: 'ES256', kid: input.keyId, typ: 'JWT' }
  const payload = {
    iss: input.teamId,
    iat: now,
    exp: now + MAX_LIFETIME_SEC,
    aud: APPLE_AUDIENCE,
    sub: input.clientId,
  }

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: createPrivateKey(normalizePrivateKey(input.privateKey)),
    dsaEncoding: 'ieee-p1363',
  })

  return `${signingInput}.${base64url(signature)}`
}

/**
 * คืนค่า private key ให้อยู่ในรูปที่ createPrivateKey อ่านได้
 *
 * 🛑 จำเป็นเพราะ env var บน Vercel/`.env` เก็บค่าหลายบรรทัดไม่ได้ตรง ๆ — คนตั้งค่าจึงมักวางเป็น
 * บรรทัดเดียวที่มี `\n` เป็นตัวอักษรสองตัว (backslash + n) ไม่ใช่ขึ้นบรรทัดจริง ถ้าไม่แปลงกลับ
 * `createPrivateKey` จะ throw ว่า "unsupported" ซึ่งอ่านไม่ออกเลยว่าต้นเหตุคือรูปแบบ newline
 */
function normalizePrivateKey(raw: string): string {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
}

/**
 * อีเมลนี้เป็น "อีเมลซ่อน" ที่ Apple สร้างให้หรือเปล่า
 *
 * ผู้ใช้ที่เลือก "ซ่อนอีเมลของฉัน" ตอนล็อกอินจะได้อีเมลหน้าตา `x7k9m2p@privaterelay.appleid.com`
 * ซึ่ง **ไม่ใช่อีเมลจริงของเขา** และเป็นคนละค่ากันในแต่ละแอป
 *
 * 🛑 ทำไมต้องแยกให้ออก: ระบบเรามีฟีเจอร์จับคู่ประวัติลูกค้าเก่าด้วยอีเมล (linkBuyerHistory)
 * ถ้าเอาอีเมล relay ไปเก็บเป็น `User.email` แล้วใช้จับคู่ จะไม่มีวันตรงกับใคร (ไม่เสียหาย) แต่
 * ที่แย่กว่าคือมันจะกลายเป็น "อีเมลของผู้ใช้คนนี้" ในระบบเรา ทั้งที่ส่งอีเมลไปหาไม่ได้จริงถ้าเขา
 * กดตัดการส่งต่อทิ้ง — และหน้าโปรไฟล์จะโชว์อีเมลที่ผู้ใช้เองก็ไม่รู้จัก
 */
export function isApplePrivateRelayEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith('@privaterelay.appleid.com')
}
