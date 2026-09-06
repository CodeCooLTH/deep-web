// [blocker] ทะเบียนข้อตรวจอัตโนมัติขั้น 1 (feature 00060 · T8)

import { describe, expect, it } from 'vitest'
import { INSPECTION_CHECKS, INSPECTION_CHECK_KEYS } from './checks'
import {
  ACCOUNT_AGE_MIN_DAYS,
  CHAT_RESPONSE_MIN_RATE_PERCENT,
  STEP1_AUTO_CHECKS,
  STEP1_AUTO_CHECK_KEYS,
  decideDuplicateListing,
  isRoomScopedAutoCheck,
  type AutoCheckFacts,
  type RoomAutoCheckFacts,
} from './auto-checks'

/**
 * ตัวช่วยเรียกข้อที่ผูกกับ "ร้าน" — ถ้าใครเปลี่ยน scope ของข้อใดข้อหนึ่งโดยไม่ได้ตั้งใจ
 * เทสจะพังตรงนี้ทันทีแทนที่จะเงียบแล้วไปโผล่เป็นผลที่ fan-out ผิดในโปรดักชัน
 */
const shopVerdict = (key: 'scam_db' | 'phone_identity' | 'complaints' | 'account_age' | 'chat_response_speed', facts: AutoCheckFacts) => {
  const def = STEP1_AUTO_CHECKS[key]
  if (def.kind !== 'SHOP') throw new Error(`${key} ควรเป็นข้อระดับร้าน แต่กลายเป็น ${def.kind}`)
  return def.evaluate(facts)
}

const ROOM_FACTS: RoomAutoCheckFacts = {
  totalImageCount: 4,
  hashedImageCount: 4,
  copiedFromOtherShopCount: 0,
  lookupFailed: false,
}

const FACTS: AutoCheckFacts = {
  scamFound: false,
  verificationLevel: 1,
  accountAgeDays: 400,
  chatResponseRate: 98,
  openComplaintCount: 0,
}

describe('ความครบของทะเบียน', () => {
  it('🛑 ต้องครอบข้อ AUTO ของขั้น 1 ครบทุกข้อ ไม่ขาดไม่เกิน — ข้อที่หายจากลูปคือข้อที่ไม่มีใครรู้ว่าไม่เคยถูกตรวจ', () => {
    const fromSsot = INSPECTION_CHECK_KEYS.filter(
      (k) => INSPECTION_CHECKS[k].step === 1 && INSPECTION_CHECKS[k].method === 'AUTO',
    )
    expect([...STEP1_AUTO_CHECK_KEYS].sort()).toEqual([...fromSsot].sort())
    expect(fromSsot).toHaveLength(6)
  })

  it('duplicate_listing เป็นข้อเดียวของขั้น 1 ที่ผูกรายหลัง — cron ต้องวนต่อ Room', () => {
    expect(STEP1_AUTO_CHECK_KEYS.filter(isRoomScopedAutoCheck)).toEqual(['duplicate_listing'])
  })
})

describe('scam_db', () => {
  it('ไม่พบในฐาน → ผ่าน · พบ → ไม่ผ่าน', () => {
    expect(shopVerdict('scam_db', { ...FACTS, scamFound: false })).toEqual({
      kind: 'RECORD',
      outcome: 'PASS',
    })
    expect(shopVerdict('scam_db', { ...FACTS, scamFound: true })).toEqual({
      kind: 'RECORD',
      outcome: 'FAIL',
    })
  })

  it('🛑 mutation: ค้นฐานไม่สำเร็จแล้ว fallback เป็น PASS → เคสนี้ต้องแดง', () => {
    // ระบบค้นล่มหนึ่งวัน = "วันนี้ยังไม่ได้ตรวจ" ไม่ใช่ "ตรวจแล้วสะอาด"
    // ผิดข้อนี้ = ออกคำรับรองเท็จให้ร้านที่อยู่ในฐานมิจฉาชีพจริง
    expect(shopVerdict('scam_db', { ...FACTS, scamFound: null })).toEqual({
      kind: 'SKIP',
      reason: 'NO_SOURCE_DATA',
    })
  })
})

describe('phone_identity', () => {
  it('ยืนยันแล้ว L1 ขึ้นไป → ผ่าน', () => {
    expect(shopVerdict('phone_identity', { ...FACTS, verificationLevel: 2 })).toEqual({
      kind: 'RECORD',
      outcome: 'PASS',
    })
  })

  it('🛑 mutation: ยังไม่เคยยืนยัน (ระดับ 0) แล้วบันทึกเป็น FAIL → เคสนี้ต้องแดง', () => {
    // "ยังไม่ส่งยืนยัน" ไม่ใช่ "ตัวตนมีปัญหา" — ตี FAIL คือการกล่าวหาโดยไม่มีการตรวจ
    for (const level of [0, null]) {
      expect(shopVerdict('phone_identity', { ...FACTS, verificationLevel: level })).toEqual({
        kind: 'SKIP',
        reason: 'NO_SOURCE_DATA',
      })
    }
  })
})

describe('complaints', () => {
  it('ไม่มีเรื่องค้าง → ผ่าน · มีเรื่องค้าง → ไม่ผ่าน · อ่านไม่ได้ → ไม่บันทึก', () => {
    expect(shopVerdict('complaints', { ...FACTS, openComplaintCount: 0 })).toEqual({
      kind: 'RECORD',
      outcome: 'PASS',
    })
    expect(shopVerdict('complaints', { ...FACTS, openComplaintCount: 2 })).toEqual({
      kind: 'RECORD',
      outcome: 'FAIL',
    })
    expect(shopVerdict('complaints', { ...FACTS, openComplaintCount: null })).toEqual({
      kind: 'SKIP',
      reason: 'NO_SOURCE_DATA',
    })
  })
})

describe('account_age (OQ-12 — เกณฑ์ 30 วัน)', () => {
  it('ถึงเกณฑ์พอดี → ผ่าน · ขาดไปวันเดียว → ไม่ผ่าน · อ่านไม่ได้ → ไม่บันทึก', () => {
    expect(shopVerdict('account_age', { ...FACTS, accountAgeDays: ACCOUNT_AGE_MIN_DAYS })).toEqual({
      kind: 'RECORD',
      outcome: 'PASS',
    })
    expect(shopVerdict('account_age', { ...FACTS, accountAgeDays: ACCOUNT_AGE_MIN_DAYS - 1 })).toEqual({
      kind: 'RECORD',
      outcome: 'FAIL',
    })
    expect(shopVerdict('account_age', { ...FACTS, accountAgeDays: null })).toEqual({
      kind: 'SKIP',
      reason: 'NO_SOURCE_DATA',
    })
  })

  it('🛑 mutation: เปลี่ยน >= เป็น > (หรือขยับเส้น) → เคสขอบต้องแดง', () => {
    // เขียนเป็นเคสขอบสองข้างของเส้นโดยเจตนา — เทสที่ป้อน 400 วันกับ 2 วันจะเขียวต่อไปแม้เส้นขยับ
    // ไป 29 หรือ 31 ซึ่งแปลว่าเทสนั้นไม่ได้กันสิ่งที่มันอ้างว่ากัน (mutation-silence)
    expect(ACCOUNT_AGE_MIN_DAYS).toBe(30)
  })
})

describe('chat_response_speed (OQ-12 — เกณฑ์ 80%)', () => {
  it('ถึงเกณฑ์พอดี → ผ่าน · ต่ำกว่า → ไม่ผ่าน', () => {
    expect(shopVerdict('chat_response_speed', { ...FACTS, chatResponseRate: CHAT_RESPONSE_MIN_RATE_PERCENT })).toEqual({
      kind: 'RECORD',
      outcome: 'PASS',
    })
    expect(
      shopVerdict('chat_response_speed', { ...FACTS, chatResponseRate: CHAT_RESPONSE_MIN_RATE_PERCENT - 1 }),
    ).toEqual({ kind: 'RECORD', outcome: 'FAIL' })
  })

  it('🛑 mutation: ตัวอย่างไม่พอ (null) แล้วบันทึกเป็น FAIL → เคสนี้ต้องแดง', () => {
    // `null` ที่มาถึงข้อนี้แปลว่า resolveChatResponse() ตัดสินว่ายังพูดไม่ได้ — ตี FAIL แปลว่า
    // ป้ายบอกว่า "ตอบแชทไม่ผ่าน" ให้ร้านที่แค่ยังไม่มีบทสนทนามากพอ
    expect(shopVerdict('chat_response_speed', { ...FACTS, chatResponseRate: null })).toEqual({
      kind: 'SKIP',
      reason: 'NO_SOURCE_DATA',
    })
  })

  it('เกณฑ์อยู่ที่ 80 ตามช่องว่างจริงในข้อมูล prod (56/67 กับ 99/100)', () => {
    expect(CHAT_RESPONSE_MIN_RATE_PERCENT).toBe(80)
    for (const rate of [56, 67]) {
      expect(shopVerdict('chat_response_speed', { ...FACTS, chatResponseRate: rate })).toMatchObject({ outcome: 'FAIL' })
    }
    for (const rate of [99, 100]) {
      expect(shopVerdict('chat_response_speed', { ...FACTS, chatResponseRate: rate })).toMatchObject({ outcome: 'PASS' })
    }
  })
})

describe('duplicate_listing (OQ-13 — เทียบรูปด้วย hash ข้ามร้าน)', () => {
  it('ไม่มีรูปตรงกับร้านอื่นและแฮชครบทุกใบ → ผ่าน', () => {
    expect(decideDuplicateListing(ROOM_FACTS)).toEqual({ kind: 'RECORD', outcome: 'PASS' })
  })

  it('เจอรูปที่ก็อปมาจากร้านที่ประกาศก่อน → ไม่ผ่าน', () => {
    expect(decideDuplicateListing({ ...ROOM_FACTS, copiedFromOtherShopCount: 1 })).toEqual({
      kind: 'RECORD',
      outcome: 'FAIL',
    })
  })

  it('🛑 mutation: สลับลำดับกฎให้เช็ค "แฮชครบไหม" ก่อน "เจอของก็อปไหม" → เคสนี้ต้องแดง', () => {
    // หลักฐานฝั่งบวกสรุปได้ทันทีแม้ข้อมูลไม่ครบ — เจอรูปที่ก็อปมาแล้ว 1 ใบก็พอ
    // ถ้าสลับลำดับ เคสนี้จะกลายเป็น SKIP แล้วห้องที่ก็อปรูปมาจริงจะไม่มีวันได้ FAIL
    // ตราบใดที่ยังมีรูปสักใบที่แฮชไม่ผ่าน (ซึ่งคนก็อปทำให้เกิดได้เองด้วยการอัปไฟล์เสีย 1 ใบ)
    expect(decideDuplicateListing({ ...ROOM_FACTS, hashedImageCount: 1, copiedFromOtherShopCount: 1 })).toEqual({
      kind: 'RECORD',
      outcome: 'FAIL',
    })
  })

  it('🛑 mutation: ยอมให้ผ่านทั้งที่แฮชไม่ครบทุกใบ → เคสนี้ต้องแดง', () => {
    // "ไม่พบว่าก็อป" จากรูป 2 ใน 10 ใบ คือคำรับรองที่อ้างจากข้อมูลที่ไม่มี
    expect(decideDuplicateListing({ ...ROOM_FACTS, totalImageCount: 10, hashedImageCount: 2 })).toEqual({
      kind: 'SKIP',
      reason: 'NO_SOURCE_DATA',
    })
  })

  it('🛑 mutation: ห้องที่ยังไม่มีรูปเลย แล้วคืน PASS → เคสนี้ต้องแดง', () => {
    // ไม่มีรูป = ไม่มีอะไรให้เทียบ ไม่ใช่ "สะอาด"
    expect(decideDuplicateListing({ ...ROOM_FACTS, totalImageCount: 0, hashedImageCount: 0 })).toEqual({
      kind: 'SKIP',
      reason: 'NO_SOURCE_DATA',
    })
  })

  it('🛑 mutation: ค้นลายนิ้วมือล้มเหลวแล้วคืน PASS → เคสนี้ต้องแดง', () => {
    expect(decideDuplicateListing({ ...ROOM_FACTS, lookupFailed: true })).toEqual({
      kind: 'SKIP',
      reason: 'NO_SOURCE_DATA',
    })
  })

  it('ข้อนี้ต้องอยู่ในทะเบียนแบบ ROOM เท่านั้น — ห้ามกลับไปตัดสินครั้งเดียวแล้ว fan-out ทุกหลัง', () => {
    expect(STEP1_AUTO_CHECKS.duplicate_listing.kind).toBe('ROOM')
  })
})

describe('ทะเบียนกับ SSOT ต้องพูดเรื่อง scope ตรงกัน', () => {
  it('🛑 kind ในทะเบียนต้องตรงกับ scope ใน INSPECTION_CHECKS ทุกข้อ', () => {
    for (const key of STEP1_AUTO_CHECK_KEYS) {
      expect(STEP1_AUTO_CHECKS[key].kind).toBe(INSPECTION_CHECKS[key].scope)
    }
  })
})
