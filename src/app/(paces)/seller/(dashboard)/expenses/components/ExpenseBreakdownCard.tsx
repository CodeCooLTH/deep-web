'use client'

/**
 * ExpenseBreakdownCard — สัดส่วนค่าใช้จ่ายแยกหมวดในช่วงที่เลือก (feature 00016 redesign)
 *
 * คำนวณจาก `expenses` ที่ parent ถืออยู่ (ก้อนเดียวกับที่ list และ P&L ใช้) — ไม่ fetch เอง
 * จึงไม่มีทางที่ยอดรวมในการ์ดนี้จะขัดกับ "ค่าใช้จ่าย" บนการ์ด P&L
 *
 * Base:
 *   - card + card-header/card-body: docs/system/ui-guideline/paces-component-reference.md §1
 *   - แถบสัดส่วน + legend: src/app/(paces)/seller/(dashboard)/dashboard/components/SalesReport.tsx
 *     (แถวสรุปพร้อมจุดสี + ตัวเลขชิดขวา) — เปลี่ยนจากแท่งแยกเป็นแถบเดียวต่อกัน
 *
 * Design Spec: docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md §1A, §9
 */
import { useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatBaht } from '@/lib/format-money'
import {
  EXPENSE_CATEGORY_LABEL_TH,
  EXPENSE_CATEGORY_ICON,
  EXPENSE_BAR_STEPS,
  type ExpenseCategory,
} from '@/lib/expense'
import type { SerializedExpense } from '@/services/expense.service'

const MOBILE_PREVIEW_ROWS = 3


type Props = {
  expenses: SerializedExpense[]
  /** รายได้ในช่วงเดียวกัน — ใช้คิด "สัดส่วนต่อรายได้" ที่ท้ายการ์ด */
  revenue: number
  /** จำนวนวันในช่วงที่เลือก — ใช้คิดค่าเฉลี่ยต่อวัน */
  days: number
  loading?: boolean
}

export default function ExpenseBreakdownCard({ expenses, revenue, days, loading = false }: Props) {
  const [expanded, setExpanded] = useState(false)

  const { rows, total } = useMemo(() => {
    const sums = new Map<ExpenseCategory, number>()
    let sum = 0
    for (const e of expenses) {
      const c = e.category as ExpenseCategory
      sums.set(c, (sums.get(c) ?? 0) + e.amount)
      sum += e.amount
    }
    const list = [...sums.entries()]
      .map(([category, amount]) => ({
        category,
        amount,
        // total=0 เกิดไม่ได้ถ้ามีแถว (amount ต้อง >0 ตาม validation) แต่กันหารศูนย์ไว้
        percent: sum > 0 ? (amount / sum) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
    return { rows: list, total: sum }
  }, [expenses])

  // ไม่มีรายการในช่วงนี้ = ไม่มีอะไรให้แบ่งสัดส่วน — ซ่อนทั้งการ์ดดีกว่าโชว์การ์ดว่างที่ไม่บอกอะไร
  if (rows.length === 0) return null

  const hiddenCount = rows.length - MOBILE_PREVIEW_ROWS
  const perDay = days > 0 ? total / days : 0
  const shareOfRevenue = revenue > 0 ? (total / revenue) * 100 : null

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ค่าใช้จ่ายแยกหมวด</h4>
        <span className="text-default-700 text-xs">รวม {formatBaht(total)}</span>
      </div>

      <div className={cn('card-body transition-opacity', loading && 'opacity-50')}>
        {/* แถบเรียงจากมากไปน้อย ความเข้มจึงไล่ลงตามอันดับ — ไม่มีข้อมูลไหนพึ่งสีอย่างเดียว
            (legend ข้างล่างมีไอคอน ชื่อ % และจำนวนเงินกำกับครบทุกแถว) */}
        <div className="bg-default-200 flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
          {rows.map((r, idx) => (
            <span
              key={r.category}
              className={cn('block h-full', EXPENSE_BAR_STEPS[Math.min(idx, EXPENSE_BAR_STEPS.length - 1)])}
              style={{ width: `${r.percent}%` }}
            />
          ))}
        </div>

        <ul className="mt-4 grid gap-2.5">
          {/* จอ ≥sm โชว์ครบทุกหมวดเสมอ (พื้นที่พอ) — จอแคบตัดเหลือ 3 แถวแล้วให้กดกาง */}
          {rows.map((r, idx) => {
            const beyondPreview = idx >= MOBILE_PREVIEW_ROWS
            const hiddenOnMobile = beyondPreview && !expanded
            return (
              <li
                key={r.category}
                className={cn('flex items-center gap-2.5 text-xs', hiddenOnMobile && 'hidden sm:flex')}
              >
                <span
                  className={cn(
                    'size-2.5 shrink-0 rounded-sm',
                    EXPENSE_BAR_STEPS[Math.min(idx, EXPENSE_BAR_STEPS.length - 1)],
                  )}
                  aria-hidden="true"
                />
                <Icon
                  icon={EXPENSE_CATEGORY_ICON[r.category]}
                  className="text-default-700 shrink-0 text-base"
                  aria-hidden="true"
                />
                <span className="text-default-800 min-w-0 flex-1 truncate">
                  {EXPENSE_CATEGORY_LABEL_TH[r.category]}
                </span>
                <span className="text-default-700 w-12 text-end">{r.percent.toFixed(1)}%</span>
                <span className="text-default-900 w-24 text-end font-semibold">{formatBaht(r.amount)}</span>
              </li>
            )
          })}
        </ul>

        {hiddenCount > 0 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="btn btn-sm bg-light text-dark mt-3 min-h-11 w-full sm:hidden"
          >
            ดูทั้ง {rows.length} หมวด
          </button>
        )}

        {/* เดิมเป็นการ์ด "สรุปเร็ว" แยกต่างหาก — ยุบมาต่อท้ายการ์ดนี้เพราะ 2 ใน 4 บรรทัดของมัน
            (จำนวนรายการ / หมวดที่จ่ายมากสุด) ซ้ำกับ badge บนหัวรายการและแถวแรกของ legend ที่อยู่
            ในสายตาเดียวกันอยู่แล้ว เหลือเฉพาะสองค่าที่หาจากที่อื่นบนหน้านี้ไม่ได้ */}
        <dl className="border-default-300 mt-4 flex border-t border-dashed pt-3 text-xs">
          <div className="flex-1">
            <dt className="text-default-700">เฉลี่ยต่อวัน</dt>
            <dd className="text-default-900 font-semibold">{formatBaht(perDay)}</dd>
          </div>
          <div className="flex-1 text-end">
            <dt className="text-default-700">สัดส่วนต่อรายได้</dt>
            {/* รายได้ 0 คิดสัดส่วนไม่ได้ (ไม่ใช่ 0%) — ขีดแทน ไม่งั้นอ่านว่า "ค่าใช้จ่ายไม่กินรายได้เลย" */}
            <dd className="text-default-900 font-semibold">
              {shareOfRevenue == null ? '—' : `${shareOfRevenue.toFixed(1)}%`}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
