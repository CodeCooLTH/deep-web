'use client'

/**
 * QualityTab — แท็บคุณภาพคำสั่งซื้อแบบ analytics dashboard (00091 · ม็อกอัพอนุมัติ 2026-11-16)
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx (KPI → กราฟคู่ 6/6 → ตาราง)
 * KPI: อัตรารับเงิน (ของยอดสั่งที่ไม่ยกเลิก = waterfall.open) · รอเก็บเงิน · ยกเลิก · ตีกลับ — ทั้งหมดจาก waterfall/summary ชุดเดียวกับกราฟ (HR16)
 */
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { KpiGrid, kpiBg, type KpiSpec } from './DashBits'
import QualityTableCard from './QualityTableCard'
import StatusMixCard from './StatusMixCard'
import StatusWaterfallCard from './StatusWaterfallCard'
import { fmtPct, type AdMetrics, type AdRevenueReport, type StatusLabels } from './data'

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)

type QAd = Pick<AdMetrics, 'adId' | 'adTitle' | 'adPhotoFileId' | 'status' | 'gross' | 'collectedPlaced'>

export default function QualityTab({ report, ads, noun, labels }: { report: AdRevenueReport; ads: QAd[]; noun: string; labels: StatusLabels }) {
  const t = useT().adRevenue
  const d = t.dash
  const { waterfall: w, summary: s, daily } = report

  const kpis: KpiSpec[] = [
    {
      key: 'rate', title: d.collectRate, icon: 'wallet', iconBg: kpiBg(0), value: fmtPct(pct(w.collected, w.open)), sub: d.collectRateSub,
      spark: { data: daily.map((x) => x.collected), kind: 'area', name: `${t.collected} · ${d.dailySpark}` },
    },
    {
      key: 'pending', title: d.pending, icon: 'hourglass', iconBg: kpiBg(1), value: formatBaht(Math.round(w.unrecorded)), sub: d.pendingSub,
      spark: { data: daily.map((x) => x.pending), kind: 'bar', name: `${d.pending} · ${d.dailySpark}` },
    },
    { key: 'cancelled', title: labels.CANCELLED, icon: 'circle-x', iconBg: kpiBg(2), value: fmtPct(pct(s.cancelled, s.placed)), sub: fmt(d.lostRateOf, { n: formatNumberNoSymbol(s.cancelled), v: formatBaht(Math.round(w.cancelled)) }) },
    { key: 'returned', title: labels.RETURNED, icon: 'arrow-back-up', iconBg: kpiBg(3), value: fmtPct(pct(s.returned, s.placed)), sub: fmt(d.lostRateOf, { n: formatNumberNoSymbol(s.returned), v: formatBaht(Math.round(w.returned)) }) },
  ]

  return (
    <>
      <KpiGrid items={kpis} />
      <div className="gap-base mb-base grid grid-cols-1 xl:grid-cols-2">
        <div className="min-w-0"><StatusWaterfallCard waterfall={w} /></div>
        <div className="min-w-0"><StatusMixCard ads={ads} noun={noun} labels={labels} /></div>
      </div>
      <QualityTableCard ads={ads} noun={noun} labels={labels} />
    </>
  )
}
