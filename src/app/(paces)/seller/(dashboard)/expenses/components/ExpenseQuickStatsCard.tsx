'use client'

/**
 * ExpenseQuickStatsCard — สรุปเร็ว 4 บรรทัดข้าง ๆ การ์ดแยกหมวด (feature 00016 redesign)
 *
 * ซ่อนบนมือถือโดยตั้งใจ (`hidden sm:block`): บนจอแคบ "จำนวนรายการ" ซ้ำกับ badge บนหัวรายการ
 * ที่อยู่ห่างกันไม่กี่บรรทัด — เก็บไว้เฉพาะจอที่การ์ดนี้กับรายการอยู่คนละสายตาจริง
 *
 * Base: src/app/(paces)/seller/(dashboard)/expenses/components/PnlReportCard.tsx (แถว label/value
 *   คั่นเส้นประ) + docs/system/ui-guideline/paces-component-reference.md §1 card
 *
 * Design Spec: docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md §1A, §11 ข้อ 3
 */
import { useMemo } from 'react'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { EXPENSE_CATEGORY_LABEL_TH, type ExpenseCategory } from '@/lib/expense'
import type { SerializedExpense } from '@/services/expense.service'

const formatThb = (n: number) =>
  '฿' + new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

type Props = {
  expenses: SerializedExpense[]
  /** รายได้ในช่วงเดียวกัน — ใช้คิด "สัดส่วนต่อรายได้" */
  revenue: number
  /** จำนวนวันในช่วงที่เลือก — ใช้คิดค่าเฉลี่ยต่อวัน */
  days: number
  loading?: boolean
}

export default function ExpenseQuickStatsCard({ expenses, revenue, days, loading = false }: Props) {
  const stats = useMemo(() => {
    const total = expenses.reduce((s, e) => s + e.amount, 0)
    const sums = new Map<ExpenseCategory, number>()
    for (const e of expenses) {
      const c = e.category as ExpenseCategory
      sums.set(c, (sums.get(c) ?? 0) + e.amount)
    }
    const top = [...sums.entries()].sort((a, b) => b[1] - a[1])[0]
    return {
      count: expenses.length,
      perDay: days > 0 ? total / days : 0,
      topCategory: top ? EXPENSE_CATEGORY_LABEL_TH[top[0]] : null,
      // รายได้ 0 → คิดสัดส่วนไม่ได้ (ไม่ใช่ 0%) — ต้องแสดงขีดแทน ไม่งั้นอ่านว่า "ค่าใช้จ่ายไม่กินรายได้เลย"
      shareOfRevenue: revenue > 0 ? (total / revenue) * 100 : null,
    }
  }, [expenses, revenue, days])

  if (expenses.length === 0) return null

  return (
    <div className="card hidden sm:block">
      <div className="card-header">
        <h4 className="card-title">สรุปเร็ว</h4>
      </div>
      <div className={cn('card-body py-1 transition-opacity', loading && 'opacity-50')}>
        <dl className="grid">
          <Row icon="receipt" label="จำนวนรายการ" value={`${stats.count} รายการ`} />
          <Row icon="calendar" label="เฉลี่ยต่อวัน" value={formatThb(stats.perDay)} />
          <Row icon="chart-pie" label="หมวดที่จ่ายมากสุด" value={stats.topCategory ?? '—'} />
          <Row
            icon="percentage"
            label="สัดส่วนต่อรายได้"
            value={stats.shareOfRevenue == null ? '—' : `${stats.shareOfRevenue.toFixed(1)}%`}
          />
        </dl>
      </div>
    </div>
  )
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="border-default-300 flex items-center justify-between gap-3 border-b border-dashed py-2.5 last:border-b-0">
      <dt className="text-default-600 flex items-center gap-1.5 text-xs">
        <Icon icon={icon} className="text-base" aria-hidden="true" />
        {label}
      </dt>
      <dd className="text-default-900 truncate font-semibold">{value}</dd>
    </div>
  )
}
