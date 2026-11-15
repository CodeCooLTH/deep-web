'use client'

/**
 * AgeGenderPanel — อายุและเพศ (FR-007): แท่งแนวนอนซ้อนตามช่วงอายุ แยกสีตามเพศ + ตัวสลับตัวชี้วัด
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/charts/apex/bar/components/data.ts (stacked bar) + theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/WeeklyPerformanceInsights.tsx (`horizontal: true`)
 *   ตัวสลับตัวชี้วัด: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (native `form-select`)
 * ตัด: donut ตามเพศ + ตารางสรุป (ข้อมูลเดียวกันอยู่ในแท่ง/tooltip) · ข้อความอธิบายท้ายแผง (ป้าย "ประมาณการ" ที่หัวการ์ดแทน)
 * สี (HR10/HR7): ชาย chart-primary · หญิง chart-zeta · ไม่ระบุ default-400 — ไม่ม่วง
 * 🛑 BR-AIQ-02: ไม่มียอดขาย · ช่องว่างของเพศนั้น = null (tooltip "—") ไม่ใช่ 0 · aria-label ตามตัวชี้วัดที่เลือก (รวมทุกเพศ)
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback, useId, useMemo, useState } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { buildAgeSeries } from '@/lib/ad-quality-view'
import { formatBaht, formatBahtCompact } from '@/lib/format-money'
import { getColor } from '@/utils/helpers'
import { fmtInt, type AgeGenderRow, type Metric } from './data'

const GENDER_TOKEN = { male: 'chart-primary', female: 'chart-zeta', unknown: 'default-400' } as const

export default function AgeGenderPanel({ rows }: { rows: AgeGenderRow[] }) {
  const t = useT().adQuality
  const metricId = useId()
  const [metric, setMetric] = useState<Metric>('chats')
  const { ages, series } = useMemo(() => buildAgeSeries(rows, metric), [rows, metric])
  const ageLabel = useCallback((a: string) => (a === 'unknown' ? t.genderUnknown : a), [t.genderUnknown])
  const gName = useMemo(() => ({ male: t.genderMale, female: t.genderFemale, unknown: t.genderUnknown }), [t.genderMale, t.genderFemale, t.genderUnknown])
  const metricLabel = metric === 'chats' ? t.metricChats : metric === 'impressions' ? t.metricImpr : t.metricSpend
  const height = Math.max(220, ages.length * 44 + 80)

  const barOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: 'bar', height, stacked: true, toolbar: { show: false } },
      plotOptions: { bar: { horizontal: true, barHeight: '60%', borderRadius: 2 } },
      series: series.map((s) => ({ name: gName[s.gender], data: s.data })),
      colors: series.map((s) => getColor(GENDER_TOKEN[s.gender])),
      dataLabels: { enabled: false },
      grid: { borderColor: getColor('chart-border-color'), strokeDashArray: 4 },
      xaxis: { categories: ages.map(ageLabel), labels: { formatter: (v: string) => (metric === 'spend' ? formatBahtCompact(Number(v)) : fmtInt(Number(v))) } },
      legend: { position: 'top', horizontalAlign: 'right' },
      tooltip: { y: { formatter: (v: number | null) => (v === null || v === undefined ? '—' : `≈${metric === 'spend' ? formatBaht(v) : fmtInt(v)}`) } },
    }),
    [series, ages, metric, height, gName, ageLabel],
  )
  // รวมทุกเพศต่อช่วงอายุ — ใช้ตัวชี้วัดที่เลือกจริง (ไม่ใช่แชทเสมอ)
  const items = ages.map((a, i) => {
    const sum = series.reduce((s, x) => s + (x.data[i] ?? 0), 0)
    return `${ageLabel(a)} ${metric === 'spend' ? formatBaht(sum) : fmtInt(sum)}`
  })

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <label htmlFor={metricId} className="text-default-700 text-sm">{t.metricLabel}</label>
        <select id={metricId} className="form-select form-select-sm min-h-11 w-auto lg:min-h-0" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
          <option value="chats">{t.metricChats}</option>
          <option value="impressions">{t.metricImpr}</option>
          <option value="spend">{t.metricSpend}</option>
        </select>
      </div>
      <div role="img" aria-label={fmt(t.chartAria, { label: `${t.subAge} (${metricLabel})`, items: items.join(', ') })}>
        <ApexChart getOptions={barOptions} type="bar" height={height} />
      </div>
    </div>
  )
}
