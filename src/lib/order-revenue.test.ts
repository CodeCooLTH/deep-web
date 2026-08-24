// order-revenue.test.ts — ล็อกเกณฑ์ "ออเดอร์ใบไหนนับเป็นยอดขาย"
//
// เกณฑ์นี้แตะตัวเลขเงินที่ร้านเอาไปตัดสินใจจริง ถ้ามันเพี้ยนจะไม่มีอะไรพัง มีแต่ตัวเลขที่ผิด
// แล้วไม่มีใครรู้ — เทสจึงเป็นด่านเดียวที่ส่งเสียงได้

import { describe, expect, it } from 'vitest'
import { countsAsRevenue, REVENUE_CARRIER_STATUSES, revenueOrderWhere } from './order-revenue'

const parcel = (carrierStatus: string | null, direction = 'FORWARD') => ({
  status: 'CREATED',
  isDryRun: false,
  carrierStatus,
  direction,
})

describe('countsAsRevenue', () => {
  it('ผู้ซื้อยืนยันรับของแล้ว → นับ (พฤติกรรมเดิม ห้ามหาย)', () => {
    expect(countsAsRevenue({ status: 'CONFIRMED' })).toBe(true)
    expect(countsAsRevenue({ status: 'CONFIRMED', shipments: [] })).toBe(true)
  })

  it('ขนส่งรับของไปแล้วจริง → นับ แม้ผู้ซื้อยังไม่กดยืนยัน', () => {
    for (const code of REVENUE_CARRIER_STATUSES) {
      expect(countsAsRevenue({ status: 'SHIPPED', shipments: [parcel(code)] })).toBe(true)
    }
  })

  it('ร้านกดแจ้งเลขพัสดุเองแต่ขนส่งยังไม่แตะ → ยังไม่นับ', () => {
    // นี่คือเหตุผลที่เกณฑ์ไม่ใช่แค่ status==='SHIPPED' — สถานะนั้นร้านตั้งเองได้
    expect(countsAsRevenue({ status: 'SHIPPED', shipments: [] })).toBe(false)
    expect(countsAsRevenue({ status: 'SHIPPED', shipments: [parcel(null)] })).toBe(false)
    expect(countsAsRevenue({ status: 'SHIPPED', shipments: [parcel('order_success')] })).toBe(false)
  })

  it('ของตีกลับ → ไม่นับ แม้ขนส่งเคยรับของไปแล้ว (ไม่มีการขายเกิดขึ้นจริง)', () => {
    expect(countsAsRevenue({ status: 'SHIPPED', shipments: [parcel('return')] })).toBe(false)
    expect(countsAsRevenue({ status: 'SHIPPED', shipments: [parcel('return_success')] })).toBe(false)
  })

  it('พัสดุทดสอบไม่เข้าสถิติ (BR-ISHIP-60/61)', () => {
    expect(
      countsAsRevenue({ status: 'SHIPPED', shipments: [{ ...parcel('delivered'), isDryRun: true }] }),
    ).toBe(false)
  })

  it('พัสดุที่ถูกยกเลิกแล้วไม่นับ', () => {
    expect(
      countsAsRevenue({ status: 'SHIPPED', shipments: [{ ...parcel('delivered'), status: 'CANCELLED' }] }),
    ).toBe(false)
  })

  it('ยกเลิก/รอดำเนินการ → ไม่นับเสมอ', () => {
    expect(countsAsRevenue({ status: 'CANCELLED', shipments: [parcel('delivered')] })).toBe(false)
    expect(countsAsRevenue({ status: 'PENDING', shipments: [parcel('delivered')] })).toBe(false)
  })
})

describe('revenueOrderWhere ต้องสื่อเกณฑ์เดียวกับ countsAsRevenue', () => {
  it('ครอบ 2 กรณี: ยืนยันแล้ว หรือ จัดส่งแล้ว+ขนส่งรับของ', () => {
    expect(revenueOrderWhere.OR).toHaveLength(2)
    expect(revenueOrderWhere.OR[0]).toEqual({ status: 'CONFIRMED' })
    const shipped = revenueOrderWhere.OR[1] as {
      status: string
      shipments: { some: { status: string; isDryRun: boolean; carrierStatus: { in: string[] } } }
    }
    expect(shipped.status).toBe('SHIPPED')
    expect(shipped.shipments.some.isDryRun).toBe(false)
    expect(shipped.shipments.some.status).toBe('CREATED')
    // ลิสต์ต้องตรงกับที่ countsAsRevenue ใช้เป๊ะ ไม่งั้น query กับการกรองในหน่วยความจำจะให้คนละผล
    expect(shipped.shipments.some.carrierStatus.in).toEqual([...REVENUE_CARRIER_STATUSES])
  })

  it('ไม่มีสถานะของตีกลับหลุดเข้ามาในลิสต์', () => {
    expect(REVENUE_CARRIER_STATUSES).not.toContain('return')
    expect(REVENUE_CARRIER_STATUSES).not.toContain('return_success')
    expect(REVENUE_CARRIER_STATUSES).not.toContain('cancelled')
    expect(REVENUE_CARRIER_STATUSES).not.toContain('is_expired')
  })
})

/**
 * [blocker] feature 00056 — พัสดุ **ขากลับ** ของใบคืนต้องไม่ถูกนับเป็นยอดขาย
 *
 * ระบบคืนของเก็บพัสดุขากลับไว้ใน `OrderShipment` ตารางเดียวกับขาไป ถ้าเกณฑ์ยอดขายไม่แยกทิศทาง
 * ออเดอร์ที่ลูกค้าคืนของแล้วจะยัง "นับเป็นยอดขาย" ต่อไปเพราะมีพัสดุที่ขนส่งรับไปจริง —
 * ซึ่งเป็นพัสดุที่กำลังวิ่งกลับมาหาร้าน ไม่ใช่วิ่งไปหาลูกค้า
 */
describe('[blocker] ทิศทางพัสดุ (feature 00056)', () => {
  it('พัสดุขากลับไม่นับเป็นยอดขาย แม้ขนส่งรับของไปแล้ว', () => {
    for (const code of REVENUE_CARRIER_STATUSES) {
      expect(
        countsAsRevenue({ status: 'SHIPPED', shipments: [parcel(code, 'RETURN')] }),
        code,
      ).toBe(false)
    }
  })

  it('มีทั้งขาไปและขากลับในใบเดียว → ยังนับ (ขาไปคือหลักฐานว่าขายได้จริง)', () => {
    const code = REVENUE_CARRIER_STATUSES[0]
    expect(
      countsAsRevenue({
        status: 'SHIPPED',
        shipments: [parcel(code, 'RETURN'), parcel(code, 'FORWARD')],
      }),
    ).toBe(true)
  })
})
