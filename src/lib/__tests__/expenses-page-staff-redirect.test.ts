/**
 * [blocker] รันหน้า /expenses จริงในทางที่ถูกปฏิเสธ (00086 FR-018) — ไม่ใช่แค่อ่านซอร์ส
 * พนักงานร้านบริการที่ได้ธง → ไป /expenses/mine · คนอื่นทั้งหมด → หน้าไม่มีสิทธิ์เดิม · ไม่มีร้าน = ไม่แตะแถวสมาชิก
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REDIRECT = vi.hoisted(() => ({ fn: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`) }) }))
vi.mock('next/navigation', () => ({ redirect: REDIRECT.fn }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'u1', activeShopId: 's1' } })) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
const gate = vi.hoisted(() => ({ gatePage: vi.fn() }))
vi.mock('@/lib/shop-capability', () => gate)
const ctx = vi.hoisted(() => ({ requireActiveShop: vi.fn() }))
vi.mock('@/lib/shop-context', () => ctx)
vi.mock('@/lib/viewer-roles', () => ({ viewerRolesOf: vi.fn(async () => ['MANAGER']) }))
vi.mock('@/services/expense.service', () => ({ listExpenses: vi.fn(), serializeExpense: vi.fn(), hasAnyExpense: vi.fn() }))
vi.mock('@/services/pnl.service', () => ({ getPnlReport: vi.fn() }))
vi.mock('@/components/PageBreadcrumb', () => ({ default: () => null }))
vi.mock('../../app/(paces)/seller/(dashboard)/expenses/components/ExpenseWorkspace', () => ({ default: () => null }))

import ExpensesPage from '@/app/(paces)/seller/(dashboard)/expenses/page'

const active = (vertical: string, role: string, roles: string[], canRecordExpense: boolean) => ({
  kind: 'BUSINESS', role, roles, canRecordExpense, shop: { id: 's1', vertical },
})
const open = () => ExpensesPage({ searchParams: Promise.resolve({}) })

beforeEach(() => {
  REDIRECT.fn.mockClear()
  ctx.requireActiveShop.mockReset()
  gate.gatePage.mockReset()
  gate.gatePage.mockResolvedValue({ ok: false, reason: 'FORBIDDEN_ROLE' })
})

describe('/expenses เมื่อไม่มีสิทธิ์การเงิน', () => {
  it('[blocker] ทุกบทบาทพนักงานร้านบริการที่ได้ธง → /expenses/mine', async () => {
    for (const r of ['MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN']) {
      ctx.requireActiveShop.mockResolvedValue(active('SERVICE_QUEUE', 'ADMIN', [r], true))
      await expect(open(), r).rejects.toThrow('REDIRECT:/expenses/mine')
    }
  })
  it('[blocker] ไม่ได้ติ๊ก · ร้านสินค้า · ร้านที่พัก → หน้าไม่มีสิทธิ์ ไม่ redirect', async () => {
    for (const a of [active('SERVICE_QUEUE', 'ADMIN', ['MANAGER'], false), active('ONLINE_SALES', 'ADMIN', ['MANAGER'], true), active('LODGING', 'ADMIN', ['MANAGER'], true)]) {
      ctx.requireActiveShop.mockResolvedValue(a)
      expect(await open()).toBeTruthy()
    }
    expect(REDIRECT.fn).not.toHaveBeenCalled()
  })
  it('หาแถวร้านไม่ได้ → หน้าไม่มีสิทธิ์ ไม่พัง', async () => {
    ctx.requireActiveShop.mockResolvedValue(null)
    expect(await open()).toBeTruthy()
    expect(REDIRECT.fn).not.toHaveBeenCalled()
  })
  it('ไม่มีร้าน (NO_SHOP) → การ์ดเปิดร้านเดิม ไม่แตะแถวสมาชิก', async () => {
    gate.gatePage.mockResolvedValue({ ok: false, reason: 'NO_SHOP' })
    expect(await open()).toBeTruthy()
    expect(ctx.requireActiveShop).not.toHaveBeenCalled()
  })
})
