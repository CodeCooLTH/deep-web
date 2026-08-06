/**
 * tests/lib/order-date-window.test.ts
 *
 * feature 00033 re-review #2 (I-7) — resolveEditedOrderedAtPayload: payload ของ createdAt
 * ที่ OrderCreateForm ส่งไป API ตอนแก้ไขคำสั่งซื้อ. ปุ่ม "ตอนนี้" เคลียร์ orderedAt กลับเป็น
 * undefined แต่จอโชว์ "วันนี้ HH:mm" — เดิม logic ไม่ส่ง createdAt เลยตอนกดปุ่มนี้ (จอโกหก)
 */
import { describe, it, expect } from 'vitest'
import { resolveEditedOrderedAtPayload } from '@/lib/order-date-window'

describe('resolveEditedOrderedAtPayload (00033 I-7)', () => {
  const nowMs = new Date('2026-08-06T10:30:00').getTime()

  it('ไม่ dirty เลย — ไม่ส่งคีย์ createdAt เลย (ไม่แตะวันที่เดิม)', () => {
    expect(resolveEditedOrderedAtPayload(false, undefined, nowMs)).toEqual({})
    // แม้ values.orderedAt จะมีค่าค้างอยู่ (จาก defaultValues ที่ reset ใส่ไว้) แต่ไม่ dirty
    // ก็ต้องไม่ส่ง — ผู้ใช้ไม่ได้แตะแถววันที่เลย
    expect(resolveEditedOrderedAtPayload(false, '2026-07-01T09:00', nowMs)).toEqual({})
  })

  it('dirty + มีค่า (พิมพ์ใน datetime-local) — ส่งค่าที่พิมพ์เป็น ISO', () => {
    const result = resolveEditedOrderedAtPayload(true, '2026-07-01T09:00', nowMs)
    expect(result).toEqual({ createdAt: new Date('2026-07-01T09:00').toISOString() })
  })

  it('dirty + ไม่มีค่า (กดปุ่ม "ตอนนี้") — ส่งเวลาปัจจุบันจริง ตรงกับ label ที่จอโชว์ ไม่ใช่งดส่ง', () => {
    const result = resolveEditedOrderedAtPayload(true, undefined, nowMs)
    expect(result).toEqual({ createdAt: new Date(nowMs).toISOString() })
  })
})
