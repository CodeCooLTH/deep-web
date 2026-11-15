'use client'

/**
 * ChatQualityCard — คุณภาพแชท (Meta): radialBar + แถวอัตรา คุยต่อ ≥2 / ≥3 / ตอบกลับ / บล็อก (F-05…F-09 ที่ระดับยอดรวม)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/StorePerformance.tsx (วงกลม h-204 · total ตรงกลาง)
 *   + theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx (แถวแถบ `h-1.25 bg-default-100` ซ้อนแถบสี)
 * 🛑 ตัวหารของทุกแถว = แชท (Meta) (เขียน "k จาก แชท (Meta) n" กำกับ) · ค่า >100% แสดงตามจริง (แถบ clamp 100%) · บล็อกไม่เข้า radial (เป็นสัญญาณลบ ไม่ใช่สัดส่วนที่ "เต็มได้")
 * สี: ≥2 chart-delta · ≥3 chart-primary · ตอบกลับ chart-zeta · บล็อก bg-warning — ไม่ม่วง/เขียว/แดง
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { colorVar, getColor } from '@/utils/helpers'
import { fmtInt, fmtPct1, type QualityTotals } from './data'
import NoDataCell from './NoDataCell'

type Key = 'depth2' | 'depth3' | 'replied' | 'block'

export default function ChatQualityCard({ totals }: { totals: QualityTotals }) {
  const t = useT().adQuality
  const rows: { key: Key; title: string; token: string }[] = [
    { key: 'depth2', title: t.rate2, token: 'chart-delta' },
    { key: 'depth3', title: t.rate3, token: 'chart-primary' },
    { key: 'replied', title: t.rateReplied, token: 'chart-zeta' },
    { key: 'block', title: t.rateBlock, token: 'warning' },
  ]
  const radial = rows.slice(0, 3)
  const getOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: 'radialBar', height: 220 },
      series: radial.map((r) => Math.min(100, totals.rates[r.key].pct ?? 0)),
      labels: radial.map((r) => r.title),
      colors: radial.map((r) => getColor(r.token)),
      plotOptions: {
        radialBar: {
          hollow: { size: '38%' },
          track: { background: getColor('default-100') },
          dataLabels: { name: { fontSize: '13px' }, value: { show: false } /* ค่าวงถูกตัดที่ 100 — % จริงอยู่ที่แถวข้างล่าง ไม่โชว์ตัวเลขที่ตัดแล้ว */, total: { show: true, label: t.chatMeta, formatter: () => fmtInt(totals.chatsMeta) } },
        },
      },
      stroke: { lineCap: 'round' },
    }),
    // radial/t คงที่ตาม totals/t — ใส่ตัวที่เปลี่ยนจริง
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [totals, t],
  )
  const aria = fmt(t.chartAria, { label: t.qualityTitle, items: rows.map((r) => `${r.title} ${fmtPct1(totals.rates[r.key].pct)}`).join(', ') })

  return (
    <div className="card h-full min-w-0">
      <div className="card-header"><h4 className="card-title">{t.qualityTitle}</h4></div>
      <div className="card-body">
        <div role="img" aria-label={aria}><ApexChart getOptions={getOptions} type="radialBar" height={220} /></div>
        {rows.map((r) => {
          const g = totals.rates[r.key]
          return (
            <div className="mt-4" key={r.key}>
              <div className="mb-1.25 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorVar(r.token) }} aria-hidden="true" />{r.title}</span>
                <span className="tabular-nums">{g.pct === null ? <NoDataCell /> : fmtPct1(g.pct)}</span>
              </div>
              {/* ความกว้าง/สีแถบเป็นค่าไดนามิก (style แบบธีมเอง) · aria-hidden — ค่าอ่านจากข้อความ */}
              <div className="bg-default-100 mb-1.25 h-1.25 w-full rounded" aria-hidden="true">
                <div className="h-full rounded-s" style={{ width: `${Math.min(g.pct ?? 0, 100)}%`, backgroundColor: colorVar(r.token) }} />
              </div>
              <p className="text-default-700 text-xs mb-0">{g.num === null || g.den === null ? <NoDataCell /> : fmt(t.fromMeta, { k: fmtInt(g.num), n: fmtInt(g.den) })}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
