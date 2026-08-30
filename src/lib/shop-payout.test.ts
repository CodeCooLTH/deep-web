import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import {
  needsPayoutAccount,
  PAYOUT_ACCOUNT_NO_RE,
  THAI_BANKS,
  UpdateShopPayoutSchema,
  buildPayoutSnapshot,
  findThaiBank,
  isValidBankCode,
  isValidPayoutAccountNo,
  isValidPromptPayId,
  maskAccountNo,
  normalizePayoutAccountNo,
  type ShopPayoutFields,
} from './shop-payout'

describe('THAI_BANKS', () => {
  it('มีรายการอย่างน้อย 10 ธนาคาร และไม่มีรหัสซ้ำกัน', () => {
    expect(THAI_BANKS.length).toBeGreaterThanOrEqual(10)
    const codes = THAI_BANKS.map((b) => b.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('มีธนาคารหลักที่ตัวอย่างใน API.md อ้างถึง (KBANK, SCB)', () => {
    expect(isValidBankCode('KBANK')).toBe(true)
    expect(isValidBankCode('SCB')).toBe(true)
    expect(findThaiBank('SCB')?.nameTh).toBe('ธนาคารไทยพาณิชย์')
  })

  it('รหัสที่ไม่รู้จัก → false / undefined', () => {
    expect(isValidBankCode('NOT_A_BANK')).toBe(false)
    expect(findThaiBank('NOT_A_BANK')).toBeUndefined()
  })
})

describe('normalizePayoutAccountNo', () => {
  it('ตัดขีดและช่องว่างออก', () => {
    expect(normalizePayoutAccountNo('123-4-56789-0')).toBe('1234567890')
    expect(normalizePayoutAccountNo('123 456 7890')).toBe('1234567890')
    expect(normalizePayoutAccountNo('  1234567890  ')).toBe('1234567890')
  })

  it('ไม่ตัดตัวอักษรอื่นที่ไม่ใช่ขีด/ช่องว่าง (ปล่อยให้ regex ความยาว/ตัวเลขจับต่อ)', () => {
    expect(normalizePayoutAccountNo('12345678AB')).toBe('12345678AB')
  })
})

describe('isValidPayoutAccountNo', () => {
  it('ผ่านเมื่อ normalize แล้วเป็นตัวเลข 10-15 หลัก', () => {
    expect(isValidPayoutAccountNo('123-456-7890')).toBe(true) // 10 หลักหลัง normalize
    expect(isValidPayoutAccountNo('123456789012345')).toBe(true) // 15 หลัก
  })

  it('ไม่ผ่านเมื่อสั้น/ยาวเกิน/มีตัวอักษร', () => {
    expect(isValidPayoutAccountNo('123456789')).toBe(false) // 9 หลัก
    expect(isValidPayoutAccountNo('1234567890123456')).toBe(false) // 16 หลัก
    expect(isValidPayoutAccountNo('12345678AB')).toBe(false)
  })

  it('PAYOUT_ACCOUNT_NO_RE ตรงกับพฤติกรรมของ isValidPayoutAccountNo', () => {
    expect(PAYOUT_ACCOUNT_NO_RE.test('1234567890')).toBe(true)
  })
})

describe('maskAccountNo', () => {
  it('เหลือ 4 หลักท้าย ที่เหลือเป็น x', () => {
    expect(maskAccountNo('1234567890')).toBe('xxxxxx7890')
  })

  it('ตัดขีด/ช่องว่างก่อนมาสก์ (เรียก normalize ในตัว)', () => {
    expect(maskAccountNo('123-456-7890')).toBe('xxxxxx7890')
  })

  it('เลขสั้น ≤4 หลัก → มาสก์ทั้งหมด', () => {
    expect(maskAccountNo('12')).toBe('xxxx')
  })
})

describe('isValidPromptPayId', () => {
  it('เบอร์มือถือ 10 หลัก (ขึ้นต้น 06/08/09) → true', () => {
    expect(isValidPromptPayId('0812345678')).toBe(true)
    expect(isValidPromptPayId('0612345678')).toBe(true)
    expect(isValidPromptPayId('0912345678')).toBe(true)
  })

  it('เลขบัตร ปชช./ผู้เสียภาษี 13 หลัก → true', () => {
    expect(isValidPromptPayId('1234567890123')).toBe(true)
  })

  it('ขึ้นต้น 07 (ไม่ใช่มือถือ) หรือความยาวผิด → false', () => {
    expect(isValidPromptPayId('0712345678')).toBe(false)
    expect(isValidPromptPayId('081234567')).toBe(false) // 9 หลัก
    expect(isValidPromptPayId('12345678901234')).toBe(false) // 14 หลัก
  })
})

describe('buildPayoutSnapshot', () => {
  const empty: ShopPayoutFields = {
    payoutBankCode: null,
    payoutAccountNo: null,
    payoutAccountName: null,
    payoutPromptPayId: null,
  }

  it('ทุกฟิลด์ null → คืน null ทั้งก้อน', () => {
    expect(buildPayoutSnapshot(empty)).toBeNull()
  })

  it('ตั้งครบ 4 ฟิลด์ → snapshot มีครบ 4 key', () => {
    const snap = buildPayoutSnapshot({
      payoutBankCode: 'SCB',
      payoutAccountNo: '1234567890',
      payoutAccountName: 'ร้าน BT เคสมือถือ',
      payoutPromptPayId: '0812345678',
    })
    expect(snap).toEqual({
      bankCode: 'SCB',
      accountNo: '1234567890',
      accountName: 'ร้าน BT เคสมือถือ',
      promptPayId: '0812345678',
    })
  })

  // [blocker] mutation: เปลี่ยนให้ buildPayoutSnapshot ใส่ค่า null ทับทุก key (ไม่ว่า
  // field เดิมจะเป็น null หรือไม่) ต้องทำให้เทสนี้แดง — พิสูจน์ตาม DATABASE.md §3.1
  // "ไม่ใส่ null ทับ" (docs/conventions/mutation-silence-means-weak-corpus.md)
  it('ตั้งบางฟิลด์ (bankCode อย่างเดียว) → key อื่นที่เหลือ "ไม่มีอยู่" ใน object เลย ไม่ใช่ null', () => {
    const snap = buildPayoutSnapshot({ ...empty, payoutBankCode: 'SCB' })!
    expect(snap.bankCode).toBe('SCB')
    expect('accountNo' in snap).toBe(false)
    expect('accountName' in snap).toBe(false)
    expect('promptPayId' in snap).toBe(false)
    expect(Object.keys(snap)).toEqual(['bankCode'])
  })

  it('ค่าว่าง (empty string) ไม่ใช่ null → ยังถูกใส่ลง snapshot (เก็บตามค่าจริง ไม่ตีความแทน)', () => {
    const snap = buildPayoutSnapshot({ ...empty, payoutAccountName: '' })!
    expect('accountName' in snap).toBe(true)
    expect(snap.accountName).toBe('')
  })
})

describe('UpdateShopPayoutSchema', () => {
  const validBase = {
    payoutBankCode: 'KBANK',
    payoutAccountNo: '123-456-7890',
    payoutAccountName: 'ร้าน BT เคสมือถือ',
    payoutPromptPayId: '0812345678',
    reauth: { method: 'PASSWORD', password: 'secret1234' },
  }

  it('parse ผ่านเมื่อค่าครบและถูกต้อง — accountNo ถูก normalize ระหว่าง parse', () => {
    const result = v.parse(UpdateShopPayoutSchema, validBase)
    expect(result.payoutAccountNo).toBe('1234567890')
    expect(result.reauth).toEqual({ method: 'PASSWORD', password: 'secret1234' })
  })

  it('reauth แบบ OTP parse ผ่าน', () => {
    const result = v.parse(UpdateShopPayoutSchema, {
      ...validBase,
      reauth: { method: 'OTP', code: '123456' },
    })
    expect(result.reauth).toEqual({ method: 'OTP', code: '123456' })
  })

  it('ไม่ส่งฟิลด์ payout* เลย (เฉพาะ reauth) → parse ผ่าน (optional ทั้งหมด)', () => {
    const result = v.parse(UpdateShopPayoutSchema, { reauth: validBase.reauth })
    expect(result.payoutBankCode).toBeUndefined()
  })

  it('ส่ง null ในฟิลด์ payout* → parse ผ่าน (ความหมาย = ลบค่า)', () => {
    const result = v.parse(UpdateShopPayoutSchema, {
      reauth: validBase.reauth,
      payoutBankCode: null,
      payoutAccountNo: null,
      payoutAccountName: null,
      payoutPromptPayId: null,
    })
    expect(result.payoutBankCode).toBeNull()
    expect(result.payoutAccountNo).toBeNull()
  })

  it('bank code ไม่รู้จัก → parse ล้ม', () => {
    expect(() => v.parse(UpdateShopPayoutSchema, { ...validBase, payoutBankCode: 'FAKE_BANK' })).toThrow()
  })

  it('เลขบัญชีผิดรูป (สั้นเกินหลัง normalize) → parse ล้ม', () => {
    expect(() => v.parse(UpdateShopPayoutSchema, { ...validBase, payoutAccountNo: '123' })).toThrow()
  })

  it('PromptPay ID ผิดรูป → parse ล้ม', () => {
    expect(() => v.parse(UpdateShopPayoutSchema, { ...validBase, payoutPromptPayId: '0712345678' })).toThrow()
  })

  /**
   * 🛑 **ไม่ส่ง reauth = parse ผ่าน** (แก้ 2026-08-29) — schema ไม่ใช่ที่บังคับเรื่องนี้
   *
   * เดิมบังคับ `reauth` เสมอ ทำให้หน้าจอต้องส่ง **รหัสผ่านปลอมเป็นสตริงคงที่** มาให้ผ่าน schema
   * ตอนตั้งบัญชีครั้งแรก (ซึ่ง service ข้ามการตรวจอยู่แล้วตาม BR-BANK-02)
   *
   * ตัวที่ตัดสินว่าต้อง reauth ไหมคือ `Shop.payoutUpdatedAt` **ในฐาน** เท่านั้น — ให้ client
   * ตัดสินไม่ได้ (ก็แค่ส่ง "ครั้งแรก" มาเพื่อข้ามการยืนยัน) ⇒ ด่านอยู่ที่
   * `updateShopPayout()` ซึ่งปฏิเสธ 401 เมื่อไม่ใช่ครั้งแรกแต่ไม่ส่ง reauth มา
   * (เทส `[blocker]` คุมอยู่ที่ `src/services/__tests__/shop-payout.service.test.ts`)
   */
  it('ไม่ส่ง reauth เลย → parse ผ่าน (ด่านจริงอยู่ที่ service ไม่ใช่ schema)', () => {
    const { reauth: _reauth, ...withoutReauth } = validBase
    expect(() => v.parse(UpdateShopPayoutSchema, withoutReauth)).not.toThrow()
  })

  it('reauth ไม่ระบุ password ตอน method=PASSWORD → parse ล้ม', () => {
    expect(() =>
      v.parse(UpdateShopPayoutSchema, { ...validBase, reauth: { method: 'PASSWORD' } }),
    ).toThrow()
  })
})

/**
 * 🛑 [blocker] needsPayoutAccount — SSOT ของ "ต้องแสดงบัญชีรับเงินให้ผู้ซื้อไหม"
 *
 * เทสชุดนี้ถูกเติมหลังพบว่า mutation "เปลี่ยนกลับเป็น allow-list `TRANSFER|PROMPTPAY`"
 * **ยังเขียว** — แปลว่าไม่มี input ไหนในชุดเดิมที่ทำให้ความต่างโผล่เลย
 * (docs/conventions/mutation-silence-means-weak-corpus.md)
 *
 * ความต่างที่สำคัญ: ค่าที่ระบบไม่รู้จัก (free text ที่ร้านพิมพ์เอง / ค่าใหม่ในอนาคต) ต้องได้
 * บัญชีไปแสดง **ไม่ใช่ตกหาย** — ไม่งั้นผู้ซื้อเปิดลิงก์แล้วไม่รู้ว่าจะโอนที่ไหน ซึ่งเป็น
 * ปัญหาเดียวกับที่ฟีเจอร์นี้ตั้งใจแก้ตั้งแต่แรก (prod ปัจจุบันยังไม่มี free text แต่ระบบเปิดช่องไว้)
 */
describe('[blocker] needsPayoutAccount — ผู้ซื้อต้องโอนเงินเองไหม', () => {
  it('COD ทุกรูปแบบ → false (ขนส่งเก็บให้ ไม่ต้องโอน)', () => {
    expect(needsPayoutAccount('COD')).toBe(false)
    expect(needsPayoutAccount('เก็บเงินปลายทาง')).toBe(false)
    expect(needsPayoutAccount('เก็บเงินปลายทาง (COD)')).toBe(false)
  })

  it('เงินสด → false (จ่ายต่อหน้า ไม่ต้องโอน)', () => {
    expect(needsPayoutAccount('CASH')).toBe(false)
    expect(needsPayoutAccount('เงินสด')).toBe(false)
  })

  it('โอนเงิน/พร้อมเพย์ → true', () => {
    expect(needsPayoutAccount('TRANSFER')).toBe(true)
    expect(needsPayoutAccount('PROMPTPAY')).toBe(true)
  })

  /**
   * 🛑 เคสที่ mutation "allow-list 2 ค่า" จะทำให้แดง — ค่าที่ไม่รู้จักต้องได้บัญชี ไม่ใช่ตกหาย
   */
  it('[blocker] free text / ค่าที่ไม่รู้จัก / null → true (ห้ามตกหาย)', () => {
    expect(needsPayoutAccount('พร้อมเพย์ 081-234-5678')).toBe(true)
    expect(needsPayoutAccount('โอนผ่านแอปธนาคาร')).toBe(true)
    expect(needsPayoutAccount('CARD')).toBe(true)
    expect(needsPayoutAccount('OTHER')).toBe(true)
    expect(needsPayoutAccount(null)).toBe(true)
    expect(needsPayoutAccount(undefined)).toBe(true)
  })
})
