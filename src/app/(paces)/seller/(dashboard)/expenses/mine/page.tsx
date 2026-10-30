/**
 * MyExpensesPage — /expenses/mine "ค่าใช้จ่ายที่ฉันบันทึก" ของพนักงานร้านบริการ (00086 · BRD FR-018/019)
 *
 * Base (page shell): theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx
 *   in-repo precedent: ../page.tsx (session guard + PageBreadcrumb) · การ์ดล็อกยกจาก _shared/NoPermissionCard.tsx
 *
 * ด่าน (fail-closed · อ่านแถวสมาชิกสดผ่าน requireActiveShop):
 *  - เจ้าของ (มี F1) → /expenses หน้าเต็มของเจ้าของ (ไม่ใช่หน้านี้)
 *  - showsStaffExpenseCard = ร้านบริการ ∧ ADMIN ∧ ธง canRecordExpense — ตัวเดียวกับการ์ดหน้าแรกและด่านของ /api/expenses/mine
 *  - ไม่ผ่าน = การ์ดล็อก ไม่ query ค่าใช้จ่ายเลย
 * 🛑 query เฉพาะแถวที่ผู้ใช้คนนี้บันทึก (createdByUserId) ไม่มียอดรวม/รายงานใด ๆ
 */
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { requireActiveShop } from '@/lib/shop-context'
import { sessionUserId } from '@/lib/session-user'
import { can, effectiveRoles } from '@/lib/shop-permissions'
import { showsStaffExpenseCard } from '@/lib/dashboard-money'
import { listExpenses, serializeExpense } from '@/services/expense.service'
import MyExpenses from './components/MyExpenses'

export const metadata: Metadata = { title: 'ค่าใช้จ่าย' }

export default async function MyExpensesPage() {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!userId) redirect('/auth/sign-in')

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  if (!active) redirect('/dashboard')

  const shopRef = { kind: active.kind, vertical: active.shop.vertical }
  const roles = effectiveRoles(shopRef, active.role, active.roles)
  // เจ้าของเห็นค่าใช้จ่ายทั้งร้านที่ /expenses อยู่แล้ว — ลิงก์เก่า/พิมพ์ตรงมาที่นี่ส่งต่อไปหน้าเต็ม
  if (can(roles, 'F1')) redirect('/expenses')

  if (!showsStaffExpenseCard(shopRef, active.role, roles, { canRecordExpense: active.canRecordExpense === true })) {
    return (
      <>
        <PageBreadcrumb title="ค่าใช้จ่าย" trail={[{ label: 'ธุรกิจ' }]} />
        <div className="card mx-auto max-w-2xl rounded-xl p-6 text-center md:p-10">
          <Icon icon="lock" width={64} height={64} className="text-default-700 mx-auto mb-4" aria-hidden="true" />
          <h2 className="text-dark mb-2 text-xl font-bold">ยังไม่ได้เปิดให้บันทึกค่าใช้จ่าย</h2>
          <p className="text-default-700">ถ้าต้องการบันทึกค่าใช้จ่ายหน้างาน ขอให้เจ้าของร้านเปิดสิทธิ์นี้ให้ได้เลย</p>
        </div>
      </>
    )
  }

  const expenses = await listExpenses(active.shop.id, { createdByUserId: userId })

  return (
    <>
      <PageBreadcrumb title="ค่าใช้จ่าย" trail={[{ label: 'ธุรกิจ' }]} />
      <MyExpenses initialExpenses={expenses.map(serializeExpense)} />
    </>
  )
}
