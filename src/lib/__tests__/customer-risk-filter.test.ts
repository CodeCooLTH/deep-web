/**
 * แกน `?risk=` (ความเสี่ยงข้ามร้าน) — feature 00057
 *
 * 🛑 กฎที่เทสนี้กัน: **ตัวเลขบนไทล์/การ์ดที่กดได้ ต้องนับด้วยฟังก์ชันเดียวกับที่กรองจริง**
 * ถ้านับด้วยเกณฑ์หนึ่งแล้วกรองด้วยอีกเกณฑ์ ผู้ขายจะกดเลข 2 เข้าไปเจอ 1 โดยไม่มีอะไรฟ้อง
 * (บทเรียน Command Center 2026-08-04 — SQL นับ / TS กรอง)
 *
 * 🛑 และ **สองแกนต้อง AND กัน ไม่ใช่แทนที่กัน** — `?f=` ถามเรื่องร้านนี้ `?risk=` ถามเรื่อง
 * ทั้งระบบ คนเดียวกันตอบต่างกันได้ (ไม่เคยตีกลับกับเรา แต่ตีกลับร้านอื่น 4 ครั้ง)
 */
import { describe, expect, it } from 'vitest'
import { classifyCustomerRiskTier, type BuyerReputation } from '../buyer-reputation'
import {
  matchesRiskFilter,
  parseCustomerRiskFilter,
  type CustomerRiskFilter,
} from '../customer-directory'

const rep = (o: Partial<BuyerReputation>): BuyerReputation => ({
  orders: 1, shipped: 0, received: 0, returned: 0, cancelledByBuyer: 0,
  returnRate: null, riskLevel: 'NONE', ...o,
})

describe('parseCustomerRiskFilter — fail-closed', () => {
  it('ค่าที่ไม่รู้จักตกเป็น all ไม่ throw (URL ที่พิมพ์เอง/bookmark เก่า)', () => {
    for (const v of ['', 'HIGH', 'danger', undefined, null, 'all'])
      expect(['all', 'high', 'watch']).toContain(parseCustomerRiskFilter(v as string))
    expect(parseCustomerRiskFilter('zzz')).toBe('all')
    expect(parseCustomerRiskFilter('high')).toBe('high')
  })
})

describe('[blocker] ตัวเลขบนไทล์ต้องมาจากฟังก์ชันเดียวกับที่กรอง', () => {
  /** ชุดตัวอย่างที่ครอบทุก tier — ต้องมีทั้ง 4 ไม่งั้น mutation ไม่รู้สึก */
  const people = [
    rep({ shipped: 2, returned: 2, riskLevel: 'HIGH' }),
    rep({ shipped: 4, returned: 3, riskLevel: 'HIGH' }),
    rep({ shipped: 2, returned: 1, riskLevel: 'WATCH' }),
    rep({ shipped: 3, received: 3 }), // ok
    rep({ shipped: 1, received: 1 }), // new (ฐานไม่ถึง)
    rep({ shipped: 0 }), // new (ไม่เคยเปิดพัสดุ)
  ]
  const tiers = people.map((r) => classifyCustomerRiskTier(r))
  const countBy = (f: CustomerRiskFilter) => tiers.filter((t) => matchesRiskFilter(t, f)).length

  it('จำนวนที่นับได้ = จำนวนที่กรองได้ ทุกค่าของตัวกรอง', () => {
    for (const f of ['all', 'high', 'watch'] as const) {
      const filtered = tiers.filter((t) => matchesRiskFilter(t, f))
      expect(filtered.length, f).toBe(countBy(f))
    }
  })

  it('high กับ watch แยกกันจริง ไม่ใช่ high ⊂ watch', () => {
    expect(countBy('high')).toBe(2)
    expect(countBy('watch')).toBe(1)
    // ถ้าใครทำให้ watch รวม high ด้วย เลขจะเป็น 3 แล้วกดไทล์ "เฝ้าระวัง 3" เจอ 1
    expect(countBy('watch')).not.toBe(countBy('high') + 1)
  })

  it('all ต้องคืนครบทุกคน — รวมคนที่ยังไม่มีประวัติ', () => {
    expect(countBy('all')).toBe(people.length)
  })

  it('tier ที่ไม่ใช่ high/watch ต้องไม่ติดตัวกรองความเสี่ยงเลย', () => {
    expect(matchesRiskFilter('ok', 'high')).toBe(false)
    expect(matchesRiskFilter('ok', 'watch')).toBe(false)
    expect(matchesRiskFilter('new', 'high')).toBe(false)
    expect(matchesRiskFilter('new', 'watch')).toBe(false)
    expect(matchesRiskFilter('new', 'all')).toBe(true)
  })
})

/**
 * URL ต้องคง **ทั้งสองแกน** ไว้ด้วยกัน — สแกนซอร์สเพราะเป็นกฎเรื่องการประกอบ query
 * ไม่ใช่ค่าที่คำนวณได้ (รีโปไม่มี jsdom จึงยืนยันใน DOM ไม่ได้)
 */
describe('[blocker] pushWith ต้องไม่ลืมแกนที่ไม่ได้เปลี่ยน', () => {
  it('เขียน ?risk= จาก ref เสมอเมื่อผู้เรียกไม่ได้ส่งมา', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(process.cwd(), 'src/app/(paces)/seller/(dashboard)/customers/components/CustomerTable.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '')
    // ต้อง fallback ไปค่าปัจจุบัน ไม่ใช่ drop ทิ้งเมื่อไม่ได้ส่ง
    expect(src).toContain('next.risk ?? riskRef.current')
    expect(src).toMatch(/params\.set\('risk'/)
  })
})
