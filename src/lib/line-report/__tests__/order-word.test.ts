import { describe, expect, it } from 'vitest'
import { orderWordFor } from '../order-word'

const s = (vertical: string | null, state = 'OK') => ({ name: 'x', vertical, state })

describe('orderWordFor', () => {
  it('ร้านเดียว/vertical เดียว → คำของ vertical นั้น (ไม่ใช่ "ออเดอร์")', () => {
    const r = orderWordFor([s('ONLINE_SALES')])
    expect(r.mixed).toBe(false)
    expect(r.word).not.toBe('ออเดอร์')
    expect(orderWordFor([s('SERVICE_QUEUE')]).word).not.toBe(r.word)
  })
  it('ผสม vertical → "รายการ"', () => {
    expect(orderWordFor([s('ONLINE_SALES'), s('SERVICE_QUEUE')])).toEqual({ word: 'รายการ', mixed: true })
  })
  it('ร้านที่ล็อกไม่นับ: ผสมกับร้านล็อกต่าง vertical ยังเป็นคำของร้านที่นับ', () => {
    const only = orderWordFor([s('ONLINE_SALES')])
    expect(orderWordFor([s('ONLINE_SALES'), s('SERVICE_QUEUE', 'LOCKED')])).toEqual(only)
  })
  it('ล็อกหมดทุกร้าน → ถอยไปใช้ vertical ของทุกร้าน (ไม่ throw)', () => {
    expect(orderWordFor([s('ONLINE_SALES', 'LOCKED'), s('SERVICE_QUEUE', 'DELETED')]).mixed).toBe(true)
  })
})
