/** [blocker] feature 00073 เฟส B — ตั้งค่ารายงาน: ค่าตั้งต้น = เหมือนวันนี้ · ร้านอื่นไม่ได้รับผล · ค่าเพี้ยนไม่พังจอ */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REPORT_SETTINGS,
  isDefaultReportSettings,
  mergeReportSettings,
  profitExclusionNote,
  profitShown,
  resolveReportSettings,
  showsExpenseTab,
} from '../report-settings'

describe('resolveReportSettings', () => {
  it('ยังไม่เคยตั้ง = ค่าตั้งต้น · มัดจำล่วงหน้าปิด · ที่เหลือเปิด', () => {
    const s = resolveReportSettings(null, 'SERVICE_QUEUE')
    expect(s).toEqual(DEFAULT_REPORT_SETTINGS)
    expect(s.advanceDeposit).toBe(false)
    expect(s.receivables && s.jobCount && s.partCost && s.shopExpense && s.pnl).toBe(true)
    expect(s.chartStyle).toBe('STACKED')
  })
  it('[blocker] ร้านขายของ/ที่พัก = ค่าตั้งต้นเสมอ แม้แถวจะมีค่า', () => {
    const raw = { receivables: false, pnl: false }
    expect(resolveReportSettings(raw, 'ONLINE_SALES')).toEqual(DEFAULT_REPORT_SETTINGS)
    expect(resolveReportSettings(raw, 'LODGING')).toEqual(DEFAULT_REPORT_SETTINGS)
  })
  it('ค่าเพี้ยน/ชนิดผิด → ช่องนั้นใช้ค่าตั้งต้น (ไม่ throw)', () => {
    const s = resolveReportSettings({ receivables: 'no', chartStyle: 'PIE', pnl: false, defaultRange: 'M6' }, 'SERVICE_QUEUE')
    expect(s.receivables).toBe(true)
    expect(s.chartStyle).toBe('STACKED')
    // 00078: สวิตช์/ช่วงที่เลิกใช้ = ค่าตั้งต้นเสมอ (ค่าในแถวไม่มีผลแล้ว — ไม่ลบจากฐาน)
    expect(s.pnl).toBe(true)
    expect(s.defaultRange).toBe('MONTH')
    expect(resolveReportSettings([], 'SERVICE_QUEUE')).toEqual(DEFAULT_REPORT_SETTINGS)
  })
})

describe('สิ่งที่จอแสดง', () => {
  it('merge เฉพาะช่องที่ส่งมา · isDefault', () => {
    const next = mergeReportSettings({ ...DEFAULT_REPORT_SETTINGS }, { pnl: false, chartStyle: 'LINE' })
    expect(next.pnl).toBe(false)
    expect(next.chartStyle).toBe('LINE')
    expect(next.receivables).toBe(true)
    expect(isDefaultReportSettings(next)).toBe(false)
    expect(isDefaultReportSettings({ ...DEFAULT_REPORT_SETTINGS })).toBe(true)
  })
  it('แท็บค่าใช้จ่าย = ตามสวิตช์ค่าใช้จ่ายร้าน', () => {
    expect(showsExpenseTab({ ...DEFAULT_REPORT_SETTINGS })).toBe(true)
    expect(showsExpenseTab({ ...DEFAULT_REPORT_SETTINGS, shopExpense: false })).toBe(false)
  })
  it('กำไรที่แสดงหักเฉพาะที่เปิด + ป้ายบอกสิ่งที่ไม่ได้หัก', () => {
    const n = { revenue: 1000, cogs: 300, expense: 200 }
    expect(profitShown({ ...DEFAULT_REPORT_SETTINGS }, n)).toBe(500)
    expect(profitShown({ ...DEFAULT_REPORT_SETTINGS, partCost: false }, n)).toBe(800)
    expect(profitShown({ ...DEFAULT_REPORT_SETTINGS, shopExpense: false, partCost: false }, n)).toBe(1000)
    expect(profitExclusionNote({ ...DEFAULT_REPORT_SETTINGS }, 'ต้นทุนอะไหล่')).toBeNull()
    expect(profitExclusionNote({ ...DEFAULT_REPORT_SETTINGS, partCost: false }, 'ต้นทุนอะไหล่')).toBe('ยังไม่หักต้นทุนอะไหล่ (ปิดไว้ในตั้งค่ารายงาน)')
  })
})

describe('แท็บการเงินตามตั้งค่า', () => {
  it('ค่าตั้งต้น = ครบ 3 แท็บ ลำดับเดิม · ปิดกำไรขาดทุน/ค่าใช้จ่ายแล้วแท็บหาย', async () => {
    const { visibleFinanceTabs, resolveVisibleFinanceTab } = await import('../report-settings')
    const d = { ...DEFAULT_REPORT_SETTINGS }
    expect(visibleFinanceTabs(d)).toEqual(['pnl', 'collect', 'expense'])
    expect(visibleFinanceTabs({ ...d, pnl: false, shopExpense: false })).toEqual(['collect'])
    expect(resolveVisibleFinanceTab(undefined, d)).toBe('pnl')
    expect(resolveVisibleFinanceTab('expense', { ...d, shopExpense: false })).toBe('pnl')
    expect(resolveVisibleFinanceTab('pnl', { ...d, pnl: false })).toBe('collect')
    expect(resolveVisibleFinanceTab(['collect', 'pnl'], d)).toBe('collect')
  })
})

describe('ตัวเลขหลักบนการ์ด', () => {
  it('ค่าตั้งต้น = ยอดขาย · ตัวที่สวิตช์ต้นทางปิดถอยเป็นยอดขาย · ค่าเพี้ยน = ยอดขาย', async () => {
    const { resolveHeadline } = await import('../report-settings')
    const d = { ...DEFAULT_REPORT_SETTINGS }
    expect(resolveHeadline(d)).toBe('SALES')
    expect(resolveHeadline({ ...d, headline: 'RECEIVED' })).toBe('RECEIVED')
    expect(resolveHeadline({ ...d, headline: 'RECEIVED', receivables: false })).toBe('SALES')
    expect(resolveHeadline({ ...d, headline: 'NET_PROFIT' })).toBe('NET_PROFIT')
    expect(resolveHeadline({ ...d, headline: 'NET_PROFIT', pnl: false })).toBe('SALES')
    expect(resolveReportSettings({ headline: 'PROFIT!!' }, 'SERVICE_QUEUE').headline).toBe('SALES')
    expect(resolveReportSettings({ headline: 'NET_PROFIT' }, 'ONLINE_SALES').headline).toBe('SALES')
  })
})
