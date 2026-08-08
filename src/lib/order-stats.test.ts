// order-stats.test.ts — Vitest สำหรับสูตรอัตราความสำเร็จ (feature 00039)
//
// เทสชุดเดิม 11 เคสถูก "ปรับ" ไม่ใช่ลบทิ้ง — เคสที่ยืนยันการปัดเศษและตัวหาร 0 ยังอยู่ครบ
// เปลี่ยนแค่ signature (รับ object) และเลขเกณฑ์ขั้นต่ำ 3 → 5
// (ลบเทสเก่าแล้วเขียนใหม่ = เสียหลักฐานว่าพฤติกรรมเดิมข้อไหนตั้งใจ — TC-A09)

import { describe, it, expect } from 'vitest'

import {
  computeCompletionRate,
  isRateExcludedCancellation,
  COMPLETION_RATE_MIN_SAMPLE,
  AUTO_CONFIRM_GRACE_DAYS,
} from './order-stats'

describe('computeCompletionRate — เกณฑ์ขั้นต่ำ', () => {
  it('TC-A01: ตัวหาร 4 (ต่ำกว่าเกณฑ์ 5) → rate เป็น null ไม่ใช่ 100', () => {
    const r = computeCompletionRate({ confirmed: 4, cancelled: 0, excluded: 0 })
    expect(r.rate).toBeNull()
    expect(r.denominator).toBe(4)
    expect(r.belowMinSample).toBe(true)
  })

  it('TC-A02: ตัวหาร 5 พอดี → แสดงได้', () => {
    const r = computeCompletionRate({ confirmed: 5, cancelled: 0, excluded: 0 })
    expect(r.rate).toBe(100)
    expect(r.denominator).toBe(5)
    expect(r.belowMinSample).toBe(false)
  })

  it('TC-A03: เช็คเกณฑ์ "หลังหัก" — ก่อนหักผ่าน หลังหักไม่ผ่าน ต้องได้ null', () => {
    // confirmed 4 + cancelled 3 = 7 ใบ (ผ่านเกณฑ์ถ้าเช็คก่อนหัก)
    // แต่ 3 ใบนั้นถูกตัดออกหมด → ตัวหารจริงเหลือ 4 → ต้องไม่แสดง
    const r = computeCompletionRate({ confirmed: 4, cancelled: 3, excluded: 3 })
    expect(r.denominator).toBe(4)
    expect(r.rate).toBeNull()
    expect(r.belowMinSample).toBe(true)
  })

  it('TC-A08: ไม่มีข้อมูลเลย → null ไม่ throw', () => {
    const r = computeCompletionRate({ confirmed: 0, cancelled: 0, excluded: 0 })
    expect(r.rate).toBeNull()
    expect(r.denominator).toBe(0)
  })

  it('เกณฑ์ขั้นต่ำต้องเป็น 5 (ตรงกับ FB Marketplace / Airbnb Guest Favourite)', () => {
    expect(COMPLETION_RATE_MIN_SAMPLE).toBe(5)
  })
})

describe('computeCompletionRate — การหักใบที่ไม่ใช่ความผิดร้าน', () => {
  it('TC-A04: ตัวอย่างจริงจาก PRD — 17 สำเร็จ / ยกเลิก 4 / ตัดออก 3 → 94% จาก 18 ใบ', () => {
    const r = computeCompletionRate({ confirmed: 17, cancelled: 4, excluded: 3 })
    expect(r.denominator).toBe(18)
    expect(r.rate).toBe(94)
    expect(r.excluded).toBe(3)
  })

  it('TC-A05: ไม่มีใบถูกตัดออก → ได้ค่าเดิมแบบก่อนเปลี่ยนสูตร (81% จาก 21)', () => {
    const r = computeCompletionRate({ confirmed: 17, cancelled: 4, excluded: 0 })
    expect(r.denominator).toBe(21)
    expect(r.rate).toBe(81)
    expect(r.excluded).toBe(0)
  })

  it('TC-A06: ยกเลิกทั้งหมดและตัดออกทั้งหมด → ตัวหาร 0 ต้องได้ null ไม่ใช่ 0%', () => {
    const r = computeCompletionRate({ confirmed: 0, cancelled: 6, excluded: 6 })
    expect(r.denominator).toBe(0)
    expect(r.rate).toBeNull()
  })

  it('TC-A07: ข้อมูลผิดรูป excluded > cancelled → clamp ตัวหารห้ามติดลบ', () => {
    const r = computeCompletionRate({ confirmed: 5, cancelled: 2, excluded: 4 })
    expect(r.denominator).toBe(5) // 5 + 2 − clamp(4→2)
    expect(r.excluded).toBe(2)
    expect(r.rate).toBe(100)
  })

  it('ค่าติดลบที่หลุดเข้ามาต้องไม่ทำให้ผลเพี้ยน', () => {
    const r = computeCompletionRate({ confirmed: -3, cancelled: -1, excluded: -5 })
    expect(r.denominator).toBe(0)
    expect(r.rate).toBeNull()
  })
})

describe('computeCompletionRate — การปัดเศษ (ยกมาจากเทสชุดเดิม)', () => {
  it('ครึ่ง ๆ ปัดขึ้นตาม Math.round', () => {
    // 5/8 = 62.5 → 63
    expect(computeCompletionRate({ confirmed: 5, cancelled: 3, excluded: 0 }).rate).toBe(63)
  })

  it('2 ใน 3 → 67', () => {
    expect(computeCompletionRate({ confirmed: 4, cancelled: 2, excluded: 0 }).rate).toBe(67)
  })

  it('ยกเลิกล้วน → 0% (ต่างจาก null — มีข้อมูลพอแล้วและผลคือแย่จริง)', () => {
    const r = computeCompletionRate({ confirmed: 0, cancelled: 5, excluded: 0 })
    expect(r.rate).toBe(0)
    expect(r.belowMinSample).toBe(false)
  })

  it('สำเร็จล้วน → 100%', () => {
    expect(computeCompletionRate({ confirmed: 12, cancelled: 0, excluded: 0 }).rate).toBe(100)
  })
})

describe('isRateExcludedCancellation — ตัดสินจากเส้นทาง ไม่ใช่จากเหตุผลที่ร้านเลือก', () => {
  it('TC-B01: ผู้ซื้อกดยกเลิกเอง → ตัดออก', () => {
    expect(
      isRateExcludedCancellation({ cancelInitiator: 'buyer', activeShipmentCarrierStatus: null }),
    ).toBe(true)
  })

  it('TC-B02: ร้านยกเลิกเอง (แม้จะเป็นเพราะลูกค้าจริง) ต้องไม่ตัดออก', () => {
    // นี่คือเคสที่กันร้าน "ให้คะแนนตัวเอง" — ถ้าเคสนี้กลายเป็น true เมื่อไหร่
    // แปลว่ามีใครเอา cancelReason กลับเข้ามามีอำนาจตัดสิน = ละเมิด BR-OSM-05
    expect(
      isRateExcludedCancellation({ cancelInitiator: 'seller', activeShipmentCarrierStatus: null }),
    ).toBe(false)
  })

  it('TC-B04: พัสดุตีกลับถึงร้านแล้ว → ตัดออก', () => {
    expect(
      isRateExcludedCancellation({
        cancelInitiator: 'seller',
        activeShipmentCarrierStatus: 'return_success',
      }),
    ).toBe(true)
  })

  it('TC-B05: พัสดุกำลังตีกลับ → ตัดออก', () => {
    expect(
      isRateExcludedCancellation({ cancelInitiator: 'seller', activeShipmentCarrierStatus: 'return' }),
    ).toBe(true)
  })

  it('สถานะขนส่งปกติ (ส่งถึงแล้ว) แต่ร้านยกเลิก → ไม่ตัดออก', () => {
    expect(
      isRateExcludedCancellation({
        cancelInitiator: 'seller',
        activeShipmentCarrierStatus: 'delivered',
      }),
    ).toBe(false)
  })

  it('ไม่มีข้อมูลผู้ยกเลิกเลย (ออเดอร์เก่า) → ไม่ตัดออก (fail-closed)', () => {
    expect(
      isRateExcludedCancellation({ cancelInitiator: null, activeShipmentCarrierStatus: null }),
    ).toBe(false)
  })
})

describe('ค่าคงที่ที่หน้าจอต้องอ่านจากที่เดียว', () => {
  it('AUTO_CONFIRM_GRACE_DAYS = 7 (user เคาะ 2026-08-08)', () => {
    expect(AUTO_CONFIRM_GRACE_DAYS).toBe(7)
  })
})
