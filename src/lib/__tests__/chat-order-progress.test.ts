import { describe, expect, it } from 'vitest'
import { filterActiveOrders, orderShippingStage } from '../chat-order-progress'

// fixture ย่อ — shape เดียวกับที่การ์ด/แถบปักได้รับจริง (ดู plan Task 3)
const base = {
  status: 'PENDING',
  // feature 00062 — fixture ชุดนี้เป็นออเดอร์ที่ส่งของจริง (เคสนัดรับอยู่ใน describe แยก)
  fulfillmentMode: 'SHIPPED',
  hasManualTracking: false, // feature 00080 — เคสส่งเอง override เป็นรายเคส
  paymentMethod: null as string | null,
  codReceivedAt: null as string | null,
  shipment: null as { status: string; carrierStatus: string | null; problemAt: string | null; problemCloseOutcome: 'DELIVERY_FAILED' | 'LOST_ON_RETURN' | null } | null,
}

describe('orderShippingStage', () => {
  it('ยกเลิกทั้งใบ = DONE ไม่ว่าพัสดุอยู่สถานะไหน', () => {
    expect(
      orderShippingStage({ ...base, status: 'CANCELLED', shipment: { status: 'CREATED', carrierStatus: 'in_transit', problemAt: null, problemCloseOutcome: null } }),
    ).toBe('DONE')
  })

  it('ยังไม่มีพัสดุ = รอเลขพัสดุ', () => {
    expect(orderShippingStage(base)).toBe('AWAITING_PARCEL')
  })

  it('พัสดุที่สร้างไม่สำเร็จ (FAILED) ไม่นับว่ามีพัสดุ — ยังรอเลขพัสดุ', () => {
    expect(orderShippingStage({ ...base, shipment: { status: 'FAILED', carrierStatus: null, problemAt: null, problemCloseOutcome: null } })).toBe('AWAITING_PARCEL')
  })

  it('พัสดุกำลังสร้าง (PENDING) นับว่ามีพัสดุแล้ว — รอรับเข้า', () => {
    expect(orderShippingStage({ ...base, shipment: { status: 'PENDING', carrierStatus: null, problemAt: null, problemCloseOutcome: null } })).toBe('AWAITING_PICKUP')
  })

  it('COD ส่งถึงแล้วแต่ยังไม่กดรับเงิน = AWAITING_COD (ยังเป็นงานค้าง)', () => {
    expect(
      orderShippingStage({
        ...base,
        paymentMethod: 'เก็บเงินปลายทาง',
        shipment: { status: 'CREATED', carrierStatus: 'delivered', problemAt: null, problemCloseOutcome: null },
      }),
    ).toBe('AWAITING_COD')
  })

  it('โอนแล้ว + ส่งถึงแล้ว = DONE', () => {
    expect(
      orderShippingStage({
        ...base,
        paymentMethod: 'โอนเงิน',
        shipment: { status: 'CREATED', carrierStatus: 'delivered', problemAt: null, problemCloseOutcome: null },
      }),
    ).toBe('DONE')
  })
})

describe('filterActiveOrders', () => {
  it('กรองใบที่จบงานออก เหลือเฉพาะงานค้าง เรียงลำดับเดิม', () => {
    const orders = [
      { ...base, id: 'a', status: 'CANCELLED' }, // DONE → หลุด
      { ...base, id: 'b', shipment: { status: 'CREATED', carrierStatus: 'in_transit', problemAt: null, problemCloseOutcome: null } }, // SHIPPING → อยู่
      { ...base, id: 'c', status: 'CONFIRMED' }, // DONE (ปิดการขาย ไม่มีพัสดุ) → หลุด
      { ...base, id: 'd' }, // AWAITING_PARCEL → อยู่
    ]
    expect(filterActiveOrders(orders).map((o) => o.id)).toEqual(['b', 'd'])
  })
})

describe('orderShippingStage — ส่งเอง (00080)', () => {
  it('PENDING + เลขส่งเอง ไม่มีพัสดุ = AWAITING_DISPATCH · พัสดุ iShip ชนะ', () => {
    expect(orderShippingStage({ ...base, hasManualTracking: true })).toBe('AWAITING_DISPATCH')
    expect(
      orderShippingStage({ ...base, hasManualTracking: true, shipment: { status: 'CREATED', carrierStatus: null, problemAt: null, problemCloseOutcome: null } }),
    ).toBe('AWAITING_PICKUP')
  })
})
