'use client'

/**
 * AgeGenderPanel — ④ แผง 2 อายุและเพศ (FR-007): donut ตามเพศ + แท่งแนวนอนซ้อนตามช่วงอายุ + ตารางสรุป
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AudienceInsight.tsx (donut)
 *   + theme/paces/Admin/TS/src/app/(admin)/charts/apex/bar/components/data.ts (stacked bar) + theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/WeeklyPerformanceInsights.tsx (`horizontal: true`)
 *   ตัวสลับตัวชี้วัด: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (native `form-select`)
 * สี (HR10/HR7): ชาย chart-primary · หญิง chart-zeta · ไม่ระบุ default-400 — ไม่ใช้ฟ้า/ชมพูตามเพศแบบเหมารวม · ไม่ม่วง
 * 🛑 BR-AIQ-02: ไม่มีคอลัมน์ยอดขาย · ช่องว่างของเพศนั้น = null (tooltip "—") ไม่ใช่ 0 · ตารางสรุปคงเดิมไม่เปลี่ยนตามตัวสลับ
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback, useId, useMemo, useState } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { buildAgeSeries, buildAgeSummary } from '@/lib/ad-quality-view'
import { formatBaht, formatBahtCompact } from '@/lib/format-money'
import { colorVar, getColor } from '@/utils/helpers'
import { fmtInt, fmtPct1, type AgeGenderRow, type Metric } from './data'
import NoDataCell from './NoDataCell'

const GENDER_TOKEN = { male: 'chart-primary', female: 'chart-zeta', unknown: 'default-400' } as const

export default function AgeGenderPanel({ rows }: { rows: AgeGenderRow[] }) {
  const t = useT().adQuality
  const metricId = useId()
  const [metric, setMetric] = useState<Metric>('chats')
  const summary = useMemo(() => buildAgeSummary(rows), [rows])
  const { ages, series, donut } = useMemo(() => buildAgeSeries(rows, metric), [rows, metric])
  const ageLabel = (a: string) => (a === 'unknown' ? t.genderUnknown : a)
  const gName = { male: t.genderMale, female: t.genderFemale, unknown: t.genderUnknown } as const
  const fmtMetric = useCallback((v: number) => (metric === 'spend' ? formatBahtCompact(v) : fmtInt(v)), [metric])
  const metricLabel = metric === 'chats' ? t.metricChats : metric === 'impressions' ? t.metricImpr : t.metricSpend

  const barOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: 'bar', height: Math.max(220, ages.length * 44 + 80), stacked: true, toolbar: { show: false } },
      plotOptions: { bar: { horizontal: true, barHeight: '60%', borderRadius: 2 } },
      series: series.map((s) => ({ name: gName[s.gender], data: s.data })),
      colors: series.map((s) => getColor(GENDER_TOKEN[s.gender])),
      dataLabels: { enabled: false },
      grid: { borderColor: getColor('chart-border-color'), strokeDashArray: 4 },
      xaxis: { categories: ages.map(ageLabel), labels: { formatter: (v: string) => fmtMetric(Number(v)) } },
      legend: { position: 'top', horizontalAlign: 'right' },
      tooltip: { y: { formatter: (v: number | null) => (v === null || v === undefined ? '—' : `≈${metric === 'spend' ? formatBaht(v) : fmtInt(v)}`) } },
    }),
    // gName/fmtMetric เปลี่ยนตาม t/metric ซึ่งอยู่ใน deps แล้วผ่าน series/ages
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, ages, metric, t],
  )
  const donutOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: 'donut', height: 160 },
      legend: { show: false },
      stroke: { width: 0 },
      plotOptions: { pie: { donut: { size: '75%', labels: { show: true, total: { show: true, showAlways: true, label: t.donutGender, formatter: () => `≈${fmtMetric(donut.reduce((s, d) => s + (d.value ?? 0), 0))}` } } } } },
      series: donut.map((d) => d.value ?? 0),
      labels: donut.map((d) => gName[d.gender as keyof typeof gName]),
      colors: donut.map((d) => getColor(GENDER_TOKEN[d.gender as keyof typeof GENDER_TOKEN])),
      dataLabels: { enabled: false },
      tooltip: { y: { formatter: (v: number) => `≈${metric === 'spend' ? formatBaht(v) : fmtInt(v)}` } },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [donut, metric, t],
  )
  const donutTotal = donut.reduce((s, d) => s + (d.value ?? 0), 0)
  const aria = fmt(t.chartAria, { label: `${t.donutGender} (${metricLabel})`, items: donut.map((d) => `${gName[d.gender as keyof typeof gName]} ${d.value === null ? '—' : fmtPct1(donutTotal > 0 ? Math.round((d.value / donutTotal) * 1000) / 10 : null)}`).join(', ') })

  return (
    <div className="grid grid-cols-1 gap-base md:grid-cols-4">
      <div className="md:col-span-4 flex items-center gap-2">
        <label htmlFor={metricId} className="text-default-700 text-sm">{t.metricLabel}</label>
        <select id={metricId} className="form-select form-select-sm min-h-11 w-auto lg:min-h-0" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
          <option value="chats">{t.metricChats}</option>
          <option value="impressions">{t.metricImpr}</option>
          <option value="spend">{t.metricSpend}</option>
        </select>
      </div>
      <div className="min-w-0">
        <div className="min-h-40" role="img" aria-label={aria}>
          <ApexChart getOptions={donutOptions} type="donut" height={160} />
        </div>
      </div>
      <div className="min-w-0 md:col-span-3">
        <div role="img" aria-label={fmt(t.chartAria, { label: `${t.colAge} (${metricLabel})`, items: summary.lines.map((l) => `${ageLabel(l.age)} ${l.chats === null ? '—' : fmtInt(l.chats)}`).join(', ') })}>
          <ApexChart getOptions={barOptions} type="bar" height={Math.max(220, ages.length * 44 + 80)} />
        </div>
      </div>
      <div className="min-w-0 md:col-span-4">
        <div className="overflow-x-auto">
          <table className="table table-sm table-borderless whitespace-nowrap">
            <thead className="bg-default-100 text-2xs thead-sm">
              <tr>
                <th className="p-2 text-start">{t.colAge}</th>
                <th className="p-2 text-end">{t.colChatsMeta}</th>
                <th className="p-2 text-end">{t.colCostChatMeta}</th>
                <th className="p-2 text-end">{t.colShare}</th>
              </tr>
            </thead>
            <tbody>
              {summary.lines.map((l) => (
                <tr key={l.age}>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorVar('default-400') }} aria-hidden="true" />
                      {ageLabel(l.age)}
                    </span>
                  </td>
                  <td className="text-end tabular-nums">{l.chats === null ? <NoDataCell /> : `≈${fmtInt(l.chats)}`}</td>
                  <td className="text-end tabular-nums">{l.costPerChat === null ? <NoDataCell /> : `≈${formatBaht(l.costPerChat)}`}</td>
                  <td className="text-end tabular-nums">{l.sharePct === null ? <NoDataCell /> : `≈${fmtPct1(l.sharePct)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-default-700 mb-0 text-xs md:col-span-4">{t.ageNote}</p>
    </div>
  )
}
