// agent-report-access.service.test.ts — ล็อกเส้นแบ่งของ "ใครเห็นผลงานของใครได้" (feature 00059)
//
// เหตุผลเดียวกับ `expense-access.service.test.ts` เป๊ะ: การ **ถอด guard เกินไปหนึ่งบรรทัด
// ไม่ทำให้อะไรพังเลย** — tsc เขียว build ผ่าน หน้าจอเปิดได้ปกติ สิ่งเดียวที่เปลี่ยนคือพนักงาน
// เห็นยอดขายรายคนของเพื่อนร่วมงานทั้งร้าน แล้วไม่มีใครรู้จนกว่าเจ้าของร้านจะบังเอิญเปิดเจอ
//
// 🛑 ธงที่ใช้คือ `Shop.staffCanViewFinance` ตัวเดียวกับ /expenses — ห้ามตั้งธงใหม่มาคุมของ
// ประเภทเดียวกัน ไม่งั้นเจ้าของร้านต้องไปปิดสองที่ถึงจะปิดได้จริง
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireActiveShop = vi.fn()
vi.mock('@/lib/shop-context', () => ({
  requireActiveShop: (...args: unknown[]) => requireActiveShop(...args),
}))

const { redactRevenue, resolveAgentReportAccess } = await import('./agent-report-access.service')

const session = { user: { id: 'u1', activeShopId: 's1' } }
const shop = (staffCanViewFinance: boolean) => ({ id: 's1', userId: 'owner1', staffCanViewFinance })

beforeEach(() => requireActiveShop.mockReset())

describe('resolveAgentReportAccess', () => {
  it('[blocker] ไม่มีร้าน → NO_SHOP', async () => {
    requireActiveShop.mockResolvedValue(null)
    expect(await resolveAgentReportAccess(session)).toEqual({ kind: 'NO_SHOP' })
  })

  it('[blocker] ไม่มี session (ไม่ได้ล็อกอิน) → NO_SHOP ไม่ใช่ FULL', async () => {
    requireActiveShop.mockResolvedValue({ shop: shop(true), role: 'OWNER' })
    // 🛑 เคสนี้สำคัญ: requireActiveShop คืนร้านมาได้ แต่ไม่มี userId ⇒ ห้ามผ่าน
    // ("มี session" ≠ "รู้ว่าเป็นใคร" — docs/conventions/session-exists-is-not-identity.md)
    expect(await resolveAgentReportAccess({ user: { id: null, activeShopId: 's1' } })).toEqual({
      kind: 'NO_SHOP',
    })
    expect(await resolveAgentReportAccess(null)).toEqual({ kind: 'NO_SHOP' })
  })

  it('[blocker] เจ้าของร้าน → FULL เสมอ ไม่สนใจธง staffCanViewFinance', async () => {
    for (const flag of [true, false]) {
      requireActiveShop.mockResolvedValue({ shop: shop(flag), role: 'OWNER' })
      const d = await resolveAgentReportAccess(session)
      expect(d.kind).toBe('FULL')
      expect(d.kind === 'FULL' && d.scopeToAgentUserId).toBeNull()
      expect(d.kind === 'FULL' && d.canSeeRevenue).toBe(true)
    }
  })

  it('[blocker] พนักงานที่เจ้าของเปิดสิทธิ์การเงินให้ → FULL', async () => {
    requireActiveShop.mockResolvedValue({ shop: shop(true), role: 'ADMIN' })
    const d = await resolveAgentReportAccess(session)
    expect(d.kind).toBe('FULL')
    expect(d.kind === 'FULL' && d.scopeToAgentUserId).toBeNull()
  })

  it('[blocker] พนักงานที่ยังไม่ได้เปิดสิทธิ์ → SELF · เห็นเฉพาะตัวเอง · ไม่เห็นเงิน', async () => {
    requireActiveShop.mockResolvedValue({ shop: shop(false), role: 'ADMIN' })
    const d = await resolveAgentReportAccess(session)
    expect(d.kind).toBe('SELF')
    expect(d.kind === 'SELF' && d.scopeToAgentUserId).toBe('u1')
    expect(d.kind === 'SELF' && d.canSeeRevenue).toBe(false)
  })

  it('[blocker] fail-closed: ธงที่ไม่ใช่ true แท้ ๆ ต้องตกเป็น SELF', async () => {
    // ค่าที่ "ไม่ใช่ false แต่ก็ไม่ใช่ true" (ข้อมูลเพี้ยน/คอลัมน์ใหม่ที่ยังไม่ backfill)
    // ต้องไม่หลุดเป็น FULL — เกณฑ์คือ `=== true` ไม่ใช่ `!== false`
    for (const weird of [undefined, null, 0, '']) {
      requireActiveShop.mockResolvedValue({
        shop: { id: 's1', userId: 'owner1', staffCanViewFinance: weird },
        role: 'ADMIN',
      })
      expect((await resolveAgentReportAccess(session)).kind).toBe('SELF')
    }
  })
})

describe('redactRevenue', () => {
  const rows = [{ agentUserId: 'a1', revenue: 1200 }]

  it('[blocker] FULL → ตัวเลขเงินผ่านไปครบ', async () => {
    requireActiveShop.mockResolvedValue({ shop: shop(true), role: 'OWNER' })
    const access = await resolveAgentReportAccess(session)
    expect(redactRevenue(rows, access)[0].revenue).toBe(1200)
  })

  it('[blocker] SELF → ตัวเลขเงินต้องเป็น null ไม่ใช่ 0', async () => {
    requireActiveShop.mockResolvedValue({ shop: shop(false), role: 'ADMIN' })
    const access = await resolveAgentReportAccess(session)
    // 🛑 0 แปลว่า "ขายไม่ได้เลย" ซึ่งเป็นคำโกหก · null = "คุณไม่มีสิทธิ์เห็น" ⇒ จอซ่อนคอลัมน์ได้
    expect(redactRevenue(rows, access)[0].revenue).toBeNull()
  })

  it('[blocker] NO_SHOP → ตัดเงินเช่นกัน (fail-closed)', async () => {
    requireActiveShop.mockResolvedValue(null)
    const access = await resolveAgentReportAccess(session)
    expect(redactRevenue(rows, access)[0].revenue).toBeNull()
  })
})

/**
 * mutation ที่ใช้พิสูจน์ (รันแล้วต้องแดง):
 *  1. `active.shop.staffCanViewFinance === true` → `!== false`  → เคส fail-closed แดง
 *  2. ลบสาขา SELF ทิ้งแล้วคืน FULL เสมอ                        → 2 เคสแดง
 *  3. `redactRevenue` คืน 0 แทน null                            → เคส SELF แดง
 *  4. ถอด `if (!active || !userId)` เหลือ `if (!active)`        → เคส "ไม่มี session" แดง
 */
