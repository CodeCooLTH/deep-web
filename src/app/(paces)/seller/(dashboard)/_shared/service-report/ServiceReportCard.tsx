'use client'

/**
 * การ์ดยอดขายหน้าแรกของร้านบริการ (feature 00078 · BRD FR-010) — มือถือ (แตะ → ชีต) และคอม (แตะ → /sales)
 *
 * หัว: ไอคอน · ชื่อตามตั้งค่า · ปุ่มตั้งค่า (ก่อน) · วันนี้/เดือนนี้ → ตัวเลข → บรรทัด % → กราฟ
 * ไม่มีป้ายสี/จำนวนงาน/ยอดขาย-หักออก (user 2026-10-17: หน้าแรกรก — ดูในหน้ายอดขายและกำไร)
 *
 * Base: dashboard/components/SalesChartCard.tsx (card-body !p-4 · segmented · hero ramp "Metric")
 */
import Link from 'next/link'
import { useMemo, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { formatNumberNoSymbol } from '@/lib/format-money'
import { REPORT_SETTINGS_URL, type ServiceReportChart as ChartKind, type ServiceReportView } from '@/lib/report-settings'
import { buildServiceReport, buildServiceToday, type ServiceReportData } from '@/lib/service-report/view-model'
import { SERVICE_REPORT_WORDS as W, deltaSentence } from '@/lib/service-report/words'

import ServiceReportChart from './ServiceReportChart'
import ServiceReportSheet from './ServiceReportSheet'

const pill = (on: boolean) =>
  `min-h-11 rounded-md px-3 text-xs font-medium transition-colors ${on ? 'bg-card text-primary shadow' : 'text-default-700'}`

type Props = {
  initial: ServiceReportData
  view: ServiceReportView
  chart: ChartKind
  /** mobile = แตะแล้วเปิดชีต · desktop = แตะแล้วไปหน้า /sales */
  variant: 'mobile' | 'desktop'
}

export default function ServiceReportCard({ initial, view, chart, variant }: Props) {
  const [period, setPeriod] = useState<'today' | 'month'>('month')
  const [open, setOpen] = useState(false)
  const isToday = period === 'today'

  const month = useMemo(() => buildServiceReport(initial, view), [initial, view])
  const today = useMemo(() => buildServiceToday(initial, view), [initial, view])
  const hero = isToday ? today.hero : month.hero
  const delta = isToday ? today.delta : month.delta
  const chartModel = isToday && today.chart ? today.chart : month.chart
  /* กราฟ 14 วันโหมดกำไรใช้ยอดขาย 14 วัน (ไม่มีต้นทุน/ค่าใช้จ่ายรายวันย้อนข้ามเดือน) — ดู buildServiceToday */
  const heroTone = hero.tone === 'loss' ? 'text-danger-ink' : 'text-dark'

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className={`mb-0 text-4xl font-extrabold tracking-tight tabular-nums ${heroTone}`}>{formatNumberNoSymbol(hero.value)}</p>
        {variant === 'mobile' ? (
          <Icon icon="chevron-right" className="size-4 shrink-0 text-default-500" aria-hidden="true" />
        ) : (
          <span className="shrink-0 text-sm font-medium text-primary">{W.openPage} ›</span>
        )}
      </div>
      <div className="-mt-0.5 min-h-5">
        {delta && (
          <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${delta.direction === 'up' ? 'text-success-ink' : 'text-danger-ink'}`}>
            <Icon icon={delta.direction === 'up' ? 'arrow-up' : 'arrow-down'} className="size-3.5" aria-hidden="true" />
            {view === 'profit' ? W.sales : ''}
            {deltaSentence(delta.direction, delta.pct, delta.compareLabel)}
          </span>
        )}
      </div>
    </>
  )

  return (
    <>
      <div className="card">
        <div className="card-body !p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Icon icon="chart-bar" className="size-4 text-primary" />
              <span className="text-sm font-bold text-dark">{view === 'profit' ? W.profit : W.sales}</span>
            </div>
            <div className="flex items-center gap-1">
              {/* ปุ่มตั้งค่า "ก่อน" ตัวเลือกช่วง (user 2026-10-17) */}
              <Link href={REPORT_SETTINGS_URL} aria-label={W.settings} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-default-700">
                <Icon icon="adjustments-horizontal" className="size-5" />
              </Link>
              <div role="group" aria-label={`${W.today}/${W.thisMonth}`} className="flex items-center gap-0.5 rounded-lg bg-default-100 p-0.5">
                <button type="button" onClick={() => setPeriod('today')} aria-pressed={isToday} className={pill(isToday)}>
                  {W.today}
                </button>
                <button type="button" onClick={() => setPeriod('month')} aria-pressed={!isToday} className={pill(!isToday)}>
                  {W.thisMonth}
                </button>
              </div>
            </div>
          </div>

          {variant === 'mobile' ? (
            <button type="button" onClick={() => setOpen(true)} className="block w-full text-start" aria-label={`${W.openPage} · ${hero.label} ${formatNumberNoSymbol(hero.value)}`}>
              {body}
            </button>
          ) : (
            <Link href="/sales" className="block w-full" aria-label={`${W.openPage} · ${hero.label} ${formatNumberNoSymbol(hero.value)}`}>
              {body}
            </Link>
          )}

          {/* กราฟอยู่นอกปุ่ม — แตะแท่งแล้วเห็นป้ายยอดวันนั้น (ไม่เปิดชีต) */}
          <ServiceReportChart
            chart={chartModel}
            kind={chart}
            height={variant === 'desktop' ? 240 : 168}
            period={isToday && today.chart ? 'last14' : 'daily'}
          />
        </div>
      </div>
      {open && <ServiceReportSheet initial={initial} view={view} chart={chart} onClose={() => setOpen(false)} />}
    </>
  )
}
