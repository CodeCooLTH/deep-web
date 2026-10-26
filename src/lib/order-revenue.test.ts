// order-revenue.test.ts — ล็อกเกณฑ์ "ออเดอร์ใบไหนนับเป็นยอดขาย"
//
// เกณฑ์นี้แตะตัวเลขเงินที่ร้านเอาไปตัดสินใจจริง ถ้ามันเพี้ยนจะไม่มีอะไรพัง มีแต่ตัวเลขที่ผิด
// แล้วไม่มีใครรู้ — เทสจึงเป็นด่านเดียวที่ส่งเสียงได้

import { describe, expect, it } from 'vitest'
import {
  countsAsRevenue,
  countsAsSoldFor,
  REVENUE_CARRIER_STATUSES,
  revenueOrderWhere,
  revenueWindowWhere,
  soldItemsWindowWhere,
} from './order-revenue'

const parcel = (
  carrierStatus: string | null,
  direction = 'FORWARD',
  problemCloseExcludesRevenue: boolean | null = null,
) => ({
  status: 'CREATED',
  isDryRun: false,
  carrierStatus,
  direction,
  problemCloseExcludesRevenue,
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
  it('ครอบ 3 กรณี: ยืนยันแล้ว · จัดส่งแล้ว+ขนส่งรับของ · ปิดพัสดุแบบนับยอดขาย (00085)', () => {
    expect(revenueOrderWhere.OR).toHaveLength(3)
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

/**
 * feature 00085 — ร้านปิดพัสดุที่มีปัญหา: ผล A / B-COD / B-คืนเงินแล้ว (excludes=true) ไม่นับ,
 * B-โอน-ไม่คืนเงิน (excludes=false) นับแม้ carrierStatus = issue
 */
describe('[blocker] 00085 ปิดพัสดุมีปัญหา', () => {
  it('T-REV-1: ปิดแบบไม่นับ → ไม่นับ แม้ CONFIRMED / SHIPPED(progress)', () => {
    expect(countsAsRevenue({ status: 'CONFIRMED', shipments: [parcel('issue', 'FORWARD', true)] })).toBe(false)
    expect(countsAsRevenue({ status: 'SHIPPED', shipments: [parcel('progress', 'FORWARD', true)] })).toBe(false)
  })

  it('T-REV-2: ปิดแบบนับ (B-โอน-ไม่คืน) + SHIPPED + issue → นับ', () => {
    expect(countsAsRevenue({ status: 'SHIPPED', shipments: [parcel('issue', 'FORWARD', false)] })).toBe(true)
    // ยังไม่ปิด + issue → ไม่นับเหมือนเดิม
    expect(countsAsRevenue({ status: 'SHIPPED', shipments: [parcel('issue')] })).toBe(false)
  })

  it('ธงบนพัสดุขากลับ/ไม่ active ไม่มีผล', () => {
    expect(countsAsRevenue({ status: 'CONFIRMED', shipments: [parcel('issue', 'RETURN', true)] })).toBe(true)
    expect(
      countsAsRevenue({ status: 'CONFIRMED', shipments: [{ ...parcel('issue', 'FORWARD', true), status: 'CANCELLED' }] }),
    ).toBe(true)
  })

  it('T-REV-3: revenueOrderWhere มี NOT + สาขา OR ที่ประกาศ · window ทั้งสองใช้ร่วมกัน', () => {
    const w = revenueOrderWhere as any
    expect(w.NOT.shipments.some).toMatchObject({
      status: 'CREATED', isDryRun: false, direction: 'FORWARD', problemCloseExcludesRevenue: true,
    })
    expect(w.OR[2]).toMatchObject({
      status: 'SHIPPED',
      shipments: { some: { status: 'CREATED', isDryRun: false, direction: 'FORWARD', problemCloseExcludesRevenue: false } },
    })
    const win = { gte: new Date(0), lt: new Date(1) }
    for (const f of [revenueWindowWhere('RETAIL', win), soldItemsWindowWhere('RETAIL', win)] as any[]) {
      expect(f.NOT).toEqual(w.NOT)
      expect(f.OR).toEqual(w.OR)
    }
  })

  it('T-SOLD-1: countsAsSoldFor ปิดไม่นับ → false · ไม่ปิด → CONFIRMED เดิม', () => {
    const mk = (status: string, ex: boolean | null) => ({ status, shipments: [parcel('issue', 'FORWARD', ex)] })
    expect(countsAsSoldFor(mk('CONFIRMED', true), 'RETAIL')).toBe(false)
    expect(countsAsSoldFor(mk('CONFIRMED', null), 'RETAIL')).toBe(true)
    expect(countsAsSoldFor(mk('CONFIRMED', false), 'RETAIL')).toBe(true)
    expect(countsAsSoldFor(mk('SHIPPED', null), 'RETAIL')).toBe(false)
  })
})
