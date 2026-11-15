'use client'

/**
 * ProfitCard — ความคุ้มค่า: ROAS ตอนนี้ · ROAS คุ้มทุน · อัตรากำไรขั้นต้น · กำไรหลังค่าโฆษณา + น้ำตก + กำไรรายแคมเปญ (00094 FR-010)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/FinancialOverview.tsx
 *   (card-header · แถบสรุป 4 ช่อง bg-light/25 เส้นประล่าง ไอคอน+ตัวเลขกลาง · กราฟใต้แถบ)
 * Base (น้ำตก): theme/paces/Admin/TS/src/app/(admin)/charts/apex/column/components/data.ts (stacked column — ธีมไม่มี waterfall จึงทำฐานโปร่ง)
 * Base (รายแคมเปญ): theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/WeeklyPerformanceInsights.tsx (bar horizontal)
 *
 * 🛑 ต้นทุนไม่ครบ/ใบเกินเพดาน/ไม่มีค่าโฆษณา → กล่อง warning บรรทัดเดียว "ข้อมูลไม่เพียงพอ" ห้ามเดาเป็น 0 (profitView ตัดสิน)
 *    กำไรติดลบ = ข้อความ − + สี warning-ink (ไม่ใช้ danger) · อัตรากำไร ≤ 0 → ไม่แสดง ROAS คุ้มทุน แสดง "ขายต่ำกว่าทุน"
 *    ป้ายถาวร "ยังไม่หักค่าส่ง/ค่าธรรมเนียม" · สี chart-primary / default-400 / chart-zeta (ห้ามม่วง)
 */
import type { ApexOptions } from 'apexcharts'
import Link from 'next/link'
import { useCallback, useMemo } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { formatValue, profitByCampaign, profitView, waterfall } from '@/lib/ad-summary/view'
import type { AdSummaryReport } from '@/lib/ad-summary/types'
import { formatBaht, formatBahtCompact } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn, getColor } from '@/utils/helpers'
import { InfoTip } from './Bits'

const signed = (n: number, f: (v: number) => string) => `${n < 0 ? '−' : ''}${f(n)}`

export default function ProfitCard({ report }: { report: AdSummaryReport }) {
  const t = useT().adSummary
  const { profit, kpi, meta } = report
  const view = profitView(profit, meta.state)
  const bars = useMemo(() => (view.kind === 'ok' ? waterfall(profit) : null), [view.kind, profit])
  const camps = useMemo(() => profitByCampaign(profit), [profit])
  const names = [t.wfSales, t.wfCogs, t.wfSpend, t.wfProfit]

  const getWaterfall = useCallback((): ApexOptions => {
    const b = bars ?? []
    const colorOf = (i: number) => (b[i]?.key === 'cogs' || b[i]?.key === 'spend' ? getColor('default-400') : b[i]?.key === 'profit' && b[i].label < 0 ? getColor('chart-zeta') : getColor('chart-primary'))
    const lab = (i: number) => signed(b[i].minus ? -Math.abs(b[i].label) : b[i].label, (v) => formatBahtCompact(v))
    return {
      chart: { type: 'bar', height: 260, stacked: true, toolbar: { show: false }, animations: { enabled: false } },
      series: [
        { name: 'base', data: b.map((x) => x.base) },
        { name: 'pos', data: b.map((x) => x.pos) },
        { name: 'neg', data: b.map((x) => x.neg) },
      ],
      colors: ['transparent', ({ dataPointIndex }: { dataPointIndex: number }) => colorOf(dataPointIndex), ({ dataPointIndex }: { dataPointIndex: number }) => colorOf(dataPointIndex)],
      fill: { opacity: [0, 1, 1] },
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 2 } },
      states: { hover: { filter: { type: 'none' } } },
      // ป้ายตัวเลขจริงของแท่ง (ไม่ใช่ความสูงของส่วนบวก/ลบ) · แท่งที่คร่อมศูนย์ติดป้ายที่ส่วนบวกอย่างเดียว
      dataLabels: {
        enabled: true,
        enabledOnSeries: [1, 2],
        formatter: (v: string | number | number[], o?: { seriesIndex: number; dataPointIndex: number }) => {
          const x = o ? b[o.dataPointIndex] : undefined
          if (!o || !x || Number(v) === 0) return ''
          if (o.seriesIndex === 2 && x.pos !== 0) return ''
          return lab(o.dataPointIndex)
        },
        style: { fontSize: '11px', fontWeight: 600, colors: [getColor('default-900')] },
        offsetY: -20,
      },
      xaxis: { categories: names, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { tickAmount: 4, labels: { formatter: (v: number) => signed(v, (n) => formatBahtCompact(n)) } },
      grid: { strokeDashArray: 4 },
      legend: { show: false },
      tooltip: { enabledOnSeries: [1, 2], y: { formatter: (_v: number, o?: { dataPointIndex: number }) => (o ? lab(o.dataPointIndex) : '') } },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- names มาจาก t (อ้างอิงเดียวกับ t)
  }, [bars, t])

  const getPerCampaign = useCallback(
    (): ApexOptions => ({
      chart: { type: 'bar', height: 260, toolbar: { show: false }, animations: { enabled: false } },
      series: [{ name: t.pProfit, data: camps.map((c) => c.value) }],
      colors: [({ value }: { value: number }) => (value < 0 ? getColor('chart-zeta') : getColor('chart-primary'))],
      plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 2 } },
      dataLabels: { enabled: false },
      grid: { strokeDashArray: 4 },
      legend: { show: false },
      // Apex escape ชื่อใน tooltip เอง (escapeString) — escape ซ้ำจะโชว์ &amp; บนแกน
      xaxis: { categories: camps.map((c) => c.name), labels: { formatter: (v: string) => signed(Number(v), (n) => formatBahtCompact(n)) } },
      yaxis: { labels: { maxWidth: 160 } },
      tooltip: { y: { formatter: (v: number) => signed(v, formatBaht) } },
    }),
    [camps, t],
  )

  const header = (
    <div className="card-header">
      <h4 className="card-title">{t.profTitle}</h4>
      <span className="badge bg-light text-default-800">{t.profNote}</span>
    </div>
  )

  if (view.kind !== 'ok') {
    const msg = view.kind === 'noSpend' ? t.pNoSpend : view.missing > 0 ? fmt(t.pInsufficient, { n: view.missing }) : t.pInsufficientGeneric
    return (
      <div className="card">
        {header}
        <div className="card-body">
          <div role="status" className="bg-warning/15 text-warning-ink flex flex-wrap items-center gap-3 rounded px-4 py-3 text-sm font-medium">
            <Icon icon="alert-triangle" className="text-lg" aria-hidden="true" />
            <span className="min-w-0 flex-1">{msg}</span>
            {view.kind === 'insufficient' && (
              <Link href="/products" className="btn btn-sm border-warning text-warning-ink min-h-11 border lg:min-h-0">
                {t.pGoProducts}
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  const net = profit.profitAfterAds
  const strip: { label: string; icon: string; value: React.ReactNode; tip?: string; cls: string }[] = [
    { label: t.pRoasNow, icon: 'chart-arrows-vertical', value: formatValue('x2', kpi.roas.cur), cls: 'text-primary-ink' },
    {
      label: t.pBreakEven, icon: 'scale', tip: t.pBreakEvenTip, cls: 'text-default-700',
      value: view.belowCost ? t.pBelowCost : profit.breakEvenRoas === null ? '—' : formatValue('x2', profit.breakEvenRoas),
    },
    { label: t.pMargin, icon: 'percentage', tip: t.pMarginTip, cls: 'text-default-700', value: profit.grossMargin === null ? '—' : formatValue('pct1', profit.grossMargin * 100) },
    { label: t.pProfit, icon: 'coin', cls: net !== null && net < 0 ? 'text-warning-ink' : 'text-success-ink', value: net === null ? '—' : signed(net, formatBaht) },
  ]

  return (
    <div className="card">
      {header}
      <div className="bg-light/25 border-default-300 border-b border-dashed">
        <div className="gap-base grid grid-cols-2 text-center md:grid-cols-4">
          {strip.map((s) => (
            <div key={s.label} className="px-2">
              <p className="text-default-600 mt-5 mb-1.5 flex items-center justify-center gap-1 text-sm">
                {s.label}
                {s.tip && <InfoTip text={s.tip} />}
              </p>
              <h4 className="text-default-900 mb-base flex items-center justify-center gap-1.25 text-lg font-semibold tabular-nums">
                <span className={cn(s.cls)}>
                  <Icon icon={s.icon} className="text-lg" aria-hidden="true" />
                </span>
                {s.value}
              </h4>
            </div>
          ))}
        </div>
      </div>
      <div className="card-body">
        <div className="gap-base grid grid-cols-1 xl:grid-cols-12">
          <div className="min-w-0 xl:col-span-5">
            <p className="text-default-800 mb-1 text-sm font-medium">{t.wfTitle}</p>
            <div role="img" aria-label={t.wfAria}>
              <ApexChart getOptions={getWaterfall} type="bar" height={260} />
            </div>
          </div>
          <div className="min-w-0 xl:col-span-7">
            <p className="text-default-800 mb-1 text-sm font-medium">{t.perCampTitle}</p>
            {camps.length === 0 ? (
              <p className="text-default-700 py-10 text-center text-sm">{t.perCampEmpty}</p>
            ) : (
              <div role="img" aria-label={t.perCampAria}>
                <ApexChart getOptions={getPerCampaign} type="bar" height={260} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
