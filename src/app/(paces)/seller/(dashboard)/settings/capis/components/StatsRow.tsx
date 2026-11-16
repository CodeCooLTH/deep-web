'use client'

/**
 * แถว "ผลการส่งให้ Meta" — การ์ดเดียวแบบ KPI strip 4 ช่อง (redesign 2026-11-16: เดิม 4 การ์ด) (รอส่ง · ส่งสำเร็จ · ยอดขายที่ส่งให้ Meta · ลีด) + สวิตช์ 7/30 วัน (feature 00089 stat-cards)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/projects/components/ProjectStat.tsx (การ์ดเดียวแบ่งช่อง) + .../widgets/charts/components/Stat.tsx (.card h-full > card-body · หัวไอคอนวงกลม · ตัวเลขใหญ่ ·
 *   delta % + trending-up/down · sparkline ApexChart area/sparkline ใช้ options ตาม statData ใน data.ts: stroke 2 smooth · gradient 0.5→0)
 *   + theme: .../widgets/charts/page.tsx (กริด xl:grid-cols-4 md:grid-cols-2)
 * Mockup: docs/superpowers/specs/2026-11-14-00089-capi-stat-cards-mockup.html
 *
 * ตัดจาก Stat.tsx: CountUp (ตัวเลขนับขึ้นทุกครั้งที่สลับช่วง = รบกวน) และสีตัวเลข delta ใช้ -ink ให้คอนทราสต์ผ่านบนพื้นการ์ด
 * ช่วงเวลาอยู่ใน URL (?days=) → server โหลดสถิติใหม่ · การ์ดรอส่งไม่มี sparkline โดยตั้งใจ (PENDING เป็นภาพ ณ ตอนนี้ ย้อนดูรายวันไม่ได้)
 */
import type { ApexOptions } from 'apexcharts'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useTransition } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { formatDateTime } from '@/lib/format-date'
import { formatBaht } from '@/lib/format-money'
import type { CapiMetric } from '@/lib/meta-capi/stats'
import { cn, getColor } from '@/utils/helpers'
import type { StatsView } from './types'

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** sparkline ตาม statData ของธีม — getOptions ต้องนิ่ง (wrapper memo ตามมัน) จึงห่อ useCallback */
function Spark({ series, color, name }: { series: number[]; color: string; name: string }) {
  const getOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: 'area', height: 40, sparkline: { enabled: true } },
      series: [{ name, data: series }],
      stroke: { width: 2, curve: 'smooth' },
      markers: { size: 0 },
      colors: [getColor(color)],
      tooltip: { fixed: { enabled: false }, x: { show: false }, marker: { show: false } },
      fill: { opacity: [1], type: ['gradient'], gradient: { type: 'vertical', inverseColors: false, opacityFrom: 0.5, opacityTo: 0, stops: [0, 100] } },
    }),
    [series, color, name],
  )
  return <ApexChart getOptions={getOptions} />
}

type CellProps = {
  title: string
  icon: string
  iconTone?: string
  value: string
  valueTone?: string
  unit: string
  tone?: string
  sub: React.ReactNode
  chart?: React.ReactNode
}

/** ช่องหนึ่งใน KPI strip — ไม่มีกรอบการ์ดของตัวเอง (เส้นคั่นมาจากกริด gap-px บนพื้น default-200) */
function StatCell({ title, icon, iconTone, value, valueTone, unit, tone, sub, chart }: CellProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2 p-4 sm:p-5', tone ?? 'bg-card')}>
      <div className="flex items-center gap-2">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', iconTone ?? 'bg-light text-default-700')}>
          <Icon icon={icon} className="size-4" aria-hidden="true" />
        </span>
        <h5 className="text-default-700 min-w-0 truncate text-xs font-semibold" title={title}>
          {title}
        </h5>
      </div>
      <div className="min-w-0">
        <p className={cn('text-xl leading-tight font-bold break-words tabular-nums', valueTone ?? 'text-default-900')}>
          {value}
        </p>
        {unit ? <p className="text-default-700 truncate text-xs">{unit}</p> : null}
      </div>
      {chart ? <div className="min-w-0">{chart}</div> : null}
      <div className="space-y-0.5">{sub}</div>
    </div>
  )
}

export default function StatsRow({ stats, logHref }: { stats: StatsView; logHref: string }) {
  const t = useT().conversionsApi
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  const setDays = (d: 7 | 30) => {
    if (d === stats.days) return
    startTransition(() => router.replace(d === 7 ? pathname : `${pathname}?days=${d}`, { scroll: false }))
  }

  const age = (min: number) => (min < 60 ? fmt(t.statsAgeMin, { n: min }) : min < 1440 ? fmt(t.statsAgeHr, { n: Math.floor(min / 60) }) : fmt(t.statsAgeDay, { n: Math.floor(min / 1440) }))
  const noData = <p className="text-default-700 text-xs">{t.statsNoData}</p>
  const vsPrev = fmt(t.statsVsPrev, { n: stats.days })

  /** delta ตาม Stat.tsx · ช่วงก่อนเป็น 0 = ไม่หาร (ป้าย "ใหม่") · 0 ทั้งคู่ = ไม่มีข้อมูล */
  const delta = (m: CapiMetric) => {
    if (m.total === 0 && m.prevTotal === 0) return noData
    // ช่วงก่อนว่าง = บอกครั้งเดียวที่หัวแถว (anyNew) ไม่ซ้ำทุกช่อง
    if (m.deltaPct === null) return null
    const up = m.deltaPct >= 0
    return (
      <p className="text-default-700 flex flex-wrap items-center gap-x-1.5 text-xs">
        <span className={cn('flex items-center gap-0.5 font-semibold', up ? 'text-success-ink' : 'text-danger-ink')}>
          <Icon icon={up ? 'trending-up' : 'trending-down'} className="size-3.5" aria-hidden="true" />
          {Math.abs(m.deltaPct)}%
        </span>
        {vsPrev}
      </p>
    )
  }
  // ไม่มีอะไรให้วาด = เส้นประแบน (กราฟค่า 0 ล้วนดูเหมือนข้อมูลพัง)
  const spark = (m: CapiMetric, color: string, name = t.statsSeriesName) =>
    m.total === 0 ? <div className="border-default-300 mt-5 border-t-2 border-dashed" aria-hidden="true" /> : <Spark series={m.series} color={color} name={name} />

  const periodBtn = (d: 7 | 30, label: string) => (
    <button key={d} type="button" aria-pressed={stats.days === d} onClick={() => setDays(d)} className={cn('btn btn-sm min-h-11 lg:min-h-0', stats.days === d ? 'bg-primary/15 text-primary-ink font-semibold' : 'text-default-700')}>
      {label}
    </button>
  )
  const logLink = (
    <Link href={logHref} className="text-primary-ink flex min-h-11 items-center gap-1 text-sm font-medium lg:min-h-0">
      <Icon icon="history" className="size-4" aria-hidden="true" />
      {t.viewLog}
      <Icon icon="chevron-right" className="size-3.5" aria-hidden="true" />
    </Link>
  )

  // ช่วงก่อนไม่มีข้อมูล (มีแต่ช่วงนี้) — บอกครั้งเดียวที่หัวการ์ดแทนป้ายซ้ำทุกช่อง
  const anyNew = [stats.sent, stats.sales, stats.leads].some((m) => m.deltaPct === null && m.total > 0)
  // ช่องสุขภาพ: มีปัญหา = ตัวเลขก่อน (ส่งไม่สำเร็จชนะรอส่ง) + เติมสีทั้งช่อง · ปกติ = "ปกติ" เงียบ ๆ
  const health =
    stats.failed > 0
      ? { value: num.format(stats.failed), unit: fmt(t.statsHealthFailed, { n: stats.days }), ink: 'text-danger-ink', fill: 'bg-danger/15', icon: 'clock-exclamation', tile: 'bg-danger/15 text-danger-ink' }
      : stats.pending > 0
        ? { value: num.format(stats.pending), unit: stats.oldestPendingMin !== null ? `${t.statsHealthPending} · ${fmt(t.statsOldest, { age: age(stats.oldestPendingMin) })}` : t.statsHealthPending, ink: 'text-warning-ink', fill: 'bg-warning/15', icon: 'clock-exclamation', tile: 'bg-warning/15 text-warning-ink' }
        : { value: t.statsHealthOk, unit: '', ink: 'text-default-900', fill: undefined, icon: 'clock', tile: undefined }

  return (
    <section aria-label={t.statsTitle} aria-busy={pending || undefined} className="card overflow-hidden">
      <div className="card-header flex flex-wrap items-center gap-x-3 gap-y-2">
        <h4 className="card-title">{t.statsTitle}</h4>
        <div role="group" aria-label={t.statsPeriodAria} className="border-default-300 bg-card inline-flex rounded border p-0.5">
          {periodBtn(7, t.statsPeriod7)}
          {periodBtn(30, t.statsPeriod30)}
        </div>
        {anyNew && (
          <p className="text-default-700 flex items-center gap-1.5 text-xs">
            <span className="badge bg-default-200 text-default-800">{t.statsNew}</span>
            {t.statsNewHint}
          </p>
        )}
        <span className="ms-auto">{logLink}</span>
      </div>

      {/* KPI strip: เส้นคั่นจาก gap-px บนพื้น default-200 (ใช้ได้ทั้ง 2×2 และ 1×4 โดยไม่ต้องไล่ border ต่อช่อง) */}
      <div className={cn('bg-default-200 grid grid-cols-2 gap-px transition-opacity md:grid-cols-4', pending && 'opacity-60')}>
        <StatCell
          title={t.statsHealth}
          icon={health.icon}
          iconTone={health.tile}
          tone={health.fill}
          value={health.value}
          valueTone={health.ink}
          unit={health.unit}
          sub={
            <>
              {/* แยกกรอบเวลาให้ชัด: รอส่ง = ตอนนี้ · ส่งไม่สำเร็จ = ในช่วงที่เลือก */}
              <p className="text-default-700 text-xs">
                {t.statsHealthPending} <span className="text-default-900 tabular-nums">{num.format(stats.pending)}</span>
              </p>
              <p className="text-default-700 text-xs">
                {fmt(t.statsHealthFailed, { n: stats.days })}{' '}
                <span className={cn('tabular-nums', stats.failed > 0 ? 'text-danger-ink font-semibold' : 'text-default-900')}>{num.format(stats.failed)}</span>
              </p>
              <p className="text-default-700 text-xs">
                {t.resultsLast} <span className="text-default-900 tabular-nums">{stats.lastSentAt ? formatDateTime(stats.lastSentAt) : t.resultsNever}</span>
              </p>
              {stats.failed > 0 && (
                <Link href={`${logHref}?status=FAILED`} className="text-primary-ink flex min-h-11 items-center text-xs font-medium underline underline-offset-2 lg:min-h-0">
                  {t.statsViewFailed}
                </Link>
              )}
            </>
          }
        />
        <StatCell title={t.statsSent} icon="circle-check" value={num.format(stats.sent.total)} unit={t.statsEvents} sub={delta(stats.sent)} chart={spark(stats.sent, 'chart-alpha')} />
        <StatCell
          title={t.statsSales}
          icon="receipt"
          value={formatBaht(stats.sales.total)}
          unit={fmt(t.statsOrders, { n: num.format(stats.sales.orders) })}
          sub={
            <>
              {delta(stats.sales)}
              <p className="text-default-700 text-2xs">{t.statsSalesNote}</p>
            </>
          }
          chart={spark(stats.sales, 'chart-primary', t.statsSalesSeries)}
        />
        <StatCell title={t.statsLeads} icon="user-check" value={num.format(stats.leads.total)} unit={t.statsLeadsUnit} sub={delta(stats.leads)} chart={spark(stats.leads, 'chart-primary')} />
      </div>
    </section>
  )
}
