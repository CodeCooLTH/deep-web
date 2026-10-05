import { describe, it, expect } from 'vitest'
import {
  marginText, shopIncompleteBadges, profitToneClass, profitHeading, financeBasisNote,
  excludedShopsNote, rangeSubtitle, chartMonthNote, hasChartData, chartDates,
} from '../portfolio-display'

describe('marginText', () => {
  it('ยอดขาย 0 → —', () => expect(marginText(null, false)).toBe('—'))
  it('ครบ → อัตรากำไร', () => expect(marginText(25.84, false)).toBe('อัตรากำไร 25.8%'))
  it('ไม่ครบ → ไม่เกิน', () => expect(marginText(16.4, true)).toBe('ไม่เกิน 16.4%'))
  it('ไม่ครบแต่ติดลบ → ไม่ใส่ "ไม่เกิน"', () => expect(marginText(-5, true)).toBe('อัตรากำไร -5.0%'))
})

describe('shopIncompleteBadges', () => {
  it('ครบ → ว่าง', () => expect(shopIncompleteBadges({ missingCost: false, missingExpense: false }, 'ต้นทุนสินค้า')).toEqual([]))
  it('ขาดต้นทุน', () => expect(shopIncompleteBadges({ missingCost: true, missingExpense: false }, 'ต้นทุนอะไหล่')).toEqual(['ยังไม่ตั้งต้นทุนอะไหล่']))
  it('ขาดทั้งคู่ → 2 ป้าย', () => expect(shopIncompleteBadges({ missingCost: true, missingExpense: true }, 'ต้นทุนสินค้า')).toHaveLength(2))
})

describe('profit tone/heading', () => {
  it('ขาดทุน → แดง + ขาดทุนสุทธิรวม (แม้ไม่ครบ)', () => {
    expect(profitToneClass(-1, true)).toBe('text-danger-ink')
    expect(profitHeading(-1, 'total')).toBe('ขาดทุนสุทธิรวม')
    expect(profitHeading(-1, 'shop')).toBe('ขาดทุนสุทธิ')
  })
  it('ไม่ครบ → warning · ครบ → กลาง ไม่ใช่เขียว', () => {
    expect(profitToneClass(10, true)).toBe('text-warning-ink')
    expect(profitToneClass(10, false)).toBe('text-default-800')
    expect(profitHeading(0, 'total')).toBe('กำไรสุทธิรวม')
  })
})

describe('notes', () => {
  it('ฐานค่าส่งแสดงเมื่อผสม', () => {
    expect(financeBasisNote(true)).toContain('หักค่าส่ง')
    expect(financeBasisNote(false)).toBeNull()
  })
  it('ร้านล้ม', () => {
    expect(excludedShopsNote([])).toBeNull()
    expect(excludedShopsNote(['A', 'B'])).toBe('ยอดรวมยังไม่รวมร้าน A, B')
  })
  it('หมายเหตุเดือนของกราฟ', () => {
    expect(chartMonthNote('month', '2026-10')).toBeNull()
    expect(chartMonthNote('7d', '2026-10')).toBe('กราฟแสดงทั้งเดือน ต.ค. 2569 ไม่ได้ตามช่วงที่เลือก')
  })
  it('บรรทัดช่วงเวลา', () => {
    expect(rangeSubtitle('month', { start: '2026-10-01', end: '2026-10-05' })).toBe('เดือนนี้ · 01-10-2569 – 05-10-2569')
  })
})

describe('chart', () => {
  it('hasChartData', () => {
    expect(hasChartData(null)).toBe(false)
    expect(hasChartData({ revenue: [0, 0] })).toBe(false)
    expect(hasChartData({ revenue: [0, 5] })).toBe(true)
  })
  it('chartDates pad วัน', () => expect(chartDates('2026-10', ['1', '12'])).toEqual(['2026-10-01', '2026-10-12']))
})
