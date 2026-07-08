'use client'

/**
 * ExpenseList — ตารางรายการค่าใช้จ่าย (feature 00016 Expense & Cost Tracking, Unit 5A)
 *
 * Base:
 *   - table markup: docs/system/ui-guideline/paces-component-reference.md §5 Table
 *     (.table-wrapper > .table — ไม่ใช้ TanStack DataTable ตาม design decision "list เล็ก ไม่ต้อง
 *     filter/search/pagination")
 *   - row action icons (แก้ไข/ลบ): src/app/(paces)/seller/(dashboard)/products/components/ProductsListing.tsx:194-220
 *     (btn btn-icon btn-sm border border-default-300 + Icon icon="pencil"/"trash", inline ไม่ dropdown)
 *   - ลบ confirm: src/lib/paces-swal.ts (pacesConfirm.danger)
 *   - empty state: src/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState.tsx (icon="receipt-off", compact)
 */
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { EXPENSE_CATEGORY_LABEL_TH, EXPENSE_CATEGORY_ICON, type ExpenseCategory } from '@/lib/expense'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import type { SerializedExpense } from '@/services/expense.service'

type Props = {
  expenses: SerializedExpense[]
  onEdit: (expense: SerializedExpense) => void
  onDeleted: () => void
}

export default function ExpenseList({ expenses, onEdit, onDeleted }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (expense: SerializedExpense) => {
    const confirmed = await pacesConfirm.danger('ลบรายการค่าใช้จ่ายนี้?', 'ลบแล้วกู้คืนไม่ได้')
    if (!confirmed) return

    setDeletingId(expense.id)
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, { method: 'DELETE' })
      if (!res.ok) {
        pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
        return
      }
      pacesToast.success('ลบค่าใช้จ่ายแล้ว')
      onDeleted()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">รายการค่าใช้จ่าย</h4>
      </div>

      {expenses.length === 0 ? (
        <div className="card-body">
          <SellerEmptyState
            compact
            icon="receipt-off"
            title="ยังไม่มีรายการค่าใช้จ่าย"
            description="เริ่มบันทึกค่าใช้จ่ายแรกของร้านได้เลย"
          />
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>หมวดหมู่</th>
                <th>จำนวนเงิน</th>
                <th>หมายเหตุ</th>
                <th className="text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => {
                const category = expense.category as ExpenseCategory
                const iconName = EXPENSE_CATEGORY_ICON[category] ?? ''
                return (
                  <tr key={expense.id}>
                    <td>{expense.expenseDate}</td>
                    <td>
                      <span className="badge bg-primary/10 text-primary inline-flex items-center gap-1 py-0 text-2xs font-semibold">
                        {iconName && <Icon icon={iconName} className="size-3.5" aria-hidden="true" />}
                        {EXPENSE_CATEGORY_LABEL_TH[category] ?? category}
                      </span>
                    </td>
                    <td>฿{new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(expense.amount)}</td>
                    <td className="text-default-500">{expense.note || '—'}</td>
                    <td>
                      <div className="flex justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEdit(expense)}
                          className="btn btn-icon btn-sm border border-default-300 text-default-800 hover:border-default-400"
                          aria-label="แก้ไข"
                        >
                          <Icon icon="pencil" className="text-base" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(expense)}
                          disabled={deletingId === expense.id}
                          className="btn btn-icon btn-sm border border-default-300 text-default-800 hover:border-default-400 disabled:opacity-50"
                          aria-label="ลบ"
                        >
                          <Icon icon="trash" className="text-base" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
