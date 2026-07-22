// stat-change-tone.test.ts — Vitest unit tests สำหรับ getStatChangeTone (S-A1)
// ครอบเคสบังคับ: CANCELLED invert + สถานะอื่น regression + changePct=0 neutral

import { describe, it, expect } from 'vitest'
import { getStatChangeTone } from './stat-change-tone'

describe('getStatChangeTone', () => {
  it('CANCELLED + changePct > 0 → danger (ยอดยกเลิกเพิ่ม = แย่)', () => {
    expect(getStatChangeTone('CANCELLED', 15)).toBe('danger')
  })

  it('CANCELLED + changePct < 0 → success (ยอดยกเลิกลด = ดี)', () => {
    expect(getStatChangeTone('CANCELLED', -15)).toBe('success')
  })

  it('CANCELLED + changePct = 0 → neutral', () => {
    expect(getStatChangeTone('CANCELLED', 0)).toBe('neutral')
  })

  it('PENDING + changePct > 0 → success (regression กฎปกติ)', () => {
    expect(getStatChangeTone('PENDING', 20)).toBe('success')
  })

  it('PENDING + changePct < 0 → danger (regression กฎปกติ)', () => {
    expect(getStatChangeTone('PENDING', -20)).toBe('danger')
  })

  it('SHIPPED + changePct > 0 → success', () => {
    expect(getStatChangeTone('SHIPPED', 10)).toBe('success')
  })

  it('SHIPPED + changePct < 0 → danger', () => {
    expect(getStatChangeTone('SHIPPED', -10)).toBe('danger')
  })

  it('CONFIRMED + changePct > 0 → success', () => {
    expect(getStatChangeTone('CONFIRMED', 5)).toBe('success')
  })

  it('CONFIRMED + changePct < 0 → danger', () => {
    expect(getStatChangeTone('CONFIRMED', -5)).toBe('danger')
  })

  it('changePct = 0 (สถานะอื่น) → neutral', () => {
    expect(getStatChangeTone('PENDING', 0)).toBe('neutral')
    expect(getStatChangeTone('SHIPPED', 0)).toBe('neutral')
    expect(getStatChangeTone('CONFIRMED', 0)).toBe('neutral')
  })
})
