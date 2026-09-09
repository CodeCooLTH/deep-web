/**
 * ตั๋วเข้า App Store Server API — ตัวเดินตรวจซ้ำใช้ถาม Apple ว่าใบไหนสถานะยังไง (BR-IAP-15)
 *
 * ## ทำไมต้องมีตัวเดินตรวจซ้ำ
 *
 * webhook หายได้จริง — Apple ยิงตอนที่เราล่ม/deploy อยู่พอดี แล้วข่าวนั้นหายไปเลย
 * การพึ่ง webhook อย่างเดียวแปลว่า **วันหนึ่งจะมีคนใช้ฟรีตลอดไปโดยไม่มีใครรู้**
 *
 * ## 🛑 เซ็นด้วย ES256 แบบ P-1363 ไม่ใช่ DER
 *
 * `crypto.sign()` ของ Node คืนลายเซ็นแบบ DER เป็นค่าปริยาย แต่ JWT ต้องการ **raw R‖S**
 * ⇒ ต้องสั่ง `dsaEncoding: 'ieee-p1363'` · ถ้าลืม Apple จะตอบ 401 ทุกครั้งโดยไม่บอกสาเหตุ
 * และจะดูเหมือน "กุญแจผิด" ทั้งที่กุญแจถูก
 */
import { createPrivateKey, generateKeyPairSync, verify as verifySig } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { appleApiHost, buildAppleApiJwt, readSubscriptionStatus } from '@/lib/apple/server-api'

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const NOW = new Date('2026-09-09T00:00:00.000Z')

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString())

function parts(jwt: string) {
  const [h, p, s] = jwt.split('.')
  return { header: decode(h), payload: decode(p), signature: s, signed: `${h}.${p}` }
}

const opts = {
  keyId: 'A8A683WGG5',
  issuerId: '13fc8488-cc66-409a-8215-9fc695cfcddd',
  bundleId: 'com.deepthailand.seller',
  privateKeyPem: PEM,
}

describe('buildAppleApiJwt', () => {
  it('header ตรงตามที่ Apple ต้องการ', () => {
    const { header } = parts(buildAppleApiJwt(opts, NOW))
    expect(header).toEqual({ alg: 'ES256', kid: 'A8A683WGG5', typ: 'JWT' })
  })

  it('payload ครบทุกช่องที่ Apple บังคับ', () => {
    const { payload } = parts(buildAppleApiJwt(opts, NOW))
    expect(payload.iss).toBe(opts.issuerId)
    expect(payload.aud).toBe('appstoreconnect-v1')
    expect(payload.bid).toBe(opts.bundleId)
    expect(payload.iat).toBe(Math.floor(NOW.getTime() / 1000))
  })

  it('🛑 อายุตั๋วต้องไม่เกิน 60 นาที — Apple ปฏิเสธตั๋วที่ยาวกว่านั้น', () => {
    const { payload } = parts(buildAppleApiJwt(opts, NOW))
    const life = payload.exp - payload.iat
    expect(life).toBeGreaterThan(0)
    expect(life).toBeLessThanOrEqual(3600)
  })

  it('🛑 ลายเซ็นเป็น P-1363 (raw R‖S) ยาว 64 ไบต์ ไม่ใช่ DER', () => {
    const { signature, signed } = parts(buildAppleApiJwt(opts, NOW))
    const raw = Buffer.from(signature, 'base64url')
    expect(raw.length, 'DER จะยาวไม่คงที่และขึ้นต้นด้วย 0x30 — Apple จะตอบ 401 เงียบ ๆ').toBe(64)
    expect(raw[0]).not.toBe(0x30)

    const ok = verifySig(
      'sha256',
      Buffer.from(signed),
      /* ส่ง KeyObject สาธารณะตรง ๆ — `createPublicKey()` รับเฉพาะกุญแจส่วนตัว/ตัวหนังสือ
         ถ้าป้อน KeyObject ที่เป็น public อยู่แล้วมันจะโยน "expected private" */
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      raw,
    )
    expect(ok, 'ลายเซ็นต้องตรวจผ่านด้วยกุญแจสาธารณะคู่กัน').toBe(true)
  })

  it('🛑 กุญแจพัง → โยน error ที่อ่านรู้เรื่อง ไม่ใช่ปล่อยตั๋วเสียออกไป', () => {
    expect(() => buildAppleApiJwt({ ...opts, privateKeyPem: 'ไม่ใช่กุญแจ' }, NOW)).toThrow()
  })

  it('รับกุญแจที่ขึ้นบรรทัดใหม่แบบ \\n ในตัวแปรสภาพแวดล้อมได้', () => {
    /* Vercel เก็บค่าหลายบรรทัดเป็น `\n` ตัวอักษร ไม่ใช่ขึ้นบรรทัดจริง —
       ถ้าไม่แปลงกลับ createPrivateKey จะพังทันทีบน prod ทั้งที่เทสในเครื่องผ่าน */
    const escaped = PEM.replace(/\n/g, '\\n')
    expect(() => buildAppleApiJwt({ ...opts, privateKeyPem: escaped }, NOW)).not.toThrow()
    const a = parts(buildAppleApiJwt({ ...opts, privateKeyPem: escaped }, NOW))
    expect(a.payload.iss).toBe(opts.issuerId)
    expect(createPrivateKey(PEM)).toBeTruthy()
  })
})

describe('appleApiHost — Sandbox กับ Production คนละบ้าน', () => {
  it('🛑 ถามผิดบ้าน = 404 ทุกครั้ง แม้ตั๋วถูก', () => {
    expect(appleApiHost('Production')).toBe('https://api.storekit.itunes.apple.com')
    expect(appleApiHost('Sandbox')).toBe('https://api.storekit-sandbox.itunes.apple.com')
  })

  it('ค่าที่ไม่รู้จัก → Sandbox (ปลอดภัยกว่า: ถามผิดบ้านดีกว่าไปยุ่งกับของจริง)', () => {
    expect(appleApiHost(null)).toBe('https://api.storekit-sandbox.itunes.apple.com')
    expect(appleApiHost('อะไรก็ไม่รู้')).toBe('https://api.storekit-sandbox.itunes.apple.com')
  })
})

/**
 * ── อ่านคำตอบจาก /inApps/v1/subscriptions/{id} ────────────────────────────
 *
 * Apple ตอบเป็นกลุ่ม subscription แต่ละกลุ่มมีธุรกรรมล่าสุดหลายใบ (ใบต่อ product)
 * เราสนใจ **ใบของ originalTransactionId ที่ถามไป** เท่านั้น
 *
 * 🛑 หยิบใบแรกมั่ว ๆ ไม่ได้ — บัญชีที่เคยเปลี่ยน tier จะมีหลายใบในกลุ่มเดียวกัน
 * หยิบผิดใบ = เขียนสถานะของแพ็กเกจเก่าทับของปัจจุบัน ลูกค้าถูกลดขั้นโดยไม่มีสาเหตุ
 */
describe('readSubscriptionStatus', () => {
  const OTID = '2000000900000001'
  const body = {
    data: [
      {
        lastTransactions: [
          { originalTransactionId: 'อีกใบ', signedTransactionInfo: 'other.tx', signedRenewalInfo: 'other.rn' },
          { originalTransactionId: OTID, signedTransactionInfo: 'mine.tx', signedRenewalInfo: 'mine.rn' },
        ],
      },
    ],
  }

  it('หยิบใบที่ตรงกับรหัสที่ถามไป ไม่ใช่ใบแรก', () => {
    expect(readSubscriptionStatus(body, OTID)).toEqual({
      signedTransactionInfo: 'mine.tx',
      signedRenewalInfo: 'mine.rn',
    })
  })

  it('ไม่มี renewal info ก็ยังใช้ได้ (ช่วงผ่อนผันเป็นของไม่บังคับ)', () => {
    expect(
      readSubscriptionStatus(
        { data: [{ lastTransactions: [{ originalTransactionId: OTID, signedTransactionInfo: 'a.b' }] }] },
        OTID,
      ),
    ).toEqual({ signedTransactionInfo: 'a.b', signedRenewalInfo: null })
  })

  it('🛑 ไม่เจอใบที่ถาม → null ไม่ใช่หยิบใบอื่นมาแทน', () => {
    expect(readSubscriptionStatus(body, 'ไม่มีจริง')).toBeNull()
  })

  it('🛑 รูปร่างพังทุกแบบ → null ไม่ throw', () => {
    for (const bad of [null, undefined, 0, 'x', [], {}, { data: 'x' }, { data: [{}] }, { data: [{ lastTransactions: 'x' }] }]) {
      expect(() => readSubscriptionStatus(bad, OTID)).not.toThrow()
      expect(readSubscriptionStatus(bad, OTID)).toBeNull()
    }
  })
})
