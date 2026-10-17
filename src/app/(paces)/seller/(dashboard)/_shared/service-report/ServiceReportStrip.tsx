/**
 * แถบสมการใต้ตัวเลขใหญ่ (feature 00078) — ชิ้นเดียวของการ์ดหน้าแรกและหน้ายอดขายและกำไร
 * ยอดขาย: ● ปิดงานแล้ว + ● ยังไม่ปิดงาน · กำไร: ● ปิดงานแล้ว − (ต้นทุนอะไหล่) − ● ค่าใช้จ่าย
 * ค่ามาจาก `stripOf` ในตัวคำนวณกลาง ⇒ การ์ดกับหน้าเต็มตรงกันโดยโครงสร้าง
 *
 * `inline` = บรรทัดเดียวแบบการ์ดหน้าแรกเดิม (● ชื่อ ตัวเลข · ไม่มีกรอบ/เครื่องหมาย) — user 2026-10-17:
 * แถบสมการบนหน้าแรก "รก เยอะไป" ขอแบบเดิม · หน้าเต็มยังเป็นแถบสมการ (`equation`)
 * Base inline: dashboard/components/SalesChartCard.tsx (แถว legend ใต้ตัวเลข)
 */
import { FINANCE_COLORS } from '@/lib/finance-colors'
import { formatNumberNoSymbol } from '@/lib/format-money'
import type { StripCell, StripDot } from '@/lib/service-report/view-model'

const DOT_CLASS: Record<StripDot, string> = {
  counted: FINANCE_COLORS.counted.dot,
  notCounted: FINANCE_COLORS.notCounted.dot,
  outflow: FINANCE_COLORS.outflow.dot,
}

export default function ServiceReportStrip({
  cells,
  className = '',
  variant = 'equation',
}: {
  cells: StripCell[]
  className?: string
  variant?: 'equation' | 'inline'
}) {
  if (variant === 'inline') {
    return (
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-default-700 ${className}`}>
        {cells.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1.5">
            {c.dot && <span className={`size-2 shrink-0 rounded-full ${DOT_CLASS[c.dot]}`} aria-hidden="true" />}
            {c.label} <b className="font-semibold text-default-800 tabular-nums">{formatNumberNoSymbol(c.value)}</b>
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className={`border-default-300 flex items-stretch border-y border-dashed ${className}`}>
      {cells.map((c) => (
        <div key={c.key} className="flex flex-1 items-center">
          {c.op && (
            <span className="px-1 text-sm font-bold text-default-500" aria-hidden="true">
              {c.op}
            </span>
          )}
          <div className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-center">
            {c.dot && <span className={`size-2 rounded-full ${DOT_CLASS[c.dot]}`} aria-hidden="true" />}
            <span className="text-xs text-default-700">{c.label}</span>
            <b className="text-sm font-bold text-default-800 tabular-nums">{formatNumberNoSymbol(c.value)}</b>
          </div>
        </div>
      ))}
    </div>
  )
}
