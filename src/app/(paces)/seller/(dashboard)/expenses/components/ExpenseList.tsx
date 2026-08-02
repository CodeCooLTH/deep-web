'use client'

/**
 * ExpenseList — รายการค่าใช้จ่าย จัดกลุ่มตามวันพร้อมยอดรวมรายวัน (feature 00016 redesign)
 *
 * เปลี่ยนจากตาราง 5 คอลัมน์เป็นแถวการ์ด เพราะบนมือถือตารางล้นจอจนต้องเลื่อนแนวนอน และคอลัมน์
 * "วันที่" ซ้ำกันเองทุกแถวของวันเดียวกัน — ยกขึ้นเป็นหัวกลุ่มแล้วได้ยอดรวมรายวันแถมมาฟรี
 *
 * Base:
 *   - แถว + ปุ่ม icon ท้ายแถว: src/app/(paces)/seller/(dashboard)/products/components/ProductsListing.tsx:194-220
 *   - หัวกลุ่มวัน: src/app/(paces)/seller/(chat)/inbox/... (แถบคั่นพื้น default-100) — pattern เดียวกับ
 *     day divider ของแชท
 *   - empty state: src/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState.tsx
 *   - ยืนยันลบ: src/lib/paces-swal.ts (pacesConfirm.danger)
 *
 * Design Spec: docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md §1A, §4.6, §8
 */
import { useEffect, useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { cn } from '@/utils/helpers'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL_TH,
  EXPENSE_CATEGORY_ICON,
  EXPENSE_CATEGORY_COLOR,
  type ExpenseCategory,
} from '@/lib/expense'
import { formatDate } from '@/lib/format-date'
import { todayThaiIsoDate, shiftIsoDate } from '@/lib/date-range'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import ExpenseCategoryFilterSheet from './ExpenseCategoryFilterSheet'
import type { SerializedExpense } from '@/services/expense.service'

const PAGE = 10

const formatThb = (n: number) =>
  '฿' + new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

/** หัวกลุ่ม: "วันนี้ · 2 ส.ค. 2569" — พูดภาษาคนสำหรับ 2 วันล่าสุด ที่เหลือใช้วันที่ตรง ๆ */
function dayHeading(iso: string): string {
  const today = todayThaiIsoDate()
  if (iso === today) return `วันนี้ · ${formatDate(iso)}`
  if (iso === shiftIsoDate(today, -1)) return `เมื่อวาน · ${formatDate(iso)}`
  return formatDate(iso)
}

type Props = {
  expenses: SerializedExpense[]
  /** ร้านนี้เคยบันทึกค่าใช้จ่ายไหม (ไม่จำกัดช่วง) — แยกข้อความ empty state */
  hasAnyExpenseEver: boolean
  loading?: boolean
  onEdit: (expense: SerializedExpense) => void
  onAdd: () => void
  onMutated: () => void
}

export default function ExpenseList({
  expenses,
  hasAnyExpenseEver,
  loading = false,
  onEdit,
  onAdd,
  onMutated,
}: Props) {
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | ExpenseCategory>('ALL')
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // เปลี่ยนตัวกรอง/คำค้น = เริ่มนับใหม่ ไม่งั้น "โหลดเพิ่ม" ค้างค่าจากชุดก่อนหน้า
  useEffect(() => setVisibleCount(PAGE), [categoryFilter, search])

  /** จำนวนต่อหมวด — นับจากชุดเต็มเสมอ (ไม่ผูกกับคำค้น) ไม่งั้นตัวเลขบนชิปเต้นตามที่พิมพ์ */
  const counts = useMemo(() => {
    const map = new Map<ExpenseCategory, number>()
    for (const e of expenses) {
      const c = e.category as ExpenseCategory
      map.set(c, (map.get(c) ?? 0) + 1)
    }
    return map
  }, [expenses])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return expenses
      .filter((e) => categoryFilter === 'ALL' || e.category === categoryFilter)
      .filter((e) => !q || (e.note ?? '').toLowerCase().includes(q))
  }, [expenses, categoryFilter, search])

  const visible = filtered.slice(0, visibleCount)

  /** จัดกลุ่มตามวัน โดยคงลำดับเดิม (service เรียง expenseDate ล่าสุดก่อนมาแล้ว) */
  const groups = useMemo(() => {
    const out: { date: string; rows: SerializedExpense[]; total: number }[] = []
    for (const e of visible) {
      const last = out[out.length - 1]
      if (last && last.date === e.expenseDate) {
        last.rows.push(e)
        last.total += e.amount
      } else {
        out.push({ date: e.expenseDate, rows: [e], total: e.amount })
      }
    }
    return out
  }, [visible])

  const handleDelete = async (expense: SerializedExpense) => {
    const confirmed = await pacesConfirm.danger('ลบรายการค่าใช้จ่ายนี้?', 'ลบแล้วกู้คืนไม่ได้')
    if (!confirmed) return

    setDeletingId(expense.id)
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) {
        pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
        return
      }
      pacesToast.success(res.status === 404 ? 'รายการนี้ถูกลบไปแล้ว' : 'ลบค่าใช้จ่ายแล้ว')
      onMutated()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setDeletingId(null)
    }
  }

  const hasFilter = categoryFilter !== 'ALL' || search.trim() !== ''

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title flex items-center gap-2">
          รายการค่าใช้จ่าย
          <span className="badge bg-light text-default-700">{expenses.length}</span>
        </h4>

        <div className="flex items-center gap-2">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาหมายเหตุ..."
              aria-label="ค้นหาหมายเหตุ"
              className="form-input"
            />
          </div>
          {/* จอแคบ: ชิปหมวด 8 อันยาวเกินไป ย่อเป็นปุ่มเปิดแผ่นเลือกแทน */}
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className="btn btn-sm btn-outline border-default-300 text-default-800 min-h-11 shrink-0 sm:hidden"
          >
            <Icon icon="filter" aria-hidden="true" />
            {categoryFilter === 'ALL' ? 'ตัวกรอง' : EXPENSE_CATEGORY_LABEL_TH[categoryFilter]}
          </button>
        </div>
      </div>

      {/* ชิปหมวด — จอ ≥sm เท่านั้น */}
      <div className="border-default-300 hidden border-b px-5 py-3 sm:block">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={categoryFilter === 'ALL'}
            onClick={() => setCategoryFilter('ALL')}
            label="ทั้งหมด"
            count={expenses.length}
          />
          {EXPENSE_CATEGORIES.filter((c) => (counts.get(c) ?? 0) > 0).map((c: ExpenseCategory) => (
            <FilterChip
              key={c}
              active={categoryFilter === c}
              onClick={() => setCategoryFilter(c)}
              label={EXPENSE_CATEGORY_LABEL_TH[c]}
              icon={EXPENSE_CATEGORY_ICON[c]}
              count={counts.get(c) ?? 0}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card-body">
          {expenses.length > 0 && hasFilter ? (
            <div className="text-center">
              <SellerEmptyState
                compact
                icon="search-off"
                title="ไม่พบรายการที่ตรงกับตัวกรอง"
                description="ลองล้างตัวกรองหรือเปลี่ยนคำค้นดู"
              />
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter('ALL')
                  setSearch('')
                }}
                className="btn bg-light text-dark -mt-2"
              >
                ล้างตัวกรอง
              </button>
            </div>
          ) : (
            <div className="text-center">
              <SellerEmptyState
                compact
                icon="receipt-off"
                title={hasAnyExpenseEver ? 'ช่วงเวลานี้ยังไม่มีรายการ' : 'ยังไม่มีรายการค่าใช้จ่าย'}
                description={
                  hasAnyExpenseEver
                    ? 'ลองเลือกช่วงเวลาอื่น หรือบันทึกรายการของช่วงนี้เพิ่ม'
                    : 'บันทึกค่าเช่า ค่าโฆษณา ค่าขนส่ง แล้วระบบจะคำนวณกำไรสุทธิให้อัตโนมัติ'
                }
              />
              <button
                type="button"
                onClick={onAdd}
                className="btn bg-primary hover:bg-primary-hover -mt-2 inline-flex items-center gap-1.5 text-white"
              >
                <Icon icon="plus" aria-hidden="true" />
                {hasAnyExpenseEver ? 'เพิ่มค่าใช้จ่าย' : 'บันทึกรายการแรก'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={cn('transition-opacity', loading && 'opacity-50')}>
          {groups.map((g) => (
            <div key={g.date}>
              <div className="bg-default-100 border-default-300 flex items-center justify-between border-y px-5 py-2">
                <span className="text-default-800 text-xs font-semibold">{dayHeading(g.date)}</span>
                <span className="text-default-600 text-xs">
                  รวม <b className="text-default-900">{formatThb(g.total)}</b>
                </span>
              </div>

              {g.rows.map((expense) => {
                const category = expense.category as ExpenseCategory
                const color = EXPENSE_CATEGORY_COLOR[category]
                return (
                  <div
                    key={expense.id}
                    className="border-default-200 flex items-center gap-3 border-b px-5 py-3 last:border-b-0"
                  >
                    {/* จอแคบ: ทั้งแถวคือปุ่มแก้ไข (ปุ่ม icon เล็กเกินกดพลาดง่าย) — จอ ≥sm มีปุ่มแยกท้ายแถว */}
                    <button
                      type="button"
                      onClick={() => onEdit(expense)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-start sm:pointer-events-none"
                      aria-label={`แก้ไข ${EXPENSE_CATEGORY_LABEL_TH[category]} ${formatThb(expense.amount)}`}
                    >
                      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', color.wash)}>
                        <Icon icon={EXPENSE_CATEGORY_ICON[category]} className="text-lg" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-default-900 block font-semibold">
                          {EXPENSE_CATEGORY_LABEL_TH[category]}
                        </span>
                        {expense.note && (
                          <span className="text-default-600 block truncate text-xs">{expense.note}</span>
                        )}
                      </span>
                      <span className="text-default-900 shrink-0 font-bold">{formatThb(expense.amount)}</span>
                    </button>

                    <div className="hidden shrink-0 gap-1.5 sm:flex">
                      <button
                        type="button"
                        onClick={() => onEdit(expense)}
                        className="btn btn-icon btn-sm border-default-300 text-default-800 hover:border-default-400 border"
                        aria-label="แก้ไข"
                      >
                        <Icon icon="pencil" className="text-base" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(expense)}
                        disabled={deletingId === expense.id}
                        className="btn btn-icon btn-sm border-default-300 text-default-800 hover:border-default-400 border disabled:opacity-50"
                        aria-label="ลบ"
                      >
                        <Icon icon="trash" className="text-base" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          <div className="border-default-300 flex items-center justify-between border-t border-dashed px-5 py-3">
            <span className="text-default-600 text-xs">
              แสดง {visible.length} จาก {filtered.length} รายการ
            </span>
            {visible.length < filtered.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((v) => v + PAGE)}
                className="btn btn-sm bg-light text-dark inline-flex items-center gap-1"
              >
                <Icon icon="chevron-down" aria-hidden="true" />
                โหลดเพิ่ม
              </button>
            )}
          </div>
        </div>
      )}

      {filterSheetOpen && (
        <ExpenseCategoryFilterSheet
          selected={categoryFilter}
          counts={counts}
          totalCount={expenses.length}
          onSelect={(c) => {
            setCategoryFilter(c)
            setFilterSheetOpen(false)
          }}
          onClose={() => setFilterSheetOpen(false)}
        />
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  icon,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon?: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'btn btn-sm inline-flex items-center gap-1.5 rounded-full',
        active ? 'bg-primary/15 text-primary font-semibold' : 'bg-light text-dark',
      )}
    >
      {icon && <Icon icon={icon} className="text-base" aria-hidden="true" />}
      {label}
      <span className="text-2xs opacity-75">{count}</span>
    </button>
  )
}
