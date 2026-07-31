// order-action-set.test.ts — Vitest unit tests สำหรับ getOrderActionSet (T5 contract)
//
// ครอบทุกสถานะ × MANUAL/ISHIP/null × SHIPPED/NO_SHIPPING (matrix แบบ combinatorial)
// อ้างอิง: docs/superpowers/specs/2026-07-31-seller-order-detail-v5-design.md §3
//          docs/scope/2026-07-31-seller-order-detail-v5-scope-baseline.md Change Log

import { describe, it, expect } from 'vitest'
import { getOrderActionSet, type ShipmentSource } from '../order-action-set'
import type { OrderStatus } from '@/lib/order-display'

const keys = (arr: { key: string }[]) => arr.map((a) => a.key)

const SHIPMENT_SOURCES: ShipmentSource[] = ['MANUAL', 'ISHIP', null]
const FULFILLMENT_MODES = ['SHIPPED', 'NO_SHIPPING']
const STATUSES: OrderStatus[] = ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED']

// -------------------------------------------------------------------------
// Matrix ที่ Controller ระบุตรง ๆ ใน task (fulfillmentMode='SHIPPED' = มีจัดส่งปกติ)
// -------------------------------------------------------------------------
describe('getOrderActionSet — matrix ตาม design §3', () => {
  it('PENDING → primary=ส่งลิงก์ทาง SMS, ghost=[แจ้งเลขพัสดุ], menu=[คัดลอกลิงก์,คัดลอกที่อยู่,แก้ไขคำสั่งซื้อ,ยกเลิก]', () => {
    const r = getOrderActionSet({ status: 'PENDING', fulfillmentMode: 'SHIPPED', shipmentSource: null })
    expect(r.primary).toEqual({ key: 'send-sms', label: 'ส่งลิงก์ทาง SMS (฿1)', icon: 'message-forward' })
    expect(keys(r.ghosts)).toEqual(['report-tracking'])
    expect(keys(r.menu)).toEqual(['copy-link', 'copy-address', 'edit-order', 'cancel-order'])
  })

  it('SHIPPED + MANUAL → primary=null, ghost=[คัดลอกลิงก์,แก้ไขเลขพัสดุ], menu=[คัดลอกเลขพัสดุ,คัดลอกที่อยู่,ยกเลิก]', () => {
    const r = getOrderActionSet({ status: 'SHIPPED', fulfillmentMode: 'SHIPPED', shipmentSource: 'MANUAL' })
    expect(r.primary).toBeNull()
    expect(keys(r.ghosts)).toEqual(['copy-link', 'edit-tracking'])
    expect(keys(r.menu)).toEqual(['copy-tracking', 'copy-address', 'cancel-order'])
  })

  it('CONFIRMED → primary=null, ghost=[คัดลอกลิงก์], menu=[คัดลอกเลขพัสดุ,คัดลอกที่อยู่]', () => {
    const r = getOrderActionSet({ status: 'CONFIRMED', fulfillmentMode: 'SHIPPED', shipmentSource: 'MANUAL' })
    expect(r.primary).toBeNull()
    expect(keys(r.ghosts)).toEqual(['copy-link'])
    expect(keys(r.menu)).toEqual(['copy-tracking', 'copy-address'])
  })

  it('CANCELLED → primary=null, ghost=[], menu=[] (ไม่มีแถบเลย)', () => {
    const r = getOrderActionSet({ status: 'CANCELLED', fulfillmentMode: 'SHIPPED', shipmentSource: 'MANUAL' })
    expect(r).toEqual({ primary: null, ghosts: [], menu: [] })
  })
})

// -------------------------------------------------------------------------
// CANCELLED ว่างหมด ไม่ว่า shipmentSource/fulfillmentMode จะเป็นอะไร
// -------------------------------------------------------------------------
describe('CANCELLED ต้องว่างหมดเสมอ (regression)', () => {
  for (const shipmentSource of SHIPMENT_SOURCES) {
    for (const fulfillmentMode of FULFILLMENT_MODES) {
      it(`CANCELLED + shipmentSource=${shipmentSource} + fulfillmentMode=${fulfillmentMode} → ว่างหมด`, () => {
        const r = getOrderActionSet({ status: 'CANCELLED', fulfillmentMode, shipmentSource })
        expect(r).toEqual({ primary: null, ghosts: [], menu: [] })
      })
    }
  }
})

// -------------------------------------------------------------------------
// ISHIP ต้องไม่มี "แก้ไขเลขพัสดุ" เลย (ไม่ใช่ disabled — หายไปทั้งปุ่ม)
// -------------------------------------------------------------------------
describe('ISHIP ไม่มี "แก้ไขเลขพัสดุ" (feat 00022: ห้ามเขียน ShipmentTracking)', () => {
  it('SHIPPED + ISHIP + fulfillmentMode=SHIPPED → ghost ไม่มี edit-tracking', () => {
    const r = getOrderActionSet({ status: 'SHIPPED', fulfillmentMode: 'SHIPPED', shipmentSource: 'ISHIP' })
    expect(keys(r.ghosts)).not.toContain('edit-tracking')
    expect(keys(r.ghosts)).toEqual(['copy-link'])
  })

  it('SHIPPED + shipmentSource=null (ยังไม่แจ้งพัสดุ) → ghost ไม่มี edit-tracking', () => {
    const r = getOrderActionSet({ status: 'SHIPPED', fulfillmentMode: 'SHIPPED', shipmentSource: null })
    expect(keys(r.ghosts)).not.toContain('edit-tracking')
  })

  it('เฉพาะ MANUAL เท่านั้นที่มี edit-tracking', () => {
    const r = getOrderActionSet({ status: 'SHIPPED', fulfillmentMode: 'SHIPPED', shipmentSource: 'MANUAL' })
    expect(keys(r.ghosts)).toContain('edit-tracking')
  })

  it('menu ไม่มี edit-tracking เลยในทุกกรณี (ปุ่มนี้อยู่ ghost เท่านั้นตาม matrix)', () => {
    for (const shipmentSource of SHIPMENT_SOURCES) {
      const r = getOrderActionSet({ status: 'SHIPPED', fulfillmentMode: 'SHIPPED', shipmentSource })
      expect(keys(r.menu)).not.toContain('edit-tracking')
    }
  })
})

// -------------------------------------------------------------------------
// SHIPPED ไม่มี "แก้ไขคำสั่งซื้อ" ใน ⋮ (Change Log 2026-07-31)
// -------------------------------------------------------------------------
describe('SHIPPED ไม่มี "แก้ไขคำสั่งซื้อ" ใน ⋮ (edit page บล็อก non-PENDING = dead-end)', () => {
  for (const shipmentSource of SHIPMENT_SOURCES) {
    for (const fulfillmentMode of FULFILLMENT_MODES) {
      it(`SHIPPED + shipmentSource=${shipmentSource} + fulfillmentMode=${fulfillmentMode} → menu ไม่มี edit-order`, () => {
        const r = getOrderActionSet({ status: 'SHIPPED', fulfillmentMode, shipmentSource })
        expect(keys(r.menu)).not.toContain('edit-order')
      })
    }
  }

  it('PENDING ยังมี "แก้ไขคำสั่งซื้อ" ตามปกติ (คอนทราสต์กับ SHIPPED)', () => {
    const r = getOrderActionSet({ status: 'PENDING', fulfillmentMode: 'SHIPPED', shipmentSource: null })
    expect(keys(r.menu)).toContain('edit-order')
  })

  it('CONFIRMED ก็ไม่มี "แก้ไขคำสั่งซื้อ" (ไม่เคยมีตั้งแต่ต้น)', () => {
    const r = getOrderActionSet({ status: 'CONFIRMED', fulfillmentMode: 'SHIPPED', shipmentSource: null })
    expect(keys(r.menu)).not.toContain('edit-order')
  })
})

// -------------------------------------------------------------------------
// NO_SHIPPING ไม่มี action ที่เกี่ยวกับพัสดุ/ที่อยู่จัดส่งเลย
// -------------------------------------------------------------------------
describe('NO_SHIPPING (digital/service) ไม่มี action เกี่ยวกับพัสดุ/ที่อยู่จัดส่ง', () => {
  const SHIPMENT_KEYS = ['report-tracking', 'edit-tracking', 'copy-tracking', 'copy-address']

  it('PENDING + NO_SHIPPING → ไม่มี report-tracking/copy-address; ยังมี copy-link/edit-order/cancel-order', () => {
    const r = getOrderActionSet({ status: 'PENDING', fulfillmentMode: 'NO_SHIPPING', shipmentSource: null })
    const all = [...(r.primary ? [r.primary] : []), ...r.ghosts, ...r.menu]
    for (const k of SHIPMENT_KEYS) {
      expect(keys(all)).not.toContain(k)
    }
    expect(keys(r.menu)).toEqual(['copy-link', 'edit-order', 'cancel-order'])
    expect(r.primary?.key).toBe('send-sms')
  })

  it('SHIPPED + NO_SHIPPING + MANUAL → ไม่มี edit-tracking/copy-tracking/copy-address (แม้ shipmentSource=MANUAL)', () => {
    const r = getOrderActionSet({ status: 'SHIPPED', fulfillmentMode: 'NO_SHIPPING', shipmentSource: 'MANUAL' })
    const all = [...r.ghosts, ...r.menu]
    for (const k of SHIPMENT_KEYS) {
      expect(keys(all)).not.toContain(k)
    }
    expect(keys(r.ghosts)).toEqual(['copy-link'])
    expect(keys(r.menu)).toEqual(['cancel-order'])
  })

  it('SHIPPED + NO_SHIPPING + ISHIP → เหมือนกัน ไม่มี action พัสดุ', () => {
    const r = getOrderActionSet({ status: 'SHIPPED', fulfillmentMode: 'NO_SHIPPING', shipmentSource: 'ISHIP' })
    const all = [...r.ghosts, ...r.menu]
    for (const k of SHIPMENT_KEYS) {
      expect(keys(all)).not.toContain(k)
    }
  })

  it('CONFIRMED + NO_SHIPPING → menu ว่าง (ตัด copy-tracking/copy-address ออกหมด), ghost=[copy-link]', () => {
    const r = getOrderActionSet({ status: 'CONFIRMED', fulfillmentMode: 'NO_SHIPPING', shipmentSource: null })
    expect(keys(r.menu)).toEqual([])
    expect(keys(r.ghosts)).toEqual(['copy-link'])
  })
})

// -------------------------------------------------------------------------
// Full combinatorial sweep — invariants ที่ต้องเป็นจริงทุกชุดค่าผสม
// -------------------------------------------------------------------------
describe('combinatorial sweep — invariants ทุกสถานะ × shipmentSource × fulfillmentMode', () => {
  for (const status of STATUSES) {
    for (const shipmentSource of SHIPMENT_SOURCES) {
      for (const fulfillmentMode of FULFILLMENT_MODES) {
        it(`status=${status} shipmentSource=${shipmentSource} fulfillmentMode=${fulfillmentMode}`, () => {
          const r = getOrderActionSet({ status, fulfillmentMode, shipmentSource })
          const all = [...(r.primary ? [r.primary] : []), ...r.ghosts, ...r.menu]

          // invariant 1: CANCELLED ว่างหมดเสมอ
          if (status === 'CANCELLED') {
            expect(all).toHaveLength(0)
          }

          // invariant 2: ISHIP ไม่เคยมี edit-tracking
          if (shipmentSource === 'ISHIP') {
            expect(keys(all)).not.toContain('edit-tracking')
          }

          // invariant 3: SHIPPED ไม่เคยมี edit-order ใน menu
          if (status === 'SHIPPED') {
            expect(keys(r.menu)).not.toContain('edit-order')
          }

          // invariant 4: NO_SHIPPING ไม่เคยมี action เกี่ยวกับพัสดุ/ที่อยู่จัดส่ง
          if (fulfillmentMode === 'NO_SHIPPING') {
            for (const k of ['report-tracking', 'edit-tracking', 'copy-tracking', 'copy-address']) {
              expect(keys(all)).not.toContain(k)
            }
          }

          // invariant 5: primary น้ำเงินมีได้อย่างมาก 1 ปุ่ม (One Voice) — ชนิด structure บังคับอยู่แล้ว
          expect(r.primary === null || typeof r.primary.key === 'string').toBe(true)

          // invariant 6: ไม่มี key ซ้ำข้าม primary/ghosts/menu
          const allKeys = keys(all)
          expect(new Set(allKeys).size).toBe(allKeys.length)
        })
      }
    }
  }
})
