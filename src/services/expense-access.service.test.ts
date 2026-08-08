// expense-access.service.test.ts — ล็อกเส้นแบ่งของ "ใครเห็นข้อมูลการเงินได้"
//
// เทสชุดนี้เขียนขึ้นตอนถอด Business Package gate (D-EXT-1, 2026-08-07) โดยมีเป้าหมายเดียว:
// จับกรณีที่มีคน "ถอดเกิน" ในอนาคต
//
// การถอด guard ต่างจากการเพิ่มฟีเจอร์ตรงที่ **ถอดเกินไปหนึ่งบรรทัดแล้วไม่มีอะไรพัง** —
// tsc เขียว build ผ่าน หน้าจอเปิดได้ปกติ สิ่งเดียวที่เปลี่ยนคือพนักงานที่เจ้าของร้าน
// ตั้งใจไม่ให้เห็นต้นทุน/กำไร กลับเห็นได้ทั้งหมด และจะไม่มีใครรู้จนกว่าเจ้าของร้านจะบังเอิญ
// เปิดเจอเอง เทสจึงเป็นด่านเดียวที่ส่งเสียงได้ (เหตุผลเดียวกับ order-revenue.test.ts)

import { describe, expect, it, vi, beforeEach } from 'vitest'

const requireActiveShop = vi.fn()
vi.mock('@/lib/shop-context', () => ({
  requireActiveShop: (...args: unknown[]) => requireActiveShop(...args),
}))

const { resolveExpenseAccess } = await import('./expense-access.service')

const session = { user: { id: 'u1', activeShopId: 's1' } }
const shop = (staffCanViewFinance: boolean) => ({ id: 's1', userId: 'owner1', staffCanViewFinance })

beforeEach(() => requireActiveShop.mockReset())

describe('resolveExpenseAccess', () => {
  it('ไม่มีร้าน → NO_SHOP', async () => {
    requireActiveShop.mockResolvedValue(null)
    expect(await resolveExpenseAccess(session)).toEqual({ kind: 'NO_SHOP' })
  })

  it('เจ้าของร้าน → GRANTED เสมอ ไม่สนใจ toggle', async () => {
    for (const flag of [true, false]) {
      requireActiveShop.mockResolvedValue({ shop: shop(flag), role: 'OWNER', locked: false })
      const d = await resolveExpenseAccess(session)
      expect(d.kind).toBe('GRANTED')
    }
  })

  it('พนักงานที่เจ้าของเปิดสิทธิ์ให้ → GRANTED', async () => {
    requireActiveShop.mockResolvedValue({ shop: shop(true), role: 'ADMIN', locked: false })
    const d = await resolveExpenseAccess(session)
    expect(d.kind).toBe('GRANTED')
    if (d.kind === 'GRANTED') expect(d.role).toBe('ADMIN')
  })

  // ── เทสเชิงลบ: สองข้อนี้คือเหตุผลที่ไฟล์นี้มีอยู่ ────────────────────────────────
  it('[blocker] พนักงานที่ toggle ปิด → STAFF_NOT_ALLOWED — ห้ามผ่านเด็ดขาด', async () => {
    // ค่า default ของ Shop.staffCanViewFinance คือ false แปลว่านี่คือ "ร้านทั่วไปที่ไม่เคย
    // ตั้งค่าอะไรเลย" ไม่ใช่เคสหายาก — ถ้าเคสนี้กลายเป็น GRANTED เมื่อไหร่ แปลว่าพนักงาน
    // ทุกร้านในระบบเห็นกำไร-ขาดทุนของเจ้าของร้านได้ทันทีโดยไม่มีใครสั่ง
    requireActiveShop.mockResolvedValue({ shop: shop(false), role: 'ADMIN', locked: false })
    expect(await resolveExpenseAccess(session)).toEqual({ kind: 'STAFF_NOT_ALLOWED' })
  })

  it('[blocker] ร้านที่ถูกล็อกจากแพ็กเกจ (packageLockedAt) → ต้องเข้าถึงได้ ไม่ใช่ถูกบล็อก', async () => {
    // กลับทิศจากพฤติกรรมเดิมโดยตั้งใจ (D-EXT-1): `locked` มาจาก Shop.packageLockedAt ล้วน ๆ
    // ซึ่งเป็นเรื่อง "ต่ออายุไม่ผ่าน/โควตาเกิน" = billing ไม่ใช่ความปลอดภัย
    // ถ้าเทสนี้แดง แปลว่ามีคนเอาเงื่อนไขการจ่ายเงินกลับเข้ามาในเส้นทางสิทธิ์อีกรอบ
    requireActiveShop.mockResolvedValue({ shop: shop(false), role: 'OWNER', locked: true })
    expect((await resolveExpenseAccess(session)).kind).toBe('GRANTED')
  })

  it('ไม่มี variant PACKAGE_LOCKED หลงเหลืออยู่ในผลลัพธ์ที่เป็นไปได้', async () => {
    // กันการ "เอากลับมาแบบเงียบ ๆ" — union มี 3 ค่าเท่านั้นหลัง D-EXT-1
    const cases = [
      { shop: shop(false), role: 'ADMIN', locked: true },
      { shop: shop(true), role: 'ADMIN', locked: true },
      { shop: shop(false), role: 'OWNER', locked: true },
    ]
    for (const c of cases) {
      requireActiveShop.mockResolvedValue(c)
      const kind = (await resolveExpenseAccess(session)).kind
      expect(['GRANTED', 'NO_SHOP', 'STAFF_NOT_ALLOWED']).toContain(kind)
    }
  })
})
