/**
 * [blocker] กฎของใบคืนของ (feature 00056 · AC-RT-01..12)
 *
 * 🛑 คลาสที่เสี่ยงที่สุดของฟีเจอร์นี้คือ **เปิดใบคืนกับออเดอร์ที่ไม่ควรคืนได้** แล้วออกเลขพัสดุ
 * ขากลับจากที่อยู่ที่ของยังไม่เคยไปถึง — เสียเงินค่าส่งจริงและลูกค้าได้เลขที่ใช้ไม่ได้
 *
 * แดง = ห้าม merge
 */
import { describe, it, expect } from 'vitest'

import {
  RETURN_PAYER,
  RETURN_TRACKING_SOURCE,
  canCreateReturn,
  computeRefundAmount,
  isFullyReturned,
  remainingReturnable,
  resolveCountAsCost,
  resolveReturnShippingCost,
  sumReturnShippingCost,
  validateReturnShipping,
} from '../order-return'

const base = {
  orderStatus: 'CONFIRMED',
  forwardCarrierStatus: 'delivered' as string | null,
  hasOpenReturn: false,
  remainingQty: 3,
}

describe('canCreateReturn', () => {
  it('ของถึงมือแล้วเปิดใบคืนได้ — ยืนยันโดยผู้ซื้อ หรือขนส่งบอกว่าส่งถึง', () => {
    expect(canCreateReturn(base)).toBeNull()
    expect(canCreateReturn({ ...base, orderStatus: 'SHIPPED' })).toBeNull()
    expect(
      canCreateReturn({ ...base, orderStatus: 'SHIPPED', forwardCarrierStatus: 'payment_success' }),
    ).toBeNull()
  })

  /**
   * 🛑 `SHIPPED` เฉย ๆ ไม่พอ — สถานะนั้น **ร้านตั้งเองได้** (กดแจ้งจัดส่ง) ยอมรับมันเท่ากับ
   * ให้ร้านออกเลขพัสดุขากลับของของที่ยังไม่เคยออกจากร้าน
   */
  it('[blocker] ร้านกดแจ้งส่งเองแต่ขนส่งยังไม่แตะ → คืนไม่ได้', () => {
    expect(canCreateReturn({ ...base, orderStatus: 'SHIPPED', forwardCarrierStatus: null })).toBe(
      'ORDER_NOT_DELIVERED',
    )
    expect(
      canCreateReturn({ ...base, orderStatus: 'SHIPPED', forwardCarrierStatus: 'order_success' }),
    ).toBe('ORDER_NOT_DELIVERED')
    expect(canCreateReturn({ ...base, orderStatus: 'PENDING', forwardCarrierStatus: null })).toBe(
      'ORDER_NOT_DELIVERED',
    )
  })

  /**
   * 🛑 เคสนี้พลาดง่ายที่สุด: ใบที่ตีกลับมี `Order.status = 'SHIPPED'` ค้างอยู่เสมอ
   * (ยืนยันกับ prod 2026-08-24 — 12/12 ใบเป็น SHIPPED) ถ้าเช็คตีกลับ *ทีหลัง* ด่าน
   * "ส่งถึงหรือยัง" มันจะผ่านไปแล้ว แล้วร้านจะเปิดใบคืนของที่ลูกค้าไม่เคยได้รับ
   */
  it('[blocker] พัสดุตีกลับ (ลูกค้าไม่เคยได้ของ) → คืนไม่ได้ ต้องยกเลิกแทน', () => {
    for (const code of ['return', 'return_success']) {
      expect(canCreateReturn({ ...base, orderStatus: 'SHIPPED', forwardCarrierStatus: code })).toBe(
        'PARCEL_WAS_RETURNED',
      )
      /**
       * 🛑 input ที่ทำให้ **ลำดับของด่าน** มีผลจริง — ผู้ซื้อกดยืนยันตอนเห็นเลขพัสดุ แล้ว
       * ขนส่งส่งไม่สำเร็จทีหลัง (`Order.status` ไม่ถอยกลับเอง) · ถ้าย้ายด่านตีกลับลงไปใต้
       * ด่าน CONFIRMED เคสนี้จะคืน null = เปิดใบคืนของที่ลูกค้าไม่เคยได้รับ
       * ห้ามลบเคสนี้ทิ้งเพราะ "ซ้ำกับบรรทัดบน" — มันคนละสิ่งที่ถูกทดสอบ
       */
      expect(
        canCreateReturn({ ...base, orderStatus: 'CONFIRMED', forwardCarrierStatus: code }),
      ).toBe('PARCEL_WAS_RETURNED')
    }
  })

  it('ยกเลิกแล้ว / มีใบคืนค้างอยู่ / คืนครบแล้ว → ปฏิเสธพร้อมเหตุผลที่ต่างกัน', () => {
    expect(canCreateReturn({ ...base, orderStatus: 'CANCELLED' })).toBe('ORDER_CANCELLED')
    expect(canCreateReturn({ ...base, hasOpenReturn: true })).toBe('RETURN_ALREADY_OPEN')
    expect(canCreateReturn({ ...base, remainingQty: 0 })).toBe('NOTHING_LEFT')
  })
})

describe('จำนวน/ยอด', () => {
  it('เหลือคืนได้ = ที่ซื้อ − ที่เคยคืน และไม่ติดลบ', () => {
    expect(remainingReturnable(3, 1)).toBe(2)
    expect(remainingReturnable(3, 3)).toBe(0)
    expect(remainingReturnable(3, 5)).toBe(0)
  })

  it('ยอดคืนคิดจากราคาที่แช่แข็งไว้ตอนขาย', () => {
    expect(computeRefundAmount([{ qty: 2, unitPrice: 150 }, { qty: 1, unitPrice: 99.5 }])).toBe(399.5)
    expect(computeRefundAmount([])).toBe(0)
  })

  /**
   * 🛑 ต้องเทียบ "ทุกรายการ" ไม่ใช่ผลรวมจำนวน — ซื้อ A×1 B×3 (รวม 4) แล้วคืน B×3 + A×0
   * ผลรวมที่คืน = 3 ยังไม่ถึง 4 ก็จริง แต่ถ้ามีใครเขียนเป็นผลรวม เคสที่คืน B×4 (ซึ่งด่าน
   * BR-RT-04 กันอยู่) จะทำให้ผลรวมเท่ากันพอดีทั้งที่ A ยังไม่เคยถูกคืนเลย
   */
  it('[blocker] คืนครบ = ครบ "ทุกรายการ" ไม่ใช่ผลรวมจำนวนเท่ากัน', () => {
    expect(isFullyReturned([{ orderedQty: 1, returnedQty: 1 }, { orderedQty: 3, returnedQty: 3 }])).toBe(true)
    expect(isFullyReturned([{ orderedQty: 1, returnedQty: 0 }, { orderedQty: 3, returnedQty: 4 }])).toBe(false)
    expect(isFullyReturned([{ orderedQty: 1, returnedQty: 1 }, { orderedQty: 3, returnedQty: 1 }])).toBe(false)
    // ไม่มีรายการเลย = ยังไม่ครบ ไม่ใช่ครบ (ห้ามปิดออเดอร์จากใบคืนที่ว่างเปล่า)
    expect(isFullyReturned([])).toBe(false)
  })
})

describe('รูปแบบการคืน (4 แบบ)', () => {
  it('ทั้ง 4 รูปแบบที่หัวหน้าระบุต้องผ่าน', () => {
    expect(validateReturnShipping({ payer: 'SHOP', trackingSource: 'ISHIP' })).toBeNull()
    expect(
      validateReturnShipping({ payer: 'SHOP', trackingSource: 'MANUAL', manualTrackingNo: 'TH1' }),
    ).toBeNull()
    expect(
      validateReturnShipping({ payer: 'BUYER', trackingSource: 'MANUAL', manualTrackingNo: 'TH2' }),
    ).toBeNull()
    expect(validateReturnShipping({ payer: 'BUYER', trackingSource: 'NONE' })).toBeNull()
  })

  it('[blocker] MANUAL ต้องมีเลข · แบบอื่นต้องไม่มีเลขที่กรอกเอง', () => {
    expect(validateReturnShipping({ payer: 'SHOP', trackingSource: 'MANUAL' })).toBe(
      'MANUAL_NEEDS_TRACKING',
    )
    expect(
      validateReturnShipping({ payer: 'SHOP', trackingSource: 'MANUAL', manualTrackingNo: '  ' }),
    ).toBe('MANUAL_NEEDS_TRACKING')
    // สองแหล่งความจริงในแถวเดียว — เลขที่กรอกเองกับเลขจาก iShip จะขัดกันวันที่ต้องใช้
    expect(
      validateReturnShipping({ payer: 'SHOP', trackingSource: 'ISHIP', manualTrackingNo: 'TH9' }),
    ).toBe('TRACKING_NOT_ALLOWED')
  })

  /**
   * ระบบเปิดพัสดุผ่านเครดิต iShip **ของร้าน** เสมอ ⇒ ค่าส่งออกโดยร้านโดยอัตโนมัติ
   * ถ้าลูกค้าจะออกเอง เขาต้องเปิดพัสดุเองแล้วส่งเลขมาให้กรอก (= MANUAL)
   */
  it('[blocker] ลูกค้าออกค่าส่ง + ให้ระบบออกเลข iShip = เป็นไปไม่ได้', () => {
    expect(validateReturnShipping({ payer: 'BUYER', trackingSource: 'ISHIP' })).toBe(
      'ISHIP_NEEDS_SHOP_PAYS',
    )
  })

  /**
   * 🛑 ร้านจ่ายเอง = บังคับเป็นต้นทุนเสมอ ห้ามให้ปิด — เงินออกจากกระเป๋าร้านไปแล้วจริง
   * ยอมให้ติ๊กออก = ให้ร้านซ่อนค่าใช้จ่ายจากตัวเอง แล้วตัวเลขกำไรสวยกว่าความจริง
   */
  it('[blocker] ร้านจ่าย → เป็นต้นทุนเสมอแม้พยายามปิด · ลูกค้าจ่าย → ร้านเลือกได้', () => {
    expect(resolveCountAsCost(RETURN_PAYER.SHOP, false)).toBe(true)
    expect(resolveCountAsCost(RETURN_PAYER.SHOP, undefined)).toBe(true)
    // ลูกค้าออกเอง: ค่าตั้งต้นไม่นับ (เงินไม่ได้ออกจากร้าน) แต่เปิดได้ — บางเคสลูกค้าออกเลขเอง
    // แล้วมาเรียกเก็บร้านทีหลัง (เคสที่หัวหน้าระบุมาเอง)
    expect(resolveCountAsCost(RETURN_PAYER.BUYER, undefined)).toBe(false)
    expect(resolveCountAsCost(RETURN_PAYER.BUYER, true)).toBe(true)
    expect(RETURN_TRACKING_SOURCE.NONE).toBe('NONE')
  })
})

/**
 * [blocker] ค่าส่งขากลับเข้าระบบกำไร (P5 · D-3c · หัวหน้ายืนยัน 2026-08-24)
 *
 * 🛑 คลาสที่เสี่ยงที่สุดคือ **ตัวเลขที่ยังไม่ครบแต่หน้าตาเหมือนครบ** — ใบที่ยังไม่รู้ค่าส่งถูก
 * นับเป็น 0 ซึ่งเหมือน "ไม่มีค่าส่ง" ทุกประการ ถ้าไม่แยกสองอย่างนี้ ร้านจะอ่านกำไรที่สูงกว่า
 * ความจริงโดยไม่มีอะไรเตือน (เกิดจริงมาแล้ว 2026-08-10 กับค่าส่งขาไป)
 */
describe('[blocker] resolveReturnShippingCost', () => {
  const base = { countAsCost: true, shippingCost: null, carrierPrice: null, estimatedPrice: null }

  it('ไม่นับเป็นต้นทุน = 0 และ **รู้แน่นอน** ว่าเป็น 0', () => {
    const r = resolveReturnShippingCost({ ...base, countAsCost: false, carrierPrice: 55 })
    expect(r).toEqual({ amount: 0, known: true })
  })

  it('ยังไม่รู้ราคา = 0 แต่ known:false — ห้ามปนกับ "ไม่มีค่าส่ง"', () => {
    expect(resolveReturnShippingCost(base)).toEqual({ amount: 0, known: false })
  })

  /**
   * ราคาที่ร้านกรอกเองมาก่อน เพราะเป็นตัวเลขที่ร้าน **จ่ายจริง** — เคสลูกค้าออกเลขเองแล้วมา
   * เรียกเก็บร้าน ไม่มีทางอ่านจาก iShip ได้เลย
   */
  it('ลำดับความน่าเชื่อถือ: กรอกเอง > ราคาจริง > ราคาประมาณ', () => {
    expect(
      resolveReturnShippingCost({ ...base, shippingCost: 40, carrierPrice: 55, estimatedPrice: 60 })
        .amount,
    ).toBe(40)
    expect(resolveReturnShippingCost({ ...base, carrierPrice: 55, estimatedPrice: 60 }).amount).toBe(55)
    expect(resolveReturnShippingCost({ ...base, estimatedPrice: 60 }).amount).toBe(60)
  })

  it('[blocker] ยอดรวมต้องมาพร้อมจำนวนใบที่ยังไม่รู้ราคา', () => {
    const sum = sumReturnShippingCost([
      { ...base, carrierPrice: 50 },
      { ...base, shippingCost: 30 },
      base, // ยังไม่รู้ราคา
      { ...base, countAsCost: false, carrierPrice: 999 }, // ลูกค้าออกเอง ร้านไม่รับผิดชอบ
    ])
    expect(sum.total).toBe(80)
    expect(sum.unknownCount).toBe(1)
  })
})
