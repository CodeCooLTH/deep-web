/** mergeSettings ตรวจ dailyTimes/cutoffDay ซ้ำที่ service (00070 follow-up U4) — ค่านอกชุด = VALIDATION ไม่ใช่ raw CHECK error */
import { describe, it, expect } from 'vitest'
import { mergeSettings } from '@/services/line-report-group.service'

const cur = {
  dailyEnabled: true, dailyTimes: [540], monthlyEnabled: false, cutoffDay: null as number | null,
  showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: false,
  skipWhenNoOrders: false, attachCycleToDaily: false, profitEnabledAt: null as Date | null,
}
const code = (f: () => unknown) => { try { f(); return null } catch (e) { return (e as { code?: string }).code } }
const now = new Date()

describe('mergeSettings — validation ซ้ำ', () => {
  it('dailyTimes > 4 / นอกชุด 48 ค่า / ไม่ใช่ทีละ 30 นาที → VALIDATION', () => {
    expect(code(() => mergeSettings(cur, { dailyTimes: [30, 60, 90, 120, 150] } as never, now))).toBe('VALIDATION')
    expect(code(() => mergeSettings(cur, { dailyTimes: [45] } as never, now))).toBe('VALIDATION')
    expect(code(() => mergeSettings(cur, { dailyTimes: [0] } as never, now))).toBe('VALIDATION')
    expect(code(() => mergeSettings(cur, { dailyTimes: [1470] } as never, now))).toBe('VALIDATION')
  })
  it('cutoffDay 0 / 32 / ทศนิยม → VALIDATION · null/1/31 ผ่าน', () => {
    for (const c of [0, 32, 1.5]) expect(code(() => mergeSettings(cur, { cutoffDay: c } as never, now))).toBe('VALIDATION')
    for (const c of [null, 1, 31]) expect(code(() => mergeSettings(cur, { cutoffDay: c }, now))).toBeNull()
  })
  it('ค่าถูกต้องผ่าน (รวม 1440 และซ้ำถูกยุบ)', () => {
    expect(mergeSettings(cur, { dailyTimes: [1440, 30, 30] } as never, now).dailyTimes).toEqual([30, 1440])
  })
})
