/**
 * [blocker] ทางเข้าค่าใช้จ่ายของพนักงานร้านบริการ (00086 FR-018 · ลูกค้าแจ้ง 2026-11-05 "ติ๊กแล้วแต่เพิ่มไม่ได้")
 *
 * ต้นเหตุ: สิทธิ์ถูกแล้ว แต่ทางเข้ามีแค่การ์ดใต้กราฟบนหน้าแรก · `/expenses` เป็น F1 จึงไม่มีเมนูและเปิดแล้วเจอหน้าไม่มีสิทธิ์
 * mutation ที่ต้องแดง: เติมเมนูทั้งที่ show=false · ร้านอื่น/คนไม่ได้ติ๊กเห็นแถว · เจ้าของถูกส่งไป /expenses/mine ·
 * ข้อความไม่มีสิทธิ์รั่วไปฝั่งเจ้าของ/5xx · การ์ดกลับไปอยู่ใต้ยอดขาย
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import ShopQuickLinks from '@/app/(paces)/seller/(dashboard)/shop/components/ShopQuickLinks'
import { showsStaffExpenseCard } from '../dashboard-money'
import { EXPENSE_RETRY_ERROR, expenseWriteErrorMessage, STAFF_EXPENSE_NO_ACCESS_ERROR } from '../expense'
import { canSeePage, shopQuickLinks } from '../role-nav'
import { applyStaffExpenseMenu, resolveVisibleSellerMenu, sellerMenuItems, STAFF_EXPENSE_MENU_ITEM } from '../seller-menu'
import { effectiveRoles, type ShopRole } from '../shop-permissions'
import type { MenuItemType } from '@/types'

const SVC = { kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' }
const read = (f: string) => readFileSync(join(process.cwd(), 'src/app/(paces)/seller/(dashboard)', f), 'utf8')

const urls = (items: MenuItemType[]): string[] =>
  items.flatMap((i) => [...(i.url ? [i.url] : []), ...urls(i.children ?? [])])

/** เมนูจริงของบทบาทนี้ ก่อนเติมเมนูพนักงาน */
function visibleMenu(roles: ShopRole[], vertical = 'SERVICE_QUEUE') {
  return resolveVisibleSellerMenu(sellerMenuItems, {
    entitlement: { status: 'NOT_SUBSCRIBED', package: null },
    staff: { kind: 'BUSINESS', role: 'ADMIN', roles },
    ownsShop: false,
    shop: { kind: 'BUSINESS', vertical, isPrimaryOwner: false, reportSettings: null },
    hidePayments: false,
    hidePaidFeatures: false,
    offerIap: true,
  })
}

describe('applyStaffExpenseMenu', () => {
  it('[blocker] show=false ไม่แตะเมนู (คืนชุดเดิม)', () => {
    const menu = visibleMenu(['MANAGER'])
    expect(applyStaffExpenseMenu(menu, false)).toBe(menu)
  })

  it('[blocker] ทุกบทบาทพนักงานที่ได้ธงมีเมนู และเปิดหน้าได้จริง · เมนูเจ้าของยังไม่โผล่', () => {
    for (const role of ['MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN'] as ShopRole[]) {
      const out = urls(applyStaffExpenseMenu(visibleMenu([role]), true))
      expect(out, role).toContain('/expenses/mine')
      expect(out, role).not.toContain('/expenses')
      expect(canSeePage('/expenses/mine', [role]), role).toBe(true)
    }
  })

  it('วางต่อจาก "ติดตามลูกค้า" ถ้ามี · เติมครั้งเดียว · ไม่แก้ SSOT ของเมนูลัด', () => {
    const items: MenuItemType[] = [{ slug: 'g', label: 'g', children: [{ slug: 'seller:customers', url: '/customers', label: 'c' }, { slug: 'seller:follow-ups', url: '/follow-ups', label: 'f' }, { slug: 'x', url: '/x', label: 'x' }] }]
    const children = applyStaffExpenseMenu(items, true)[0].children ?? []
    expect(children.map((c) => c.slug)).toEqual(['seller:customers', 'seller:follow-ups', STAFF_EXPENSE_MENU_ITEM.slug, 'x'])
    expect(urls(sellerMenuItems)).not.toContain('/expenses/mine')
  })

  it('ไม่มีกลุ่มลูกค้า = ท้ายกลุ่มสุดท้าย · ไม่มีกลุ่มเลย = รายการเดี่ยว', () => {
    const groups: MenuItemType[] = [{ slug: 'a', label: 'a', children: [{ slug: 'p', url: '/p', label: 'p' }] }, { slug: 'b', url: '/b', label: 'b' }]
    expect((applyStaffExpenseMenu(groups, true)[0].children ?? []).map((c) => c.slug)).toEqual(['p', STAFF_EXPENSE_MENU_ITEM.slug])
    expect(applyStaffExpenseMenu([{ slug: 'b', url: '/b', label: 'b' }], true).map((i) => i.slug)).toEqual(['b', STAFF_EXPENSE_MENU_ITEM.slug])
  })
})

describe('ใครได้เมนู (ด่านเดียวกับการ์ดหน้าแรก)', () => {
  const show = (shop: { kind: string; vertical: string }, role: string, roles: string[], flag: boolean) =>
    showsStaffExpenseCard(shop, role, effectiveRoles(shop, role, roles), { canRecordExpense: flag })

  it('[blocker] ผู้ดูแลร้านบริการที่ได้ติ๊ก (เคสลูกค้า) = ได้', () => {
    expect(show(SVC, 'ADMIN', ['MANAGER'], true)).toBe(true)
  })
  it('[blocker] ไม่ได้ติ๊ก · เจ้าของ · ร้านสินค้า · ร้านที่พัก = ไม่ได้ แม้ธงค้าง', () => {
    expect(show(SVC, 'ADMIN', ['MANAGER'], false)).toBe(false)
    expect(show(SVC, 'OWNER', [], true)).toBe(false)
    expect(show({ kind: 'BUSINESS', vertical: 'ONLINE_SALES' }, 'ADMIN', ['MANAGER'], true)).toBe(false)
    expect(show({ kind: 'BUSINESS', vertical: 'LODGING' }, 'ADMIN', ['MANAGER'], true)).toBe(false)
  })
})

describe('แถวใน จัดการร้าน', () => {
  const render = (visible: string[]) =>
    renderToStaticMarkup(<ShopQuickLinks visibleUrls={new Set(visible)} hidePayments={false} offerIap lineReports={null} />)

  it('เห็นตามเมนูจริงเท่านั้น', () => {
    expect(shopQuickLinks(new Set(['/expenses/mine']))).toEqual(['/expenses/mine'])
    expect(shopQuickLinks(new Set(['/settings']))).not.toContain('/expenses/mine')
  })
  it('[blocker] มีเมนู = มีแถวพาไป /expenses/mine · ไม่มีเมนู = ไม่มีแถว · ซ่อนจ่ายเงินแล้วยังอยู่ (ไม่ใช่ทางจ่ายเงิน)', () => {
    const html = render(['/expenses/mine'])
    expect(html).toContain('href="/expenses/mine"')
    expect(html).toContain('บันทึกค่าใช้จ่ายหน้างานของคุณ')
    expect(render(['/settings'])).not.toContain('/expenses/mine')
    expect(
      renderToStaticMarkup(<ShopQuickLinks visibleUrls={new Set(['/expenses/mine'])} hidePayments offerIap={false} lineReports={null} />),
    ).toContain('href="/expenses/mine"')
  })
  it('"ตั้งค่าแอป" ยังอยู่ท้ายสุด (แถวใหม่มาจากรายการข้างบน)', () => {
    const src = read('shop/components/ShopQuickLinks.tsx')
    expect(src.indexOf('<AppSettingsRow />')).toBeGreaterThan(src.lastIndexOf('</Link>'))
  })
})

describe('/expenses พาคนที่ได้ธงไปหน้าของตัวเอง', () => {
  const page = read('expenses/page.tsx')
  it('[blocker] ด่านเดียวกับหน้า mine · อยู่ในทางที่ถูกปฏิเสธเท่านั้น · หน้าไม่มีสิทธิ์ยังอยู่สำหรับคนอื่น', () => {
    const denied = page.indexOf('if (!gate.ok) {\n    // 00086')
    const redirectAt = page.indexOf("redirect('/expenses/mine')")
    const card = page.indexOf('<NoPermissionCard capability="F1"')
    expect(denied).toBeGreaterThan(-1)
    expect(redirectAt).toBeGreaterThan(denied)
    expect(card).toBeGreaterThan(redirectAt)
    expect(page.slice(denied, redirectAt)).toContain('showsStaffExpenseCard(')
    expect(page).toContain('const decision = { shop: gate.active.shop }')
  })
  it('ไม่วน: หน้า mine ส่งกลับ /expenses เฉพาะผู้ถือ F1 ซึ่ง showsStaffExpenseCard ไม่ผ่าน', () => {
    expect(read('expenses/mine/page.tsx')).toContain("if (can(roles, 'F1')) redirect('/expenses')")
    expect(showsStaffExpenseCard(SVC, 'ADMIN', ['OWNER'], { canRecordExpense: true })).toBe(false)
  })
})

describe('expenseWriteErrorMessage', () => {
  it('[blocker] พนักงาน 403 = บอกเหตุผล+ทางแก้', () => {
    expect(expenseWriteErrorMessage('mine', 403)).toBe(STAFF_EXPENSE_NO_ACCESS_ERROR)
    expect(STAFF_EXPENSE_NO_ACCESS_ERROR).toContain('ขอให้เจ้าของร้านเปิดสิทธิ์')
  })
  it('[blocker] 5xx · 400 · 409 · ฝั่งเจ้าของ = ข้อความเดิม', () => {
    for (const s of [400, 409, 500]) expect(expenseWriteErrorMessage('mine', s)).toBe(EXPENSE_RETRY_ERROR)
    expect(expenseWriteErrorMessage('shop', 403)).toBe(EXPENSE_RETRY_ERROR)
  })
  it('โมดัลใช้ตัวนี้ทั้งตอนบันทึกและตอนลบ', () => {
    const modal = read('expenses/components/ExpenseFormModal.tsx')
    expect(modal.match(/expenseWriteErrorMessage\(scope, res\.status\)/g)).toHaveLength(2)
  })
})

describe('การ์ดบนหน้าแรก (มือถือ)', () => {
  const cc = read('dashboard/components/CommandCenter.tsx')
  it('[blocker] บทบาททั่วไป: เหนือกราฟยอดขาย · ฝ่ายช่างล้วน: ถัดจากงานวันนี้ · แสดงครั้งเดียวต่อกรณี', () => {
    const top = cc.indexOf('{!blocks.todayJobs && staffExpenseCount !== null && <StaffExpenseCard')
    const sales = cc.indexOf('<SalesChartCard')
    const jobs = cc.indexOf('{blocks.todayJobs && <TodayJobs')
    const afterJobs = cc.indexOf('{blocks.todayJobs && staffExpenseCount !== null && <StaffExpenseCard')
    expect(top).toBeGreaterThan(-1)
    expect(top).toBeLessThan(sales)
    expect(afterJobs).toBeGreaterThan(jobs)
    expect(cc.match(/<StaffExpenseCard /g)).toHaveLength(2)
  })
})
