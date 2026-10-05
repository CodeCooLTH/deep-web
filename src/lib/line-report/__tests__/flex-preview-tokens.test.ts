import { describe, expect, it } from 'vitest'
import { FLEX_COLORS } from '@/lib/line/flex-summary-report'
import { flexColorClass, FLEX_INK_CLASS } from '../flex-preview-tokens'

describe('flexColorClass', () => {
  it('ทุกสีของ builder มีคลาสของมันเอง (builder เพิ่ม/เปลี่ยนสี → เทสแดง)', () => {
    expect(flexColorClass(FLEX_COLORS.ACCENT)).toBe('text-primary')
    expect(flexColorClass(FLEX_COLORS.SLATE)).toBe('text-default-700')
    expect(flexColorClass(FLEX_COLORS.DANGER)).toBe('text-danger-ink')
    expect(flexColorClass(FLEX_COLORS.INK)).toBe(FLEX_INK_CLASS)
    // สีต่างกันต้องได้คลาสต่างกัน (กัน map ตกไป default หมด)
    expect(new Set(Object.values(FLEX_COLORS).map(flexColorClass)).size).toBe(4)
  })
  it('ไม่สนตัวพิมพ์ · ไม่รู้จัก/ไม่ใช่สตริง → หมึกปกติ', () => {
    expect(flexColorClass(FLEX_COLORS.ACCENT.toUpperCase())).toBe('text-primary')
    expect(flexColorClass('#123456')).toBe(FLEX_INK_CLASS)
    expect(flexColorClass(undefined)).toBe(FLEX_INK_CLASS)
  })
})
