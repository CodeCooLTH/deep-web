import { describe, expect, it } from 'vitest'
import { sortTracesNewestFirst } from './traces'

/**
 * ปักหมุดลำดับ "ใหม่ → เก่า" ของไทม์ไลน์พัสดุ
 *
 * ทุกหน้าจอไฮไลต์ `index 0` เป็น "สถานะล่าสุด" และ `.slice(0, n)` เอา n แถวแรกไปโชว์ในโหมดย่อ
 * ⇒ ถ้าลำดับกลับด้านเมื่อไหร่ ร้านจะเห็นเหตุการณ์เก่าสุดถูกป้ายว่าเป็นสถานะปัจจุบัน โดยไม่มี
 * tsc/build/theme-guard ตัวไหนฟ้อง (อาเรย์ถูกชนิดทุกประการ สิ่งที่ผิดคือความหมาย)
 */
describe('[blocker] sortTracesNewestFirst — ล่าสุดต้องอยู่ index 0 เสมอ', () => {
  const asc = [
    { occurredAt: '2026-08-16T09:31:00.000Z', status: 'created' },
    { occurredAt: '2026-08-16T12:06:00.000Z', status: 'in_transit' },
    { occurredAt: '2026-08-17T03:14:00.000Z', status: 'out_for_delivery' },
  ]

  it('รับ input เก่า→ใหม่ (รูปที่ getTraces คืนมาจริง) แล้วกลับด้านให้', () => {
    expect(sortTracesNewestFirst(asc).map((t) => t.status)).toEqual([
      'out_for_delivery',
      'in_transit',
      'created',
    ])
  })

  it('input ที่เรียงใหม่→เก่าอยู่แล้วต้องไม่ถูกสลับ (เรียกซ้ำกี่ครั้งก็ได้ผลเดิม)', () => {
    const once = sortTracesNewestFirst(asc)
    expect(sortTracesNewestFirst(once)).toEqual(once)
  })

  it('ไม่แก้อาเรย์เดิม — ผู้เรียกส่ง state ของ React เข้ามาตรง ๆ ได้', () => {
    const input = [...asc]
    sortTracesNewestFirst(input)
    expect(input.map((t) => t.status)).toEqual(['created', 'in_transit', 'out_for_delivery'])
  })

  it('รองรับ Date (เส้นทาง fallback อ่านจาก ShipmentEvent ในฐาน) ไม่ใช่แค่ string', () => {
    const rows = [
      { occurredAt: new Date('2026-08-16T09:31:00.000Z'), status: 'created' },
      { occurredAt: new Date('2026-08-17T03:14:00.000Z'), status: 'out_for_delivery' },
    ]
    expect(sortTracesNewestFirst(rows)[0].status).toBe('out_for_delivery')
  })

  it('เวลาเท่ากันเป๊ะ ต้องคงลำดับเดิมจาก API ไว้ (stable) ไม่สุ่มสลับกันทุก render', () => {
    const sameTime = [
      { occurredAt: '2026-08-17T03:14:00.000Z', status: 'a' },
      { occurredAt: '2026-08-17T03:14:00.000Z', status: 'b' },
      { occurredAt: '2026-08-17T03:14:00.000Z', status: 'c' },
    ]
    expect(sortTracesNewestFirst(sameTime).map((t) => t.status)).toEqual(['a', 'b', 'c'])
  })

  it('เวลาพัง (NaN) ต้องตกไปท้ายสุด ห้ามขึ้นไปนั่งตำแหน่ง "สถานะล่าสุด"', () => {
    const withBroken = [
      { occurredAt: 'ไม่ใช่วันที่', status: 'broken' },
      ...asc,
    ]
    const sorted = sortTracesNewestFirst(withBroken)
    expect(sorted[0].status).toBe('out_for_delivery')
    expect(sorted[sorted.length - 1].status).toBe('broken')
  })

  it('occurredAt = null (ShippingCard ประกาศไว้เป็น nullable) ต้องตกท้ายสุดเหมือนกัน', () => {
    const withNull: { occurredAt: string | null; status: string }[] = [
      { occurredAt: null, status: 'no-time' },
      ...asc,
    ]
    const sorted = sortTracesNewestFirst(withNull)
    expect(sorted[0].status).toBe('out_for_delivery')
    expect(sorted[sorted.length - 1].status).toBe('no-time')
  })

  it('อาเรย์ว่างไม่พัง', () => {
    expect(sortTracesNewestFirst([])).toEqual([])
  })
})
