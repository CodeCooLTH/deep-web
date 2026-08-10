import { describe, it, expect } from 'vitest'
import {
  computeShippingSpeed,
  resolveShippedAt,
  resolveStartedAt,
  resolveElapsedHours,
  type ShippingSpeedRow,
} from '@/lib/shipping-speed'

const at = (iso: string) => new Date(iso)

/** ออเดอร์ปกติ: กดสร้าง 09:00 เปิดพัสดุ 15:00 ของวันเดียวกัน = 6 ชม. */
function row(over: Partial<ShippingSpeedRow> = {}): ShippingSpeedRow {
  return {
    orderCreatedAt: at('2026-08-01T09:00:00Z'),
    keyedInAt: at('2026-08-01T09:00:00Z'),
    ishipShipmentEventAt: null,
    ishipShipmentRowAt: null,
    manualShipmentAt: at('2026-08-01T15:00:00Z'),
    ...over,
  }
}

describe('resolveShippedAt — เลขพัสดุมี 2 ทางเข้า', () => {
  it('[blocker] นับใบที่เปิดผ่าน iShip ด้วย ไม่ใช่เฉพาะที่ร้านกรอกเอง', () => {
    // บั๊กเดิม: กรอง shipmentTracking อย่างเดียว ⇒ ร้านที่ใช้ iShip ล้วนได้ sample = 0
    // ตลอดกาล และไม่มีอะไรฟ้อง
    const ishipOnly = row({ ishipShipmentRowAt: at('2026-08-01T15:00:00Z'), manualShipmentAt: null })
    expect(resolveShippedAt(ishipOnly)).toEqual(at('2026-08-01T15:00:00Z'))
    expect(computeShippingSpeed([ishipOnly]).sampleSize).toBe(1)
  })

  it('[blocker] iShip ชนะเมื่อมีทั้งสองแหล่ง', () => {
    const both = row({
      ishipShipmentRowAt: at('2026-08-01T12:00:00Z'),
      manualShipmentAt: at('2026-08-01T20:00:00Z'),
    })
    expect(resolveShippedAt(both)).toEqual(at('2026-08-01T12:00:00Z'))
    expect(computeShippingSpeed([both]).avgHours).toBe(3)
  })

  it('ไม่มีพัสดุเลย = ไม่นับ ทั้งตัวตั้งและตัวหาร (ไม่ใช่ถ่วงค่าเฉลี่ย)', () => {
    const noShipment = row({ manualShipmentAt: null })
    const r = computeShippingSpeed([row(), noShipment])
    expect(r.sampleSize).toBe(1)
    expect(r.avgHours).toBe(6)
    expect(r.discarded).toBe(0)
  })
})

describe('เวลาเปิดพัสดุ — คอลัมน์ค้างที่ความพยายามครั้งแรกเมื่อมี retry', () => {
  it('[blocker] ใช้เวลาจาก event ที่เปิดสำเร็จ ไม่ใช่ OrderShipment.createdAt ที่ค้าง', () => {
    // เคสจริง: กดเปิดพัสดุ 10:00 → ล้มเพราะเครดิต iShip ไม่พอ → เติมเงินแล้วลองใหม่สำเร็จ
    // อีก 3 วันให้หลัง. คอลัมน์ยังค้างที่ 10:00 ของวันแรก (retry update แถวเดิม)
    // ถ้าเชื่อคอลัมน์ = 1 ชม. (ส่งไวมาก!) · ความจริง = 73 ชม.
    const retried = row({
      keyedInAt: at('2026-08-01T09:00:00Z'),
      ishipShipmentRowAt: at('2026-08-01T10:00:00Z'),
      ishipShipmentEventAt: at('2026-08-04T10:00:00Z'),
      manualShipmentAt: null,
    })
    expect(resolveShippedAt(retried)).toEqual(at('2026-08-04T10:00:00Z'))
    expect(computeShippingSpeed([retried]).avgHours).toBe(73)
  })

  it('พัสดุเก่าที่ไม่มี event (ก่อนฟีเจอร์ 00031) ถอยไปใช้คอลัมน์ได้', () => {
    const legacy = row({
      ishipShipmentRowAt: at('2026-08-01T15:00:00Z'),
      ishipShipmentEventAt: null,
      manualShipmentAt: null,
    })
    expect(resolveShippedAt(legacy)).toEqual(at('2026-08-01T15:00:00Z'))
    expect(computeShippingSpeed([legacy]).avgHours).toBe(6)
  })
})

describe('resolveStartedAt — Order.createdAt ไม่ใช่เวลาที่กดอีกต่อไป (00033)', () => {
  it('[blocker] ใช้เวลาที่กดจริง ไม่ใช่วันที่ลูกค้าสั่งที่ผู้ขายพิมพ์เอง', () => {
    // ร้านลงวันที่ย้อนหลัง 5 วัน แต่กดสร้างจริง 09:00 แล้วเปิดพัสดุ 15:00 = 6 ชม. ไม่ใช่ 126 ชม.
    const backdated = row({ orderCreatedAt: at('2026-07-27T09:00:00Z') })
    expect(resolveStartedAt(backdated)).toEqual(at('2026-08-01T09:00:00Z'))
    expect(computeShippingSpeed([backdated]).avgHours).toBe(6)
  })

  it('ออเดอร์เก่าที่ไม่มี OrderEvent ถอยไปใช้ Order.createdAt ได้', () => {
    const legacy = row({ keyedInAt: null })
    expect(resolveStartedAt(legacy)).toEqual(at('2026-08-01T09:00:00Z'))
    expect(computeShippingSpeed([legacy]).avgHours).toBe(6)
  })
})

describe('ค่าติดลบ — ช่องปั่นเหรียญที่ต้องปิด', () => {
  it('[blocker] ลงวันที่ล่วงหน้าแล้วได้ค่าติดลบ ต้องถูกตัดทิ้ง ไม่ใช่ถ่วงค่าเฉลี่ยลง', () => {
    // ถ้าปล่อยผ่าน: (-90 + 6) / 2 = -42 ชม. ⇒ ผ่านเกณฑ์ 24 ชม. สบาย ๆ = แจกเหรียญฟรี
    const forwardDated = row({
      keyedInAt: at('2026-08-05T09:00:00Z'),
      manualShipmentAt: at('2026-08-01T15:00:00Z'),
    })
    expect(resolveElapsedHours(forwardDated)).toBeNull()

    const r = computeShippingSpeed([forwardDated, row()])
    expect(r.sampleSize).toBe(1)
    expect(r.discarded).toBe(1)
    expect(r.avgHours).toBe(6)
  })

  it('[blocker] ค่าติดลบต้องไม่ถูกปัดเป็น 0 (ซึ่งแปลว่า "ส่งทันที" = ดีที่สุดเท่าที่เป็นไปได้)', () => {
    const forwardDated = row({
      keyedInAt: at('2026-08-05T09:00:00Z'),
      manualShipmentAt: at('2026-08-01T15:00:00Z'),
    })
    // ถ้าใครเปลี่ยนไปเป็น Math.max(0, diff) เทสนี้จะแดง — 0 ไม่ใช่ "ไม่รู้"
    expect(computeShippingSpeed([forwardDated]).sampleSize).toBe(0)
    expect(computeShippingSpeed([forwardDated]).avgHours).toBe(0)
  })
})

describe('computeShippingSpeed — ค่าเฉลี่ย', () => {
  it('เฉลี่ยจากใบที่นับได้เท่านั้น', () => {
    const rows = [
      row({ manualShipmentAt: at('2026-08-01T11:00:00Z') }), // 2 ชม.
      row({ manualShipmentAt: at('2026-08-01T13:00:00Z') }), // 4 ชม.
      row({ manualShipmentAt: at('2026-08-01T21:00:00Z') }), // 12 ชม.
    ]
    const r = computeShippingSpeed(rows)
    expect(r.sampleSize).toBe(3)
    expect(r.avgHours).toBe(6)
  })

  it('ไม่มีแถวเลย = 0 ไม่ใช่ NaN (0/0)', () => {
    const r = computeShippingSpeed([])
    expect(r.sampleSize).toBe(0)
    expect(r.avgHours).toBe(0)
    expect(Number.isNaN(r.avgHours)).toBe(false)
  })

  it('[blocker] ลำดับความสำคัญของ 3 แหล่งเวลาส่ง ครบทุกคู่ ไม่สลับกัน', () => {
    // ให้ 3 แหล่งมีค่าต่างกันชัดเจน แล้วไล่ปิดทีละชั้น — กันการสลับคู่ตอน refactor
    const all = row({
      ishipShipmentEventAt: at('2026-08-01T10:00:00Z'), // 1 ชม.
      ishipShipmentRowAt: at('2026-08-01T13:00:00Z'), // 4 ชม.
      manualShipmentAt: at('2026-08-01T21:00:00Z'), // 12 ชม.
    })
    expect(computeShippingSpeed([all]).avgHours).toBe(1)
    expect(computeShippingSpeed([{ ...all, ishipShipmentEventAt: null }]).avgHours).toBe(4)
    expect(
      computeShippingSpeed([{ ...all, ishipShipmentEventAt: null, ishipShipmentRowAt: null }])
        .avgHours,
    ).toBe(12)
  })
})
