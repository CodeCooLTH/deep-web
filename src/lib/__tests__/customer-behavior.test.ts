import { describe, it, expect } from 'vitest'
import {
  summarizeCustomerBehavior,
  customerBadges,
  hasBehaviorWarning,
  type CustomerOrderEvidence,
} from '@/lib/customer-behavior'
import { th } from '@/i18n/dictionaries/th'

/**
 * คำไทยจริงจาก dictionary — เทสชุดนี้ยืนยัน "รูปประโยคของป้าย" (มีตัวเลข/คำนามถูกที่)
 * ไม่ได้ยืนยันคำแปล ถ้าคำเปลี่ยนที่ dictionary เทสยังถูกต้องอยู่
 */
const copy = th.inbox.customerPanel

const order = (o: Partial<CustomerOrderEvidence> = {}): CustomerOrderEvidence => ({
  status: 'CONFIRMED',
  cancelInitiator: null,
  cancelReason: null,
  activeShipmentCarrierStatus: null,
  ...o,
})

describe('summarizeCustomerBehavior', () => {
  it('ไม่มีประวัติเลย → ศูนย์ทุกช่อง (ไม่ใช่ null ให้ปลายทางต้องเช็คซ้ำ)', () => {
    expect(summarizeCustomerBehavior([])).toEqual({
      orders: 0,
      completed: 0,
      cancelledByBuyer: 0,
      cancelledTotal: 0,
      returnedParcels: 0,
      problemOrders: 0,
    })
  })

  it('ใบปกติ → นับเป็น completed', () => {
    const s = summarizeCustomerBehavior([order(), order({ status: 'SHIPPED' })])
    expect(s.orders).toBe(2)
    expect(s.completed).toBe(2)
    expect(s.problemOrders).toBe(0)
  })

  /**
   * [blocker] ป้ายเดิมใน /orders นับ `status==='CANCELLED'` ทุกใบ ทำให้ลูกค้าถูกติดตราด้วย
   * การยกเลิกของ *ร้านเอง* — ข้อมูล prod 2026-08-11: ยกเลิก 8 ใบ เป็น 'seller' ทั้งหมด
   * ถ้าเทสนี้แดง = เรากลับไปโทษลูกค้าด้วยการกระทำของร้านอีกครั้ง
   */
  it('[blocker] ร้านเป็นคนยกเลิก → ไม่นับเป็นพฤติกรรมลูกค้า', () => {
    const s = summarizeCustomerBehavior([order({ status: 'CANCELLED', cancelInitiator: 'seller' })])
    expect(s.cancelledByBuyer).toBe(0)
    expect(s.problemOrders).toBe(0)
    expect(s.completed).toBe(0) // ยกเลิกแล้วก็ไม่ใช่ใบที่สำเร็จเช่นกัน
  })

  it('[blocker] ใบเก่าที่ไม่รู้ว่าใครยกเลิก (null) → ไม่โทษลูกค้า (fail-closed)', () => {
    const s = summarizeCustomerBehavior([order({ status: 'CANCELLED', cancelInitiator: null })])
    expect(s.cancelledByBuyer).toBe(0)
    expect(s.problemOrders).toBe(0)
  })

  /**
   * [blocker] เคสที่ทำให้ป้ายไม่ขึ้นเลยตอน ship รอบแรก (user รายงาน 2026-08-11 "ยกเลิก 2 orders
   * ไม่เห็นจะขึ้นในกล่องแชท")
   *
   * ในทางปฏิบัติ **ลูกค้าแจ้งในแชทแล้วร้านเป็นคนกดยกเลิกให้** ปุ่มฝั่งผู้ซื้อแทบไม่ถูกใช้เลย —
   * ฐาน prod ยืนยัน: ยกเลิกทั้งฐานเป็น `cancelInitiator='seller'` 100% ไม่มี 'buyer' สักใบ
   * ต้นเรื่องจริงถูกบันทึกไว้ที่ `cancelReason` ต่างหาก
   *
   * เทสนี้แดง = ป้าย "ยกเลิกเอง" กลับไปเป็นป้ายที่ไม่มีวันขึ้นให้ใครเห็นอีกครั้ง
   */
  it('[blocker] ร้านกดยกเลิกให้ แต่บันทึกว่าลูกค้าขอเอง → นับเป็นพฤติกรรมลูกค้า', () => {
    const s = summarizeCustomerBehavior([
      order({ status: 'CANCELLED', cancelInitiator: 'seller', cancelReason: 'BUYER_REQUESTED' }),
      order({ status: 'CANCELLED', cancelInitiator: 'seller', cancelReason: 'BUYER_NO_TRANSFER' }),
    ])
    expect(s.cancelledByBuyer).toBe(2)
    expect(s.problemOrders).toBe(2)
  })

  it('[blocker] เหตุผลที่เป็นความผิดร้าน/ตกลงกันได้ → ไม่นับ', () => {
    const s = summarizeCustomerBehavior([
      order({ status: 'CANCELLED', cancelInitiator: 'seller', cancelReason: 'SHOP_ISSUE' }),
      order({ status: 'CANCELLED', cancelInitiator: 'seller', cancelReason: 'MUTUAL' }),
    ])
    expect(s.cancelledByBuyer).toBe(0)
  })

  it('ผู้ซื้อกดยกเลิกเอง → นับ', () => {
    const s = summarizeCustomerBehavior([order({ status: 'CANCELLED', cancelInitiator: 'buyer' })])
    expect(s.cancelledByBuyer).toBe(1)
    expect(s.problemOrders).toBe(1)
  })

  it('พัสดุตีกลับ → นับเป็น returnedParcels (ทั้ง return และ return_success)', () => {
    const s = summarizeCustomerBehavior([
      order({ activeShipmentCarrierStatus: 'return' }),
      order({ activeShipmentCarrierStatus: 'return_success' }),
    ])
    expect(s.returnedParcels).toBe(2)
    expect(s.problemOrders).toBe(2)
    expect(s.completed).toBe(0)
  })

  /**
   * [blocker] ใบเดียวต้องนับครั้งเดียว — ตีกลับแล้วผู้ซื้อกดยกเลิกตามคือเหตุการณ์เดียว
   * ถ้านับสองถัง ผู้ขายจะอ่านว่า "ยกเลิก 1 · ตีกลับ 1" แล้วเข้าใจว่ามีปัญหา 2 ครั้ง
   */
  it('[blocker] ตีกลับ + ผู้ซื้อยกเลิกในใบเดียว → นับครั้งเดียว (ตีกลับชนะ)', () => {
    const s = summarizeCustomerBehavior([
      order({ status: 'CANCELLED', cancelInitiator: 'buyer', activeShipmentCarrierStatus: 'return_success' }),
    ])
    expect(s.returnedParcels).toBe(1)
    expect(s.cancelledByBuyer).toBe(0)
    expect(s.problemOrders).toBe(1)
  })

  it('[blocker] problemOrders ต้องเท่ากับผลรวมสองถังเสมอ — ปลายทางห้ามบวกเอง', () => {
    const s = summarizeCustomerBehavior([
      order(),
      order({ status: 'CANCELLED', cancelInitiator: 'buyer' }),
      order({ activeShipmentCarrierStatus: 'return' }),
      order({ status: 'CANCELLED', cancelInitiator: 'seller' }),
    ])
    expect(s.orders).toBe(4)
    expect(s.completed).toBe(1)
    expect(s.problemOrders).toBe(s.cancelledByBuyer + s.returnedParcels)
    expect(s.problemOrders).toBe(2)
  })
})

describe('customerBadges', () => {
  const noun = 'คำสั่งซื้อ'
  const behavior = (o: Partial<ReturnType<typeof summarizeCustomerBehavior>> = {}) => ({
    orders: 0,
    completed: 0,
    cancelledByBuyer: 0,
    cancelledTotal: 0,
    returnedParcels: 0,
    problemOrders: 0,
    ...o,
  })

  it('[blocker] ยังไม่ผูกกับลูกค้าในระบบ → ไม่มีป้ายเลย แม้แต่ "ลูกค้าใหม่"', () => {
    // ป้าย "ลูกค้าใหม่" ในเธรดที่ยังไม่มีออเดอร์สักใบ = ยืนยันสิ่งที่ยังไม่เกิด
    expect(customerBadges(behavior({ orders: 0 }), { hasHistory: false, orderNoun: noun, copy })).toEqual([])
  })

  it('สั่งใบเดียว → ลูกค้าใหม่', () => {
    const b = customerBadges(behavior({ orders: 1, completed: 1 }), { hasHistory: true, orderNoun: noun, copy })
    expect(b.map((x) => x.key)).toEqual(['NEW'])
  })

  it('[blocker] สั่ง 5 ยกเลิกหมด → ห้ามได้ป้าย "ลูกค้าเก่า" (ป้ายบวกที่ผิด)', () => {
    const b = customerBadges(behavior({ orders: 5, completed: 0, cancelledByBuyer: 5, cancelledTotal: 5, problemOrders: 5 }), {
      hasHistory: true,
      orderNoun: noun,
      copy,
    })
    expect(b.map((x) => x.key)).not.toContain('REGULAR')
    expect(b.map((x) => x.key)).toContain('CANCELLED_BY_BUYER')
  })

  it('ลูกค้าเก่าผันคำนามตาม vertical — ไม่ต่อคำเอง', () => {
    const b = customerBadges(behavior({ orders: 4, completed: 4 }), { hasHistory: true, orderNoun: 'การจอง', copy })
    expect(b[0]!.label).toBe('ลูกค้าเก่า · 4 การจอง')
  })

  it('[blocker] ห้ามมีป้ายสีเขียว/แดง — บวก=info ระวัง=warning เท่านั้น', () => {
    const b = customerBadges(behavior({ orders: 6, completed: 4, returnedParcels: 1, cancelledByBuyer: 1, cancelledTotal: 1, problemOrders: 2 }), {
      hasHistory: true,
      orderNoun: noun,
      copy,
    })
    expect(b.every((x) => x.tone === 'info' || x.tone === 'warning')).toBe(true)
    expect(b.map((x) => x.key)).toEqual(['REGULAR', 'RETURNED', 'CANCELLED_BY_BUYER'])
    expect(hasBehaviorWarning(b)).toBe(true)
  })

  it('[blocker] ห้ามใช้คำว่า "คืน" กับพัสดุตีกลับ (ชนกับ 00044 ที่กำลังออกแบบอยู่)', () => {
    const b = customerBadges(behavior({ orders: 2, completed: 1, returnedParcels: 1, problemOrders: 1 }), {
      hasHistory: true,
      orderNoun: noun,
      copy,
    })
    const returned = b.find((x) => x.key === 'RETURNED')!
    expect(returned.label).toBe('ตีกลับ 1 รายการ')
    // 00044 = "ลูกค้ารับของแล้วขอคืนเงิน" คนละสถานการณ์สิ้นเชิง ใช้คำเดียวกันแล้วผู้ขายแยกไม่ออก
    expect(returned.label).not.toContain('คืน')
  })

  it('[blocker] ป้ายยกเลิกนับ "ทุกใบ" ตามที่ user ระบุ + ขยายความใน tooltip เมื่อรู้ต้นเรื่อง', () => {
    const b = customerBadges(
      behavior({ orders: 5, completed: 2, cancelledTotal: 3, cancelledByBuyer: 1, problemOrders: 1 }),
      { hasHistory: true, orderNoun: noun, copy },
    )
    const cancelled = b.find((x) => x.key === 'CANCELLED_BY_BUYER')!
    expect(cancelled.label).toBe('ยกเลิก 3 รายการ')
    expect(cancelled.detail).toBe('ยกเลิก 3 รายการ (ลูกค้าขอเอง 1)')
  })

  it('ร้านยกเลิกเองล้วน → ป้ายยังขึ้น (ข้อเท็จจริง) แต่ไม่มีวงเล็บขยายความ', () => {
    const b = customerBadges(behavior({ orders: 3, completed: 1, cancelledTotal: 2 }), {
      hasHistory: true,
      orderNoun: noun,
      copy,
    })
    const cancelled = b.find((x) => x.key === 'CANCELLED_BY_BUYER')!
    expect(cancelled.label).toBe('ยกเลิก 2 รายการ')
    expect(cancelled.detail).toBe('ยกเลิก 2 รายการ')
  })

  it('ลูกค้าปกติที่ไม่เข้าเงื่อนไขไหนเลย → ไม่มีป้าย (ค่าเริ่มต้นของระบบ)', () => {
    expect(customerBadges(behavior({ orders: 2, completed: 2 }), { hasHistory: true, orderNoun: noun, copy })).toEqual([])
    expect(hasBehaviorWarning([])).toBe(false)
  })
})
