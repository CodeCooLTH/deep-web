'use client'

/**
 * AudienceCard — กลุ่มผู้ชม: เข้าถึง · แชท (Meta) · donut ตามเพศ · ตารางตามอายุ + ป้าย "ถูกสุด" (00094 FR-008b)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AudienceInsight.tsx
 *   (แถบบน 2 ช่องเส้นประ · donut 75% มียอดรวมกลาง · ตารางเล็ก table-sm bg-light/50)
 * ตัด: ตัวนับสุ่มอัตโนมัติ · เมนูจุดสามจุด — ข้อมูล = Q4 (อายุ/เพศ) ของ 00093 ตัวเดิม (แคชร่วม ไม่เพิ่มคำขอ)
 * 🛑 ห้ามยอดขาย/ออเดอร์/ROAS แยกตามอายุ/เพศ (ร้านไม่รู้อายุ/เพศลูกค้า — BR-AIQ-02) · ตัวเลขเป็นค่าประมาณ → ป้าย "≈ ประมาณการ"
 * donut ได้ยกเว้นข้อห้าม pie (BR-AIR-05) เฉพาะการ์ดนี้ · สี chart-primary / chart-zeta / default-400 (ไม่ใช้ม่วง)
 */
import type { ApexOptions } from 'apexcharts'
import Link from 'next/link'
import { useCallback } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { unitCost } from '@/lib/ad-quality-formulas'
import { audienceView, cheapestAge } from '@/lib/ad-summary/view'
import type { AdSummaryReport } from '@/lib/ad-summary/types'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { getColor } from '@/utils/helpers'
import { useRetryUncached } from '../../ad-quality/components/CardState'
import { MetaBadge } from './Bits'

const CAPIS = '/settings/capis'

export default function AudienceCard({ report, rangeQuery }: { report: AdSummaryReport; rangeQuery: string }) {
  const t = useT().adSummary
  const { retry, pending } = useRetryUncached()
  const a = report.audience
  const view = audienceView(report.meta.state, a)
  const genderLabel = { male: t.audMale, female: t.audFemale, unknown: t.audUnknown }
  const labels = a.gender.map((g) => genderLabel[g.key])
  const series = a.gender.map((g) => g.reach ?? 0)
  const cheapest = cheapestAge(a.age)

  const getOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: 'donut', height: 200, animations: { enabled: false } },
      series,
      labels,
      colors: [getColor('chart-primary'), getColor('chart-zeta'), getColor('default-400')],
      stroke: { width: 0 },
      dataLabels: { enabled: false },
      legend: { show: true, position: 'bottom', markers: { size: 6 } },
      plotOptions: { pie: { donut: { size: '75%', labels: { show: true, total: { show: true, showAlways: true, label: `${t.audReach} ≈`, formatter: (w: { globals: { seriesTotals: number[] } }) => formatNumberNoSymbol(w.globals.seriesTotals.reduce((x, y) => x + y, 0)) } } } } },
      tooltip: { y: { formatter: (v: number) => fmt(t.audPeople, { v: formatNumberNoSymbol(v) }) } },
    }),
    [series, labels, t],
  )

  const stateText = view === 'needConnect' ? t.audNeedConnect : view === 'empty' ? t.audEmpty : view === 'unavailable' ? t.audUnavail : view === 'auth' ? t.metaAuthTitle : t.audError

  return (
    <div className="card h-full">
      <div className="card-header">
        <h4 className="card-title flex items-center gap-2">
          {t.audTitle}
          <span className="badge bg-light text-default-700" title={t.audEstimateTip}>
            {t.audEstimate}
          </span>
        </h4>
        <MetaBadge />
      </div>
      {view !== 'ok' ? (
        <div className="card-body">
          <div role="status" className="text-default-700 flex flex-wrap items-center gap-3 text-sm">
            <Icon icon={view === 'needConnect' ? 'plug-connected-x' : 'info-circle'} className="shrink-0 text-lg" aria-hidden="true" />
            <span className="min-w-0 flex-1">{stateText}</span>
            {(view === 'needConnect' || view === 'auth') && (
              <Link href={CAPIS} className="btn border-default-300 text-default-800 min-h-11 border lg:min-h-0">
                {view === 'auth' ? t.metaReconnect : t.metaConnect}
              </Link>
            )}
            {view === 'error' && (
              <button type="button" onClick={retry} disabled={pending} className="btn border-default-300 text-default-800 min-h-11 border lg:min-h-0">
                {t.retry}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2">
            <div className="border-default-300 border-e border-b border-dashed p-3 text-center">
              <p className="text-default-600 mb-0 text-xs">{t.audReach}</p>
              <h3 className="text-default-900 mb-0 flex items-center justify-center gap-2.5 text-xl tabular-nums">
                <Icon icon="users" className="text-default-600" aria-hidden="true" />
                {a.reach === null ? '—' : formatNumberNoSymbol(a.reach)}
              </h3>
            </div>
            <div className="border-default-300 border-b border-dashed p-3 text-center">
              <p className="text-default-600 mb-0 text-xs">{t.audChats}</p>
              <h3 className="text-default-900 mb-0 flex items-center justify-center gap-2.5 text-xl tabular-nums">
                <Icon icon="message-circle" className="text-default-600" aria-hidden="true" />
                {a.chatsMeta === null ? '—' : formatNumberNoSymbol(a.chatsMeta)}
              </h3>
            </div>
          </div>
          <div className="card-body">
            <div role="img" aria-label={t.audGenderAria}>
              <ApexChart getOptions={getOptions} type="donut" height={200} />
            </div>
            <div className="mt-2.5 overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="bg-light/50">
                  <tr className="text-default-700 text-2xs">
                    <th className="px-2 py-2 text-start font-semibold">{t.audAge}</th>
                    <th className="px-2 py-2 text-end font-semibold">{t.audReach}</th>
                    <th className="px-2 py-2 text-end font-semibold">{t.audColChats}</th>
                    <th className="px-2 py-2 text-end font-semibold">{t.audCostPerChat}</th>
                  </tr>
                </thead>
                <tbody>
                  {a.age.map((r) => {
                    const cost = unitCost(r.spend, r.chatsMeta)
                    return (
                      <tr key={r.range}>
                        <td className="text-default-700 px-2 py-1.5">
                          {r.range}
                          {r.range === cheapest && <span className="badge bg-success/15 text-success-ink ms-1">{t.audCheapest}</span>}
                        </td>
                        <td className="text-default-900 px-2 py-1.5 text-end tabular-nums">{r.reach === null ? '—' : formatNumberNoSymbol(r.reach)}</td>
                        <td className="text-default-900 px-2 py-1.5 text-end tabular-nums">{r.chatsMeta === null ? '—' : formatNumberNoSymbol(r.chatsMeta)}</td>
                        <td className="text-default-900 px-2 py-1.5 text-end tabular-nums">{cost === null ? '—' : formatBaht(cost)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-center">
              <Link href={`/reports/ad-quality?${rangeQuery}`} className="btn btn-sm bg-primary hover:bg-primary-hover min-h-11 text-white lg:min-h-0">
                {t.audLink}
                <Icon icon="arrow-right" className="text-sm" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
