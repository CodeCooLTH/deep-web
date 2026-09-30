import { describe, it, expect } from 'vitest'
import {
  FINANCE_TABS,
  DEFAULT_FINANCE_TAB,
  resolveFinanceTab,
  resolveDataCompleteness,
  shouldOfferCostSetup,
  shouldOfferExpenseSetup,
} from '../finance-tabs'

/**
 * feature 00067 — TC-003, TC-011, TC-012, TC-015
 *
 * ตรรกะทั้งไฟล์นี้ถูกสกัดออกมาจาก JSX โดยตั้งใจ เพราะมันเป็น boolean ที่ตัดสินว่าหน้าจอ
 * จะเรียกตัวเลขว่า "กำไรสุทธิ" หรือ "กำไรไม่เกิน" — เขียนกลับด้านแล้วไม่มี gate ไหนจับได้
 */

describe('[blocker] resolveFinanceTab — fail-closed ทุกกรณี', () => {
  it('คืนค่าที่รู้จักตามเดิม', () => {
    expect(resolveFinanceTab('pnl')).toBe('pnl')
    expect(resolveFinanceTab('collect')).toBe('collect')
    expect(resolveFinanceTab('expense')).toBe('expense')
  })

  it('ค่าที่ไม่รู้จักตกไปแท็บเริ่มต้น ไม่ throw', () => {
    // ทุกค่าในลิสต์นี้มาจาก URL ที่ผู้ใช้พิมพ์เองได้ — throw = หน้าทั้งหน้า 500
    const rubbish: (string | string[] | null | undefined)[] = [
      undefined,
      null,
      '',
      ' ',
      'PNL', // ตัวพิมพ์ใหญ่ — ห้าม normalize ให้ (จะกลายเป็นสอง URL ที่ให้ผลเดียวกัน)
      'Pnl',
      'profit',
      '../../etc/passwd',
      '__proto__',
      'toString',
    ]
    for (const raw of rubbish) {
      expect(() => resolveFinanceTab(raw)).not.toThrow()
      expect(resolveFinanceTab(raw)).toBe(DEFAULT_FINANCE_TAB)
    }
  })

  it('query key ซ้ำ (?tab=a&tab=b) → Next คืน array → เอาตัวแรก', () => {
    expect(resolveFinanceTab(['expense', 'pnl'])).toBe('expense')
    expect(resolveFinanceTab(['pnl', 'expense'])).toBe('pnl')
    // array ที่ตัวแรกใช้ไม่ได้ ก็ยังต้องตกไป default ไม่ใช่ไปหยิบตัวที่สอง
    expect(resolveFinanceTab(['zzz', 'expense'])).toBe(DEFAULT_FINANCE_TAB)
    expect(resolveFinanceTab([])).toBe(DEFAULT_FINANCE_TAB)
  })

  it('แท็บเริ่มต้นต้องอยู่ในลิสต์ และลิสต์ต้องไม่ว่าง', () => {
    expect(FINANCE_TABS.length).toBeGreaterThan(0)
    expect(FINANCE_TABS).toContain(DEFAULT_FINANCE_TAB)
    // ลำดับมีความหมาย: แท็บแรกคือคำตอบของหน้า
    expect(FINANCE_TABS[0]).toBe(DEFAULT_FINANCE_TAB)
  })
})

describe('[blocker] resolveDataCompleteness — ครบก็ต่อเมื่อครบทั้งสองอย่าง', () => {
  const base = { uncostedItemCount: 0, soldItemCount: 10 }

  it('ครบเมื่อ ไม่ขาดต้นทุน และ มีค่าใช้จ่ายอย่างน้อย 1 รายการ', () => {
    expect(
      resolveDataCompleteness({ ...base, hasMissingCost: false, expenseCount: 3 }).complete,
    ).toBe(true)
  })

  it('ขาดต้นทุน = ไม่ครบ แม้มีค่าใช้จ่ายครบ', () => {
    const c = resolveDataCompleteness({ ...base, hasMissingCost: true, expenseCount: 3 })
    expect(c.complete).toBe(false)
    expect(c.missingCost).toBe(true)
    expect(c.missingExpense).toBe(false)
  })

  it('ไม่มีค่าใช้จ่าย = ไม่ครบ แม้ต้นทุนครบ', () => {
    const c = resolveDataCompleteness({ ...base, hasMissingCost: false, expenseCount: 0 })
    expect(c.complete).toBe(false)
    expect(c.missingCost).toBe(false)
    expect(c.missingExpense).toBe(true)
  })

  it('ขาดทั้งคู่ = ไม่ครบ และธงขึ้นทั้งสองตัว', () => {
    const c = resolveDataCompleteness({ ...base, hasMissingCost: true, expenseCount: 0 })
    expect(c.complete).toBe(false)
    expect(c.missingCost).toBe(true)
    expect(c.missingExpense).toBe(true)
  })

  it('ส่งตัวนับผ่านออกไปตามจริง ไม่ดัดแปลง', () => {
    const c = resolveDataCompleteness({
      hasMissingCost: true,
      expenseCount: 0,
      uncostedItemCount: 12,
      soldItemCount: 14,
    })
    expect(c.uncostedItemCount).toBe(12)
    expect(c.soldItemCount).toBe(14)
  })
})

describe('[blocker] ปุ่มเติมข้อมูล — แสดงเฉพาะเมื่อกดแล้วมีอะไรให้ทำจริง', () => {
  it('ขาดต้นทุนและมีรายการให้ตั้ง → แสดงปุ่มตั้งราคาทุน', () => {
    const c = resolveDataCompleteness({
      hasMissingCost: true,
      expenseCount: 5,
      uncostedItemCount: 12,
      soldItemCount: 14,
    })
    expect(shouldOfferCostSetup(c)).toBe(true)
  })

  it('ขาดต้นทุนแต่ไม่มีรายการให้ตั้ง (ขายแต่รายการพิมพ์เอง) → ไม่แสดงปุ่ม', () => {
    // เคสนี้คือร้านที่คีย์รายการในแชทล้วน: cost เป็น null เสมอตาม 00016
    // ป้ายเตือนยังต้องขึ้น (missingCost = true) แต่ปุ่มที่กดไปแล้วเจอหน้าว่าง แย่กว่าไม่มีปุ่ม
    const c = resolveDataCompleteness({
      hasMissingCost: true,
      expenseCount: 5,
      uncostedItemCount: 0,
      soldItemCount: 0,
    })
    expect(c.missingCost).toBe(true)
    expect(c.complete).toBe(false)
    expect(shouldOfferCostSetup(c)).toBe(false)
  })

  it('ต้นทุนครบ → ไม่แสดงปุ่มตั้งราคาทุน แม้ตัวนับจะค้างค่าอยู่', () => {
    const c = resolveDataCompleteness({
      hasMissingCost: false,
      expenseCount: 5,
      uncostedItemCount: 3,
      soldItemCount: 14,
    })
    expect(shouldOfferCostSetup(c)).toBe(false)
  })

  it('ปุ่มบันทึกค่าใช้จ่ายผูกกับการไม่มีรายการเท่านั้น', () => {
    const none = resolveDataCompleteness({
      hasMissingCost: false,
      expenseCount: 0,
      uncostedItemCount: 0,
      soldItemCount: 4,
    })
    const some = resolveDataCompleteness({
      hasMissingCost: false,
      expenseCount: 1,
      uncostedItemCount: 0,
      soldItemCount: 4,
    })
    expect(shouldOfferExpenseSetup(none)).toBe(true)
    expect(shouldOfferExpenseSetup(some)).toBe(false)
  })

  it('ข้อมูลครบแล้ว ปุ่มต้องหายทั้งสองตัว', () => {
    const c = resolveDataCompleteness({
      hasMissingCost: false,
      expenseCount: 2,
      uncostedItemCount: 0,
      soldItemCount: 14,
    })
    expect(c.complete).toBe(true)
    expect(shouldOfferCostSetup(c)).toBe(false)
    expect(shouldOfferExpenseSetup(c)).toBe(false)
  })
})
