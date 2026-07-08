'use client'

/**
 * PnlReportCard — รายงานกำไรขาดทุน (P&L): segmented date-range switcher + stat row 5 ตัวเลข
 * (feature 00016 Expense & Cost Tracking, Unit 5A)
 *
 * Base:
 *   - stat row grid: src/app/(paces)/seller/(dashboard)/dashboard/components/SalesReport.tsx:161-194
 *     (bg-light/25 border-dashed grid grid-cols-N text-center + CountUp wrapper) — ขยาย 3→5 คอลัมน์
 *   - segmented date-range switcher: docs/system/ui-guideline/paces-component-reference.md §2 Button Group
 *     (inline-flex + .btn + rounded-*-none) — ไม่ใช้ hs-dropdown เพราะ component นี้ re-render ทุกครั้งที่
 *     เปลี่ยนช่วง (ดู "Preline hs-dropdown พังใน list/toolbar ที่ re-render" component reference §3)
 *   - custom range picker: src/app/(paces)/seller/(dashboard)/sales/components/SalesDateRange.tsx
 *     (Flatpickr wrapper mode="range") — ต่างจาก sales: local state ในนี้เอง ไม่ผ่าน URL searchParams
 *   - missing-cost warning banner: src/app/(paces)/seller/(dashboard)/inventory/components/PackageSelector.tsx
 *     (role="alert" border-{semantic}/20 bg-{semantic}/10 block) — สลับ danger→warning (เตือน ไม่ใช่ error)
 *
 * Design decision: ไม่ auto-refetch เอง — parent (ExpenseWorkspace) ส่ง `refreshSignal` เพิ่มค่าทุกครั้งที่
 * expense ถูก mutate → useEffect ด้านล่าง watch ทั้ง range/customDates/refreshSignal (คง range ที่เลือกไว้)
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Flatpickr from '@/components/wrappers/Flatpickr'
import Icon from '@/components/wrappers/Icon'
import { CountUp } from '@/components/wrappers/CountUp'
import { pacesToast } from '@/lib/paces-toast'
import { cn } from '@/utils/helpers'
import type { PnlReport } from '@/services/pnl.service'
import type { DateRangePreset } from '@/lib/date-range'

type Props = {
  initialReport: PnlReport
  refreshSignal: number
}

const RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'วันนี้' },
  { value: '7d', label: '7 วัน' },
  { value: '30d', label: '30 วัน' },
  { value: 'month', label: 'เดือนนี้' },
  { value: 'custom', label: 'กำหนดเอง' },
]

export default function PnlReportCard({ initialReport, refreshSignal }: Props) {
  const [range, setRange] = useState<DateRangePreset>('today')
  const [customDates, setCustomDates] = useState<[string, string] | null>(null)
  const [report, setReport] = useState<PnlReport>(initialReport)
  const [loading, setLoading] = useState(false)
  // กัน fetch ซ้ำตอน mount ครั้งแรก — SSR ส่ง initialReport ของ range='today' มาให้แล้ว (ตรงกับ default state)
  const isFirstRun = useRef(true)

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      if (refreshSignal === 0) return
    }
    if (range === 'custom' && !customDates) return // ยังไม่เลือกช่วง "กำหนดเอง" — รอผู้ใช้เลือกก่อน

    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ range })
        if (range === 'custom' && customDates) {
          params.set('start', customDates[0])
          params.set('end', customDates[1])
        }
        const res = await fetch(`/api/expenses/report?${params.toString()}`, { signal: controller.signal })
        if (!res.ok) throw new Error('fetch failed')
        const data: PnlReport = await res.json()
        setReport(data)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          // ค้าง state เก่าไว้ (ไม่ล้างตัวเลข) ตาม UX-Design-Spec.md §Edge states "Error"
          pacesToast.error('โหลดรายงานไม่สำเร็จ กรุณาลองใหม่')
        }
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customDates, refreshSignal])

  const handleCustomChange = (selectedDates: Date[]) => {
    if (selectedDates.length === 2) {
      const f = selectedDates[0].toISOString().slice(0, 10)
      const t = selectedDates[1].toISOString().slice(0, 10)
      setCustomDates([f, t])
    }
  }

  const grossPositive = report.grossProfit >= 0
  const netPositive = report.netProfit >= 0

  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-3">
        <h4 className="card-title">รายงานกำไรขาดทุน</h4>

        <div className="flex flex-wrap items-center gap-3">
          {/* segmented date-range switcher — Button Group (§2), ไม่ใช่ .btn-group (ไม่มีใน Paces) */}
          <div className="inline-flex" role="group" aria-label="ช่วงเวลารายงาน">
            {RANGE_OPTIONS.map((opt, idx) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRange(opt.value)}
                aria-pressed={range === opt.value}
                className={cn(
                  'btn btn-sm',
                  idx === 0 && 'rounded-e-none',
                  idx > 0 && idx < RANGE_OPTIONS.length - 1 && 'rounded-none',
                  idx === RANGE_OPTIONS.length - 1 && 'rounded-s-none',
                  range === opt.value ? 'bg-primary/15 text-primary' : 'bg-light text-dark',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {range === 'custom' && (
            <div className="input-icon-group">
              <Icon icon="calendar" className="input-icon" aria-hidden="true" />
              <Flatpickr
                className="form-input"
                style={{ minWidth: 220 }}
                options={{ dateFormat: 'd M, Y', mode: 'range' }}
                onChange={handleCustomChange}
              />
            </div>
          )}
        </div>
      </div>

      <div className="card-body">
        {report.hasMissingCost && (
          <div
            role="alert"
            aria-live="polite"
            className="border-warning/20 bg-warning/10 text-warning mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-start text-sm font-medium"
          >
            <Icon icon="alert-triangle" className="size-5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              กำไรอาจไม่สมบูรณ์ — มีสินค้าที่ยังไม่ตั้งต้นทุนในช่วงนี้{' '}
              <Link href="/products" className="font-semibold underline">
                ตั้งต้นทุนตอนนี้ →
              </Link>
            </span>
          </div>
        )}

        <div className="relative">
          <div className={cn('bg-light/25 rounded-lg transition-opacity', loading && 'opacity-50')}>
            <div className="grid grid-cols-2 gap-y-4 py-5 text-center md:grid-cols-5 md:gap-y-0">
              <StatCell label="รายได้" value={report.revenue} colorClass="text-success" />
              <StatCell label="ต้นทุนสินค้า (COGS)" value={report.cogs} colorClass="text-default-700" />
              <StatCell
                label="กำไรขั้นต้น"
                value={report.grossProfit}
                colorClass={grossPositive ? 'text-success' : 'text-danger'}
              />
              <StatCell label="ค่าใช้จ่าย" value={report.totalExpense} colorClass="text-danger" />
              <StatCell
                label="กำไรสุทธิ"
                value={report.netProfit}
                colorClass={netPositive ? 'text-success' : 'text-danger'}
                big
              />
            </div>
          </div>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center" aria-live="polite" aria-busy="true">
              <Icon icon="refresh" className="animate-spin text-primary text-2xl" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCell({
  label,
  value,
  colorClass,
  big = false,
}: {
  label: string
  value: number
  colorClass: string
  big?: boolean
}) {
  return (
    <div>
      <p className="text-default-400 mb-1.25">{label}</p>
      <h4 className={cn('flex items-center justify-center font-semibold', big ? 'text-xl' : 'text-lg', colorClass)}>
        <CountUp start={0} end={value} prefix="฿" duration={1} decimals={2} />
      </h4>
    </div>
  )
}
