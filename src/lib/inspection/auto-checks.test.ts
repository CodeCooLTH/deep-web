// [blocker] ทะเบียนข้อตรวจอัตโนมัติขั้น 1 (feature 00060 · T8)

import { describe, expect, it } from 'vitest'
import { INSPECTION_CHECKS, INSPECTION_CHECK_KEYS } from './checks'
import {
  STEP1_AUTO_CHECKS,
  STEP1_AUTO_CHECK_KEYS,
  isRoomScopedAutoCheck,
  type AutoCheckFacts,
} from './auto-checks'

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
    expect(STEP1_AUTO_CHECKS.scam_db.evaluate({ ...FACTS, scamFound: false })).toEqual({
      kind: 'RECORD',
      outcome: 'PASS',
    })
    expect(STEP1_AUTO_CHECKS.scam_db.evaluate({ ...FACTS, scamFound: true })).toEqual({
      kind: 'RECORD',
      outcome: 'FAIL',
    })
  })

  it('🛑 mutation: ค้นฐานไม่สำเร็จแล้ว fallback เป็น PASS → เคสนี้ต้องแดง', () => {
    // ระบบค้นล่มหนึ่งวัน = "วันนี้ยังไม่ได้ตรวจ" ไม่ใช่ "ตรวจแล้วสะอาด"
    // ผิดข้อนี้ = ออกคำรับรองเท็จให้ร้านที่อยู่ในฐานมิจฉาชีพจริง
    expect(STEP1_AUTO_CHECKS.scam_db.evaluate({ ...FACTS, scamFound: null })).toEqual({
      kind: 'SKIP',
      reason: 'NO_SOURCE_DATA',
    })
  })
})

describe('phone_identity', () => {
  it('ยืนยันแล้ว L1 ขึ้นไป → ผ่าน', () => {
    expect(STEP1_AUTO_CHECKS.phone_identity.evaluate({ ...FACTS, verificationLevel: 2 })).toEqual({
      kind: 'RECORD',
      outcome: 'PASS',
    })
  })

  it('🛑 mutation: ยังไม่เคยยืนยัน (ระดับ 0) แล้วบันทึกเป็น FAIL → เคสนี้ต้องแดง', () => {
    // "ยังไม่ส่งยืนยัน" ไม่ใช่ "ตัวตนมีปัญหา" — ตี FAIL คือการกล่าวหาโดยไม่มีการตรวจ
    for (const level of [0, null]) {
      expect(STEP1_AUTO_CHECKS.phone_identity.evaluate({ ...FACTS, verificationLevel: level })).toEqual({
        kind: 'SKIP',
        reason: 'NO_SOURCE_DATA',
      })
    }
  })
})

describe('complaints', () => {
  it('ไม่มีเรื่องค้าง → ผ่าน · มีเรื่องค้าง → ไม่ผ่าน · อ่านไม่ได้ → ไม่บันทึก', () => {
    expect(STEP1_AUTO_CHECKS.complaints.evaluate({ ...FACTS, openComplaintCount: 0 })).toEqual({
      kind: 'RECORD',
      outcome: 'PASS',
    })
    expect(STEP1_AUTO_CHECKS.complaints.evaluate({ ...FACTS, openComplaintCount: 2 })).toEqual({
      kind: 'RECORD',
      outcome: 'FAIL',
    })
    expect(STEP1_AUTO_CHECKS.complaints.evaluate({ ...FACTS, openComplaintCount: null })).toEqual({
      kind: 'SKIP',
      reason: 'NO_SOURCE_DATA',
    })
  })
})

describe('ข้อที่ยังตัดสินไม่ได้', () => {
  it('🛑 mutation: ตั้งเกณฑ์เองให้ account_age / chat_response_speed → เคสนี้ต้องแดง', () => {
    // ป้ายพวกนี้เป็นคำรับรองต่อผู้ซื้อ — ตั้งเส้นเองแปลว่าเรารับรองด้วยตัวเลขที่ไม่มีใครตัดสิน
    expect(STEP1_AUTO_CHECKS.account_age.evaluate(FACTS)).toEqual({
      kind: 'SKIP',
      reason: 'CRITERIA_NOT_DECIDED',
    })
    expect(STEP1_AUTO_CHECKS.chat_response_speed.evaluate(FACTS)).toEqual({
      kind: 'SKIP',
      reason: 'CRITERIA_NOT_DECIDED',
    })
  })

  it('🛑 mutation: duplicate_listing คืน PASS ทั้งที่ยังไม่มีตัวตรวจจับ → เคสนี้ต้องแดง', () => {
    // "ไม่มีตัวตรวจ" กับ "ตรวจแล้วไม่พบว่าซ้ำ" คนละความหมาย และข้อนี้คือข้อที่ผู้ซื้อใช้ดูว่า
    // ที่พักถูกมิจฉาชีพเอาไปประกาศซ้ำหรือเปล่า — PASS ปลอมที่นี่คือคำรับรองที่อันตรายที่สุดในชุด
    expect(STEP1_AUTO_CHECKS.duplicate_listing.evaluate(FACTS)).toEqual({
      kind: 'SKIP',
      reason: 'NO_DETECTOR',
    })
  })
})
