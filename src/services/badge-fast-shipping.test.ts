import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock prisma ทั้ง module (test env ไม่มี DB) — pattern เดียวกับ badge.service.test.ts
vi.mock('@/lib/prisma', () => ({ prisma: { order: { findMany: vi.fn() } } }))
vi.mock('@/services/app-push.service', () => ({ pushToUser: vi.fn() }))
vi.mock('@/services/trust-score.service', () => ({
  recalculateTrustScore: vi.fn(),
  recalculateShopTrustScore: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { checkFastShipping } from '@/services/badge.service'

/**
 * เทสชุดนี้ตรวจ "ท่อต่อ" ระหว่างผลลัพธ์ของ Prisma กับ `ShippingSpeedRow` โดยเฉพาะ
 *
 * 🛑 ทำไมต้องมีแยกจาก `shipping-speed.test.ts`: ไฟล์นั้นสร้าง row เองด้วยมือ จึงพิสูจน์ได้แค่ว่า
 * *สูตร* ถูก ไม่ได้พิสูจน์ว่า *เราหยิบ field มาถูกคู่* — ซึ่งคือคลาสเดียวกับบั๊กที่ทั้งชุดนี้
 * กำลังปิดพอดี (โค้ดเดิมถูกทุกบรรทัด มันแค่อ่านข้อมูลผิดที่) ถ้าใครสลับ `ishipShipmentEventAt`
 * กับ `manualShipmentAt` ตอน refactor จะไม่มี gate ไหนจับได้เลยถ้าไม่มีเทสนี้
 * (finding ของ safepay-reviewer 2026-08-10)
 */
const at = (iso: string) => new Date(iso)
const shop = { id: 'shop1', userId: 'u1', kind: 'BUSINESS' as const }

beforeEach(() => vi.clearAllMocks())

describe('checkFastShipping — field mapping จาก query จริง', () => {
  it('[blocker] หยิบครบถูกคู่ทั้ง 4 field โดยแต่ละแหล่งมีค่าต่างกันชัดเจน', async () => {
    // ตั้งค่าให้ทุกแหล่งต่างกัน ถ้าหยิบสลับคู่ ค่าเฉลี่ยจะไม่ใช่ 2 ชม.
    //   orderCreatedAt (วันที่ผู้ขายกรอกย้อนหลัง) = 27 ก.ค.  ← ห้ามใช้
    //   keyedInAt (กดจริง)                        = 1 ส.ค. 09:00 ← ตัวตั้งที่ถูก
    //   ishipShipmentRowAt (คอลัมน์ค้าง)           = 1 ส.ค. 09:30 ← ห้ามใช้เมื่อมี event
    //   SHIPMENT_CREATED event (สำเร็จจริง)        = 1 ส.ค. 11:00 ← ตัวปลายที่ถูก
    //   manualShipmentAt                          = 1 ส.ค. 23:00 ← ห้ามใช้ (iShip ชนะ)
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        createdAt: at('2026-07-27T09:00:00Z'),
        shipmentTracking: { createdAt: at('2026-08-01T23:00:00Z') },
        shipments: [{ createdAt: at('2026-08-01T09:30:00Z') }],
        events: [
          { type: 'ORDER_CREATED', occurredAt: at('2026-08-01T09:00:00Z') },
          { type: 'SHIPMENT_CREATED', occurredAt: at('2026-08-01T11:00:00Z') },
        ],
      },
    ] as never)

    const r = await checkFastShipping(shop, { type: 'FAST_SHIPPING', maxHours: 24, minOrders: 1 })
    expect(r.orderCount).toBe(1)
    expect(r.avgHours).toBe(2)
    expect(r.met).toBe(true)
  })

  it('[blocker] เปิดพัสดุใหม่หลังยกเลิกใบเก่า → ใช้ SHIPMENT_CREATED ใบล่าสุด ไม่ใช่ใบแรก', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        createdAt: at('2026-08-01T09:00:00Z'),
        shipmentTracking: null,
        shipments: [{ createdAt: at('2026-08-01T09:10:00Z') }],
        events: [
          { type: 'ORDER_CREATED', occurredAt: at('2026-08-01T09:00:00Z') },
          { type: 'SHIPMENT_CREATED', occurredAt: at('2026-08-01T10:00:00Z') }, // ใบที่ถูกยกเลิกไป
          { type: 'SHIPMENT_CREATED', occurredAt: at('2026-08-01T14:00:00Z') }, // ใบที่ยังมีผล
        ],
      },
    ] as never)

    const r = await checkFastShipping(shop, { type: 'FAST_SHIPPING', maxHours: 24, minOrders: 1 })
    expect(r.avgHours).toBe(5)
  })

  it('ไม่มีร้าน → ไม่ยิง query เลย', async () => {
    const r = await checkFastShipping(null, { type: 'FAST_SHIPPING', maxHours: 24, minOrders: 1 })
    expect(r).toEqual({ met: false, orderCount: 0, avgHours: 0 })
    expect(prisma.order.findMany).not.toHaveBeenCalled()
  })

  it('[blocker] ตัวอย่างไม่ถึง minOrders → met=false และไม่รายงาน avgHours ที่ยังเชื่อไม่ได้', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        createdAt: at('2026-08-01T09:00:00Z'),
        shipmentTracking: { createdAt: at('2026-08-01T10:00:00Z') },
        shipments: [],
        events: [{ type: 'ORDER_CREATED', occurredAt: at('2026-08-01T09:00:00Z') }],
      },
    ] as never)

    const r = await checkFastShipping(shop, { type: 'FAST_SHIPPING', maxHours: 24, minOrders: 20 })
    expect(r.met).toBe(false)
    expect(r.orderCount).toBe(1)
    expect(r.avgHours).toBe(0)
  })

  it('[blocker] ออเดอร์ที่ไม่มีพัสดุ ไม่ถูกนับเป็นตัวหาร', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        createdAt: at('2026-08-01T09:00:00Z'),
        shipmentTracking: { createdAt: at('2026-08-01T13:00:00Z') },
        shipments: [],
        events: [{ type: 'ORDER_CREATED', occurredAt: at('2026-08-01T09:00:00Z') }],
      },
      // ใบนี้ยังไม่ได้ส่ง — ถ้านับเป็นตัวหารด้วย avg จะเพี้ยนเป็น 2 ชม.
      {
        createdAt: at('2026-08-01T09:00:00Z'),
        shipmentTracking: null,
        shipments: [],
        events: [{ type: 'ORDER_CREATED', occurredAt: at('2026-08-01T09:00:00Z') }],
      },
    ] as never)

    const r = await checkFastShipping(shop, { type: 'FAST_SHIPPING', maxHours: 24, minOrders: 1 })
    expect(r.orderCount).toBe(1)
    expect(r.avgHours).toBe(4)
  })
})
