import { describe, it, expect } from 'vitest'
import {
  shopIncompleteBadges, profitToneClass, profitHeading, financeBasisNote,
  stackColorToken, rowDotToken, STACK_COLOR_TOKENS, OTHERS_COLOR_TOKEN, excludedCountNote,
  portfolioPeriodLabel, isCurrentOrFuturePeriod, shiftPeriod, switchPeriodMode, portfolioSeriesQuery,
  portfolioChartAria, rowAriaLabel, othersLabel,
} from '../portfolio-display'

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
    expect(excludedCountNote(0)).toBeNull()
    expect(excludedCountNote(2)).toBe('ยอดรวมนี้ยังไม่รวม 2 ร้าน')
  })
  it('อื่น ๆ', () => expect(othersLabel(3)).toBe('อื่น ๆ (3 ร้าน)'))
  it('aria', () => {
    expect(rowAriaLabel('ร้านก')).toBe('เปิดร้าน ร้านก')
    expect(portfolioChartAria('฿100', 'ต.ค. 2569')).toContain('กราฟแท่งซ้อนยอดขายแยกตามธุรกิจ')
  })
})

describe('สีกราฟ (v1.1)', () => {
  it('ไม่มีเขียว/แดง/เหลือง/ม่วง และ "อื่น ๆ" = default-400', () => {
    for (const bad of ['chart-alpha', 'chart-beta', 'chart-gamma', 'chart-secondary'])
      expect(STACK_COLOR_TOKENS).not.toContain(bad)
    expect(stackColorToken(4, 'others')).toBe(OTHERS_COLOR_TOKEN)
    expect(stackColorToken(0, 'a')).toBe('chart-primary')
    expect(stackColorToken(1, 'b')).toBe('chart-dark')
  })
  it('จุดสีของแถวตรงกับสีแท่งทุกร้าน · อยู่ใน "อื่น ๆ" = เทาอ่อน · Personal/ERROR ไม่มีจุด', () => {
    const stack = [{ key: 'a' }, { key: 'b' }, { key: 'others' }]
    const ok = (shopId: string) => ({ shopId, isPersonal: false, status: 'OK' as const })
    expect(rowDotToken(stack, ok('a'))).toBe(stackColorToken(0, 'a'))
    expect(rowDotToken(stack, ok('b'))).toBe(stackColorToken(1, 'b'))
    expect(rowDotToken(stack, ok('zzz'))).toBe(OTHERS_COLOR_TOKEN)
    expect(rowDotToken(stack, { shopId: 'p', isPersonal: true, status: 'OK' })).toBeNull()
    expect(rowDotToken(stack, { shopId: 'a', isPersonal: false, status: 'ERROR' })).toBeNull()
    // ไม่มี others ในกราฟ + ร้านไม่อยู่ใน stack = ไม่มีจุด (ไม่ใส่สีมั่ว)
    expect(rowDotToken([{ key: 'a' }], ok('zzz'))).toBeNull()
  })
})

describe('ช่วงเวลา (v1.1)', () => {
  const now = { year: 2026, month: 10 }
  const daily = (year: number, month: number) => ({ mode: 'daily' as const, year, month })
  it('ป้ายช่วง', () => {
    expect(portfolioPeriodLabel(daily(2026, 10))).toBe('ต.ค. 2569')
    expect(portfolioPeriodLabel({ mode: 'monthly', year: 2026, month: 10 })).toBe('ปี 2569')
  })
  it('› ปิดที่เดือนปัจจุบัน/ปีปัจจุบัน · เปิดเมื่อย้อนหลัง', () => {
    expect(isCurrentOrFuturePeriod(daily(2026, 10), now)).toBe(true)
    expect(isCurrentOrFuturePeriod(daily(2026, 9), now)).toBe(false)
    expect(isCurrentOrFuturePeriod(daily(2025, 12), now)).toBe(false)
    expect(isCurrentOrFuturePeriod({ mode: 'monthly', year: 2026, month: 1 }, now)).toBe(true)
    expect(isCurrentOrFuturePeriod({ mode: 'monthly', year: 2025, month: 1 }, now)).toBe(false)
  })
  it('‹ ข้ามปี · › ข้ามปี · › ไปอนาคตไม่ได้', () => {
    expect(shiftPeriod(daily(2026, 1), -1, now)).toEqual(daily(2025, 12))
    expect(shiftPeriod(daily(2025, 12), 1, now)).toEqual(daily(2026, 1))
    expect(shiftPeriod(daily(2026, 10), 1, now)).toEqual(daily(2026, 10))
    expect(shiftPeriod({ mode: 'monthly', year: 2026, month: 10 }, -1, now).year).toBe(2025)
    expect(shiftPeriod({ mode: 'monthly', year: 2026, month: 10 }, 1, now).year).toBe(2026)
  })
  it('สลับโหมด → กลับช่วงปัจจุบัน', () => {
    expect(switchPeriodMode('monthly', now)).toEqual({ mode: 'monthly', year: 2026, month: 10 })
  })
  it('query: monthly ไม่ส่ง month', () => {
    expect(portfolioSeriesQuery(daily(2026, 9))).toBe('mode=daily&year=2026&month=9')
    expect(portfolioSeriesQuery({ mode: 'monthly', year: 2026, month: 9 })).toBe('mode=monthly&year=2026')
  })
})
