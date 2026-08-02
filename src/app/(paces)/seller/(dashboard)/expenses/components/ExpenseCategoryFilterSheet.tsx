'use client'

/**
 * ExpenseCategoryFilterSheet — แผ่นเลือกหมวดสำหรับกรองรายการ (มือถือเท่านั้น)
 *
 * จอ ≥sm ใช้ชิปเรียงในหัวการ์ดได้เลย แต่จอแคบ 8 ชิปกินสองบรรทัดครึ่งจนหัวการ์ดบวม
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/ProductPickerSheet.tsx
 *   (bottom sheet + Escape ปิด + backdrop) — ตัดส่วนค้นหา/lazy-load ออก เพราะรายการคงที่ 7 หมวด
 *
 * Design Spec: docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md §4.6
 */
import { useEffect } from 'react'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL_TH,
  EXPENSE_CATEGORY_ICON,
  type ExpenseCategory,
} from '@/lib/expense'

type Props = {
  selected: 'ALL' | ExpenseCategory
  counts: Map<ExpenseCategory, number>
  totalCount: number
  onSelect: (c: 'ALL' | ExpenseCategory) => void
  onClose: () => void
}

export default function ExpenseCategoryFilterSheet({
  selected,
  counts,
  totalCount,
  onSelect,
  onClose,
}: Props) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  // แสดงเฉพาะหมวดที่มีรายการจริงในช่วงนี้ — หมวดที่นับได้ 0 กรองแล้วได้จอว่าง ไม่มีประโยชน์
  const available = EXPENSE_CATEGORIES.filter((c) => (counts.get(c) ?? 0) > 0)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="กรองตามหมวดหมู่"
      className="size-full bg-dark/40 fixed top-0 start-0 z-80 flex items-end sm:hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-card max-h-dvh w-full overflow-y-auto rounded-t-2xl">
        <div className="bg-default-300 mx-auto mt-2.5 h-1 w-9 rounded-full" aria-hidden="true" />

        <div className="card-header">
          <h3 className="card-title">กรองตามหมวดหมู่</h3>
          <button
            type="button"
            aria-label="ปิด"
            onClick={onClose}
            className="btn btn-icon text-default-600 min-h-11 min-w-11"
          >
            <Icon icon="x" className="align-middle text-2xl" />
          </button>
        </div>

        <ul
          className="p-2"
          /* carve-out safe-area (Hard Rule 7): แผ่นชิดขอบล่างจอ ต้องเผื่อ home indicator ของ iOS
             ไม่มี token Paces แทนได้ — precedent: SelectPagesClient.tsx */
          style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
        >
          <li>
            <FilterRow
              active={selected === 'ALL'}
              label="ทั้งหมด"
              count={totalCount}
              onClick={() => onSelect('ALL')}
            />
          </li>
          {available.map((c) => (
            <li key={c}>
              <FilterRow
                active={selected === c}
                label={EXPENSE_CATEGORY_LABEL_TH[c]}
                icon={EXPENSE_CATEGORY_ICON[c]}
                count={counts.get(c) ?? 0}
                onClick={() => onSelect(c)}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function FilterRow({
  active,
  label,
  icon,
  count,
  onClick,
}: {
  active: boolean
  label: string
  icon?: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start',
        active ? 'bg-primary/15 text-primary font-semibold' : 'text-default-800',
      )}
    >
      {icon ? (
        <Icon icon={icon} className="text-lg" aria-hidden="true" />
      ) : (
        <Icon icon="list" className="text-lg" aria-hidden="true" />
      )}
      <span className="flex-1">{label}</span>
      <span className="text-default-600 text-xs">{count}</span>
      {active && <Icon icon="check" className="text-primary text-base" aria-hidden="true" />}
    </button>
  )
}
