/**
 * apple/jws — ตรวจลายเซ็นของ Apple แบบออฟไลน์ (feature 00064)
 *
 * StoreKit 2 และ App Store Server Notifications v2 ส่งของมาเป็น **JWS** ที่แนบ
 * ห่วงโซ่ใบรับรองมาในหัวข้อ `x5c` ⇒ ตรวจได้เองโดยไม่ต้องยิงกลับไปถาม Apple
 *
 * 🛑 **ทั้งฟีเจอร์นี้วางความน่าเชื่อถือไว้บนไฟล์นี้ไฟล์เดียว** — ถ้าตรวจหลวม
 * ใครก็ได้ยิง payload ปลอมมาที่ `/api/iap/apple/verify` แล้วได้สิทธิ์ฟรี
 *
 * ── ทำไมตรวจเองไม่ยิงถาม Apple ทุกครั้ง ────────────────────────────────────────
 *
 * webhook ของ Apple มาถึงเราตอนไหนก็ได้และต้องตอบให้ทัน · การยิง network ต่อการ
 * ตรวจหนึ่งครั้งแปลว่าเวลาตอบขึ้นกับเครือข่ายของคนอื่น และ Apple ล่มเมื่อไหร่
 * เราก็ตรวจไม่ได้ทั้งระบบ ⇒ ตรวจด้วยคณิตศาสตร์ล้วน (NFR-IAP-4)
 *
 * ── ทำไมไม่ใช้ไลบรารี JOSE ────────────────────────────────────────────────────
 *
 * ไลบรารี JWS ทั่วไป **ไม่ตรวจห่วงโซ่ใบรับรองให้** (มันตรวจแค่ลายเซ็นกับกุญแจที่เราป้อน)
 * ส่วนที่ยากและสำคัญคือ "กุญแจนี้เป็นของ Apple จริงไหม" ซึ่งต้องเขียนเองอยู่ดี
 * และ Node 22 มี `crypto.X509Certificate` ครบแล้ว ⇒ ไม่เพิ่ม dependency
 */

import { X509Certificate, createHash, verify as cryptoVerify } from 'node:crypto'

import { APPLE_ROOT_CA_G3_PEM, APPLE_ROOT_CA_G3_SHA256 } from './root-ca'

/** เหตุผลที่ปฏิเสธ — แยกให้ละเอียดเพื่อให้ตามแก้ถูกจุด (ห้ามกลืนเป็น error เดียว) */
export type JwsFailure =
  | 'MALFORMED'          // ไม่ใช่รูป JWS 3 ท่อน หรือถอด base64/JSON ไม่ได้
  | 'UNSUPPORTED_ALG'    // ไม่ใช่ ES256
  | 'NO_CERT_CHAIN'      // ไม่มี x5c หรือสั้นเกินไป
  | 'BAD_CERT'           // ใบรับรองพัง parse ไม่ได้
  | 'CERT_EXPIRED'       // ใบใดใบหนึ่งหมดอายุ/ยังไม่เริ่มใช้
  | 'CHAIN_BROKEN'       // ใบไม่ได้เซ็นต่อกันเป็นสาย
  | 'ROOT_NOT_APPLE'     // สาวไปไม่ถึงใบรากของ Apple
  | 'BAD_SIGNATURE'      // ลายเซ็นไม่ตรงกับกุญแจของใบปลาย

export type JwsResult<T> =
  | { ok: true; payload: T }
  | { ok: false; reason: JwsFailure }

function b64urlToBuffer(s: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null
  try {
    return Buffer.from(s, 'base64url')
  } catch {
    return null
  }
}

/**
 * ใบรากที่เราไว้ใจ — โหลดครั้งเดียวและ **ตรวจลายนิ้วมือก่อนใช้**
 *
 * 🛑 ตรวจ fingerprint ตอนโหลด ไม่ใช่เชื่อสตริงใน `root-ca.ts` ดื้อ ๆ — ถ้ามีใครแก้ PEM
 * (ตั้งใจ/merge ผิด/ก็อปผิดใบ) ต้องดังทันทีตอนบูต ไม่ใช่เงียบแล้วไปเชื่อ CA ของคนอื่น
 */
let cachedRoot: X509Certificate | null = null
function trustedRoot(): X509Certificate {
  if (cachedRoot) return cachedRoot
  const cert = new X509Certificate(APPLE_ROOT_CA_G3_PEM)
  const fp = createHash('sha256').update(cert.raw).digest('hex').toUpperCase()
  if (fp !== APPLE_ROOT_CA_G3_SHA256) {
    throw new Error(
      `APPLE_ROOT_CA_MISMATCH: ใบรากที่ฝังไว้ไม่ตรงกับลายนิ้วมือที่ปักหมุด (ได้ ${fp}) — ` +
        'มีคนแก้ root-ca.ts · ห้ามใช้งานต่อจนกว่าจะยืนยันกับ apple.com/certificateauthority',
    )
  }
  cachedRoot = cert
  return cert
}

/**
 * ตรวจ JWS ที่ Apple เซ็น แล้วคืน payload
 *
 * ลำดับการตรวจ (ห้ามสลับ — ทุกขั้นกันคนละอย่าง):
 *   1. รูปร่าง JWS + อัลกอริทึมต้องเป็น ES256
 *   2. ห่วงโซ่ใบรับรองต้องสาวถึง **ใบรากของ Apple ที่เราปักหมุด**
 *   3. ทุกใบต้องยังไม่หมดอายุ
 *   4. ลายเซ็นต้องตรงกับกุญแจของ **ใบปลาย** (ไม่ใช่ใบราก)
 *
 * 🛑 ข้อ 2 ต้องมาก่อนข้อ 4 เสมอ — ถ้าตรวจลายเซ็นก่อนแล้วค่อยดูห่วงโซ่ จะมีจังหวะที่
 * เราเชื่อ payload ที่เซ็นด้วยกุญแจของใครก็ไม่รู้ ซึ่งเป็นช่องให้เขียนโค้ดพลาดต่อทีหลัง
 *
 * @param now ฉีดเวลาเข้ามาได้เพื่อให้เทสคุมเคสหมดอายุได้ (ค่าปกติ = เวลาจริง)
 */
export function verifyAppleJws<T = unknown>(token: string, now: Date = new Date()): JwsResult<T> {
  return verifyAppleJwsWithRoot<T>(token, trustedRoot(), now)
}

/**
 * ตัวจริงที่ทำงาน — แยกออกมาเพื่อ **ฉีดใบรากในเทสได้**
 *
 * 🛑 เทสของจริงต้องสร้างห่วงโซ่ใบรับรองขึ้นมาเองแล้วพิสูจน์ว่าทั้ง 8 เคสทำงานถูก
 * ซึ่งทำไม่ได้ถ้าใบรากถูก hardcode ไว้ข้างใน — และ "ทดสอบไม่ได้" กับโค้ดที่ถือ
 * ความปลอดภัยทั้งฟีเจอร์ไว้ แปลว่าเราไม่รู้เลยว่ามันกันได้จริงไหม
 *
 * 🛑 **ห้ามเรียกตัวนี้จากโค้ดจริง** — มีเทส `[blocker]` สแกนซอร์สทั้ง `src/` บังคับว่า
 * นอกจาก `verifyAppleJws` แล้วห้ามมีใครเรียก มิฉะนั้นจะมีวันที่ใครส่งใบรากของตัวเองเข้ามา
 */
export function verifyAppleJwsWithRoot<T = unknown>(
  token: string,
  root: X509Certificate,
  now: Date = new Date(),
): JwsResult<T> {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'MALFORMED' }
  const [rawHeader, rawPayload, rawSignature] = parts

  const headerBuf = b64urlToBuffer(rawHeader)
  const payloadBuf = b64urlToBuffer(rawPayload)
  const signature = b64urlToBuffer(rawSignature)
  if (!headerBuf || !payloadBuf || !signature) return { ok: false, reason: 'MALFORMED' }

  let header: { alg?: unknown; x5c?: unknown }
  let payload: T
  try {
    header = JSON.parse(headerBuf.toString('utf8'))
    payload = JSON.parse(payloadBuf.toString('utf8')) as T
  } catch {
    return { ok: false, reason: 'MALFORMED' }
  }

  /* Apple ใช้ ES256 เท่านั้น — รับอย่างอื่นไม่ได้ โดยเฉพาะ `none` ซึ่งเป็นช่องโหว่คลาสสิก
     ของ JWT ที่ทำให้ใครก็ปลอม payload ได้โดยไม่ต้องมีกุญแจเลย */
  if (header.alg !== 'ES256') return { ok: false, reason: 'UNSUPPORTED_ALG' }

  const x5c = header.x5c
  if (!Array.isArray(x5c) || x5c.length < 2 || !x5c.every((c) => typeof c === 'string')) {
    return { ok: false, reason: 'NO_CERT_CHAIN' }
  }

  let chain: X509Certificate[]
  try {
    chain = (x5c as string[]).map((der) => new X509Certificate(Buffer.from(der, 'base64')))
  } catch {
    return { ok: false, reason: 'BAD_CERT' }
  }

  /* ── อายุใบรับรอง ─────────────────────────────────────────────────────────
     ตรวจทุกใบในสาย ไม่ใช่แค่ใบปลาย — ใบกลางหมดอายุก็แปลว่าสายนั้นใช้ไม่ได้แล้ว */
  for (const cert of chain) {
    const from = new Date(cert.validFrom)
    const to = new Date(cert.validTo)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { ok: false, reason: 'BAD_CERT' }
    }
    if (now < from || now > to) return { ok: false, reason: 'CERT_EXPIRED' }
  }

  /* ── ห่วงโซ่ต้องเซ็นต่อกันเป็นสาย ────────────────────────────────────────
     x5c เรียงจากใบปลาย → ใบกลาง → (ใบราก) · ใบที่ i ต้องถูกเซ็นโดยใบที่ i+1 */
  for (let i = 0; i < chain.length - 1; i++) {
    if (!chain[i].verify(chain[i + 1].publicKey)) return { ok: false, reason: 'CHAIN_BROKEN' }
  }

  /* ── ปลายสายต้องเป็นใบรากของ Apple ──────────────────────────────────────
     🛑 เทียบด้วย **ไบต์ของใบ** ไม่ใช่ชื่อ subject — ใครก็ออกใบที่ตั้งชื่อตัวเองว่า
     "Apple Root CA - G3" ได้ แต่ปลอมไบต์ทั้งใบให้ตรงไม่ได้

     รับ 2 รูปแบบ: Apple แนบใบรากมาด้วย (สายยาว 3) หรือไม่แนบ (สายยาว 2 — ใบสุดท้าย
     คือใบกลางที่ต้องถูกเซ็นโดยใบรากของเรา) */
  const last = chain[chain.length - 1]
  const lastIsAppleRoot = last.raw.equals(root.raw)
  if (!lastIsAppleRoot && !last.verify(root.publicKey)) {
    return { ok: false, reason: 'ROOT_NOT_APPLE' }
  }

  /* ── ลายเซ็นของ payload ──────────────────────────────────────────────────
     JWS ES256 ใช้ลายเซ็นแบบ raw R‖S (64 ไบต์) ส่วน node ตั้งต้นเป็น DER
     ⇒ ต้องบอก `dsaEncoding: 'ieee-p1363'` ไม่งั้นลายเซ็นที่ถูกต้องจะถูกตีว่าผิดทุกใบ */
  /* `X509Certificate.publicKey` เป็น KeyObject ชนิด public อยู่แล้ว — ห้ามส่งผ่าน
     `createPublicKey()` เพราะตัวนั้นรับ **private key** เพื่อ derive public ออกมา
     ส่ง public เข้าไปจะโยน "Invalid key object type public, expected private"
     (พลาดมาแล้วตอนเขียนรอบแรก — เทสจับได้เพราะเคสที่ไม่ถึงขั้นตรวจลายเซ็นผ่านหมด
     เหลือแดงเฉพาะ 3 เคสที่เดินมาถึงบรรทัดนี้จริง) */
  const leafKey = chain[0].publicKey
  const signingInput = Buffer.from(`${rawHeader}.${rawPayload}`, 'ascii')
  const sigOk = cryptoVerify(
    'sha256',
    signingInput,
    { key: leafKey, dsaEncoding: 'ieee-p1363' },
    signature,
  )
  if (!sigOk) return { ok: false, reason: 'BAD_SIGNATURE' }

  return { ok: true, payload }
}

/**
 * อ่าน payload โดย **ไม่ตรวจลายเซ็น** — ใช้ได้เฉพาะตอนบันทึก log เพื่อการวินิจฉัย
 *
 * 🛑 ห้ามใช้ตัดสินใจให้สิทธิ์เด็ดขาด ชื่อฟังก์ชันจึงยาวและน่ากลัวโดยตั้งใจ
 * (เขียนไว้เพราะ webhook ที่ตรวจไม่ผ่านก็ยังต้องบันทึกว่า "ใครส่งอะไรมา")
 */
export function decodeAppleJwsWithoutVerifying<T = unknown>(token: string): T | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const buf = b64urlToBuffer(parts[1])
  if (!buf) return null
  try {
    return JSON.parse(buf.toString('utf8')) as T
  } catch {
    return null
  }
}
