/**
 * ExpensesPage — /expenses (feature 00016 Expense & Cost Tracking, Unit 5A)
 *
 * Design Spec: docs/20 - Features/00016 - Expense & Cost Tracking/UX-Design-Spec.md §A
 * API: docs/20 - Features/00016 - Expense & Cost Tracking/API.md §4.1-4.5
 *
 * Base (page shell + fail-closed gate pattern): src/app/(paces)/seller/(dashboard)/inventory/page.tsx
 *   - session guard + PageBreadcrumb: pattern เดียวกับ inventory/page.tsx / sales/page.tsx
 *   - no-shop card markup (NO_SHOP): inventory/page.tsx:70-91 คัดลอกตรง (icon="building-store", CTA /shop)
 *   - PACKAGE_LOCKED/STAFF_NOT_ALLOWED card: ExpenseLockedCard.tsx (variant prop, Base เดียวกันบรรทัด 70-91)
 *
 * 🛑 TFR-007 fail-closed (ตรง SDS §NFR-Security): resolveExpenseAccess() ต้อง resolve "GRANTED" ก่อน
 * เท่านั้นที่ query getPnlReport/listExpenses จริง — ไม่มี query ข้อมูลธุรกิจใด ๆ ในสาขา NO_SHOP/PACKAGE_LOCKED/
 * STAFF_NOT_ALLOWED ด้านล่าง (กัน data leak ผ่าน timing/error message)
 */

import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { resolveExpenseAccess } from '@/services/expense-access.service'
import { listExpenses, serializeExpense, hasAnyExpense } from '@/services/expense.service'
import { getPnlReport } from '@/services/pnl.service'
import { resolveDateRange } from '@/lib/date-range'
import ExpenseLockedCard from './components/ExpenseLockedCard'
import ExpenseWorkspace from './components/ExpenseWorkspace'

export const metadata: Metadata = { title: 'ค่าใช้จ่าย' }

export default async function ExpensesPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  // fail-closed (TFR-007) — resolve decision ก่อนถึง Promise.all ใด ๆ ด้านล่าง
  const decision = await resolveExpenseAccess(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )

  if (decision.kind === 'NO_SHOP') {
    // ⚠️ ห้าม query stock/expense เพิ่มเติมในสาขานี้ (gate ไม่ leak data) — มักไม่เกิดจริง (auto-create
    // Personal shop) แต่ต้อง handle ตาม UX-Design-Spec.md §Edge states "NO_SHOP"
    return (
      <>
        <PageBreadcrumb title="ค่าใช้จ่าย" trail={[{ label: 'ธุรกิจ' }]} />
        <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
          <Icon icon="building-store" width={64} height={64} className="text-warning mx-auto mb-4" aria-hidden="true" />
          <h2 className="text-dark mb-2 text-xl font-bold">ยังไม่มีร้านค้า</h2>
          <p className="text-default-400 mb-6">เปิดร้านก่อนนะคะ ถึงจะบันทึกค่าใช้จ่ายได้</p>
          <Link
            href="/shop"
            className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
          >
            <Icon icon="plus" width={18} height={18} />
            เปิดร้าน
          </Link>
        </div>
      </>
    )
  }

  if (decision.kind === 'PACKAGE_LOCKED' || decision.kind === 'STAFF_NOT_ALLOWED') {
    return (
      <>
        <PageBreadcrumb title="ค่าใช้จ่าย" trail={[{ label: 'ธุรกิจ' }]} />
        <ExpenseLockedCard variant={decision.kind} />
      </>
    )
  }

  // GRANTED — ผ่าน gate แล้วเท่านั้นถึง query ข้อมูลจริง (default range 'today' ตาม spec)
  // listExpenses ผูกช่วงเดียวกับรายงานเสมอ — ถ้าดึงทั้งหมดเหมือนเดิม การ์ดแยกหมวด/สรุปเร็ว
  // จะคิดจากคนละฐานกับตัวเลข "ค่าใช้จ่าย" บนการ์ด P&L แล้วขัดกันเองให้ผู้ใช้เห็น
  const range = resolveDateRange('today')
  const [report, expenses, everRecorded] = await Promise.all([
    getPnlReport(decision.shop.id, range),
    listExpenses(decision.shop.id, { range: range.expenseRange }),
    hasAnyExpense(decision.shop.id),
  ])

  return (
    <>
      <PageBreadcrumb title="ค่าใช้จ่าย" trail={[{ label: 'ธุรกิจ' }]} />
      <ExpenseWorkspace
        initialReport={report}
        initialExpenses={expenses.map(serializeExpense)}
        hasAnyExpenseEver={everRecorded}
      />
    </>
  )
}
