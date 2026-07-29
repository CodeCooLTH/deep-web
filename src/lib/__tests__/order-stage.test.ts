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

  it('Order.status=SHIPPED → กำลังจัดส่ง', () => {
    expect(deriveOrderStage({ ...base, status: 'SHIPPED' }, NOW)?.label).toBe('กำลังจัดส่ง')
  })

  it('ขนส่งรับของแล้ว (carrierStatus=picked_up) → กำลังจัดส่ง แม้ Order ยัง PENDING', () => {
    // BR-ISHIP-40/41: สถานะขนส่งเป็นคนละชุดกับ Order.status และไม่ไปแก้ Order.status ให้
    // ป้ายจึงต้องอ่านทั้งสองทาง ไม่งั้นออเดอร์ที่ขนส่งรับไปแล้วจะยังขึ้น "พิมพ์เอกสารแล้ว"
    const s = deriveOrderStage(
      { ...base, labelPrintedAt: hoursAgo(5), carrierStatus: 'picked_up' },
      NOW,
    )
    expect(s?.label).toBe('กำลังจัดส่ง')
  })

  it('ส่งถึงแล้ว → จัดส่งสำเร็จ (ต้องชนะ labelPrintedAt ที่ยังติดอยู่)', () => {
    const s = deriveOrderStage(
      { status: 'PENDING', statusAt: hoursAgo(2), labelPrintedAt: hoursAgo(30), carrierStatus: 'delivered' },
      NOW,
    )
    expect(s?.label).toBe('จัดส่งสำเร็จ')
  })

  describe('การหมดอายุของป้าย', () => {
    it('จัดส่งสำเร็จ 2 วัน 23 ชม. → ยังแสดง', () => {
      const s = deriveOrderStage({ ...base, status: 'CONFIRMED', statusAt: hoursAgo(71) }, NOW)
      expect(s?.label).toBe('จัดส่งสำเร็จ')
    })

    it('จัดส่งสำเร็จเกิน 3 วัน → หายไปเลย ไม่ตกไปเป็นป้ายอื่น', () => {
      const s = deriveOrderStage({ ...base, status: 'CONFIRMED', statusAt: hoursAgo(73) }, NOW)
      expect(s).toBeNull()
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

  it('รับ statusAt เป็น ISO string ได้ (ข้าม RSC boundary แล้ว Date กลายเป็น string)', () => {
    const s = deriveOrderStage({ ...base, statusAt: hoursAgo(1).toISOString() }, NOW)
    expect(s?.label).toBe('สั่งซื้อแล้ว')
  })
})
