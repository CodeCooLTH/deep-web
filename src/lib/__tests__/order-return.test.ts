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
  RETURN_METHODS,
  RETURN_PAYER,
  RETURN_TRACKING_SOURCE,
  canCreateReturn,
  computeRefundAmount,
  isFullyReturned,
  remainingReturnable,
  resolveCountAsCost,
  parseReturnParcel,
  resolveReturnShippingCost,
  resolveReturnShippingChoice,
  returnChoiceSummary,
  returnMethod,
  sumReturnShippingCost,
  validateReturnShipping,
  type ReturnMethodKey,
  type ReturnPayer,
  type ReturnTrackingSource,
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

describe('กฎระดับล่าง: คู่ payer × trackingSource ที่เป็นไปได้', () => {
  it('ทั้ง 4 คู่ที่หัวหน้าระบุต้องผ่าน', () => {
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

/**
 * [blocker] 3 วิธีบนจอต้องตรงกับกฎที่ service บังคับ (ดีไซน์ชีตคืนของ 2026-08-25 · D-1/D-4)
 *
 * ลิสต์ `RETURN_METHODS` คือสิ่งเดียวที่ผู้ใช้เห็น — ถ้ามันหลุดจาก `validateReturnShipping`
 * จะเกิดได้ 2 ทางและทั้งคู่เงียบ:
 *   - มีข้อที่กดแล้ว service ปฏิเสธ  ⇒ ร้านเจอ error ที่แก้ไม่ได้เพราะจอไม่มีทางอื่นให้เลือก
 *   - มีคู่ที่ถูกต้องแต่ไปถึงไม่ได้    ⇒ ความสามารถหายไปจากผลิตภัณฑ์โดยไม่มีอะไรฟ้อง
 *
 * 🛑 **รอบนี้ลิสต์หดจาก 5 → 3 ข้อ — ซึ่งเป็นรูปร่างของ "ทางที่สอง" เป๊ะ ๆ** คู่ `SHOP+NONE`
 * และ `BUYER+NONE` หายจากลิสต์จริง แต่ **ต้องยังไปถึงได้** ด้วยการเว้นช่องเลขว่าง (D-4)
 * ⇒ เกณฑ์ความครบเปลี่ยนจาก "นับข้อในลิสต์" เป็น "กางทุกวิธี × มี/ไม่มีเลข แล้วเทียบกับคู่ที่
 * valid ทั้งหมด" — ถ้าใครแก้ `sourceWithoutTracking` ให้ไม่ใช่ `NONE` คู่นั้นจะหายจริงและเทสแดง
 */
describe('[blocker] RETURN_METHODS ผูกกับ validateReturnShipping', () => {
  const ALL_PAIRS = (['SHOP', 'BUYER'] as ReturnPayer[]).flatMap((payer) =>
    (['ISHIP', 'MANUAL', 'NONE'] as ReturnTrackingSource[]).map((trackingSource) => ({
      payer,
      trackingSource,
    })),
  )

  /** ทุกทางที่ผู้ใช้ไปถึงได้จากจอ = 3 วิธี × (เว้นว่าง / กรอกเลข) */
  const REACHABLE = RETURN_METHODS.flatMap((m) => [
    { key: m.key, trackingNo: '' },
    { key: m.key, trackingNo: 'TH123' },
  ])

  it('ทุกทางที่กดได้จากจอ ผ่าน validateReturnShipping', () => {
    for (const r of REACHABLE) {
      const c = resolveReturnShippingChoice(r.key, r.trackingNo)
      expect(validateReturnShipping(c), `${r.key} tracking="${r.trackingNo}"`).toBeNull()
    }
  })

  it('ครอบคู่ที่ถูกต้องครบทุกคู่ ไม่ขาดไม่เกิน (เลข "ไม่มี" มาจากการเว้นว่าง ไม่ใช่ข้อแยก)', () => {
    const validPairs = ALL_PAIRS.filter(
      (p) =>
        validateReturnShipping({
          ...p,
          manualTrackingNo: p.trackingSource === 'MANUAL' ? 'TH123' : null,
        }) === null,
    ).map((p) => `${p.payer}_${p.trackingSource}`)

    const reached = [
      ...new Set(
        REACHABLE.map((r) => {
          const c = resolveReturnShippingChoice(r.key, r.trackingNo)
          return `${c.payer}_${c.trackingSource}`
        }),
      ),
    ]
    expect(reached.sort()).toEqual(validPairs.sort())
  })

  it('[blocker] เว้นช่องเลขว่าง = "ไม่มีเลขพัสดุ" ไม่ใช่ข้อผิดพลาด (D-4 · BR-RT-19)', () => {
    expect(resolveReturnShippingChoice('SHOP_SELF', '').trackingSource).toBe('NONE')
    expect(resolveReturnShippingChoice('BUYER_SELF', null).trackingSource).toBe('NONE')
    // ช่องว่างล้วนก็คือเว้นว่าง — ไม่ใช่เลขพัสดุชื่อ "   "
    expect(resolveReturnShippingChoice('SHOP_SELF', '   ').trackingSource).toBe('NONE')
    expect(resolveReturnShippingChoice('SHOP_SELF', '   ').manualTrackingNo).toBeNull()
    // กรอกแล้วต้องกลายเป็น MANUAL และเก็บเลขที่ตัดช่องว่างหัวท้ายแล้ว
    const filled = resolveReturnShippingChoice('BUYER_SELF', '  TH9  ')
    expect(filled.trackingSource).toBe('MANUAL')
    expect(filled.manualTrackingNo).toBe('TH9')
  })

  /**
   * 🛑 iShip เป็นคนออกเลข — จอไม่มีช่องให้กรอกด้วยซ้ำ ถ้าเลขหลุดมาทาง API แล้วเราส่งต่อ
   * `validateReturnShipping` จะคืน `TRACKING_NOT_ALLOWED` ซึ่ง **ผู้ใช้แก้ไม่ได้เลย**
   * (ไม่มีช่องนั้นให้ลบ) ⇒ resolver ต้องทิ้งเลขทิ้งเอง ไม่ใช่ปล่อยไปโดนด่าน
   */
  it('[blocker] วิธีที่ระบบออกเลขให้: เลขที่หลุดมาถูกทิ้ง ไม่กลายเป็น error ที่แก้ไม่ได้', () => {
    const c = resolveReturnShippingChoice('ISHIP', 'TH-หลุดมา')
    expect(c.trackingSource).toBe('ISHIP')
    expect(c.manualTrackingNo).toBeNull()
    expect(validateReturnShipping(c)).toBeNull()
  })

  it('คู่ที่เป็นไปไม่ได้ (ลูกค้าจ่าย + ระบบออกเลข) ไม่มีทางไปถึงจากจอ', () => {
    // นี่คือเหตุผลทั้งหมดที่ payer เป็น **ผลลัพธ์** ของวิธี ไม่ใช่คำถามแยก
    for (const r of REACHABLE) {
      const c = resolveReturnShippingChoice(r.key, r.trackingNo)
      expect(c.payer === 'BUYER' && c.trackingSource === 'ISHIP', r.key).toBe(false)
    }
  })

  it('[blocker] costOptional ตรงกับ resolveCountAsCost (ร้านจ่าย = บังคับนับ ถามไม่ได้)', () => {
    for (const m of RETURN_METHODS) {
      // ติ๊กออกแล้วยังนับอยู่ = ถามไปก็ไม่มีผล ⇒ costOptional ต้องเป็น false
      const ignoresChoice = resolveCountAsCost(m.payer, false) === true
      expect(ignoresChoice, m.key).toBe(!m.costOptional)
      // และ resolver ต้องบังคับตามนั้นจริง ไม่ใช่ส่งค่าที่ client ส่งมาผ่านไปเฉย ๆ
      expect(resolveReturnShippingChoice(m.key, '', false).countAsCost, m.key).toBe(!m.costOptional)
      expect(resolveReturnShippingChoice(m.key, '', true).countAsCost, m.key).toBe(true)
    }
  })

  it('returnMethod ดังทันทีเมื่อคีย์ไม่รู้จัก ไม่ถอยไปข้อแรกเงียบ ๆ', () => {
    // ถอยไปข้อแรก = ISHIP = ตัดเครดิตร้านจริงโดยไม่มีใครสั่ง
    expect(() => returnMethod('NOPE' as ReturnMethodKey)).toThrow()
    expect(() => resolveReturnShippingChoice('NOPE' as ReturnMethodKey, '')).toThrow()
    expect(returnMethod('BUYER_SELF').payer).toBe('BUYER')
  })

  it('returnChoiceSummary พูดทั้ง "วิธี" และ "เรื่องเงิน" — คำเดียวกันทั้งปุ่มย้อนกลับและหน้าสรุป', () => {
    for (const m of RETURN_METHODS) {
      const s = returnChoiceSummary(m.key)
      expect(s, m.key).toContain(m.title)
      expect(s, m.key).toContain(m.money)
    }
  })
})

/**
 * [blocker] กล่องขากลับที่ร้านแก้เอง (D-5)
 *
 * 🛑 fail-closed ทั้งก้อน — ก้อนที่มีบางช่องเป็น 0/NaN จะถูก `createReturnShipment` ส่งออกไป
 * ให้ iShip ตรง ๆ ซึ่งเปิดพัสดุไม่ผ่าน หรือ (แย่กว่า) ผ่านด้วยราคาที่คิดจากกล่องผิดใบ
 * ค่าตั้งต้นที่ถูกคือ "ใช้กล่องของขาไป" ซึ่งเกิดได้เมื่อคืน `null` เท่านั้น
 */
describe('[blocker] parseReturnParcel', () => {
  const ok = { weight: 2, width: 30, length: 20, height: 15 }

  it('ก้อนที่ครบและเป็นบวกทั้งหมดผ่าน', () => {
    expect(parseReturnParcel(ok)).toEqual(ok)
    // ค่าที่มาเป็นสตริงจาก JSON/Decimal ต้องถูกแปลงให้ ไม่ใช่ตกทั้งก้อน
    expect(parseReturnParcel({ weight: '2', width: '30', length: '20', height: '15' })).toEqual(ok)
    // คีย์เกินไม่ทำให้ตก แต่ต้องไม่ไหลออกไปด้วย
    expect(parseReturnParcel({ ...ok, courierCode: 'X' })).toEqual(ok)
  })

  it('[blocker] ขาดช่องไหน / ไม่ใช่ตัวเลขบวก = null ทั้งก้อน (ไม่ใช่ก้อนที่มี 0 ปน)', () => {
    for (const k of ['weight', 'width', 'length', 'height'] as const) {
      expect(parseReturnParcel({ ...ok, [k]: 0 }), `${k}=0`).toBeNull()
      expect(parseReturnParcel({ ...ok, [k]: -1 }), `${k}=-1`).toBeNull()
      expect(parseReturnParcel({ ...ok, [k]: null }), `${k}=null`).toBeNull()
      expect(parseReturnParcel({ ...ok, [k]: 'ไม่ใช่เลข' }), `${k}=text`).toBeNull()
      const { [k]: _drop, ...missing } = ok
      expect(parseReturnParcel(missing), `ไม่มี ${k}`).toBeNull()
    }
  })

  it('ค่าที่ไม่ใช่อ็อบเจกต์ = null (คอลัมน์ Json รับอะไรก็ได้)', () => {
    for (const bad of [null, undefined, 0, '', 'x', [], [1, 2, 3], true]) {
      expect(parseReturnParcel(bad), String(bad)).toBeNull()
    }
  })
})
