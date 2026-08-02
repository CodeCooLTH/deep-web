'use client'

/**
 * ExpenseBreakdownCard — สัดส่วนค่าใช้จ่ายแยกหมวดในช่วงที่เลือก (feature 00016 redesign)
 *
 * คำนวณจาก `expenses` ที่ parent ถืออยู่ (ก้อนเดียวกับที่ list และ P&L ใช้) — ไม่ fetch เอง
 * จึงไม่มีทางที่ยอดรวมในการ์ดนี้จะขัดกับ "ค่าใช้จ่าย" บนการ์ด P&L
 *
 * Base:
 *   - card + card-header/card-body: docs/system/ui-guideline/paces-component-reference.md §1
 *   - แถว legend (จุดสี + ชื่อ + ค่าชิดขวา): theme/paces/Admin/TS/src/app/(admin)/dashboard/
 *     ecommerce/components/RevenueByLocation.tsx — citation เดิมชี้ SalesReport.tsx ซึ่งไม่ตรง
 *     (safepay-ux ตรวจพบ 2026-08-02); markup ที่ใช้อยู่ตรงกับ RevenueByLocation อยู่แล้ว
 *   - แถบสัดส่วนแบบเดียวต่อกัน (part-to-whole): ไม่มี 1:1 ในธีม ประกอบจาก primitive
 *     (flex + bg token + rounded-full) — ประกาศไว้ตรง ๆ ไม่อ้างว่า copy มา
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
  groupExpensesByCategory,
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

  const { rows, total } = useMemo(
    () => ({
      // ใช้ util กลางร่วมกับ PnlReportCard — เขียนสูตร group-by แยกกันเมื่อไหร่จะหลุดจากกัน
      rows: groupExpensesByCategory(expenses),
      total: expenses.reduce((s, e) => s + e.amount, 0),
    }),
    [expenses],
  )

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
        {/* หมวดเดียว = แถบสีเดียวยาว 100% ซึ่งไม่ได้บอกอะไร — ซ่อนไปเลย legend บรรทัดเดียวพอ */}
        {rows.length > 1 && (
        <div className="bg-default-200 flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
          {rows.map((r, idx) => (
            <span
              key={r.category}
              className={cn('block h-full', EXPENSE_BAR_STEPS[Math.min(idx, EXPENSE_BAR_STEPS.length - 1)])}
              style={{ width: `${r.percent}%` }}
            />
          ))}
        </div>
        )}

        <ul className={cn('grid gap-2.5', rows.length > 1 && 'mt-4')}>
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
            {/* ขีดลอย ๆ ถูกอ่านเป็น bug — บอกเหตุผลตรง ๆ ด้วยข้อความจาง (ใช้ถ้อยคำเดียวกับการ์ด P&L) */}
            <dd className={shareOfRevenue == null ? 'text-default-700 text-xs font-normal' : 'text-default-900 font-semibold'}>
              {shareOfRevenue == null ? 'ยังไม่มียอดขาย' : `${shareOfRevenue.toFixed(1)}%`}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
