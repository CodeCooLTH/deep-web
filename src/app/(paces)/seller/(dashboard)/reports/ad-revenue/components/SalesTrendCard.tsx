'use client'

/**
 * SalesTrendCard — แนวโน้ม: รายวัน/รายสัปดาห์/รายเดือน · เลือกตัวชี้วัด (รับเงินแล้ว · ยอดขายจากโฆษณา · {noun}) · ช่วงนี้ทึบ เทียบช่วงก่อนเส้นประ (00091 เฟส 3)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx
 *   (card-header + แท็บขวาขีดเส้นใต้ primary · แถบสรุปพื้นจางเส้นประล่าง `bg-light/25 border-b border-dashed` · area gradient stroke 3 + เส้นประ dashArray 8 · grid strokeDashArray 7)
 * ต่างจากธีม: สี chart-primary (ธีมใช้ chart-secondary = ม่วง buyer ห้ามใช้) · แท็บเป็น state ฝั่ง client (ไม่ใช้ hs-tab) · ช่วงก่อนหน่วยเดียวกัน ไม่มีแกน y คู่
 * ข้อมูล: report.daily + report.prevDaily (index ตรงกัน) รวมเป็นสัปดาห์/เดือนฝั่ง client — ผลรวมทุกถัง = ตัวเลขในแถบสรุป
 * "รับเงินแล้ว" นับตามวันสั่ง → ใบใหม่ (COD ยังไม่ถึงมือ) ทำให้ท้ายช่วงต่ำ: แสดงแท่ง "รอเก็บเงิน" (daily.pending) คู่กันให้เห็นว่าเงินรออยู่ ไม่ได้หาย (user 2026-11-16)
 * 🛑 ห้ามคีย์ undefined ใน options · getOptions ห่อ useCallback · สลับตัวชี้วัด/ช่วงไม่ remount
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback, useId, useMemo, useRef, useState } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { formatDayMonth, formatMonthYearTH } from '@/lib/format-date'
import { formatBaht, formatBahtCompact, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { cn, getColor } from '@/utils/helpers'
import type { AdRevenueReport } from './data'

type Gran = 'day' | 'week' | 'month'
type Metric = 'collected' | 'sales' | 'orders'
const GRANS: Gran[] = ['day', 'week', 'month']
const METRICS: Metric[] = ['collected', 'sales', 'orders']
const ICON: Record<Metric, string> = { collected: 'wallet', sales: 'cash', orders: 'shopping-cart' }

/** ถัง = ชุด index ของวัน (ทั้งช่วงนี้และช่วงก่อนใช้ index เดียวกัน) */
function buckets(days: string[], gran: Gran): number[][] {
  if (gran === 'day') return days.map((_, i) => [i])
  const by = new Map<string, number[]>()
  days.forEach((d, i) => {
    const k = gran === 'week' ? String(Math.floor(i / 7)) : d.slice(0, 7)
    by.set(k, [...(by.get(k) ?? []), i])
  })
  return [...by.values()]
}

export default function SalesTrendCard({ summary, daily, prevDaily, noun }: { summary: AdRevenueReport['summary']; daily: AdRevenueReport['daily']; prevDaily: AdRevenueReport['prevDaily']; noun: string }) {
  const t = useT().adRevenue
  const uid = useId()
  const [gran, setGran] = useState<Gran>('day')
  const [metric, setMetric] = useState<Metric>('collected')
  const refs = useRef<Record<Gran, HTMLButtonElement | null>>({ day: null, week: null, month: null })
  const money = metric !== 'orders'

  const showPending = metric === 'collected'
  const { cats, cur, prev, pending } = useMemo(() => {
    const bs = buckets(daily.map((d) => d.day), gran)
    const sum = (rows: { [k in Metric]: number }[], b: number[]) => Math.round(b.reduce((s, i) => s + (rows[i]?.[metric] ?? 0), 0) * 100) / 100
    return {
      cats: bs.map((b) => (gran === 'month' ? formatMonthYearTH(daily[b[0]].day) : formatDayMonth(daily[b[0]].day))),
      cur: bs.map((b) => sum(daily, b)),
      prev: bs.map((b) => sum(prevDaily, b)),
      pending: bs.map((b) => Math.round(b.reduce((s, i) => s + (daily[i]?.pending ?? 0), 0) * 100) / 100),
    }
  }, [daily, prevDaily, gran, metric])

  const totals: Record<Metric, { label: string; value: string }> = {
    collected: { label: t.collected, value: formatBaht(summary.collected) },
    sales: { label: t.sumSales, value: formatBaht(summary.sales) },
    orders: { label: noun, value: formatNumberNoSymbol(summary.orders) },
  }

  const getOptions = useCallback((): ApexOptions => ({
    chart: { type: 'line', height: 348, toolbar: { show: false } },
    series: [
      { name: t.seriesThis, type: 'area', data: cur },
      { name: t.seriesPrev, type: 'line', data: prev },
      ...(showPending ? [{ name: t.seriesPending, type: 'column', data: pending }] : []),
    ],
    stroke: { width: showPending ? [3, 2, 0] : [3, 2], curve: 'smooth', dashArray: showPending ? [0, 8, 0] : [0, 8] },
    colors: [getColor('chart-primary'), getColor('default-400'), ...(showPending ? [getColor('chart-gamma')] : [])],
    plotOptions: { bar: { columnWidth: '50%', borderRadius: 2 } },
    grid: { strokeDashArray: 7 },
    xaxis: { categories: cats, tickAmount: Math.min(cats.length, 9), axisBorder: { show: false }, labels: { offsetY: 2, rotate: 0, hideOverlappingLabels: true } },
    yaxis: { min: 0, tickAmount: 4, labels: { offsetX: -10, formatter: (v: number) => (money ? formatBahtCompact(v) : formatNumberNoSymbol(Math.round(v))) }, axisBorder: { show: false } },
    dataLabels: { enabled: false },
    markers: { size: 0 },
    legend: { position: 'bottom' },
    tooltip: { shared: true, y: { formatter: (v: number) => (money ? formatBaht(v) : formatNumberNoSymbol(v)) } },
    fill: { opacity: showPending ? [1, 1, 0.7] : [1, 1], type: showPending ? ['gradient', 'solid', 'solid'] : ['gradient', 'solid'], gradient: { type: 'vertical', inverseColors: false, opacityFrom: 0.5, opacityTo: 0, stops: [0, 70] } },
  }), [cats, cur, prev, pending, showPending, money, t.seriesThis, t.seriesPrev, t.seriesPending])

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const to = e.key === 'ArrowRight' ? (i + 1) % GRANS.length : e.key === 'ArrowLeft' ? (i - 1 + GRANS.length) % GRANS.length : e.key === 'Home' ? 0 : e.key === 'End' ? GRANS.length - 1 : null
    if (to === null) return
    e.preventDefault()
    setGran(GRANS[to])
    refs.current[GRANS[to]]?.focus()
  }

  return (
    <div className="card h-full min-w-0">
      <div className="card-header md:py-0 pt-6 pb-0">
        <h4 className="card-title">
          {t.trendTitle}<span className="text-default-600 ms-1 text-sm font-normal">({t.trendNote})</span>
        </h4>
        <nav className="flex gap-x-1" role="tablist" aria-label={t.trendTitle}>
          {GRANS.map((g, i) => (
            <button
              key={g} ref={(el) => { refs.current[g] = el }} id={`${uid}-g-${g}`} type="button" role="tab" aria-selected={gran === g} aria-controls={`${uid}-panel`}
              tabIndex={gran === g ? 0 : -1} onClick={() => setGran(g)} onKeyDown={(e) => onKey(e, i)}
              className={cn('hover:text-primary inline-flex min-h-11 items-center border-b border-transparent px-4 py-3 text-sm whitespace-nowrap md:py-4.25', gran === g && 'border-primary text-primary font-semibold')}>
              {t.gran[g]}
            </button>
          ))}
        </nav>
      </div>
      <div className="bg-light/25 border-default-300 border-b border-dashed">
        <div className="gap-base grid grid-cols-3 text-center" role="tablist" aria-label={t.trendTitle}>
          {METRICS.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={metric === m} onClick={() => setMetric(m)} className={cn('min-h-11 border-b-2 border-transparent px-2 pt-4 pb-3', metric === m && 'border-primary')}>
              <span className={cn('mb-1 block text-xs', metric === m ? 'text-primary font-semibold' : 'text-default-600')}>{totals[m].label}</span>
              <span className="text-default-900 flex items-center justify-center text-lg font-semibold tabular-nums">
                <Icon icon={ICON[m]} className={cn('me-1.5', metric === m ? 'text-primary' : 'text-default-500')} aria-hidden="true" />
                {totals[m].value}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="p-5 pt-1.25" role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-g-${gran}`}>
        <div role="img" aria-label={`${t.trendTitle}: ${totals[metric].label} ${totals[metric].value}`} className="min-h-80">
          <ApexChart getOptions={getOptions} type="line" height={348} />
        </div>
      </div>
    </div>
  )
}
