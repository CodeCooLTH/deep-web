import { describe, it, expect } from 'vitest'
import { pickApiErrorMessage } from '@/lib/api-error-message'

/**
 * [blocker] จอ error ของผู้ขายห้ามโชว์รหัสภาษาอังกฤษดิบ (user report prod 2026-08-11:
 * เห็น `RESOURCE_NOT_FOUND` เต็มจอ) และห้ามทำกลุ่ม error ที่ใส่ข้อความไทยไว้ในคีย์ `error`
 * ตกหล่นไป fallback (regression ที่เงียบพอ ๆ กับบั๊กเดิม)
 */

const FALLBACK = 'สร้างคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่'

describe('[blocker] pickApiErrorMessage', () => {
  it('คอนเวนชัน (ก) — มี message ไทย: ใช้ message เป็นข้อความ และเก็บรหัสไว้อ้างอิง', () => {
    const r = pickApiErrorMessage(
      { error: 'RESOURCE_NOT_FOUND', message: 'ประเภทงานที่เลือกไว้ถูกลบไปแล้ว' },
      FALLBACK,
    )
    expect(r.text).toBe('ประเภทงานที่เลือกไว้ถูกลบไปแล้ว')
    expect(r.code).toBe('RESOURCE_NOT_FOUND')
  })

  it('คอนเวนชัน (ข) — ข้อความไทยอยู่ในคีย์ error: ใช้เป็นข้อความ และไม่โชว์รหัสซ้ำ', () => {
    const r = pickApiErrorMessage({ error: 'ออเดอร์ที่ต้องจัดส่งต้องระบุที่อยู่จัดส่ง' }, FALLBACK)
    expect(r.text).toBe('ออเดอร์ที่ต้องจัดส่งต้องระบุที่อยู่จัดส่ง')
    expect(r.code).toBeNull()
  })

  it('มีแต่รหัสอังกฤษ: ห้ามให้รหัสหลุดเป็นข้อความหลัก (บั๊กต้นเรื่อง)', () => {
    const r = pickApiErrorMessage({ error: 'RESOURCE_NOT_FOUND' }, FALLBACK)
    expect(r.text).toBe(FALLBACK)
    expect(r.text).not.toContain('RESOURCE_NOT_FOUND')
    expect(r.code).toBe('RESOURCE_NOT_FOUND')
  })

  it('500 ตัวเปล่า / body ว่าง: fallback และไม่มีรหัสให้อ้าง', () => {
    expect(pickApiErrorMessage({}, FALLBACK)).toEqual({ text: FALLBACK, code: null })
    expect(pickApiErrorMessage(null, FALLBACK)).toEqual({ text: FALLBACK, code: null })
    expect(pickApiErrorMessage(undefined, FALLBACK)).toEqual({ text: FALLBACK, code: null })
  })

  it('error ไม่ใช่สตริง (validation รูปแบบอื่น) ต้องไม่ throw', () => {
    const r = pickApiErrorMessage({ error: { field: 'items' } }, FALLBACK)
    expect(r).toEqual({ text: FALLBACK, code: null })
  })

  it('message เป็นอังกฤษล้วนแต่ error เป็นไทย → ใช้ไทย (ภาษาชนะตำแหน่งคีย์)', () => {
    const r = pickApiErrorMessage({ error: 'ช่วงเวลานี้เต็มแล้ว', message: 'slot full' }, FALLBACK)
    expect(r.text).toBe('ช่วงเวลานี้เต็มแล้ว')
  })
})
