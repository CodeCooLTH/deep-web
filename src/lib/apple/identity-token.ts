/**
 * apple/identity-token — ตรวจ identity token ของ Sign in with Apple (feature 00040 · ภาคผนวก 7)
 *
 * ที่มา: Apple ตีกลับ 2026-09-24 ด้วย **Guideline 4** — แอป iOS ต้องเปิด "แผ่นของระบบ"
 * ไม่ใช่หน้าเว็บ `appleid.apple.com` ⇒ แผ่นนั้นคืน **identity token** มาให้แอป
 * แล้วแอปส่งต่อเข้าหน้าเว็บผ่านสะพาน (`apple-bridge-protocol.ts`) มาจบที่ไฟล์นี้
 *
 * 🛑 **ไฟล์นี้คือด่านเดียวที่กั้นระหว่าง "โทเคนที่ Apple เซ็น" กับ "ใครก็ได้ที่ยิง JSON มา"**
 * ฝั่งแอปเป็นโค้ดที่ผู้ใช้ถือไว้ในมือ แก้ได้ ⇒ ทุกอย่างที่มาจากที่นั่นคือ *ข้อกล่าวอ้าง*
 * ไม่ใช่ข้อเท็จจริง จนกว่าจะผ่านที่นี่
 *
 * ── 🛑 ทำไมใช้ `apple/jws.ts` ที่มีอยู่แล้วไม่ได้ ──────────────────────────────
 *
 * สองอย่างนี้เป็น JWT ของ Apple เหมือนกัน แต่ **คนละกลไกการพิสูจน์ตัวตนของกุญแจ**:
 *
 *   ใบเสร็จ StoreKit (`jws.ts`)  ES256 · แนบห่วงโซ่ใบรับรองมาในโทเคน (`x5c`)
 *                                 ⇒ ตรวจออฟไลน์ได้ สาวถึงใบรากที่เราปักหมุดไว้
 *   identity token (ไฟล์นี้)      RS256 · **ไม่มี `x5c`** มีแต่ `kid`
 *                                 ⇒ ต้องไปดึงกุญแจสาธารณะจาก `/auth/keys` ของ Apple
 *
 * ⇒ ดัดแปลง `jws.ts` ให้รับทั้งสองแบบ = เอาความเสี่ยงสองชนิดมารวมในฟังก์ชันเดียว
 * แล้ววันหนึ่งจะมีคนแก้ฝั่งหนึ่งจนอีกฝั่งหลวมโดยไม่มีใครเห็น — **แยกไฟล์โดยตั้งใจ**
 *
 * ── ทำไมไม่เพิ่มไลบรารี ─────────────────────────────────────────────────────
 *
 * Node 22 รับ JWK ตรง ๆ ได้แล้ว (`createPublicKey({ key, format: 'jwk' })`) ⇒ ไม่ต้องมี
 * `jose` · และ **ห้ามพึ่ง `jose` ที่ติดมาใน `node_modules`** เพราะมันมาทาง next-auth
 * แบบ transitive (`server-api.ts` เขียนเตือนไว้เองแล้ว) วันที่ next-auth เปลี่ยน
 * dependency มันจะหายไปเงียบ ๆ พร้อมกับล็อกอินทั้งระบบ
 */

import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto'

/** ผู้ออกโทเคน — ค่าคงที่ของ Apple ห้ามเปลี่ยน */
export const APPLE_ISSUER = 'https://appleid.apple.com'

/** ที่อยู่กุญแจสาธารณะของ Apple */
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys'

/**
 * bundle id ของแอปผู้ขาย — ค่าที่จะโผล่เป็น `aud` เมื่อโทเคนมาจาก **แผ่นของระบบ**
 *
 * 🛑 **สัญญาข้ามรีโป** — ต้องตรงกับ `ios.bundleIdentifier` ใน `deep-seller-app/app.config.ts`
 * ตัวอักษรต่อตัวอักษร · ไม่ตรง = โทเคนจริงถูกปฏิเสธทุกใบด้วย `WRONG_AUDIENCE`
 * และจะดูเหมือน "ล็อกอิน Apple ในแอปพัง" โดยไม่มีอะไรชี้ว่าเพราะอะไร
 *
 * ไม่รับค่าจาก env โดยตั้งใจ: env ที่ตั้งผิดจะเปิดให้โทเคนของแอปอื่นผ่านด่านนี้ได้
 * ส่วนค่าคงที่ที่ผิดจะถูกเทสจับตั้งแต่ก่อน merge
 */
export const APPLE_APP_BUNDLE_ID = 'com.deepthailand.seller'

/**
 * เหตุผลที่ปฏิเสธ — แยกละเอียดเพื่อให้ตามแก้ถูกจุด
 *
 * 🛑 ห้ามยุบเป็น error เดียว: `WRONG_AUDIENCE` แปลว่า "ตั้งค่าผิด" (เราแก้เองได้)
 * ส่วน `BAD_SIGNATURE` แปลว่า "มีคนพยายามปลอม" (ต้องเฝ้าดู) — สองอย่างนี้ตอบคนละคำถาม
 */
export type AppleIdentityFailure =
  | 'MALFORMED'        // ไม่ใช่รูป JWT 3 ท่อน หรือถอด base64/JSON ไม่ได้
  | 'UNSUPPORTED_ALG'  // ไม่ใช่ RS256 (รวม `none` ซึ่งเป็นช่องโหว่คลาสสิก)
  | 'NO_KEY_ID'        // ไม่มี `kid` ⇒ เลือกกุญแจไม่ได้
  | 'UNKNOWN_KEY'      // `kid` ไม่มีในชุดกุญแจของ Apple
  | 'BAD_SIGNATURE'    // ลายเซ็นไม่ตรงกับกุญแจนั้น
  | 'WRONG_ISSUER'     // `iss` ไม่ใช่ appleid.apple.com
  | 'WRONG_AUDIENCE'   // `aud` ไม่ใช่ของเรา (แอปอื่น/Services ID อื่น)
  | 'EXPIRED'          // เลย `exp` แล้ว
  | 'ISSUED_IN_FUTURE' // `iat` ล้ำหน้าเกินค่าคลาดเคลื่อนที่ยอมรับ
  | 'NONCE_MISMATCH'   // ไม่ใช่โทเคนที่ตอบคำขอของเรา (เล่นซ้ำ)
  | 'NO_SUBJECT'       // ไม่มี `sub` ⇒ ไม่รู้ว่าใคร

/** สิ่งที่เชื่อได้หลังผ่านด่านครบ */
export interface AppleIdentityClaims {
  /** รหัสผู้ใช้ของ Apple — ค่าที่เก็บใน `AuthAccount.providerAccountId` */
  sub: string
  /** ผู้รับที่โทเคนใบนี้ออกให้ (bundle id หรือ Services ID) */
  aud: string
  email?: string
  /** Apple ส่งมาเป็น boolean หรือสตริง `"true"` แล้วแต่รุ่น — ปรับให้เป็น boolean แล้ว */
  emailVerified?: boolean
  /** อีเมลซ่อน (`@privaterelay.appleid.com`) */
  isPrivateEmail?: boolean
}

export type AppleIdentityResult =
  | { ok: true; claims: AppleIdentityClaims }
  | { ok: false; reason: AppleIdentityFailure }

/** กุญแจหนึ่งดอกจาก `/auth/keys` — รับเฉพาะฟิลด์ที่เราใช้จริง */
export interface AppleJwk {
  kty: string
  kid: string
  alg?: string
  use?: string
  n: string
  e: string
}

/**
 * ค่าคลาดเคลื่อนของนาฬิกาที่ยอมรับ (วินาที)
 *
 * เครื่องของผู้ใช้กับเซิร์ฟเวอร์ไม่มีทางตรงกันเป๊ะ — 0 วินาทีจะปฏิเสธโทเคนจริงเป็นครั้งคราว
 * โดยไม่มีใครหาสาเหตุเจอ · 60 วินาทีกว้างพอสำหรับนาฬิกาที่เพี้ยนปกติ แต่แคบพอที่โทเคน
 * ซึ่งมีอายุ 10 นาทีอยู่แล้วจะไม่ถูกยืดอายุอย่างมีนัยสำคัญ
 */
const CLOCK_SKEW_SEC = 60

function b64urlToBuffer(s: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null
  try {
    return Buffer.from(s, 'base64url')
  } catch {
    return null
  }
}

/**
 * ค่าที่ Apple ใส่ใน claim `nonce` = **SHA-256 (hex) ของ nonce ดิบ** ตามธรรมเนียมที่
 * ทุกแพลตฟอร์มใช้ (แอปเป็นคน hash ก่อนส่งให้ระบบ ส่วนค่าดิบเดินทางมาถึงเซิร์ฟเวอร์)
 */
export function hashNonce(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * ตรวจโทเคนเทียบกับชุดกุญแจที่ให้มา — **ฟังก์ชันบริสุทธิ์ ไม่ยิงเน็ต**
 *
 * แยกจากตัวที่ดึงกุญแจโดยตั้งใจ: ด่านความปลอดภัยทั้งหมดอยู่ที่นี่ และมันต้องเทสได้ครบ
 * ทุกช่องโดยไม่ต้องพึ่งเครือข่ายของ Apple (เหตุผลเดียวกับ `verifyAppleJwsWithRoot`)
 *
 * ลำดับการตรวจ — **ห้ามสลับ** ทุกขั้นกันคนละอย่าง:
 *   1. รูปร่าง + อัลกอริทึมต้องเป็น RS256
 *   2. ลายเซ็นต้องตรงกับกุญแจที่ `kid` ชี้
 *   3. `iss` / `aud` ต้องเป็นของเรา
 *   4. เวลา (`exp` / `iat`)
 *   5. `nonce` ต้องตรงกับคำขอของเรา
 *
 * 🛑 ข้อ 2 ต้องมาก่อนข้อ 3–5 เสมอ — ถ้าอ่าน claim มาตัดสินก่อนพิสูจน์ลายเซ็น
 * จะมีจังหวะที่เราเชื่อค่าที่ใครก็เขียนได้ ซึ่งเป็นช่องให้เขียนโค้ดพลาดต่อทีหลัง
 *
 * @param expectedNonce nonce **ดิบ** ที่ฝั่งเว็บสร้างไว้ — `null` = ไม่ตรวจ (เฉพาะเส้นทาง
 *   ที่ไม่ได้ส่ง nonce ไป ซึ่งตอนนี้ไม่มี) · ส่งค่ามา = บังคับต้องตรง
 */
export function verifyAppleIdentityTokenWithKeys(
  token: string,
  opts: {
    keys: readonly AppleJwk[]
    audiences: readonly string[]
    expectedNonce: string | null
    now?: Date
  },
): AppleIdentityResult {
  const now = opts.now ?? new Date()
  const nowSec = Math.floor(now.getTime() / 1000)

  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'MALFORMED' }
  const [rawHeader, rawPayload, rawSignature] = parts

  const headerBuf = b64urlToBuffer(rawHeader)
  const payloadBuf = b64urlToBuffer(rawPayload)
  const signature = b64urlToBuffer(rawSignature)
  if (!headerBuf || !payloadBuf || !signature) return { ok: false, reason: 'MALFORMED' }

  let header: { alg?: unknown; kid?: unknown }
  let payload: Record<string, unknown>
  try {
    header = JSON.parse(headerBuf.toString('utf8'))
    payload = JSON.parse(payloadBuf.toString('utf8'))
  } catch {
    return { ok: false, reason: 'MALFORMED' }
  }
  if (typeof payload !== 'object' || payload === null) return { ok: false, reason: 'MALFORMED' }

  /* Apple เซ็น identity token ด้วย RS256 เท่านั้น — การรับค่าอื่นโดยเฉพาะ `none`
     แปลว่าใครก็ปลอม payload ได้โดยไม่ต้องมีกุญแจเลย */
  if (header.alg !== 'RS256') return { ok: false, reason: 'UNSUPPORTED_ALG' }
  if (typeof header.kid !== 'string' || header.kid.length === 0) {
    return { ok: false, reason: 'NO_KEY_ID' }
  }

  const jwk = opts.keys.find((k) => k.kid === header.kid)
  /* 🛑 เลือกกุญแจด้วย `kid` เท่านั้น ห้ามไล่ลองทุกดอก — การไล่ลองทำให้กุญแจที่ Apple
     กำลังจะเลิกใช้ยังรับโทเคนได้ต่อไป และกลบข้อผิดพลาดของฝั่งเราเองที่ดึงกุญแจมาไม่ครบ */
  if (!jwk) return { ok: false, reason: 'UNKNOWN_KEY' }
  if (jwk.kty !== 'RSA' || (jwk.alg && jwk.alg !== 'RS256')) {
    return { ok: false, reason: 'UNSUPPORTED_ALG' }
  }

  let sigOk: boolean
  try {
    const key = createPublicKey({
      key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
      format: 'jwk',
    })
    sigOk = cryptoVerify(
      'sha256',
      Buffer.from(`${rawHeader}.${rawPayload}`, 'ascii'),
      key,
      signature,
    )
  } catch {
    /* กุญแจที่ Apple ส่งมาพัง/ถอดไม่ได้ — ปฏิบัติเหมือนลายเซ็นไม่ผ่าน ห้ามปล่อยผ่าน */
    return { ok: false, reason: 'BAD_SIGNATURE' }
  }
  if (!sigOk) return { ok: false, reason: 'BAD_SIGNATURE' }

  /* ── ตั้งแต่บรรทัดนี้ลงไป payload พิสูจน์แล้วว่า Apple เป็นคนเซ็น ───────────── */

  if (payload.iss !== APPLE_ISSUER) return { ok: false, reason: 'WRONG_ISSUER' }

  /**
   * 🛑 `aud` มีได้ **2 ค่า** เพราะโทเคนมาได้ 2 ทาง:
   *   แผ่นของระบบ (native) → bundle id        `com.deepthailand.seller`
   *   หน้าเว็บของ Apple    → Services ID       `com.deepthailand.seller.web`
   * รับค่าเดียวก็พังทางใดทางหนึ่งทันที (เธรด Apple Developer #706607 เจอเคสนี้)
   */
  const aud = payload.aud
  const audList = Array.isArray(aud) ? aud : [aud]
  const matchedAud = audList.find(
    (a): a is string => typeof a === 'string' && opts.audiences.includes(a),
  )
  if (!matchedAud) return { ok: false, reason: 'WRONG_AUDIENCE' }

  const exp = payload.exp
  if (typeof exp !== 'number' || nowSec > exp + CLOCK_SKEW_SEC) {
    return { ok: false, reason: 'EXPIRED' }
  }
  const iat = payload.iat
  if (typeof iat === 'number' && iat > nowSec + CLOCK_SKEW_SEC) {
    return { ok: false, reason: 'ISSUED_IN_FUTURE' }
  }

  /**
   * 🛑 nonce คือสิ่งเดียวที่ผูกโทเคนใบนี้เข้ากับ **คำขอครั้งนี้** — ไม่มีมันแล้วโทเคนที่
   * ถูกดักไว้จะถูกยิงซ้ำได้ตลอดอายุ 10 นาทีของมัน โดยเซิร์ฟเวอร์ไม่มีทางรู้
   *
   * รับ 2 รูปแบบ: ค่า hash (ธรรมเนียมปกติ — แอป hash ก่อนส่งให้ระบบ) และค่าดิบ
   * (บางแพลตฟอร์มไม่ hash ให้) · **ทั้งสองผูกกับค่าสุ่มที่เราเพิ่งสร้างเหมือนกัน**
   * จึงไม่ได้ลดความปลอดภัยลงเลย แต่ตัดปัญหา "ไม่ตรงเงียบ ๆ" ที่หาสาเหตุยากมากทิ้งไป
   */
  if (opts.expectedNonce !== null) {
    const got = payload.nonce
    if (typeof got !== 'string') return { ok: false, reason: 'NONCE_MISMATCH' }
    if (got !== hashNonce(opts.expectedNonce) && got !== opts.expectedNonce) {
      return { ok: false, reason: 'NONCE_MISMATCH' }
    }
  }

  const sub = payload.sub
  if (typeof sub !== 'string' || sub.length === 0) return { ok: false, reason: 'NO_SUBJECT' }

  /* Apple ส่ง `email_verified`/`is_private_email` เป็น boolean หรือสตริง `"true"` แล้วแต่รุ่น
     ⇒ ปรับให้เป็น boolean ที่นี่ที่เดียว ผู้เรียกจะได้ไม่ต้องรู้จักความแปลกนี้ */
  const asBool = (v: unknown): boolean | undefined =>
    typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : undefined

  return {
    ok: true,
    claims: {
      sub,
      aud: matchedAud,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      emailVerified: asBool(payload.email_verified),
      isPrivateEmail: asBool(payload.is_private_email),
    },
  }
}

/**
 * ชุดกุญแจที่แคชไว้ — Apple หมุนกุญแจไม่บ่อย แต่ **หมุนจริง**
 *
 * 🛑 แคชต้องมีอายุ ไม่ใช่เก็บตลอดกาล: วันที่ Apple เพิ่มกุญแจใหม่ กระบวนการที่แคชค้าง
 * จะปฏิเสธโทเคนจริงทุกใบด้วย `UNKNOWN_KEY` จนกว่าจะ deploy ใหม่
 *
 * 🛑 และต้องมีทาง **ล้างแคชทันทีเมื่อเจอ `kid` ที่ไม่รู้จัก** ไม่ใช่รอครบเวลา — ไม่งั้น
 * ช่วงที่ Apple เพิ่งหมุนกุญแจจะล็อกอินไม่ได้ทั้งระบบนานถึง 1 ชั่วโมง
 */
const JWKS_TTL_MS = 60 * 60 * 1000
const globalForJwks = globalThis as unknown as {
  appleJwksCache?: { keys: AppleJwk[]; fetchedAt: number }
}

function isJwk(v: unknown): v is AppleJwk {
  if (typeof v !== 'object' || v === null) return false
  const k = v as Record<string, unknown>
  return (
    typeof k.kty === 'string' &&
    typeof k.kid === 'string' &&
    typeof k.n === 'string' &&
    typeof k.e === 'string'
  )
}

/** แปลงคำตอบดิบของ `/auth/keys` เป็นรายการกุญแจ — ทิ้งดอกที่รูปร่างไม่ครบ */
export function parseAppleJwks(raw: unknown): AppleJwk[] {
  if (typeof raw !== 'object' || raw === null) return []
  const keys = (raw as { keys?: unknown }).keys
  if (!Array.isArray(keys)) return []
  return keys.filter(isJwk)
}

/**
 * ดึงชุดกุญแจของ Apple (แคชไว้) — `force` ข้ามแคชเมื่อเจอ `kid` ที่ไม่รู้จัก
 *
 * @param fetchImpl ฉีดเข้ามาได้เพื่อให้เทสไม่ต้องยิงเน็ตจริง
 */
export async function fetchAppleJwks(
  opts: { force?: boolean; now?: number; fetchImpl?: typeof fetch } = {},
): Promise<AppleJwk[]> {
  const now = opts.now ?? Date.now()
  const cached = globalForJwks.appleJwksCache
  if (!opts.force && cached && now - cached.fetchedAt < JWKS_TTL_MS) return cached.keys

  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(APPLE_JWKS_URL, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    /* 🛑 Apple ล่มชั่วคราว ⇒ ใช้กุญแจเก่าต่อดีกว่าล็อกอินไม่ได้ทั้งระบบ
       (กุญแจสาธารณะที่หมดอายุไม่ได้ทำให้ลายเซ็นปลอมผ่าน — มันแค่ปฏิเสธของใหม่) */
    if (cached) return cached.keys
    throw new Error(`APPLE_JWKS_HTTP_${res.status}`)
  }
  const keys = parseAppleJwks(await res.json())
  if (keys.length === 0) {
    if (cached) return cached.keys
    throw new Error('APPLE_JWKS_EMPTY')
  }
  globalForJwks.appleJwksCache = { keys, fetchedAt: now }
  return keys
}

/**
 * ตัวที่โค้ดจริงเรียก — ดึงกุญแจแล้วตรวจ พร้อมลองใหม่ครั้งเดียวเมื่อ `kid` ไม่รู้จัก
 *
 * `audiences` ตั้งต้น = bundle id ของแอป + Services ID ของเว็บ (ถ้าตั้ง env ไว้)
 */
export async function verifyAppleIdentityToken(
  token: string,
  opts: {
    expectedNonce: string | null
    audiences?: readonly string[]
    now?: Date
    fetchImpl?: typeof fetch
  },
): Promise<AppleIdentityResult> {
  const audiences =
    opts.audiences ??
    [APPLE_APP_BUNDLE_ID, process.env.APPLE_CLIENT_ID].filter((a): a is string => Boolean(a))

  const run = async (force: boolean): Promise<AppleIdentityResult> => {
    const keys = await fetchAppleJwks({ force, fetchImpl: opts.fetchImpl })
    return verifyAppleIdentityTokenWithKeys(token, {
      keys,
      audiences,
      expectedNonce: opts.expectedNonce,
      now: opts.now,
    })
  }

  const first = await run(false)
  /* กุญแจที่ไม่รู้จัก = Apple เพิ่งหมุนกุญแจ (หรือแคชของเราเก่า) ⇒ ดึงใหม่แล้วลองอีกครั้ง
     ครั้งเดียวพอ — ถ้ายังไม่ผ่านแปลว่าโทเคนนั้นไม่ได้เซ็นด้วยกุญแจของ Apple จริง ๆ */
  if (first.ok || first.reason !== 'UNKNOWN_KEY') return first
  return run(true)
}
