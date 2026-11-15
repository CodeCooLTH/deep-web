'use client'

/**
 * SalesTimeHeatmap — ช่วงเวลาขาย: วันในสัปดาห์ × ชั่วโมง (เวลาไทย) สลับ ยอดขาย | จำนวน (00091 เฟส 3 FR-017)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/charts/apex/heatmap/components/data.ts → colorScale.ranges ผ่าน ApexChart wrapper
 *   ตัวสลับ: src/app/(paces)/seller/(dashboard)/reports/ads/components/DailyOverviewCard.tsx (ซึ่ง Base เป็น dashboard/analytics/components/SessionOverview.tsx — tablist)
 * 🛑 บรรทัด "ขายดีสุด…" ซ่อนเมื่อออเดอร์ในช่วง < INSIGHT_RULES.minOrders (ตัวเลขน้อยชี้ช่วงที่ไม่มีความหมาย — มติ Controller Q5)
 * 🛑 ไม่มี data label ในช่อง (หนาแน่นเกิน) · สีเดียว chart-primary · สลับ series ไม่ remount
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback, useId, useRef, useState } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import { INSIGHT_RULES } from '@/lib/ad-revenue-view'
import { formatBaht, formatBahtCompact, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'
import { heatmapRanges } from './heatmap-scale'
import InfoTip from './InfoTip'
import type { AdRevenueReport } from './data'

type Metric = 'sales' | 'orders'
const METRICS: Metric[] = ['sales', 'orders']
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const HEIGHT = 300

export default function SalesTimeHeatmap({ heatmap, totalOrders, noun }: { heatmap: AdRevenueReport['heatmap']; totalOrders: number; noun: string }) {
  const t = useT().adRevenue
  const uid = useId()
  const [metric, setMetric] = useState<Metric>('sales')
  const refs = useRef<Record<Metric, HTMLButtonElement | null>>({ sales: null, orders: null })
  const data = heatmap[metric]
  const money = metric === 'sales'
  const max = data.reduce((m, r) => Math.max(m, ...r), 0)

  // ช่องที่ขายดีที่สุด (ตามยอดเงินเสมอ — ข้อความพระเอกไม่เปลี่ยนตามตัวสลับ)
  let best = { row: 0, hour: 0, v: 0 }
  heatmap.sales.forEach((r, row) => r.forEach((v, hour) => { if (v > best.v) best = { row, hour, v } }))
  const bestLine = totalOrders >= INSIGHT_RULES.minOrders && best.v > 0
    ? fmt(t.bestSlot, {
        day: t.weekdays[best.row], from: HOURS[best.hour], to: String((best.hour + 1) % 24).padStart(2, '0'),
        amount: formatBaht(best.v), n: formatNumberNoSymbol(heatmap.orders[best.row][best.hour]), noun,
      })
    : null

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const to = e.key === 'ArrowRight' || e.key === 'ArrowLeft' ? (i + 1) % METRICS.length : e.key === 'Home' ? 0 : e.key === 'End' ? METRICS.length - 1 : null
    if (to === null) return
    e.preventDefault()
    setMetric(METRICS[to])
    refs.current[METRICS[to]]?.focus()
  }

  const getOptions = useCallback((): ApexOptions => ({
    chart: { type: 'heatmap', height: HEIGHT, toolbar: { show: false } },
    dataLabels: { enabled: false },
    // Apex วาดซีรีส์แรกไว้ล่างสุด → ส่งอาทิตย์ก่อนเพื่อให้จันทร์อยู่บน
    series: data.map((row, i) => ({ name: t.weekdays[i], data: row.map((v, h) => ({ x: HOURS[h], y: v })) })).reverse(),
    plotOptions: { heatmap: { radius: 2, enableShades: false, colorScale: { ranges: heatmapRanges(max, { none: t.heatNone, l1: t.heatL1, l2: t.heatL2, l3: t.heatL3, l4: t.heatL4 }, (v) => (money ? formatBahtCompact(v) : formatNumberNoSymbol(Math.round(v)))) } } },
    stroke: { width: 2 },
    legend: { position: 'top', horizontalAlign: 'right' },
    xaxis: { labels: { hideOverlappingLabels: true }, axisBorder: { show: false } },
    tooltip: { y: { formatter: (v: number) => (money ? formatBaht(v) : fmt(t.ordersCount, { n: formatNumberNoSymbol(v) })) } },
  }), [data, max, money, t])

  return (
    <div className="card min-w-0">
      <div className="card-header flex-wrap gap-2">
        <h4 className="card-title">{t.timeTitle}</h4>
        <InfoTip text={t.timeNote} />
        <div className="ms-auto flex gap-1" role="tablist" aria-label={t.timeTitle}>
          {METRICS.map((m, i) => (
            <button
              key={m} ref={(el) => { refs.current[m] = el }} id={`${uid}-${m}`} type="button" role="tab" aria-selected={metric === m} aria-controls={`${uid}-panel`}
              tabIndex={metric === m ? 0 : -1} onClick={() => setMetric(m)} onKeyDown={(e) => onKey(e, i)}
              className={cn('min-h-11 border-b-2 border-transparent px-3 text-sm lg:min-h-0', metric === m && 'border-primary text-primary font-semibold')}>
              {m === 'sales' ? t.metricSales : t.metricOrders}
            </button>
          ))}
        </div>
      </div>
      <div className="card-body">
        {bestLine && <p className="text-default-900 mb-3 text-lg font-semibold tabular-nums">{bestLine}</p>}
        <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-${metric}`}>
          <div role="img" aria-label={bestLine ?? t.timeTitle} className="min-h-72">
            <ApexChart getOptions={getOptions} type="heatmap" height={HEIGHT} />
          </div>
        </div>
      </div>
    </div>
  )
}
