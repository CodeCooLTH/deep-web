'use client'

/**
 * กราฟการเงินของร้านบริการ — 3 แบบตามแท็บ (feature 00073 เฟส B · FR-011 · ดีไซน์บอร์ด 10)
 *   sales    = ยอดขาย: แท่งเดียว "รับแล้ว + ค้างรับ" · กดแท่งดูยอดสองส่วน · ยอดรวม + แถบสัดส่วน
 *   expense  = ค่าใช้จ่าย: ค่าใช้จ่ายร้าน + ต้นทุนอะไหล่
 *   overview = สรุปภาพรวม: ยอดขายเทียบรายจ่าย + ส่วนต่าง
 *
 * Base: src/app/(paces)/seller/(dashboard)/sales/components/SalesChart.tsx (ApexChart wrapper · ตัวเลือก
 *   แกน/ป้าย/grid/tooltip · สี token getColor — HR10) + dashboard/components/SalesChartSheet.tsx (ปุ่มช่วงเวลา ‹ ›)
 *   สี: รับแล้ว = success · ค้างรับ = warning (ชุดเดียวกับชีต/หน้า /sales เดิม) · ค่าใช้จ่าย = danger · ต้นทุน = chart-beta
 *
 * ทุกสิ่งที่แสดง/ซ่อนตัดสินจาก `ReportSettings` (src/lib/report-settings.ts) — ตัวเลขมาจาก
 * GET /api/seller/finance-chart (finance-chart.service: ชุดเดียวกับ P&L/ชีต — มีเทส parity)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApexOptions } from 'apexcharts'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { getColor } from '@/utils/helpers'
import { formatBaht, formatBahtCompact } from '@/lib/format-money'
import { profitExclusionNote, profitShown, showsUnclosedInCharts, type ReportRange, type ReportSettings } from '@/lib/report-settings'
import { FINANCE_COLORS } from '@/lib/finance-colors'
import type { FinanceChartData } from '@/services/finance-chart.service'

export type FinanceChartKind = 'sales' | 'expense' | 'overview'

const RANGE_PILLS: { key: ReportRange; label: string }[] = [
  { key: 'MONTH', label: 'รายวัน' },
  { key: 'M3', label: '3 เดือน' },
  { key: 'M6', label: '6 เดือน' },
  { key: 'M12', label: '12 เดือน' },
  { key: 'YEAR', label: 'ปี' },
]

const TITLE: Record<FinanceChartKind, string> = {
  sales: 'กราฟยอดขาย',
  expense: 'กราฟค่าใช้จ่าย',
  overview: 'กราฟสรุปภาพรวม',
}

type Props = {
  kind: FinanceChartKind
  settings: ReportSettings
  costNoun: string
  /** ข้อมูลชุดแรกจาก server (ช่วงตั้งต้นของร้าน) — ไม่ส่ง = โหลดเองตอน mount */
  initial?: FinanceChartData | null
  /** ลิงก์ "ดูงานค้างรับ" (แท็บยอดขาย) — ไม่ส่ง = ไม่มีลิงก์ */
  receivablesHref?: string
  /**
   * ช่วงที่ผู้เรียกคุมเอง (ชีตมือถือ: ตามปุ่ม รายวัน/รายเดือน + ‹ › ของชีต) — ส่งมา = ไม่มีตัวเลือกช่วงของกราฟเอง
   * (จอเดียวมีตัวเลือกช่วงสองชุดที่พูดคนละช่วง = สับสน) · ผู้เรียกใส่ `key` ตามช่วงเพื่อโหลดใหม่
   */
  period?: { range: ReportRange; year: number; month: number }
}

export default function ServiceFinanceChart({ kind, settings, costNoun, initial, receivablesHref, period }: Props) {
  const [data, setData] = useState<FinanceChartData | null>(initial ?? null)
  const [range, setRange] = useState<ReportRange>(period?.range ?? initial?.range ?? settings.defaultRange)
  const [anchor, setAnchor] = useState<{ year?: number; month?: number }>(
    period ? { year: period.year, month: period.month } : (initial?.anchor ?? {}),
  )
  const [loading, setLoading] = useState(!initial)
  const [error, setError] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const firstLoad = useRef(Boolean(initial))

  const load = useCallback(async (r: ReportRange, a: { year?: number; month?: number }) => {
    setLoading(true)
    setError(false)
    try {
      const qs = new URLSearchParams({ range: r })
      if (a.year) qs.set('year', String(a.year))
      if (a.month) qs.set('month', String(a.month))
      const res = await fetch(`/api/seller/finance-chart?${qs.toString()}`)
      if (!res.ok) throw new Error(String(res.status))
      setData((await res.json()) as FinanceChartData)
      setSel(null)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      return
    }
    void load(range, anchor)
  }, [range, anchor, load])

  const shift = (dir: -1 | 1) => {
    if (!data) return
    const a = data.anchor
    if (range === 'YEAR') return setAnchor({ year: a.year + dir, month: 12 })
    const step = range === 'MONTH' ? 1 : range === 'M3' ? 3 : range === 'M6' ? 6 : 12
    const idx = a.year * 12 + (a.month - 1) + dir * step
    setAnchor({ year: Math.floor(idx / 12), month: (idx % 12) + 1 })
  }

  const buckets = data?.buckets ?? []
  const outflow = (b: { cost: number; expense: number }) =>
    (settings.partCost ? b.cost : 0) + (settings.shopExpense ? b.expense : 0)

  /** FR-016 — ตั้งค่า "งานที่ยังไม่ปิด = ทุกจอ" ⇒ ก้อนเหลืองในกราฟยอดขาย (ไม่ใช่ยอดขาย · ไม่อยู่ในยอดขายรวม) */
  const withUnclosed = kind === 'sales' && showsUnclosedInCharts(settings)
  const C = FINANCE_COLORS
  const unclosedDef = { name: 'ยังไม่ปิดงาน', color: getColor(C.notCounted.token), dot: C.notCounted.dot, data: buckets.map((b) => b.unclosed) }

  /** ซีรีส์ตามแท็บ + ตั้งค่า — ชื่อกับสีต้องตรงกับแถบ legend/กล่องยอดด้านล่าง 1:1 · สีจาก FINANCE_COLORS ตัวกลาง */
  const seriesDefs: { name: string; color: string; data: number[]; dot: string }[] = (() => {
    if (kind === 'sales') {
      if (!settings.receivables) {
        return [
          { name: 'ยอดขาย', color: getColor(C.counted.token), dot: C.counted.dot, data: buckets.map((b) => b.sales) },
          ...(withUnclosed ? [unclosedDef] : []),
        ]
      }
      return [
        { name: 'รับแล้ว', color: getColor(C.counted.token), dot: C.counted.dot, data: buckets.map((b) => b.received) },
        // ค้างรับ = ฟ้า (เดิมเหลือง — เหลืองสงวนให้ "ยังไม่ปิดงาน/ยังไม่นับ" ทั้งระบบ · FR-016)
        { name: 'ค้างรับ', color: getColor(C.outstanding.token), dot: C.outstanding.dot, data: buckets.map((b) => b.outstanding) },
        ...(withUnclosed ? [unclosedDef] : []),
      ]
    }
    if (kind === 'expense') {
      return [
        ...(settings.shopExpense
          ? [{ name: 'ค่าใช้จ่ายร้าน', color: getColor(C.outflow.token), dot: C.outflow.dot, data: buckets.map((b) => b.expense) }]
          : []),
        ...(settings.partCost
          ? [{ name: costNoun, color: getColor(C.cost.token), dot: '', data: buckets.map((b) => b.cost) }]
          : []),
      ]
    }
    return [
      // ยอดขาย = เขียว (นับเป็นยอดขาย) — เดิมน้ำเงินซึ่งตอนนี้ = จำนวนงาน (FINANCE_COLORS) · รายจ่าย = แดง
      { name: 'ยอดขาย', color: getColor(C.counted.token), dot: C.counted.dot, data: buckets.map((b) => b.sales) },
      { name: 'รายจ่าย', color: getColor(C.outflow.token), dot: C.outflow.dot, data: buckets.map((b) => outflow(b)) },
    ]
  })()

  // แท่งซ้อนมีความหมายเฉพาะ "สองส่วนของก้อนเดียวกัน" (ยอดขาย · ค่าใช้จ่าย) — สรุปภาพรวมเทียบกันจึงเป็นแท่งคู่เสมอ
  const style = settings.chartStyle
  const stacked = style === 'STACKED' && kind !== 'overview'
  const chartType: 'bar' | 'line' | 'area' = style === 'LINE' ? 'line' : style === 'AREA' ? 'area' : 'bar'
  /**
   * จำนวนงานไม่วาดบนกราฟแล้ว (critique 2026-10-12) — เส้น/จุดบนแกนที่สองซ้อนทับแท่งเงินจนอ่านยาก
   * และทำให้สเกลแท่งเพี้ยน ⇒ จำนวนงานอยู่ในกล่องยอดของช่องที่เลือก + บรรทัดยอดรวมแทน (ตามสวิตช์จำนวนงาน)
   */
  const showJobs = false
  const series = [
    ...seriesDefs.map((s) => ({ name: s.name, type: chartType, data: s.data })),
    // จำนวนงานเป็น "จุด" เฉพาะช่องที่มีงาน (null = ไม่วาด) — เส้นลากผ่านศูนย์ทุกวันทับแท่งจนอ่านยาก (critique 2026-10-12)
    ...(showJobs ? [{ name: 'จำนวนงาน', type: 'line' as const, data: buckets.map((b) => (b.jobs > 0 ? b.jobs : null)) }] : []),
  ]
  const futureFrom = data?.futureFromIndex ?? buckets.length

  const getOptions = useCallback(
    (): ApexOptions => ({
      series,
      chart: {
        type: showJobs ? ('line' as const) : chartType,
        height: 280,
        stacked,
        toolbar: { show: false },
        zoom: { enabled: false },
        selection: { enabled: false },
        parentHeightOffset: 0,
        fontFamily: 'inherit',
        events: {
          // กดแท่ง/จุด → กล่องยอดของช่องนั้น (ดีไซน์: "กดแท่งดูยอด")
          click: (_e: unknown, _c: unknown, cfg?: { dataPointIndex?: number }) => {
            const i = cfg?.dataPointIndex
            if (i != null && i >= 0) setSel(i)
          },
        },
      },
      plotOptions: {
        bar: {
          columnWidth: buckets.length > 20 ? '72%' : '55%',
          borderRadius: 3,
          borderRadiusApplication: 'end' as const,
          borderRadiusWhenStacked: 'last' as const,
        },
      },
      stroke: { width: chartType === 'bar' ? [...seriesDefs.map(() => 0), ...(showJobs ? [0] : [])] : 2, curve: 'straight' as const },
      fill: chartType === 'area' ? { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.05 } } : { opacity: 1 },
      markers: { size: chartType === 'bar' ? (showJobs ? [...seriesDefs.map(() => 0), 5] : 0) : 3 },
      dataLabels: { enabled: false },
      legend: { show: false },
      colors: [...seriesDefs.map((s) => s.color), ...(showJobs ? [getColor('default-500')] : [])],
      xaxis: {
        categories: buckets.map((b) => b.label),
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
        labels: {
          rotate: 0,
          hideOverlappingLabels: true,
          trim: false,
          style: { fontSize: '11px', colors: getColor('default-500') },
        },
      },
      // แกนเดียว (object ไม่ใช่ array) — yaxis แบบ array + seriesName ทำให้แท่งซ้อนถูกวาดบนสเกลอื่นที่ไม่ใช่ป้ายแกน
      // (เจอจริง: แท่ง ฿3,500 ขึ้นแค่ระดับ ฿1.5k · critique 2026-10-12)
      yaxis: {
        min: 0,
        forceNiceScale: true,
        tickAmount: 4,
        labels: { style: { fontSize: '11px', colors: getColor('default-500') }, formatter: (v: number) => formatBahtCompact(v) },
      },
      grid: {
        strokeDashArray: 4,
        borderColor: getColor('default-200'),
        xaxis: { lines: { show: false } },
        padding: { top: -8, right: 8, bottom: 0, left: 4 },
      },
      tooltip: {
        shared: true,
        intersect: false,
        y: {
          formatter: (v: number, o?: { seriesIndex?: number }) =>
            showJobs && o?.seriesIndex === seriesDefs.length ? `${v} งาน` : formatBaht(v),
        },
      },
      // ช่องอนาคต (ยังไม่ถึง) ทำจาง — เดือน/วันที่ยังไม่มาไม่ใช่ "ยอด 0"
      ...(futureFrom < buckets.length
        ? {
            annotations: {
              xaxis: [
                {
                  x: buckets[futureFrom]?.label,
                  x2: buckets[buckets.length - 1]?.label,
                  fillColor: getColor('default-200'),
                  opacity: 0.35,
                  borderColor: 'transparent',
                },
              ],
            },
          }
        : {}),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, kind, settings, costNoun],
  )

  // ช่องที่เลือก — ค่าเริ่มต้น = ช่องล่าสุดที่ไม่ใช่อนาคต
  // ค่าเริ่มต้น = ช่องล่าสุดที่มียอด (ไม่ใช่ "วันนี้" ที่มักยังว่าง) · ไม่มียอดเลย = ช่องล่าสุดที่ไม่ใช่อนาคต
  const lastPast = Math.max(0, Math.min(futureFrom, buckets.length) - 1)
  const lastWithData = (() => {
    for (let i = lastPast; i >= 0; i--) if (buckets[i] && (buckets[i].sales > 0 || buckets[i].expense > 0 || buckets[i].cost > 0)) return i
    return lastPast
  })()
  const selIdx = sel ?? lastWithData
  const selB = buckets[selIdx]
  const t = data?.totals
  const hasAny = buckets.some((b) => b.sales > 0 || b.expense > 0 || b.cost > 0)

  return (
    <div className="card mb-1.25">
      <div className="card-header flex-wrap gap-2">
        <h5 className="card-title min-w-0 truncate">{TITLE[kind]}</h5>
        {period ? (
          <span className="text-default-700 ms-auto shrink-0 text-sm tabular-nums">{data?.rangeLabel ?? '—'}</span>
        ) : (
        <div className="ms-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            disabled={loading || !data}
            aria-label="ช่วงก่อนหน้า"
            className="btn btn-icon border-default-300 min-h-11 min-w-11"
          >
            <Icon icon="chevron-left" className="size-5" />
          </button>
          <span className="text-default-800 min-w-24 text-center text-sm font-medium tabular-nums">
            {data?.rangeLabel ?? '—'}
          </span>
          <button
            type="button"
            onClick={() => shift(1)}
            disabled={loading || !data || data.isCurrent}
            aria-label="ช่วงถัดไป"
            className={`btn btn-icon border-default-300 min-h-11 min-w-11 ${data?.isCurrent ? 'pointer-events-none opacity-40' : ''}`}
          >
            <Icon icon="chevron-right" className="size-5" />
          </button>
        </div>
        )}
      </div>

      {!period && (
      <div className="border-default-200 flex flex-wrap gap-1.5 border-b px-5 py-2.5" role="radiogroup" aria-label="ช่วงเวลาของกราฟ">
        {RANGE_PILLS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={range === p.key}
            onClick={() => {
              if (range === p.key) return
              setRange(p.key)
              setAnchor({})
            }}
            className={`btn btn-sm min-h-9 rounded-full px-3 ${range === p.key ? 'bg-primary text-white' : 'bg-default-100 text-default-700 hover:bg-default-200'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      )}

      <div className="card-body px-1 pt-3 pb-1 sm:px-3">
        {error ? (
          <p className="text-danger-ink px-4 py-8 text-center text-sm">โหลดกราฟไม่สำเร็จ — ลองกดช่วงเวลาอีกครั้ง</p>
        ) : !data ? (
          <div className="bg-default-100 h-70 animate-pulse rounded" aria-busy="true" aria-label="กำลังโหลดกราฟ" />
        ) : seriesDefs.length === 0 ? (
          <p className="text-default-600 px-4 py-8 text-center text-sm">
            ปิดค่าใช้จ่ายร้านและ{costNoun}ไว้ในตั้งค่ารายงาน — ไม่มีอะไรให้แสดง
          </p>
        ) : !hasAny ? (
          <p className="text-default-600 px-4 py-8 text-center text-sm">ยังไม่มียอดในช่วงนี้</p>
        ) : (
          <div className={loading ? 'opacity-50' : undefined}>
            <ApexChart getOptions={getOptions} series={series} type={showJobs ? 'line' : chartType} height={280} />
          </div>
        )}
      </div>

      {/* กล่องยอดของช่องที่เลือก — ตัวเลขชุดเดียวกับแท่ง (ไม่ใช่คำนวณใหม่) */}
      {data && selB && hasAny && seriesDefs.length > 0 && (
        <div className="border-default-200 border-t px-5 py-3" aria-live="polite">
          <p className="text-default-800 mb-1.5 text-sm font-semibold">
            {selB.label} {range === 'MONTH' ? data.rangeLabel : ''}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {kind === 'sales' && (
              <>
                {settings.receivables && <Row label="รับแล้ว" value={formatBaht(selB.received)} />}
                {settings.receivables && <Row label="ค้างรับ" value={formatBaht(selB.outstanding)} warn={selB.outstanding > 0} />}
                <Row label="ยอดขาย" value={formatBaht(selB.sales)} strong />
                {settings.jobCount && <Row label="จำนวนงาน" value={`${selB.jobs} งาน`} />}
                {withUnclosed && <Row label="ยังไม่ปิดงาน (ไม่นับ)" value={formatBaht(selB.unclosed)} />}
              </>
            )}
            {kind === 'expense' && (
              <>
                {settings.shopExpense && <Row label="ค่าใช้จ่ายร้าน" value={formatBaht(selB.expense)} />}
                {settings.partCost && <Row label={costNoun} value={formatBaht(selB.cost)} />}
                <Row label="รวม" value={formatBaht(outflow(selB))} strong />
              </>
            )}
            {kind === 'overview' && (
              <>
                <Row label="ยอดขาย" value={formatBaht(selB.sales)} />
                <Row label="รายจ่าย" value={formatBaht(outflow(selB))} />
                <Row label="ส่วนต่าง" value={formatBaht(selB.sales - outflow(selB))} strong />
              </>
            )}
          </dl>
        </div>
      )}

      {/* ยอดรวมของช่วง + แถบสัดส่วน */}
      {data && t && hasAny && seriesDefs.length > 0 && (
        <div className="border-default-200 border-t px-5 py-3">
          {kind === 'sales' && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-default-700 text-sm">
                  ยอดขายรวม · {data.rangeLabel}
                  {settings.jobCount && <> · {t.jobs.toLocaleString('th-TH')} งาน</>}
                </span>
                <span className="text-default-900 text-lg font-semibold tabular-nums">{formatBaht(t.sales)}</span>
              </div>
              {settings.receivables && t.sales > 0 && (
                <>
                  <div className={`${C.outstanding.soft} mt-2 flex h-2 overflow-hidden rounded-full`} aria-hidden="true">
                    <div className={`${C.counted.dot} h-full`} style={{ width: `${Math.min(100, (t.received / t.sales) * 100)}%` }} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-default-700">
                      <span className={`${C.counted.dot} me-1 inline-block size-2 rounded-full`} aria-hidden="true" />
                      รับแล้ว {formatBaht(t.received)}
                      <span className={`${C.outstanding.dot} ms-3 me-1 inline-block size-2 rounded-full`} aria-hidden="true" />
                      ค้างรับ {formatBaht(t.outstanding)}
                    </span>
                    {receivablesHref && t.outstanding > 0 && (
                      <a href={receivablesHref} className="text-primary-ink font-semibold underline">
                        ดูงานค้างรับ
                      </a>
                    )}
                  </div>
                  {withUnclosed && t.unclosed > 0 && (
                    <p className="text-default-700 mt-1 text-xs">
                      <span className={`${C.notCounted.dot} me-1 inline-block size-2 rounded-full`} aria-hidden="true" />
                      ยังไม่ปิดงาน {formatBaht(t.unclosed)} — ยังไม่นับเป็นยอดขาย นับเมื่อกดปิดงาน
                    </p>
                  )}
                  {t.unrecorded > 0 && (
                    <p className="text-default-600 mt-1 text-xs">
                      ในค้างรับมี {formatBaht(t.unrecorded)} จากงานที่ยังไม่เคยบันทึกรับเงิน — อาจรับแล้วแต่ยังไม่ได้กดบันทึก
                    </p>
                  )}
                </>
              )}
            </>
          )}
          {kind === 'expense' && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-default-700 text-sm">รายจ่ายรวม · {data.rangeLabel}</span>
              <span className="text-default-900 text-lg font-semibold tabular-nums">{formatBaht(outflow(t))}</span>
            </div>
          )}
          {kind === 'overview' && (
            <>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <Row label="ยอดขายทั้งหมด" value={formatBaht(t.sales)} />
                <Row label="รายจ่ายทั้งหมด" value={formatBaht(outflow(t))} />
                <Row
                  label="ส่วนต่าง"
                  value={formatBaht(profitShown(settings, { revenue: t.sales, cogs: t.cost, expense: t.expense }))}
                  strong
                />
              </dl>
              {profitExclusionNote(settings, costNoun) && (
                <p className="text-warning-ink mt-1.5 text-xs">{profitExclusionNote(settings, costNoun)}</p>
              )}
            </>
          )}
          {data.hasMissingCost && settings.partCost && kind !== 'sales' && (
            <p className="text-warning-ink mt-1.5 text-xs">บางงานยังไม่ได้ตั้ง{costNoun} — ตัวเลข{costNoun}ยังไม่ครบ</p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-default-600 truncate text-xs">{label}</dt>
      <dd className={`mb-0 tabular-nums ${strong ? 'text-default-900 font-semibold' : warn ? 'text-warning-ink' : 'text-default-800'}`}>
        {value}
      </dd>
    </div>
  )
}
