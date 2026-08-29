// order-action-set.test.ts — Vitest unit tests สำหรับ getOrderActionSet (T5 contract)
//
// ครอบทุกสถานะ × MANUAL/ISHIP/null × SHIPPED/NO_SHIPPING/PICKUP (matrix แบบ combinatorial)
// PICKUP = ออเดอร์จองที่พัก (feat 00017 booking.service.ts) — G-1: ต้องไม่ถูกนับเป็น "ต้องส่งของ"
// เหมือน SHIPPED (ปฏิบัติเหมือนสินค้าดิจิทัลตามมติ user)
// อ้างอิง: docs/superpowers/specs/2026-07-31-seller-order-detail-v5-design.md §3
//          docs/scope/2026-07-31-seller-order-detail-v5-scope-baseline.md Change Log

import { describe, it, expect } from 'vitest'
import { getOrderActionSet, type ShipmentSource } from '../order-action-set'
import type { OrderStatus } from '@/lib/order-display'

const keys = (arr: { key: string }[]) => arr.map((a) => a.key)

const SHIPMENT_SOURCES: ShipmentSource[] = ['MANUAL', 'ISHIP', null]
const FULFILLMENT_MODES = ['SHIPPED', 'NO_SHIPPING', 'PICKUP']
const STATUSES: OrderStatus[] = ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED']

// -------------------------------------------------------------------------
// Matrix ที่ Controller ระบุตรง ๆ ใน task (fulfillmentMode='SHIPPED' = มีจัดส่งปกติ)
// -------------------------------------------------------------------------
describe('getOrderActionSet — matrix ตาม design §3', () => {
  // 2026-08-04 (user request): "ส่งลิงก์ทาง SMS" ลงไปอยู่ใน ⋮ และ "แจ้งเลขพัสดุ" ขึ้นเป็น primary
  // — เดิม primary=send-sms · ghost=[report-tracking]
  it('PENDING → primary=แจ้งเลขพัสดุ, ghost=[], menu=[ส่ง SMS,คัดลอกลิงก์,คัดลอกที่อยู่,แก้ไขคำสั่งซื้อ,ยกเลิก]', () => {
    const r = getOrderActionSet({ status: 'PENDING', fulfillmentMode: 'SHIPPED', shipmentSource: null })
    expect(r.primary).toEqual({ key: 'report-tracking', label: 'แจ้งเลขพัสดุ', icon: 'truck' })
    expect(keys(r.ghosts)).toEqual([])
    expect(keys(r.menu)).toEqual(['send-sms', 'copy-link', 'copy-address', 'edit-order', 'cancel-order'])
  })

  // เคสจริง prod 2026-08-06: เปิดพัสดุ iShip แล้ว (ขนส่งยังไม่เข้ารับ → ออเดอร์ยัง PENDING
  // โดย design) แต่ปุ่มหลักยังเขียน "แจ้งเลขพัสดุ" ทั้งที่มีเลขแทรคแล้ว — ต้องเป็นปุ่มดูสถานะ
  it('PENDING + ISHIP (เปิดพัสดุแล้ว รอขนส่งเข้ารับ) → primary=สถานะพัสดุ + มีคัดลอกเลขใน ⋮', () => {
    const r = getOrderActionSet({ status: 'PENDING', fulfillmentMode: 'SHIPPED', shipmentSource: 'ISHIP' })
    expect(r.primary).toEqual({ key: 'report-tracking', label: 'สถานะพัสดุ', icon: 'truck' })
    expect(keys(r.menu)).toEqual(['copy-tracking', 'send-sms', 'copy-link', 'copy-address', 'edit-order', 'cancel-order'])
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
// G-1 regression: PICKUP (จองที่พัก feat 00017) ต้องไม่ถูกนับเป็น "ต้องส่งของ"
// เดิมโค้ดเป็น deny-list (เช็คว่าไม่ใช่ NO_SHIPPING) ทำให้ PICKUP หลุดเข้ามาเป็น hasShipping=true
// ตอนนี้เป็น allow-list (=== 'SHIPPED') — PICKUP ต้องไม่มี action พัสดุ เหมือน NO_SHIPPING ทุกกรณี
// -------------------------------------------------------------------------
describe('PICKUP (จองที่พัก) ไม่มี action เกี่ยวกับพัสดุ/ที่อยู่จัดส่ง — เหมือน NO_SHIPPING (G-1)', () => {
  const SHIPMENT_KEYS = ['report-tracking', 'edit-tracking', 'copy-tracking', 'copy-address']

  // feature 00062: PICKUP+PENDING ไม่ใช้ send-sms เป็น primary อีกต่อไปเมื่อรู้จักสถานะเงิน/ส่งมอบ
  // (ดู describe "PICKUP + PENDING — ลำดับ primary เงินก่อนส่งมอบ" ด้านล่างสำหรับ 3 แถวของตาราง)
  // เคสนี้ (ไม่ส่ง flag ใหม่เลย = เหมือนได้เงินแล้ว/ไม่เข้าเงื่อนไขเงิน) ยังไม่มี report-tracking/
  // copy-address ปนมา และ menu ยังเป็นชุดเดิม
  it('PENDING + PICKUP (ไม่ส่ง flag เงิน/ส่งมอบ) → ไม่มี report-tracking/copy-address; menu=[copy-link,edit-order,cancel-order]', () => {
    const r = getOrderActionSet({ status: 'PENDING', fulfillmentMode: 'PICKUP', shipmentSource: null })
    const all = [...(r.primary ? [r.primary] : []), ...r.ghosts, ...r.menu]
    for (const k of SHIPMENT_KEYS) {
      expect(keys(all)).not.toContain(k)
    }
    expect(keys(r.menu)).toEqual(['copy-link', 'edit-order', 'cancel-order'])
    expect(r.primary?.key).toBe('pickup-handed-over')
  })

  it('SHIPPED + PICKUP + MANUAL → ไม่มี report-tracking/edit-tracking/copy-tracking/copy-address (แม้ shipmentSource=MANUAL)', () => {
    const r = getOrderActionSet({ status: 'SHIPPED', fulfillmentMode: 'PICKUP', shipmentSource: 'MANUAL' })
    const all = [...r.ghosts, ...r.menu]
    for (const k of SHIPMENT_KEYS) {
      expect(keys(all)).not.toContain(k)
    }
    expect(keys(r.ghosts)).toEqual(['copy-link'])
    expect(keys(r.menu)).toEqual(['cancel-order'])
  })

  it('SHIPPED + PICKUP + ISHIP → เหมือนกัน ไม่มี action พัสดุ', () => {
    const r = getOrderActionSet({ status: 'SHIPPED', fulfillmentMode: 'PICKUP', shipmentSource: 'ISHIP' })
    const all = [...r.ghosts, ...r.menu]
    for (const k of SHIPMENT_KEYS) {
      expect(keys(all)).not.toContain(k)
    }
  })

  it('CONFIRMED + PICKUP → menu ว่าง (ตัด copy-tracking/copy-address ออกหมด), ghost=[copy-link]', () => {
    const r = getOrderActionSet({ status: 'CONFIRMED', fulfillmentMode: 'PICKUP', shipmentSource: null })
    expect(keys(r.menu)).toEqual([])
    expect(keys(r.ghosts)).toEqual(['copy-link'])
  })

  // feature 00062: PENDING แยกออกไปแล้ว (PICKUP มีลำดับ primary ของตัวเอง — เงินก่อนส่งมอบ)
  // ส่วนที่เหลือ (SHIPPED/CONFIRMED/CANCELLED) ยังต้อง contract เดียวกับ NO_SHIPPING เป๊ะเหมือนเดิม
  it('PICKUP ให้ผลเหมือน NO_SHIPPING เป๊ะทุกสถานะ ยกเว้น PENDING (feature 00062 แยก primary เฉพาะ PENDING)', () => {
    for (const status of STATUSES) {
      if (status === 'PENDING') continue
      for (const shipmentSource of SHIPMENT_SOURCES) {
        const pickup = getOrderActionSet({ status, fulfillmentMode: 'PICKUP', shipmentSource })
        const noShipping = getOrderActionSet({ status, fulfillmentMode: 'NO_SHIPPING', shipmentSource })
        expect(pickup).toEqual(noShipping)
      }
    }
  })
})

// -------------------------------------------------------------------------
// feature 00062 (U16): PICKUP + PENDING — ลำดับ primary "เงินก่อน → ส่งมอบทีหลัง"
// ตาราง UX-Design-Spec.md §A2 (3 แถว) — flag isPickupPaymentUnpaid/isPickupHandedOver
// มีผลเฉพาะ status==='PENDING' เท่านั้น (SHIPPED/CONFIRMED/CANCELLED ทดสอบแยกไว้แล้วด้านบนว่า
// ยังเหมือน NO_SHIPPING เป๊ะไม่ว่า flag จะเป็นอะไร)
// -------------------------------------------------------------------------
describe('PICKUP + PENDING — ลำดับ primary เงินก่อนส่งมอบ (feature 00062, UX §A2)', () => {
  it('ยังไม่ได้เงิน + ยังไม่มอบของ → primary=ได้รับเงินแล้ว, ghost=[มอบสินค้าแล้ว], menu=[copy-link,edit-order,cancel-order]', () => {
    const r = getOrderActionSet({
      status: 'PENDING',
      fulfillmentMode: 'PICKUP',
      shipmentSource: null,
      isPickupPaymentUnpaid: true,
      isPickupHandedOver: false,
    })
    expect(r.primary).toEqual({ key: 'pickup-payment-received', label: 'ได้รับเงินแล้ว', icon: 'cash' })
    expect(keys(r.ghosts)).toEqual(['pickup-handed-over'])
    expect(keys(r.menu)).toEqual(['copy-link', 'edit-order', 'cancel-order'])
  })

  it('ได้เงินแล้ว + ยังไม่มอบของ → primary=มอบสินค้าแล้ว, ghost=[], menu=[copy-link,edit-order,cancel-order]', () => {
    const r = getOrderActionSet({
      status: 'PENDING',
      fulfillmentMode: 'PICKUP',
      shipmentSource: null,
      isPickupPaymentUnpaid: false,
      isPickupHandedOver: false,
    })
    expect(r.primary).toEqual({ key: 'pickup-handed-over', label: 'มอบสินค้าแล้ว', icon: 'package-check' })
    expect(keys(r.ghosts)).toEqual([])
    expect(keys(r.menu)).toEqual(['copy-link', 'edit-order', 'cancel-order'])
  })

  // impeccable critique P0-1 (2026-08-29): menu ต้องมี undo (pickup-handover-undo) —
  // มือถือไม่มีทางย้อน "มอบสินค้าแล้ว" เลยถ้าไม่มีตัวนี้ (การ์ดเดสก์ท็อปมี undo เป็น hidden lg:flex
  // อยู่แล้ว แต่มือถือไม่เห็น) mutation: ถอด pickupHandoverUndo ออกจาก menu ต้องทำให้เทสนี้แดง
  it('มอบของแล้ว (รอ grace) → primary=null, ghost=[คัดลอกลิงก์], menu=[undo,edit-order,cancel-order] — ไม่สนว่าเงินจ่ายหรือยัง', () => {
    for (const isPickupPaymentUnpaid of [true, false]) {
      const r = getOrderActionSet({
        status: 'PENDING',
        fulfillmentMode: 'PICKUP',
        shipmentSource: null,
        isPickupPaymentUnpaid,
        isPickupHandedOver: true,
      })
      expect(r.primary).toBeNull()
      expect(keys(r.ghosts)).toEqual(['copy-link'])
      expect(keys(r.menu)).toEqual(['pickup-handover-undo', 'edit-order', 'cancel-order'])
    }
  })

  it('isPickupHandedOver=true ชนะเสมอ ไม่ว่า isPickupPaymentUnpaid จะเป็นอะไร (มอบของแล้ว = ปิดขั้นตอนเงินไปแล้วในทางปฏิบัติ)', () => {
    const withUnpaid = getOrderActionSet({
      status: 'PENDING', fulfillmentMode: 'PICKUP', shipmentSource: null,
      isPickupPaymentUnpaid: true, isPickupHandedOver: true,
    })
    const withoutUnpaid = getOrderActionSet({
      status: 'PENDING', fulfillmentMode: 'PICKUP', shipmentSource: null,
      isPickupPaymentUnpaid: false, isPickupHandedOver: true,
    })
    expect(withUnpaid).toEqual(withoutUnpaid)
  })

  it('shipmentSource ไม่มีผลต่อ PICKUP+PENDING เลย (PICKUP ไม่มีพัสดุ)', () => {
    for (const shipmentSource of SHIPMENT_SOURCES) {
      const r = getOrderActionSet({
        status: 'PENDING', fulfillmentMode: 'PICKUP', shipmentSource,
        isPickupPaymentUnpaid: true, isPickupHandedOver: false,
      })
      expect(r.primary?.key).toBe('pickup-payment-received')
    }
  })

  it('SHIPPED/CONFIRMED ของ PICKUP ไม่รับผลจาก isPickupPaymentUnpaid/isPickupHandedOver เลย (มีผลเฉพาะ PENDING)', () => {
    for (const status of ['SHIPPED', 'CONFIRMED'] as OrderStatus[]) {
      const withFlags = getOrderActionSet({
        status, fulfillmentMode: 'PICKUP', shipmentSource: null,
        isPickupPaymentUnpaid: true, isPickupHandedOver: true,
      })
      const withoutFlags = getOrderActionSet({ status, fulfillmentMode: 'PICKUP', shipmentSource: null })
      expect(withFlags).toEqual(withoutFlags)
    }
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

          // invariant 4: fulfillmentMode !== 'SHIPPED' (NO_SHIPPING หรือ PICKUP — G-1) ไม่เคยมี
          // action เกี่ยวกับพัสดุ/ที่อยู่จัดส่ง — allow-list ไม่ใช่ deny-list โดยตั้งใจ
          if (fulfillmentMode !== 'SHIPPED') {
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
