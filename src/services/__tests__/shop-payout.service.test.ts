/**
 * updateShopPayout (feature 00062, U14/TFR-009) — mocked-prisma unit test
 * (pattern เดียวกับ order-pickup-payment-confirm.test.ts) — ไม่แตะ DB จริง (HR13/HR14)
 *
 * ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ — ประกาศ db
 * ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError)
 *
 * mock `@/lib/password`/`@/lib/otp` ทั้งคู่ (verifyPassword/verifyOtp) — ควบคุมผล reauth ได้ตรง ๆ
 * โดยไม่ต้องพึ่ง bcrypt จริง · mock `@/lib/scam-identifier` (hashIdentifier) เพราะไฟล์นั้น throw
 * ที่ module-load ถ้า NEXTAUTH_SECRET ไม่ได้ตั้งค่า (เวิร์กทรีนี้ไม่มี .env) — `updateShopPayout`
 * import ตัวนี้แบบ dynamic (`await import(...)`) ซึ่ง vi.mock สกัดได้ทั้ง static/dynamic import
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  shop: { findUnique: vi.fn(), update: vi.fn() },
  shopMember: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  scamReportIdentifier: { findFirst: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const passwordMock = vi.hoisted(() => ({ verifyPassword: vi.fn() }))
vi.mock('@/lib/password', () => passwordMock)

const otpMock = vi.hoisted(() => ({ verifyOtp: vi.fn() }))
vi.mock('@/lib/otp', () => otpMock)

const scamMock = vi.hoisted(() => ({ hashIdentifier: vi.fn(() => 'hash-abc') }))
vi.mock('@/lib/scam-identifier', () => scamMock)

import {
  updateShopPayout,
  PayoutForbiddenError,
  PayoutReauthFailedError,
  PayoutReauthUnavailableError,
} from '@/services/shop.service'
import type { UpdateShopPayoutInput } from '@/lib/shop-payout'

const PERSONAL_ONLINE_FIRST_TIME = {
  id: 'shop-1',
  kind: 'PERSONAL',
  userId: 'user-1',
  vertical: 'ONLINE_SALES',
  payoutUpdatedAt: null,
}

const PERSONAL_ONLINE_ALREADY_SET = {
  ...PERSONAL_ONLINE_FIRST_TIME,
  payoutUpdatedAt: new Date('2026-08-01T00:00:00Z'),
}

const BODY: UpdateShopPayoutInput = {
  payoutBankCode: 'KBANK',
  payoutAccountNo: '123-456-7890',
  payoutAccountName: 'ร้านทดสอบ',
  reauth: { method: 'PASSWORD', password: 'whatever-not-checked' },
}

beforeEach(() => {
  vi.clearAllMocks()
  scamMock.hashIdentifier.mockReturnValue('hash-abc')
  db.scamReportIdentifier.findFirst.mockResolvedValue(null)
  db.shop.update.mockResolvedValue({
    payoutBankCode: 'KBANK',
    payoutAccountNo: '1234567890',
    payoutAccountName: 'ร้านทดสอบ',
    payoutPromptPayId: null,
    payoutUpdatedAt: new Date('2026-08-29T00:00:00Z'),
  })
})

describe('updateShopPayout — บันทึกครั้งแรก (payoutUpdatedAt=null) ข้าม reauth', () => {
  it('สำเร็จโดยไม่เรียก verifyPassword/verifyOtp เลย', async () => {
    db.shop.findUnique.mockResolvedValue(PERSONAL_ONLINE_FIRST_TIME)

    const result = await updateShopPayout('shop-1', 'user-1', BODY)

    expect(result.payoutBankCode).toBe('KBANK')
    expect(passwordMock.verifyPassword).not.toHaveBeenCalled()
    expect(otpMock.verifyOtp).not.toHaveBeenCalled()
    expect(db.shop.update).toHaveBeenCalledTimes(1)
  })

  it('normalize เลขบัญชี (ตัดขีด/ช่องว่าง) ก่อนบันทึกเสมอ', async () => {
    db.shop.findUnique.mockResolvedValue(PERSONAL_ONLINE_FIRST_TIME)

    await updateShopPayout('shop-1', 'user-1', BODY)

    const call = db.shop.update.mock.calls[0]![0]
    expect(call.data.payoutAccountNo).toBe('1234567890')
  })
})

describe('updateShopPayout — เปลี่ยนบัญชี (payoutUpdatedAt != null) ต้อง reauth', () => {
  it('reauth ผิด (verifyPassword=false) → PayoutReauthFailedError (401)', async () => {
    db.shop.findUnique.mockResolvedValue(PERSONAL_ONLINE_ALREADY_SET)
    db.user.findUnique.mockResolvedValue({ passwordHash: 'hash', phone: null })
    passwordMock.verifyPassword.mockResolvedValue(false)

    await expect(updateShopPayout('shop-1', 'user-1', BODY)).rejects.toThrow(
      PayoutReauthFailedError,
    )
    expect(db.shop.update).not.toHaveBeenCalled()
  })

  it('reauth ถูก (verifyPassword=true) → บันทึกสำเร็จ', async () => {
    db.shop.findUnique.mockResolvedValue(PERSONAL_ONLINE_ALREADY_SET)
    db.user.findUnique.mockResolvedValue({ passwordHash: 'hash', phone: null })
    passwordMock.verifyPassword.mockResolvedValue(true)

    const result = await updateShopPayout('shop-1', 'user-1', BODY)

    expect(passwordMock.verifyPassword).toHaveBeenCalledWith('whatever-not-checked', 'hash')
    expect(result.payoutBankCode).toBe('KBANK')
  })

  it('reauth ทาง OTP ถูก (verifyOtp=true) → บันทึกสำเร็จ', async () => {
    db.shop.findUnique.mockResolvedValue(PERSONAL_ONLINE_ALREADY_SET)
    db.user.findUnique.mockResolvedValue({ passwordHash: null, phone: '0812345678' })
    otpMock.verifyOtp.mockResolvedValue(true)

    const body: UpdateShopPayoutInput = { ...BODY, reauth: { method: 'OTP', code: '123456' } }
    const result = await updateShopPayout('shop-1', 'user-1', body)

    expect(otpMock.verifyOtp).toHaveBeenCalledWith('0812345678', '123456')
    expect(result.payoutBankCode).toBe('KBANK')
  })

  it('ไม่มีทั้ง password และเบอร์โทร → PayoutReauthUnavailableError (409) ไม่ปล่อยผ่าน', async () => {
    db.shop.findUnique.mockResolvedValue(PERSONAL_ONLINE_ALREADY_SET)
    db.user.findUnique.mockResolvedValue({ passwordHash: null, phone: null })

    await expect(updateShopPayout('shop-1', 'user-1', BODY)).rejects.toThrow(
      PayoutReauthUnavailableError,
    )
    expect(passwordMock.verifyPassword).not.toHaveBeenCalled()
    expect(db.shop.update).not.toHaveBeenCalled()
  })
})

describe('updateShopPayout — สิทธิ์ OWNER เท่านั้น', () => {
  it('ADMIN ของร้าน Business → PayoutForbiddenError (403) — [blocker]', async () => {
    db.shop.findUnique.mockResolvedValue({
      id: 'shop-2', kind: 'BUSINESS', userId: 'owner-x', vertical: 'ONLINE_SALES',
      payoutUpdatedAt: null,
    })
    db.shopMember.findUnique.mockResolvedValue({ role: 'ADMIN' })

    await expect(updateShopPayout('shop-2', 'user-admin', BODY)).rejects.toThrow(
      PayoutForbiddenError,
    )
    expect(db.shop.update).not.toHaveBeenCalled()
  })

  it('OWNER ของร้าน Business (แถว ShopMember) → สำเร็จ', async () => {
    db.shop.findUnique.mockResolvedValue({
      id: 'shop-2', kind: 'BUSINESS', userId: 'owner-x', vertical: 'ONLINE_SALES',
      payoutUpdatedAt: null,
    })
    db.shopMember.findUnique.mockResolvedValue({ role: 'OWNER' })

    const result = await updateShopPayout('shop-2', 'owner-x', BODY)
    expect(result.payoutBankCode).toBe('KBANK')
  })

  it('OWNER ของร้าน Personal (ไม่มีแถว ShopMember เลย) → สำเร็จ', async () => {
    db.shop.findUnique.mockResolvedValue(PERSONAL_ONLINE_FIRST_TIME)

    const result = await updateShopPayout('shop-1', 'user-1', BODY)
    expect(result.payoutBankCode).toBe('KBANK')
    expect(db.shopMember.findUnique).not.toHaveBeenCalled()
  })

  it('ไม่ใช่สมาชิกร้าน Business เลย (ShopMember ไม่มีแถว) → PayoutForbiddenError (403)', async () => {
    db.shop.findUnique.mockResolvedValue({
      id: 'shop-2', kind: 'BUSINESS', userId: 'owner-x', vertical: 'ONLINE_SALES',
      payoutUpdatedAt: null,
    })
    db.shopMember.findUnique.mockResolvedValue(null)

    await expect(updateShopPayout('shop-2', 'stranger', BODY)).rejects.toThrow(
      PayoutForbiddenError,
    )
  })
})

describe('updateShopPayout — ขอบเขต vertical=ONLINE_SALES เท่านั้น', () => {
  it('ร้าน SERVICE_QUEUE (แม้เป็น OWNER) → PayoutForbiddenError (403) — [blocker]', async () => {
    db.shop.findUnique.mockResolvedValue({
      ...PERSONAL_ONLINE_FIRST_TIME,
      vertical: 'SERVICE_QUEUE',
    })

    await expect(updateShopPayout('shop-1', 'user-1', BODY)).rejects.toThrow(
      PayoutForbiddenError,
    )
    expect(db.shop.update).not.toHaveBeenCalled()
  })

  it('ร้าน LODGING (แม้เป็น OWNER) → PayoutForbiddenError (403)', async () => {
    db.shop.findUnique.mockResolvedValue({ ...PERSONAL_ONLINE_FIRST_TIME, vertical: 'LODGING' })

    await expect(updateShopPayout('shop-1', 'user-1', BODY)).rejects.toThrow(
      PayoutForbiddenError,
    )
  })
})

describe('updateShopPayout — ตรวจฐาน ScamReportIdentifier แบบ best-effort (FR-BANK-04)', () => {
  it('เจอ hash ตรงกัน → ยัง save สำเร็จตามปกติ (แค่ log แจ้งเตือน ไม่บล็อก)', async () => {
    db.shop.findUnique.mockResolvedValue(PERSONAL_ONLINE_FIRST_TIME)
    db.scamReportIdentifier.findFirst.mockResolvedValue({ id: 'hit-1' })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await updateShopPayout('shop-1', 'user-1', BODY)

    expect(result.payoutBankCode).toBe('KBANK')
    expect(db.shop.update).toHaveBeenCalledTimes(1)
    // ห้ามหลุดเลขบัญชีเต็มเข้า log — ต้องเป็นรูป mask (x คั่นด้วยเลขท้าย)
    const logged = warnSpy.mock.calls[0]?.[1]
    expect(JSON.stringify(logged)).not.toContain('1234567890')
    warnSpy.mockRestore()
  })

  it('มติ ง: hashIdentifier throw ระหว่างเช็ค → save ยังต้องสำเร็จ (best-effort ต้องไม่ทำให้ทั้ง request ล้ม)', async () => {
    db.shop.findUnique.mockResolvedValue(PERSONAL_ONLINE_FIRST_TIME)
    scamMock.hashIdentifier.mockImplementation(() => {
      throw new Error('boom — NEXTAUTH_SECRET หาย/DB hiccup จำลอง')
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await updateShopPayout('shop-1', 'user-1', BODY)

    expect(result.payoutBankCode).toBe('KBANK')
    expect(db.shop.update).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })

  it('ไม่ส่ง payoutAccountNo มาในรอบนี้ → ไม่เรียก hashIdentifier/scamReportIdentifier เลย', async () => {
    db.shop.findUnique.mockResolvedValue(PERSONAL_ONLINE_FIRST_TIME)
    const { payoutAccountNo: _omit, ...bodyWithoutAccountNo } = BODY

    await updateShopPayout('shop-1', 'user-1', bodyWithoutAccountNo as UpdateShopPayoutInput)

    expect(scamMock.hashIdentifier).not.toHaveBeenCalled()
    expect(db.scamReportIdentifier.findFirst).not.toHaveBeenCalled()
  })
})

describe('updateShopPayout — ไม่ส่งฟิลด์ = ไม่เปลี่ยนค่าเดิม, ส่ง null = ลบค่า', () => {
  it('ส่ง payoutPromptPayId เป็น null → ลบค่าเดิม (ไม่ throw จาก picklist ฯลฯ)', async () => {
    db.shop.findUnique.mockResolvedValue(PERSONAL_ONLINE_FIRST_TIME)

    const body: UpdateShopPayoutInput = { ...BODY, payoutPromptPayId: null }
    await updateShopPayout('shop-1', 'user-1', body)

    const call = db.shop.update.mock.calls[0]![0]
    expect(call.data.payoutPromptPayId).toBeNull()
  })

  it('ไม่ส่ง payoutAccountName เลย → ไม่มี key นี้ใน update payload', async () => {
    db.shop.findUnique.mockResolvedValue(PERSONAL_ONLINE_FIRST_TIME)
    const { payoutAccountName: _omit, ...bodyWithoutName } = BODY

    await updateShopPayout('shop-1', 'user-1', bodyWithoutName as UpdateShopPayoutInput)

    const call = db.shop.update.mock.calls[0]![0]
    expect('payoutAccountName' in call.data).toBe(false)
  })

  it('ทุกครั้งที่บันทึกสำเร็จ ต้องตั้ง payoutUpdatedAt เป็นเวลาปัจจุบัน', async () => {
    db.shop.findUnique.mockResolvedValue(PERSONAL_ONLINE_FIRST_TIME)

    await updateShopPayout('shop-1', 'user-1', BODY)

    const call = db.shop.update.mock.calls[0]![0]
    expect(call.data.payoutUpdatedAt).toBeInstanceOf(Date)
  })
})
