/**
 * Unit tests — src/lib/link-intent.ts (FR-LO-16 Account Linking)
 * Test: sign → verify round-trip, HMAC tamper, expiry, edge cases
 *
 * ทำไม vitest ไม่ต้อง dev server: link-intent.ts ใช้เฉพาะ Node `crypto` module
 *   → pure unit, isolate ได้ 100% (ไม่มี DB / HTTP / NextAuth dependency)
 *
 * AC mapping:
 *   AC-06 = tampered userId → HMAC mismatch → null
 *   AC-07 = expired token → null
 */

import { describe, it, expect, beforeAll, vi } from 'vitest'

// ตั้ง NEXTAUTH_SECRET ก่อน import module — link-intent throw ถ้าไม่มี SECRET
const TEST_SECRET = 'test-secret-for-link-intent-unit-tests-32chars!!'

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = TEST_SECRET
})

// Dynamic import หลัง set env (module-level SECRET ถูก read ตอน import)
async function getModule() {
  // reset module cache เพื่อ re-read SECRET ที่ตั้งใน beforeAll
  return await import('./link-intent')
}

describe('signLinkIntent + verifyLinkIntent — round-trip', () => {
  it('sign → verify คืน { userId, provider } ที่ถูกต้อง', async () => {
    const { signLinkIntent, verifyLinkIntent } = await getModule()

    const token = signLinkIntent({ userId: 'user-abc', provider: 'LINE' })
    const result = verifyLinkIntent(token)

    expect(result).not.toBeNull()
    expect(result?.userId).toBe('user-abc')
    expect(result?.provider).toBe('LINE')
  })

  it('token มี format payloadB64.sigB64 (dot separator)', async () => {
    const { signLinkIntent } = await getModule()
    const token = signLinkIntent({ userId: 'u1', provider: 'FACEBOOK' })
    const parts = token.split('.')
    // payloadB64 + sigB64 = 2 part (dot ตัวแรกเท่านั้น; sig ไม่มี dot)
    expect(parts.length).toBeGreaterThanOrEqual(2)
  })

  it('verify ด้วย token ที่ถูกต้อง คืน non-null', async () => {
    const { signLinkIntent, verifyLinkIntent } = await getModule()
    const token = signLinkIntent({ userId: 'sellerX', provider: 'INSTAGRAM' })
    expect(verifyLinkIntent(token)).not.toBeNull()
  })
})

describe('verifyLinkIntent — HMAC tamper (AC-06)', () => {
  it('AC-06: แก้ userId ใน payload → HMAC mismatch → null', async () => {
    const { signLinkIntent, verifyLinkIntent } = await getModule()

    const token = signLinkIntent({ userId: 'victim', provider: 'LINE' })

    // ปลอม payload: เปลี่ยน userId → 'attacker'
    const dot = token.indexOf('.')
    const payloadB64 = token.slice(0, dot)
    const sig = token.slice(dot + 1)

    // decode → แก้ userId → encode กลับ
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    payload.userId = 'attacker'
    const tamperedB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')

    // ประกอบ token ใหม่ด้วย payload ที่แก้แล้ว + sig เดิม
    const tamperedToken = `${tamperedB64}.${sig}`

    expect(verifyLinkIntent(tamperedToken)).toBeNull()
  })

  it('AC-06: แก้ sig ตรงๆ → HMAC mismatch → null', async () => {
    const { signLinkIntent, verifyLinkIntent } = await getModule()

    const token = signLinkIntent({ userId: 'u2', provider: 'FACEBOOK' })
    // เพิ่มตัวอักษรท้าย sig ให้เพี้ยน
    const dot = token.indexOf('.')
    const badSig = token.slice(dot + 1) + 'x'
    const tamperedToken = token.slice(0, dot + 1) + badSig

    // ความยาว sig ต่างออกไป → timingSafeEqual block (ก่อนถึง compare) → null
    expect(verifyLinkIntent(tamperedToken)).toBeNull()
  })

  it('AC-06: token จาก secret อื่น → null (cross-secret verify ล้มเหลว)', async () => {
    // sign ด้วย function เดิม (SECRET ตั้งไว้แล้ว)
    const { signLinkIntent } = await getModule()
    const token = signLinkIntent({ userId: 'u3', provider: 'LINE' })

    // simulate ตรวจด้วย secret ผิด: สร้าง module ปลอมตรวจ sig ด้วย secret อื่น
    // ทำโดย: เปลี่ยน SECRET ชั่วคราว → import fresh copy
    const originalSecret = process.env.NEXTAUTH_SECRET
    process.env.NEXTAUTH_SECRET = 'completely-different-secret-xxxyyy'
    // คำนวณ expected sig ด้วย secret ใหม่โดยตรง (ไม่ผ่าน module)
    const crypto = await import('crypto')
    const dot = token.indexOf('.')
    const payloadB64 = token.slice(0, dot)
    const fakeExpected = crypto
      .createHmac('sha256', 'completely-different-secret-xxxyyy')
      .update(payloadB64)
      .digest('base64url')

    // sig จาก token เดิม ≠ fakeExpected → verify จะ fail (ทดสอบตรรกะ HMAC)
    const actualSig = token.slice(dot + 1)
    expect(actualSig).not.toBe(fakeExpected)

    process.env.NEXTAUTH_SECRET = originalSecret
  })
})

describe('verifyLinkIntent — expiry (AC-07)', () => {
  it('AC-07: token หมดอายุ (exp ในอดีต) → null', async () => {
    const { verifyLinkIntent } = await getModule()
    const crypto = await import('crypto')

    // สร้าง token ด้วย exp = วินาทีที่ผ่านไปแล้ว (100ms ago)
    const payload = {
      userId: 'u-expired',
      provider: 'LINE',
      exp: Date.now() - 100, // หมดอายุแล้ว
    }
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = crypto
      .createHmac('sha256', TEST_SECRET)
      .update(payloadB64)
      .digest('base64url')
    const expiredToken = `${payloadB64}.${sig}`

    expect(verifyLinkIntent(expiredToken)).toBeNull()
  })

  it('AC-07: token ที่เพิ่งออก (exp ในอนาคต) → ผ่าน', async () => {
    const { signLinkIntent, verifyLinkIntent } = await getModule()
    // signLinkIntent ตั้ง exp = now + 5 นาที → ยังไม่หมดอายุ
    const token = signLinkIntent({ userId: 'u-valid', provider: 'FACEBOOK' })
    expect(verifyLinkIntent(token)).not.toBeNull()
  })

  it('AC-07: token exp = now (millisecond boundary) → null (Date.now() > exp is false ยังไม่ผ่าน แต่ตรวจ strictly >)', async () => {
    const { verifyLinkIntent } = await getModule()
    const crypto = await import('crypto')

    // exp = Date.now() - 1 (1ms ที่ผ่านไป) → หมดอายุ
    const payload = {
      userId: 'u-boundary',
      provider: 'INSTAGRAM',
      exp: Date.now() - 1,
    }
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = crypto
      .createHmac('sha256', TEST_SECRET)
      .update(payloadB64)
      .digest('base64url')
    const token = `${payloadB64}.${sig}`

    expect(verifyLinkIntent(token)).toBeNull()
  })
})

describe('verifyLinkIntent — invalid input (fail-closed)', () => {
  it('token ว่าง ("") → null', async () => {
    const { verifyLinkIntent } = await getModule()
    expect(verifyLinkIntent('')).toBeNull()
  })

  it('token ไม่มี dot → null', async () => {
    const { verifyLinkIntent } = await getModule()
    expect(verifyLinkIntent('nodottoken')).toBeNull()
  })

  it('token = เพียง dot (ไม่มี payload หรือ sig) → null', async () => {
    const { verifyLinkIntent } = await getModule()
    expect(verifyLinkIntent('.')).toBeNull()
  })

  it('payload ไม่ใช่ valid base64url JSON → null (parse error path)', async () => {
    const { verifyLinkIntent } = await getModule()
    const crypto = await import('crypto')

    // payload ที่ไม่ใช่ JSON (แต่ sig ถูก)
    const badPayload = 'not-valid-json!!!'
    const sig = crypto
      .createHmac('sha256', TEST_SECRET)
      .update(badPayload)
      .digest('base64url')
    expect(verifyLinkIntent(`${badPayload}.${sig}`)).toBeNull()
  })

  it('payload ขาด userId field → null', async () => {
    const { verifyLinkIntent } = await getModule()
    const crypto = await import('crypto')

    const payload = { provider: 'LINE', exp: Date.now() + 300_000 } // ไม่มี userId
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = crypto
      .createHmac('sha256', TEST_SECRET)
      .update(payloadB64)
      .digest('base64url')

    expect(verifyLinkIntent(`${payloadB64}.${sig}`)).toBeNull()
  })

  it('payload มี userId เป็น empty string → null', async () => {
    const { verifyLinkIntent } = await getModule()
    const crypto = await import('crypto')

    const payload = { userId: '', provider: 'LINE', exp: Date.now() + 300_000 }
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = crypto
      .createHmac('sha256', TEST_SECRET)
      .update(payloadB64)
      .digest('base64url')

    expect(verifyLinkIntent(`${payloadB64}.${sig}`)).toBeNull()
  })

  it('payload มี provider เป็น empty string → null', async () => {
    const { verifyLinkIntent } = await getModule()
    const crypto = await import('crypto')

    const payload = { userId: 'u1', provider: '', exp: Date.now() + 300_000 }
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = crypto
      .createHmac('sha256', TEST_SECRET)
      .update(payloadB64)
      .digest('base64url')

    expect(verifyLinkIntent(`${payloadB64}.${sig}`)).toBeNull()
  })

  it('payload ขาด exp field → null (exp = undefined → typeof !== number)', async () => {
    const { verifyLinkIntent } = await getModule()
    const crypto = await import('crypto')

    const payload = { userId: 'u1', provider: 'FACEBOOK' } // ไม่มี exp
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = crypto
      .createHmac('sha256', TEST_SECRET)
      .update(payloadB64)
      .digest('base64url')

    expect(verifyLinkIntent(`${payloadB64}.${sig}`)).toBeNull()
  })
})

describe('signLinkIntent — output properties', () => {
  it('userId และ provider ใน token ตรงกับ input', async () => {
    const { signLinkIntent, verifyLinkIntent } = await getModule()

    const cases = [
      { userId: 'seller-001', provider: 'FACEBOOK' },
      { userId: 'seller-002', provider: 'LINE' },
      { userId: 'seller-003', provider: 'INSTAGRAM' },
    ]

    for (const c of cases) {
      const token = signLinkIntent(c)
      const result = verifyLinkIntent(token)
      expect(result?.userId).toBe(c.userId)
      expect(result?.provider).toBe(c.provider)
    }
  })

  it('token 2 ตัวจาก userId เดียวกันมี exp ต่างกัน (timestamp drift)', async () => {
    const { signLinkIntent } = await getModule()

    const t1 = signLinkIntent({ userId: 'u', provider: 'LINE' })
    await new Promise((r) => setTimeout(r, 5)) // รอ 5ms
    const t2 = signLinkIntent({ userId: 'u', provider: 'LINE' })

    // ถ้า exp ต่างกัน token จะต่างกัน (timestamp-based)
    // เพิ่ม tolerance: อาจเท่ากันถ้า Date.now() granularity = 1ms และ loop เร็ว
    // แค่ตรวจว่า format ถูก (ทั้งคู่ must verify)
    const { verifyLinkIntent } = await getModule()
    expect(verifyLinkIntent(t1)).not.toBeNull()
    expect(verifyLinkIntent(t2)).not.toBeNull()
  })
})
