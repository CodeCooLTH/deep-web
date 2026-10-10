import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dashboardMoney, redactCommandCenterData } from '../dashboard-money'

describe('dashboardMoney', () => {
  it('FULL: ทุกธงเปิด', () => {
    const f = dashboardMoney('FULL')
    expect(Object.keys(f)).toHaveLength(8)
    expect(Object.values(f).every((v) => v === true)).toBe(true)
  })
  it.each(['PER_ORDER', 'NONE'] as const)('%s: ทุกธงปิด', (lvl) => {
    expect(Object.values(dashboardMoney(lvl)).every((v) => v === false)).toBe(true)
  })
})

describe('redactCommandCenterData', () => {
  const data = {
    shopName: 'ร้าน',
    walletBalance: 500,
    salesSeries: { total: 1 },
    portfolio: { initial: {} },
    bestSellers: [{ id: 'a', name: 'x', price: 10, soldCount: 7 }],
  }
  it('PER_ORDER/NONE: ไม่เหลือคีย์เงินสักตัว (absent ไม่ใช่ null/0)', () => {
    for (const lvl of ['PER_ORDER', 'NONE'] as const) {
      const r = redactCommandCenterData(data, lvl) as Record<string, unknown>
      expect('walletBalance' in r).toBe(false)
      expect('salesSeries' in r).toBe(false)
      expect('portfolio' in r).toBe(false)
      expect(r.shopName).toBe('ร้าน')
      const b = (r.bestSellers as Record<string, unknown>[])[0]
      expect('soldCount' in b).toBe(false)
      expect(b.price).toBe(10)
    }
  })
  it('ไม่แก้ object ต้นทาง', () => {
    redactCommandCenterData(data, 'NONE')
    expect(data.walletBalance).toBe(500)
    expect(data.bestSellers[0].soldCount).toBe(7)
  })
  it('FULL: ข้อมูลครบเท่าเดิม', () => {
    expect(redactCommandCenterData(data, 'FULL')).toEqual(data)
  })
})

// ด่านซอร์ส: แหล่งเงินต้องถูกครอบด้วยธง dashboardMoney ไม่ใช่ query แล้วซ่อน
describe('dashboard/page.tsx: แหล่งเงินถูกครอบธง', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/app/(paces)/seller/(dashboard)/dashboard/page.tsx'),
    'utf8',
  )
  it.each([
    ['getBalance', 'money.walletHero'],
    ['getSalesSeries', 'money.salesChartCard'],
    ['getProvinceSales', 'money.provinceMap'],
  ])('%s() ถูกครอบด้วย %s', (fn, flag) => {
    const calls = [...src.matchAll(new RegExp(`(?<![\\w.])${fn}\\(`, 'g'))]
    expect(calls.length).toBeGreaterThan(0)
    for (const m of calls) {
      const before = src.slice(Math.max(0, m.index! - 140), m.index!)
      // รูปแบบ: `flag ? fn(...)` (หรือ `flag && ... ? fn(`)
      expect(before).toMatch(new RegExp(`${flag.replace('.', '\\.')}[^;]*\\?\\s*$`))
    }
  })
  it('ไม่เรียก resolveExpenseAccess ตัดสินเงินอีก', () => {
    expect(src).not.toMatch(/resolveExpenseAccess\(/)
  })
})

describe('ผู้เรียก getRecentActivity ผูก includeTopups กับธง topups (FULL)', () => {
  it.each([
    'src/app/(paces)/seller/(dashboard)/dashboard/page.tsx',
    'src/app/(paces)/seller/(dashboard)/notifications/page.tsx',
  ])('%s', (rel) => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8')
    expect(src).toMatch(/includeTopups: (money|canSeeTopups)\.?\w*\s*&&|includeTopups: canSeeTopups &&/)
  })
})
