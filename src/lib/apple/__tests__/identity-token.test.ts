/**
 * [blocker] ตัวตรวจ identity token ของ Sign in with Apple (feature 00040 · ภาคผนวก 7)
 *
 * ## ทำไมต้องเป็น [blocker]
 *
 * ไฟล์ที่เทสนี้คุมคือ **ด่านเดียว** ที่กั้นระหว่าง "โทเคนที่ Apple เซ็น" กับ "ใครก็ได้ที่ยิง
 * JSON มาที่เซิร์ฟเวอร์" — ฝั่งแอปเป็นโค้ดที่อยู่ในมือผู้ใช้ แก้ได้ ⇒ ถ้าด่านนี้หลวม
 * ใครก็ยิงคำขอเข้ามาแล้วได้ session ของผู้ขายคนไหนก็ได้
 *
 * ## 🛑 สิ่งที่เทสนี้ต้องพิสูจน์ ไม่ใช่แค่ "เรียกแล้วไม่ error"
 *
 * 1. โทเคนจริงผ่าน (ไม่งั้นด่านที่ปฏิเสธทุกอย่างก็ "ปลอดภัย" แต่ไร้ประโยชน์)
 * 2. **ทุกช่องปฏิเสธถูกกระตุ้นจริง** ด้วยโทเคนที่ต่างกันแค่จุดเดียว
 * 3. **ลำดับการตรวจ** — ลายเซ็นต้องถูกตรวจก่อน claim เสมอ
 *
 * สร้างกุญแจ RSA ขึ้นมาเองในเทส ไม่ใช้ fixture แช่แข็ง — เพราะสิ่งที่ต้องพิสูจน์คือ
 * "คณิตศาสตร์ของลายเซ็นถูกบังคับจริง" ไม่ใช่ "สตริงชุดนี้ผ่าน"
 */
import { createHash, generateKeyPairSync, createSign, type KeyObject } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  APPLE_APP_BUNDLE_ID,
  APPLE_ISSUER,
  APPLE_JWKS_URL,
  fetchAppleJwks,
  hashNonce,
  parseAppleJwks,
  verifyAppleIdentityToken,
  verifyAppleIdentityTokenWithKeys,
  type AppleJwk,
} from '@/lib/apple/identity-token'

// ─── เครื่องมือสร้างโทเคนจริง ────────────────────────────────────────────────

function makeKeyPair(kid: string): { jwk: AppleJwk; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const raw = publicKey.export({ format: 'jwk' }) as { n: string; e: string }
  return { jwk: { kty: 'RSA', kid, alg: 'RS256', use: 'sig', n: raw.n, e: raw.e }, privateKey }
}

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')

/** เซ็นโทเคนจริงด้วย RS256 — `sign: false` = แนบลายเซ็นขยะ (ใช้ทดสอบ alg `none`) */
function makeToken(
  privateKey: KeyObject,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  opts: { sign?: boolean } = {},
): string {
  const h = b64url(header)
  const p = b64url(payload)
  if (opts.sign === false) return `${h}.${p}.${Buffer.from('x').toString('base64url')}`
  const signer = createSign('sha256')
  signer.update(`${h}.${p}`)
  return `${h}.${p}.${signer.sign(privateKey).toString('base64url')}`
}

const NOW = new Date('2026-09-25T10:00:00Z')
const NOW_SEC = Math.floor(NOW.getTime() / 1000)
const RAW_NONCE = 'nonce-ดิบ-ของเรา-12345'

const KID = 'apple-key-1'
const { jwk: JWK, privateKey: KEY } = makeKeyPair(KID)

function basePayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: APPLE_ISSUER,
    aud: APPLE_APP_BUNDLE_ID,
    sub: '001234.abcdef.5678',
    exp: NOW_SEC + 600,
    iat: NOW_SEC - 5,
    nonce: hashNonce(RAW_NONCE),
    email: 'seller@example.com',
    email_verified: 'true',
    ...over,
  }
}

function verify(
  payload: Record<string, unknown>,
  over: { header?: Record<string, unknown>; keys?: AppleJwk[]; nonce?: string | null; sign?: boolean } = {},
) {
  const token = makeToken(
    KEY,
    { alg: 'RS256', kid: KID, typ: 'JWT', ...over.header },
    payload,
    { sign: over.sign },
  )
  return verifyAppleIdentityTokenWithKeys(token, {
    keys: over.keys ?? [JWK],
    audiences: [APPLE_APP_BUNDLE_ID, 'com.deepthailand.seller.web'],
    expectedNonce: over.nonce === undefined ? RAW_NONCE : over.nonce,
    now: NOW,
  })
}

// ─── เคส ────────────────────────────────────────────────────────────────────

describe('[blocker] identity token ที่ถูกต้องต้องผ่าน', () => {
  it('โทเคนจริงจากแผ่นของระบบผ่าน และคืน sub/aud/email', () => {
    const r = verify(basePayload())
    expect(r.ok, `ถูกปฏิเสธ: ${r.ok ? '' : r.reason}`).toBe(true)
    if (!r.ok) return
    expect(r.claims.sub).toBe('001234.abcdef.5678')
    expect(r.claims.aud).toBe(APPLE_APP_BUNDLE_ID)
    expect(r.claims.email).toBe('seller@example.com')
    /* Apple ส่ง "true" เป็นสตริง — ผู้เรียกต้องได้ boolean ไม่ใช่ความแปลกนี้ */
    expect(r.claims.emailVerified).toBe(true)
  })

  it('โทเคนจากหน้าเว็บของ Apple (aud = Services ID) ก็ต้องผ่านด้วย', () => {
    /* 🛑 เคสนี้คือเหตุผลที่ `audiences` เป็นรายการ ไม่ใช่ค่าเดียว — รับค่าเดียว
       แปลว่าผู้ขายที่ล็อกอินจากเบราว์เซอร์พังทันทีที่เราเปิดทาง native */
    const r = verify(basePayload({ aud: 'com.deepthailand.seller.web' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.claims.aud).toBe('com.deepthailand.seller.web')
  })

  it('aud ที่มาเป็นรายการ ขอแค่มีของเราอยู่ในนั้น', () => {
    const r = verify(basePayload({ aud: ['com.someone.else', APPLE_APP_BUNDLE_ID] }))
    expect(r.ok).toBe(true)
  })

  it('nonce ที่ส่งมาเป็นค่าดิบ (แพลตฟอร์มที่ไม่ hash ให้) ก็ต้องผ่าน', () => {
    const r = verify(basePayload({ nonce: RAW_NONCE }))
    expect(r.ok).toBe(true)
  })

  it('นาฬิกาเพี้ยนเล็กน้อยต้องไม่ทำให้โทเคนจริงตก', () => {
    /* หมดอายุไป 30 วินาที — อยู่ในค่าคลาดเคลื่อนที่ยอมรับ (60 วิ)
       ถ้าเคสนี้แดง แปลว่าผู้ใช้จริงจะล็อกอินไม่ได้เป็นครั้งคราวโดยไม่มีใครหาสาเหตุเจอ */
    const r = verify(basePayload({ exp: NOW_SEC - 30 }))
    expect(r.ok).toBe(true)
  })
})

describe('[blocker] ทุกช่องปฏิเสธต้องถูกกระตุ้นจริง', () => {
  it('🛑 alg `none` ต้องตก — ช่องโหว่คลาสสิกที่ทำให้ใครก็ปลอม payload ได้', () => {
    const r = verify(basePayload(), { header: { alg: 'none' }, sign: false })
    expect(r).toEqual({ ok: false, reason: 'UNSUPPORTED_ALG' })
  })

  it('alg ES256 (ของใบเสร็จ StoreKit) ต้องตก — คนละกลไก ห้ามปนกัน', () => {
    const r = verify(basePayload(), { header: { alg: 'ES256' } })
    expect(r).toEqual({ ok: false, reason: 'UNSUPPORTED_ALG' })
  })

  it('ไม่มี kid → NO_KEY_ID', () => {
    const r = verify(basePayload(), { header: { kid: undefined } })
    expect(r).toEqual({ ok: false, reason: 'NO_KEY_ID' })
  })

  it('kid ที่ไม่มีในชุดกุญแจ → UNKNOWN_KEY', () => {
    const r = verify(basePayload(), { header: { kid: 'ไม่มีดอกนี้' } })
    expect(r).toEqual({ ok: false, reason: 'UNKNOWN_KEY' })
  })

  it('🛑 กุญแจคนละดอกที่ตั้ง kid ให้ตรงกัน ต้องตกที่ลายเซ็น', () => {
    /* คือท่าโจมตีจริง: ผู้โจมตีเซ็นด้วยกุญแจตัวเอง แล้วตั้ง kid ให้ตรงกับของ Apple
       ด่านที่เลือกกุญแจด้วย kid อย่างเดียวโดยไม่ตรวจลายเซ็น จะปล่อยผ่านทันที */
    const attacker = makeKeyPair(KID)
    const token = makeToken(attacker.privateKey, { alg: 'RS256', kid: KID }, basePayload())
    const r = verifyAppleIdentityTokenWithKeys(token, {
      keys: [JWK],
      audiences: [APPLE_APP_BUNDLE_ID],
      expectedNonce: RAW_NONCE,
      now: NOW,
    })
    expect(r).toEqual({ ok: false, reason: 'BAD_SIGNATURE' })
  })

  it('payload ที่ถูกแก้หลังเซ็น → BAD_SIGNATURE', () => {
    const token = makeToken(KEY, { alg: 'RS256', kid: KID }, basePayload())
    const [h, , s] = token.split('.')
    const swapped = `${h}.${b64url(basePayload({ sub: 'ของคนอื่น' }))}.${s}`
    const r = verifyAppleIdentityTokenWithKeys(swapped, {
      keys: [JWK],
      audiences: [APPLE_APP_BUNDLE_ID],
      expectedNonce: RAW_NONCE,
      now: NOW,
    })
    expect(r).toEqual({ ok: false, reason: 'BAD_SIGNATURE' })
  })

  it('iss ที่ไม่ใช่ Apple → WRONG_ISSUER', () => {
    expect(verify(basePayload({ iss: 'https://evil.example.com' }))).toEqual({
      ok: false,
      reason: 'WRONG_ISSUER',
    })
  })

  it('aud ของแอปอื่น → WRONG_AUDIENCE', () => {
    expect(verify(basePayload({ aud: 'com.someone.else' }))).toEqual({
      ok: false,
      reason: 'WRONG_AUDIENCE',
    })
  })

  it('หมดอายุเกินค่าคลาดเคลื่อน → EXPIRED', () => {
    expect(verify(basePayload({ exp: NOW_SEC - 600 }))).toEqual({ ok: false, reason: 'EXPIRED' })
  })

  it('ไม่มี exp เลย → EXPIRED (ห้ามตีความว่า "ไม่มีวันหมดอายุ")', () => {
    expect(verify(basePayload({ exp: undefined }))).toEqual({ ok: false, reason: 'EXPIRED' })
  })

  it('iat ล้ำอนาคต → ISSUED_IN_FUTURE', () => {
    expect(verify(basePayload({ iat: NOW_SEC + 3600 }))).toEqual({
      ok: false,
      reason: 'ISSUED_IN_FUTURE',
    })
  })

  it('🛑 nonce ไม่ตรง → NONCE_MISMATCH (กันการเล่นโทเคนซ้ำ)', () => {
    expect(verify(basePayload({ nonce: hashNonce('ของคำขออื่น') }))).toEqual({
      ok: false,
      reason: 'NONCE_MISMATCH',
    })
  })

  it('🛑 ไม่มี nonce ในโทเคนทั้งที่เราส่งไป → NONCE_MISMATCH ห้ามปล่อยผ่าน', () => {
    /* ถ้าปล่อยผ่านเมื่อ claim หายไป การกัน replay จะถูกปิดได้ด้วยการ "ไม่ส่ง nonce" */
    expect(verify(basePayload({ nonce: undefined }))).toEqual({
      ok: false,
      reason: 'NONCE_MISMATCH',
    })
  })

  it('ไม่มี sub → NO_SUBJECT', () => {
    expect(verify(basePayload({ sub: undefined }))).toEqual({ ok: false, reason: 'NO_SUBJECT' })
  })

  it('ไม่ใช่รูป JWT → MALFORMED', () => {
    const r = verifyAppleIdentityTokenWithKeys('ไม่ใช่โทเคน', {
      keys: [JWK],
      audiences: [APPLE_APP_BUNDLE_ID],
      expectedNonce: null,
    })
    expect(r).toEqual({ ok: false, reason: 'MALFORMED' })
  })
})

describe('[blocker] ลำดับการตรวจ — ลายเซ็นต้องมาก่อน claim', () => {
  it('🛑 โทเคนที่ทั้งลายเซ็นผิดและ iss ผิด ต้องตอบ BAD_SIGNATURE ไม่ใช่ WRONG_ISSUER', () => {
    /* ถ้าตอบ WRONG_ISSUER แปลว่าโค้ดอ่าน claim มาตัดสิน **ก่อน** พิสูจน์ว่าใครเซ็น
       — คือจังหวะที่เราเชื่อค่าที่ใครก็เขียนได้ และเป็นรากของบั๊กความปลอดภัยรุ่นต่อไป */
    const attacker = makeKeyPair(KID)
    const token = makeToken(
      attacker.privateKey,
      { alg: 'RS256', kid: KID },
      basePayload({ iss: 'https://evil.example.com' }),
    )
    const r = verifyAppleIdentityTokenWithKeys(token, {
      keys: [JWK],
      audiences: [APPLE_APP_BUNDLE_ID],
      expectedNonce: RAW_NONCE,
      now: NOW,
    })
    expect(r).toEqual({ ok: false, reason: 'BAD_SIGNATURE' })
  })
})

describe('[blocker] ชุดกุญแจของ Apple', () => {
  beforeEach(() => {
    ;(globalThis as { appleJwksCache?: unknown }).appleJwksCache = undefined
  })

  it('parseAppleJwks ทิ้งดอกที่รูปร่างไม่ครบ ไม่ใช่ทั้งชุด', () => {
    const keys = parseAppleJwks({ keys: [JWK, { kty: 'RSA', kid: 'ไม่มี n/e' }, null, 'x'] })
    expect(keys).toHaveLength(1)
    expect(keys[0].kid).toBe(KID)
  })

  it('คำตอบที่ไม่ใช่รูป JWKS → รายการว่าง ไม่ throw', () => {
    expect(parseAppleJwks(null)).toEqual([])
    expect(parseAppleJwks({ keys: 'ไม่ใช่รายการ' })).toEqual([])
  })

  it('ดึงกุญแจแล้วแคชไว้ — เรียกซ้ำต้องไม่ยิงเน็ตอีก', async () => {
    const seen: string[] = []
    const fetchImpl = vi.fn(async (url: unknown) => {
      seen.push(String(url))
      return new Response(JSON.stringify({ keys: [JWK] }))
    })
    await fetchAppleJwks({ fetchImpl: fetchImpl as unknown as typeof fetch })
    await fetchAppleJwks({ fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(seen[0]).toBe(APPLE_JWKS_URL)
  })

  it('🛑 force ข้ามแคช — ใช้ตอน Apple หมุนกุญแจ', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ keys: [JWK] })))
    await fetchAppleJwks({ fetchImpl: fetchImpl as unknown as typeof fetch })
    await fetchAppleJwks({ force: true, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('🛑 Apple ล่ม + มีกุญแจเก่าในแคช → ใช้ของเก่าต่อ ไม่ใช่ล็อกอินไม่ได้ทั้งระบบ', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ keys: [JWK] })))
    await fetchAppleJwks({ fetchImpl: ok as unknown as typeof fetch })
    const down = vi.fn(async () => new Response('boom', { status: 503 }))
    const keys = await fetchAppleJwks({
      force: true,
      fetchImpl: down as unknown as typeof fetch,
    })
    expect(keys[0].kid).toBe(KID)
  })

  it('🛑 kid ไม่รู้จัก → ดึงกุญแจใหม่แล้วลองอีกครั้ง (Apple เพิ่งหมุนกุญแจ)', async () => {
    const fresh = makeKeyPair('apple-key-2')
    const token = makeToken(fresh.privateKey, { alg: 'RS256', kid: 'apple-key-2' }, basePayload())
    let call = 0
    const fetchImpl = vi.fn(async () => {
      call += 1
      /* ครั้งแรกได้กุญแจชุดเก่า (ไม่มีดอกใหม่) ครั้งที่สองได้ชุดที่หมุนแล้ว */
      return new Response(JSON.stringify({ keys: call === 1 ? [JWK] : [JWK, fresh.jwk] }))
    })
    const r = await verifyAppleIdentityToken(token, {
      expectedNonce: RAW_NONCE,
      audiences: [APPLE_APP_BUNDLE_ID],
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r.ok, `ยังตก: ${r.ok ? '' : r.reason}`).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('ลายเซ็นผิด → ห้ามไล่ดึงกุญแจซ้ำไปเรื่อย ๆ (ยิงเน็ตครั้งเดียว)', async () => {
    const attacker = makeKeyPair(KID)
    const token = makeToken(attacker.privateKey, { alg: 'RS256', kid: KID }, basePayload())
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ keys: [JWK] })))
    const r = await verifyAppleIdentityToken(token, {
      expectedNonce: RAW_NONCE,
      audiences: [APPLE_APP_BUNDLE_ID],
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r).toEqual({ ok: false, reason: 'BAD_SIGNATURE' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('[blocker] สัญญาข้ามรีโป', () => {
  it('🛑 bundle id ต้องตรงกับ app.config.ts ของ deep-seller-app', () => {
    /* คนละรีโป ไม่มี type ตัวไหนเชื่อมให้ — ไม่ตรงกัน = โทเคนจริงถูกปฏิเสธทุกใบ
       ด้วย WRONG_AUDIENCE แล้วดูเหมือน "ล็อกอิน Apple ในแอปพัง" โดยไม่มีอะไรชี้สาเหตุ
       อ่านจากไฟล์จริงของอีกรีโป ไม่ใช่เขียนค่าซ้ำไว้ในเทส (ซึ่งจะเป็น tautology) */
    const appConfig = '/Users/pongsakorn/Desktop/deep-seller-app/app.config.ts'
    let src: string
    try {
      src = readFileSync(appConfig, 'utf8')
    } catch {
      /* ไม่มีรีโปแอปบนเครื่องนี้ (เช่นบน CI) — ข้ามได้ แต่ห้ามเงียบ */
      console.warn(`[identity-token] ข้ามการเทียบ bundle id: เปิด ${appConfig} ไม่ได้`)
      return
    }
    expect(src).toContain(`bundleIdentifier: '${APPLE_APP_BUNDLE_ID}'`)
  })

  it('hashNonce ต้องเป็น SHA-256 hex — รูปแบบที่ทุกแพลตฟอร์มใช้', () => {
    expect(hashNonce('abc')).toBe(createHash('sha256').update('abc').digest('hex'))
    expect(hashNonce('abc')).toHaveLength(64)
  })
})

describe('[blocker] ห้ามมีทางลัดข้ามการตรวจ', () => {
  /** ไล่ไฟล์ซอร์สจริงทั้งหมด (ข้ามเทส) — แพตเทิร์นเดียวกับด่านของ `apple/jws.ts` */
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(join(process.cwd(), dir))) {
      const rel = `${dir}/${name}`
      if (statSync(join(process.cwd(), rel)).isDirectory()) {
        if (name === 'node_modules' || name === '__tests__') continue
        walk(rel, out)
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel)
    }
    return out
  }

  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('🛑 โค้ดจริงห้ามเรียก `verifyAppleIdentityTokenWithKeys` — มีไว้ให้เทสเท่านั้น', () => {
    /**
     * ตัวนั้นรับ **ชุดกุญแจจากผู้เรียก** ⇒ ถ้าโค้ดจริงเรียกได้ วันหนึ่งจะมีคนส่งกุญแจของ
     * ตัวเองเข้าไปแล้วโทเคนปลอมผ่านด่านทั้งหมด · ตัวที่ถูกต้องคือ `verifyAppleIdentityToken`
     * ซึ่งดึงกุญแจจาก Apple เอง
     *
     * ด่านนี้ลอกมาจาก `apple/jws.ts` ที่ปิดช่องเดียวกันไว้แล้ว — **ตัวตรวจใหม่ตกสำรวจ
     * ตอนเขียนรอบแรก** เจอตอนไล่ตรวจซ้ำ 2026-09-25 (กฎที่ "มีอยู่แล้วที่อื่น" ไม่ได้ตาม
     * มาเองเมื่อมีโค้ดคลาสเดียวกันเพิ่ม — `rule-must-be-enforced-not-described.md`)
     *
     * 🛑 ตัดคอมเมนต์ก่อนสแกน: ไฟล์ที่ทำถูกคือไฟล์ที่อธิบายกฎนี้ไว้ด้วย
     */
    const offenders = walk('src').filter(
      (f) =>
        f !== 'src/lib/apple/identity-token.ts' &&
        stripComments(readFileSync(join(process.cwd(), f), 'utf8')).includes(
          'verifyAppleIdentityTokenWithKeys',
        ),
    )
    expect(offenders, `เรียกตัวที่ฉีดกุญแจได้: ${offenders.join(', ')}`).toEqual([])
  })

  it('🛑 ทุก route ที่ตรวจโทเคน ต้องอ่าน nonce จาก **คุกกี้** ไม่ใช่จาก body', () => {
    /**
     * รับ nonce จาก body = ผู้โจมตีคุมทั้งสองฝั่งของการเทียบ แล้วด่านผ่านทุกครั้ง
     * — เป็นด่านที่ดูเหมือนมีแต่ไม่กันอะไร (ร่างแรกของงานนี้เป็นแบบนั้นจริง)
     *
     * ไล่หา **ทุกไฟล์ที่เรียกตัวตรวจ** ไม่ใช่รายชื่อ route ที่ฮาร์ดโค้ดไว้ ⇒ route ใหม่ที่
     * เพิ่มทีหลังถูกจับได้เองโดยไม่ต้องมีใครจำมาแก้เทส
     */
    const callers = walk('src').filter(
      (f) =>
        f !== 'src/lib/apple/identity-token.ts' &&
        stripComments(readFileSync(join(process.cwd(), f), 'utf8')).includes(
          'verifyAppleIdentityToken(',
        ),
    )
    expect(callers.length, 'ไม่เจอผู้เรียกเลย — ด่านนี้กำลังตรวจความว่างเปล่า').toBeGreaterThan(0)
    for (const f of callers) {
      const code = stripComments(readFileSync(join(process.cwd(), f), 'utf8'))
      /**
       * 🛑 ต้องจับ **การอ่านค่า** (`.get(APPLE_NONCE_COOKIE)`) ไม่ใช่แค่ชื่อที่โผล่ที่ไหนก็ได้
       *
       * ร่างแรกเช็ก `toContain('APPLE_NONCE_COOKIE')` เฉย ๆ แล้ว mutation พิสูจน์ว่าจับไม่ได้:
       * เปลี่ยนค่าที่อ่านเป็นค่าคงที่แล้วเทสยังเขียว เพราะ **บรรทัด `import` ก็ match**
       * (รอยเดิมที่รีโปเตือนไว้เองใน `rule-must-be-enforced-not-described.md`)
       */
      expect(code, `${f}: ไม่ได้อ่าน nonce จากคุกกี้`).toMatch(/\.get\(APPLE_NONCE_COOKIE\)/)
      /* และค่าที่ส่งเข้าตัวตรวจต้องเป็นตัวแปรที่มาจากคุกกี้นั้น ไม่ใช่ค่าที่แต่งขึ้นทีหลัง */
      expect(code, `${f}: ค่าที่ส่งเข้าตัวตรวจไม่ได้มาจากคุกกี้`).toMatch(
        /expectedNonce\s*=\s*[^\n]*APPLE_NONCE_COOKIE/,
      )
      expect(code, `${f}: รับ nonce จาก body = ด่านที่ไม่กันอะไร`).not.toMatch(/nonce:\s*v\./)
    }
  })
})
