import { afterEach, describe, expect, it, vi } from 'vitest'

import { sendSigninOtp, signinOtpVerifyUrl } from '../send-signin-otp'

/**
 * เทสของทางเข้า "เข้าสู่ระบบด้วยเบอร์โทร" ฝั่งผู้ขาย
 *
 * สิ่งที่ต้องกันไว้จริง ๆ ไม่ใช่ "ยิง fetch ถูก URL ไหม" แต่คือ **ลำดับ**: ต้องรู้ก่อนว่าเบอร์นี้
 * มีบัญชีจริงแล้วค่อยส่ง SMS — เพราะ provider `phone-otp` สร้างบัญชีใหม่ให้เองเมื่อเบอร์ยังว่าง
 * ⇒ ถ้าสลับลำดับ (ส่งก่อน ถามทีหลัง) คนพิมพ์เบอร์ผิดหนึ่งหลักจะได้บัญชีเปล่าใบใหม่เงียบ ๆ
 * และ SMS เสียฟรีหนึ่งใบ โดยไม่มี `tsc`/build/เทสอื่นตัวไหนฟ้องเลย
 */

type FetchCall = { url: string; init?: RequestInit }

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: FetchCall[] = []
  vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    return Promise.resolve(handler(url, init))
  })
  return calls
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sendSigninOtp', () => {
  it('[blocker] เบอร์ที่ยังไม่มีบัญชี → ต้องไม่ยิง SMS เลย', async () => {
    const calls = mockFetch((url) => {
      if (url.startsWith('/api/users/check-phone')) return json({ available: true })
      return json({ message: 'OTP sent' })
    })

    const result = await sendSigninOtp('0812345678')

    expect(result).toEqual({ ok: false, reason: 'NO_ACCOUNT' })
    expect(
      calls.some((c) => c.url.startsWith('/api/otp/send')),
      'ห้ามเรียก /api/otp/send เมื่อรู้อยู่แล้วว่าเบอร์นี้ไม่มีบัญชี',
    ).toBe(false)
  })

  it('[blocker] ต้องเช็คบัญชี "ก่อน" ส่ง SMS ไม่ใช่หลัง', async () => {
    const calls = mockFetch((url) =>
      url.startsWith('/api/users/check-phone')
        ? json({ available: false })
        : json({ message: 'OTP sent' }),
    )

    const result = await sendSigninOtp('0812345678')

    expect(result).toEqual({ ok: true })
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toContain('/api/users/check-phone')
    expect(calls[1].url).toBe('/api/otp/send')
  })

  it('429 จาก /api/otp/send → RATE_LIMITED (คนละคำกับส่งไม่สำเร็จทั่วไป)', async () => {
    mockFetch((url) =>
      url.startsWith('/api/users/check-phone')
        ? json({ available: false })
        : json({ error: 'too many' }, 429),
    )

    expect(await sendSigninOtp('0812345678')).toEqual({ ok: false, reason: 'RATE_LIMITED' })
  })

  it('ส่ง SMS ไม่ผ่าน (503) → FAILED', async () => {
    mockFetch((url) =>
      url.startsWith('/api/users/check-phone')
        ? json({ available: false })
        : json({ error: 'sms down' }, 503),
    )

    expect(await sendSigninOtp('0812345678')).toEqual({ ok: false, reason: 'FAILED' })
  })

  it('check-phone ล่มเอง → เดินต่อ (fail-open) ไม่ปิดประตูใส่คนที่ทำถูก', async () => {
    const calls = mockFetch((url) =>
      url.startsWith('/api/users/check-phone')
        ? json({ error: 'boom' }, 500)
        : json({ message: 'OTP sent' }),
    )

    expect(await sendSigninOtp('0812345678')).toEqual({ ok: true })
    expect(calls[1].url).toBe('/api/otp/send')
  })

  it('network throw → FAILED ไม่ใช่ exception หลุดขึ้นไปที่ฟอร์ม', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))

    expect(await sendSigninOtp('0812345678')).toEqual({ ok: false, reason: 'FAILED' })
  })
})

describe('signinOtpVerifyUrl', () => {
  it('[blocker] ต้องพา mode=signin ไปด้วยเสมอ', () => {
    /**
     * ไม่มี `mode=signin` → `VerifyOtpForm` ตกไปใช้ default `signup` แล้วส่ง displayName/
     * username/shopName ว่างเข้า provider — ซึ่งกับบัญชีที่มีอยู่แล้วจะกลายเป็นแค่ล็อกอิน
     * (โชคดี) แต่กับเบอร์ที่ยังว่างจะสร้างบัญชีใหม่ชื่อ `user_<timestamp>` ทันที
     */
    expect(signinOtpVerifyUrl('0812345678')).toBe(
      '/auth/verify-otp?mode=signin&phone=0812345678',
    )
  })

  it('พา callbackUrl ต่อเมื่อมี — บริบทคำเชิญ /i/<slug> ต้องไม่หายเฉพาะทาง OTP', () => {
    expect(signinOtpVerifyUrl('0812345678', '/i/abc123')).toBe(
      '/auth/verify-otp?mode=signin&phone=0812345678&callbackUrl=%2Fi%2Fabc123',
    )
  })

  it('ไม่มี callbackUrl → ไม่ใส่คีย์เปล่า', () => {
    expect(signinOtpVerifyUrl('0812345678', null)).not.toContain('callbackUrl')
  })
})
