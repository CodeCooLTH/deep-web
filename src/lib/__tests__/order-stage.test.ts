import { describe, it, expect } from 'vitest'
import { deriveOrderStage } from '@/lib/order-stage'

// เวลาอ้างอิงคงที่ — ห้ามใช้ Date.now() จริงในเทส (ผลจะเปลี่ยนตามเวลาที่รัน)
const NOW = new Date('2026-07-29T12:00:00Z').getTime()
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000)

const base = {
  status: 'PENDING',
  statusAt: hoursAgo(1),
  labelPrintedAt: null,
  carrierStatus: null,
}

describe('deriveOrderStage', () => {
  it('ไม่มีออเดอร์ → ไม่แสดงชิป', () => {
    expect(deriveOrderStage(null, NOW)).toBeNull()
  })

  it('เพิ่งสั่ง ยังไม่พิมพ์ใบปะหน้า → สั่งซื้อแล้ว', () => {
    expect(deriveOrderStage(base, NOW)?.label).toBe('สั่งซื้อแล้ว')
  })

  it('พิมพ์ใบปะหน้าแล้วแต่ยังไม่ส่ง → พิมพ์เอกสารแล้ว', () => {
    const s = deriveOrderStage({ ...base, labelPrintedAt: hoursAgo(1) }, NOW)
    expect(s?.label).toBe('พิมพ์เอกสารแล้ว')
  })

  it('ร้านแจ้งจัดส่งเองโดยไม่เปิดพัสดุ (SHIPPED, ไม่มีพัสดุ) → กำลังจัดส่ง', () => {
    expect(deriveOrderStage({ ...base, status: 'SHIPPED' }, NOW)?.label).toBe('กำลังจัดส่ง')
  })

  it('ขนส่งรับของแล้ว (carrierStatus=picked_up) → กำลังจัดส่ง แม้ Order ยัง PENDING', () => {
    // BR-ISHIP-40/41: สถานะขนส่งเป็นคนละชุดกับ Order.status และไม่ไปแก้ Order.status ให้
    // ป้ายจึงต้องอ่านทั้งสองทาง ไม่งั้นออเดอร์ที่ขนส่งรับไปแล้วจะยังขึ้น "พิมพ์เอกสารแล้ว"
    const s = deriveOrderStage(
      { ...base, hasShipment: true, labelPrintedAt: hoursAgo(5), carrierStatus: 'picked_up' },
      NOW,
    )
    expect(s?.label).toBe('กำลังจัดส่ง')
  })

  it('ส่งถึงแล้ว → จัดส่งสำเร็จ (ต้องชนะ labelPrintedAt ที่ยังติดอยู่)', () => {
    const s = deriveOrderStage(
      {
        status: 'PENDING', statusAt: hoursAgo(2), hasShipment: true,
        labelPrintedAt: hoursAgo(30), carrierStatus: 'delivered',
      },
      NOW,
    )
    expect(s?.label).toBe('จัดส่งสำเร็จ')
  })

  // ── บั๊กจริงที่ user เจอ 2026-07-29 ──────────────────────────────────────────
  // ออเดอร์ที่เพิ่งสร้างขึ้นป้าย "จัดส่งสำเร็จ" ทันที เพราะร้านกดปิดการขาย (CONFIRMED)
  // ตั้งแต่ขนส่งยังไม่มารับพัสดุ — ข้อมูลจริงตอนนั้น: hasShipment=true, carrierStatus=null
  describe('Order.status ต้องไม่ทับสถานะของพัสดุ (regression)', () => {
    it('มีพัสดุ + ร้านกด CONFIRMED แต่ขนส่งยังไม่แจ้ง → ต้องไม่ใช่ "จัดส่งสำเร็จ"', () => {
      const s = deriveOrderStage(
        {
          status: 'CONFIRMED', statusAt: hoursAgo(1), hasShipment: true,
          labelPrintedAt: null, carrierStatus: null,
        },
        NOW,
      )
      expect(s?.label).toBe('สร้างพัสดุแล้ว')
    })

    it('มีพัสดุ + พิมพ์แล้ว + ร้านกด CONFIRMED → ยังเป็น "พิมพ์เอกสารแล้ว"', () => {
      const s = deriveOrderStage(
        {
          status: 'CONFIRMED', statusAt: hoursAgo(1), hasShipment: true,
          labelPrintedAt: hoursAgo(1), carrierStatus: null,
        },
        NOW,
      )
      expect(s?.label).toBe('พิมพ์เอกสารแล้ว')
    })

    it('มีพัสดุ + ขนส่งแจ้งส่งถึงแล้ว → จัดส่งสำเร็จ (พัสดุยืนยันเอง)', () => {
      const s = deriveOrderStage(
        {
          status: 'CONFIRMED', statusAt: hoursAgo(1), hasShipment: true,
          labelPrintedAt: hoursAgo(20), carrierStatus: 'delivered',
        },
        NOW,
      )
      expect(s?.label).toBe('จัดส่งสำเร็จ')
    })
  })

  describe('ขายโดยไม่มีการส่งของ', () => {
    it('ไม่มีพัสดุ + CONFIRMED → "สำเร็จ" ไม่ใช่ "จัดส่งสำเร็จ" (ไม่มีอะไรถูกส่ง)', () => {
      const s = deriveOrderStage({ ...base, status: 'CONFIRMED', statusAt: hoursAgo(1) }, NOW)
      expect(s?.label).toBe('สำเร็จ')
    })

    it('ไม่มีพัสดุ + CONFIRMED เกิน 3 วัน → หายไป', () => {
      expect(deriveOrderStage({ ...base, status: 'CONFIRMED', statusAt: hoursAgo(73) }, NOW)).toBeNull()
    })
  })

  it('มีพัสดุแต่ยังไม่พิมพ์ ออเดอร์ยัง PENDING → สร้างพัสดุแล้ว', () => {
    expect(deriveOrderStage({ ...base, hasShipment: true }, NOW)?.label).toBe('สร้างพัสดุแล้ว')
  })

  describe('การหมดอายุของป้าย', () => {
    // ใช้เส้นทาง "พัสดุส่งถึงแล้ว" — เป็นทางเดียวที่ให้ป้าย "จัดส่งสำเร็จ" หลังแก้บั๊ก 2026-07-29
    const delivered = (h: number) => ({
      status: 'PENDING', statusAt: hoursAgo(h), hasShipment: true,
      labelPrintedAt: hoursAgo(h + 20), carrierStatus: 'delivered',
    })

    it('จัดส่งสำเร็จ 2 วัน 23 ชม. → ยังแสดง', () => {
      expect(deriveOrderStage(delivered(71), NOW)?.label).toBe('จัดส่งสำเร็จ')
    })

    it('จัดส่งสำเร็จเกิน 3 วัน → หายไปเลย ไม่ตกไปเป็นป้ายอื่น', () => {
      // ต้องเป็น null ไม่ใช่ตกไปเป็น "พิมพ์เอกสารแล้ว" ที่ labelPrintedAt ยังค้างอยู่
      expect(deriveOrderStage(delivered(73), NOW)).toBeNull()
    })

    it('ยกเลิกภายใน 1 วัน → ยกเลิกแล้ว (เตือนแอดมิน)', () => {
      const s = deriveOrderStage({ ...base, status: 'CANCELLED', statusAt: hoursAgo(23) }, NOW)
      expect(s?.label).toBe('ยกเลิกแล้ว')
      expect(s?.cls).toContain('danger')
    })

    it('ยกเลิกเกิน 1 วัน → หายไป', () => {
      const s = deriveOrderStage({ ...base, status: 'CANCELLED', statusAt: hoursAgo(25) }, NOW)
      expect(s).toBeNull()
    })

    it('ออเดอร์ที่ยังไม่จบไม่หมดอายุ — ค้างมา 10 วันก็ยังแสดง', () => {
      // งานที่ยังไม่จบต้องเห็นเสมอ ไม่งั้นออเดอร์ค้างจะหายไปจากสายตาแอดมินเงียบ ๆ
      const s = deriveOrderStage({ ...base, statusAt: hoursAgo(240) }, NOW)
      expect(s?.label).toBe('สั่งซื้อแล้ว')
    })
  })

  describe('จำนวนครั้งที่พิมพ์ใบปะหน้า', () => {
    it('พิมพ์เอกสารแล้ว + นับได้ 3 → มี printCount ไว้ทำป้ายเสริม', () => {
      const s = deriveOrderStage({ ...base, labelPrintedAt: hoursAgo(1), labelPrintCount: 3 }, NOW)
      expect(s?.label).toBe('พิมพ์เอกสารแล้ว')
      expect(s?.printCount).toBe(3)
    })

    it('แถวเก่าที่ไม่มีตัวนับ (0/null) → ไม่มี printCount ไม่เดาว่าพิมพ์ 1 ครั้ง', () => {
      expect(deriveOrderStage({ ...base, labelPrintedAt: hoursAgo(1), labelPrintCount: 0 }, NOW)?.printCount)
        .toBeUndefined()
      expect(deriveOrderStage({ ...base, labelPrintedAt: hoursAgo(1), labelPrintCount: null }, NOW)?.printCount)
        .toBeUndefined()
    })

    it('ขั้นอื่นไม่มี printCount แม้พัสดุจะเคยถูกพิมพ์มาแล้ว', () => {
      const s = deriveOrderStage(
        { ...base, status: 'SHIPPED', labelPrintedAt: hoursAgo(5), labelPrintCount: 4 },
        NOW,
      )
      expect(s?.label).toBe('กำลังจัดส่ง')
      expect(s?.printCount).toBeUndefined()
    })
  })

  it('รับ statusAt เป็น ISO string ได้ (ข้าม RSC boundary แล้ว Date กลายเป็น string)', () => {
    const s = deriveOrderStage({ ...base, statusAt: hoursAgo(1).toISOString() }, NOW)
    expect(s?.label).toBe('สั่งซื้อแล้ว')
  })
})
