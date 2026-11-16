'use client'

/**
 * AdsProfitInsights — ประโยคสรุปช่วง + คำแนะนำรายวัน (00096 P1 BRD FR-012/FR-013)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/crm/components/RecentActivity.tsx (รายการในการ์ด: ไอคอน + หัวข้อ + บรรทัดรอง)
 * ข้อมูลทั้งหมดจาก report (buildProfitInsights กฎตายตัว) — ไม่มี AI สร้างตัวเลข · ข้อความเป็นสมมติฐาน/สิ่งที่ลองได้
 * ความสำคัญมีทั้งข้อความและสี (ไม่พึ่งสีอย่างเดียว) · กดชื่อโฆษณา = หน้ารายละเอียด
 */
import Link from 'next/link'

import Icon from '@/components/wrappers/Icon'
import { adDisplayName } from '@/lib/ad-attribution'
import type { ProfitInsight } from '@/lib/ads-profit-insights'
import { formatNumberNoSymbol } from '@/lib/format-money'
import type { AdsProfitReport, ProfitMode } from '@/services/ads-profit.service'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'
import { fmtRoas } from '../../ads/components/data'
import { money } from './AdsProfitKpis'

const PRI: Record<ProfitInsight['priority'], { icon: string; cls: string }> = {
  1: { icon: 'alert-triangle', cls: 'bg-danger/15 text-danger-ink' },
  2: { icon: 'eye', cls: 'bg-warning/15 text-warning-ink' },
  3: { icon: 'trending-up', cls: 'bg-success/15 text-success-ink' },
}

export default function AdsProfitInsights({ report, mode, noun, detailQuery }: { report: AdsProfitReport; mode: ProfitMode; noun: string; detailQuery: string }) {
  const tt = useT()
  const t = tt.adsProfit
  const p = report.totals.parts[mode], m = report.totals.metrics[mode]
  const sentence = report.totals.spend === null
    ? fmt(t.summaryNoSpend, { noun, orders: formatNumberNoSymbol(p.orders), profit: money(m.profitBefore) })
    : fmt(t.summarySentence, { noun, spend: money(report.totals.spend), orders: formatNumberNoSymbol(p.orders), cpo: money(m.costPerOrder), profit: money(m.profitAfter) })
  const insights = report.insights[mode]
  const rowOf = new Map(report.rows.map((r) => [r.adId, r]))
  const show = (i: ProfitInsight) => (i.kind === 'ROAS_BUT_LOSS' ? { value: fmtRoas(i.value), baseline: fmtRoas(i.baseline) }
    : i.kind === 'LOSS' || i.kind === 'HIGH_CPO' ? { value: money(i.value), baseline: money(i.baseline) }
    : { value: i.value.toFixed(1), baseline: i.baseline.toFixed(1) })

  return (
    <div className="card mb-base">
      <div className="card-header"><h4 className="card-title">{t.summaryTitle}</h4></div>
      <div className="card-body flex flex-col gap-4">
        <p className="text-default-800 mb-0 text-base">{sentence}{p.incomplete > 0 && fmt(t.summaryEstimate, { n: p.incomplete })}</p>
        <div>
          <h5 className="text-default-900 mb-2 text-sm font-semibold">{t.insightsTitle}</h5>
          {insights.length === 0 ? <p className="text-default-500 mb-0 text-sm">{t.insightsEmpty}</p> : (
            <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 xl:grid-cols-2">
              {insights.map((i) => {
                const r = rowOf.get(i.adId)
                const name = r ? adDisplayName(r.adTitle, r.adId, tt.inbox.contextBar.adIdFallback) ?? r.adId : i.adId
                const c = t.insight[i.kind]
                const pr = PRI[i.priority]
                return (
                  <li key={`${i.kind}${i.adId}`} className="border-default-300 rounded-lg border border-dashed p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className={cn('badge gap-1 py-0.5 text-xs', pr.cls)}><Icon icon={pr.icon} className="text-sm" aria-hidden="true" />{t.priority[i.priority]}</span>
                      <b className="text-default-900 text-sm">{fmt(c.title, { noun })}</b>
                      <span className="text-default-500 ms-auto text-xs">{t.confidence[i.confidence]}</span>
                    </div>
                    <Link href={`/reports/ads-profit/${encodeURIComponent(i.adId)}?${detailQuery}&tab=diag`} className="text-primary block truncate text-sm font-medium">{name}</Link>
                    <p className="text-default-800 mt-1 mb-1 text-sm tabular-nums">{fmt(c.detail, show(i))}</p>
                    <p className="text-default-600 mb-0 text-xs">{t.causeLabel}: {c.cause} · <b className="font-semibold">{t.tryLabel}:</b> {c.tryIt}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
