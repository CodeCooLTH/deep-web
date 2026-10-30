'use client'

/**
 * MyExpenses — "ค่าใช้จ่ายที่ฉันบันทึก" ของพนักงานร้านบริการ (00086 · BRD FR-018/019)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx (แบบ "Links and Buttons":
 *   ul.divide-y + แถวเป็น <button> hover:bg-default-100 · ยกโครงทั้งดุ้น เปลี่ยนเนื้อหาในแถว)
 *   in-repo precedent: ../../components/ExpenseList.tsx (avatar หมวด · ชื่อหมวด · หมายเหตุ · จำนวนเงิน)
 *
 * 🛑 แสดงเฉพาะแถวที่ได้รับมา (ของตัวเองจาก /api/expenses/mine) — ไม่มียอดรวม/แยกหมวด/กำไร โดยตั้งใจ (ไม่มี F1)
 * แตะแถว = เปิด ExpenseFormModal โหมดแก้ไข (ลบอยู่ในโมดัล ยืนยันด้วย pacesConfirm.danger ก่อน)
 * ทุกการเขียนผ่าน scope='mine' → /api/expenses/mine/{id} (เส้นทางเจ้าของ 403 สำหรับผู้ใช้กลุ่มนี้อยู่แล้ว)
 */
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { cn } from '@/utils/helpers'
import { formatBaht } from '@/lib/format-money'
import { formatDateTH } from '@/lib/format-date'
import {
  EXPENSE_CATEGORY_AVATAR,
  EXPENSE_CATEGORY_ICON,
  EXPENSE_CATEGORY_LABEL_TH,
  expenseApi,
  type ExpenseCategory,
} from '@/lib/expense'
import type { SerializedExpense } from '@/services/expense.service'
import SellerEmptyState from '../../../_shared/SellerEmptyState'
import ExpenseFormModal from '../../components/ExpenseFormModal'

type ModalState = { mode: 'create' } | { mode: 'edit'; editing: SerializedExpense }

export default function MyExpenses({ initialExpenses }: { initialExpenses: SerializedExpense[] }) {
  const [expenses, setExpenses] = useState<SerializedExpense[]>(initialExpenses)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [loading, setLoading] = useState(false)

  // หลังบันทึก/แก้/ลบ — ดึงรายการของฉันใหม่ทั้งก้อน (ไม่ประกอบแถวเองจากผล PATCH ที่ไม่มีชื่อผู้บันทึก)
  const reload = async () => {
    setLoading(true)
    try {
      const res = await fetch(expenseApi('mine').collection, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      setExpenses((await res.json()) as SerializedExpense[])
    } catch {
      pacesToast.error('โหลดรายการใหม่ไม่สำเร็จ กรุณารีเฟรชหน้า')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-default-700 flex items-start gap-1.5 text-sm">
        <Icon icon="lock" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
        <span>เห็นเฉพาะรายการที่คุณบันทึก · ยอดรวม กำไร และรายงาน เห็นได้เฉพาะเจ้าของร้าน</span>
      </p>

      <button
        type="button"
        onClick={() => setModal({ mode: 'create' })}
        className="btn bg-primary hover:bg-primary-hover inline-flex min-h-11 w-full items-center justify-center gap-1.5 text-white sm:w-auto"
      >
        <Icon icon="plus" aria-hidden="true" />
        เพิ่มค่าใช้จ่าย
      </button>

      <div className="card">
        <div className="card-header">
          <h4 className="card-title flex items-center gap-2">
            ที่ฉันบันทึก
            <span className="badge bg-light text-default-700">{expenses.length}</span>
          </h4>
        </div>
        <div className={cn('card-body transition-opacity', loading && 'opacity-50')}>
          {expenses.length === 0 ? (
            <SellerEmptyState
              compact
              icon="receipt-off"
              title="ยังไม่มีรายการ"
              description="กด เพิ่มค่าใช้จ่าย เมื่อจ่ายเงินหน้างาน แล้วเจ้าของร้านจะเห็นรายการนี้"
            />
          ) : (
            <ul className="border-default-300 divide-default-200 divide-y rounded border">
              {expenses.map((expense) => {
                const category = expense.category as ExpenseCategory
                const label = EXPENSE_CATEGORY_LABEL_TH[category] ?? expense.category
                return (
                  <li key={expense.id}>
                    <button
                      type="button"
                      onClick={() => setModal({ mode: 'edit', editing: expense })}
                      aria-label={`แก้ไข ${label} ${formatBaht(expense.amount)}`}
                      className="hover:bg-default-100 focus:bg-default-100 flex min-h-11 w-full items-center gap-3 px-4.75 py-3 text-start"
                    >
                      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', EXPENSE_CATEGORY_AVATAR)}>
                        <Icon icon={EXPENSE_CATEGORY_ICON[category] ?? 'dots'} className="text-lg" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-default-900 block font-semibold">{label}</span>
                        <span className="text-default-700 block truncate text-xs">
                          {formatDateTH(expense.expenseDate)}
                          {expense.note ? ` · ${expense.note}` : ''}
                        </span>
                      </span>
                      <span className="text-default-900 shrink-0 font-bold">{formatBaht(expense.amount)}</span>
                      <Icon icon="chevron-right" className="text-default-500 shrink-0 text-base" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {modal && (
        <ExpenseFormModal
          mode={modal.mode}
          editing={modal.mode === 'edit' ? modal.editing : null}
          scope="mine"
          onClose={() => setModal(null)}
          onMutated={reload}
        />
      )}
    </div>
  )
}
