'use client'

/**
 * AdsProfitKpis — KPI 4 ใบหลัก + แถบตัวเลขรอง 4 ช่อง (00096 BRD FR-004 · user ตอบ §8.3 "ตามแนะนำ": 4 ใบหลัก + 4 ใบรองเป็นแถบเล็ก)
 *
 * Base ใบหลัก: Tile/Spark ใน ad-revenue/components/DashBits.tsx (theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalOrder.tsx)
 * Base แถบรอง: แถบ "การแสดงผลและต้นทุน" ของ 00093 (theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/SessionOverview.tsx แถบตัวชี้วัด)
 * 🛑 ช่วงที่มีวันนี้ (ยังไม่จบวัน) = ไม่แสดง % เทียบ (FR-002) · ตัวหาร 0 = "—" · กำไรติดลบสีแดง + เครื่องหมายลบ
 */
import { fmtRoas } from '../../ads/components/data'
import { KpiGrid, kpiBg, type KpiSpec } from '../../ad-revenue/components/DashBits'
import DeltaBadge from '../../ad-revenue/components/DeltaBadge'
import InfoTip from '../../ad-revenue/components/InfoTip'
import type { AdsProfitReport, ProfitMode } from '@/services/ads-profit.service'
import { formatBaht, formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'

// ไม่ปัด — formatBaht แสดงสตางค์เองเมื่อมีเศษ (user 2026-11-16: ค่าโฆษณา 1580.61 ต้องไม่ขึ้น ฿1,581)
export const money = (v: number | null) => (v === null ? '—' : `${v < 0 ? '−' : ''}${formatBaht(Math.abs(v))}`)
export const Signed = ({ v }: { v: number | null }) => <span className={cn(v !== null && v < 0 && 'text-danger-ink', v !== null && v > 0 && 'text-success-ink')}>{money(v)}</span>

export default function AdsProfitKpis({ report, mode, noun, partial }: { report: AdsProfitReport; mode: ProfitMode; noun: string; partial: boolean }) {
  const t = useT().adsProfit
  const { totals, daily, sameTime } = report
  const parts = totals.parts[mode]
  const m = totals.metrics[mode]
  // วันนี้ (ยังไม่จบวัน) เทียบเมื่อวาน ณ เวลาเดียวกัน (P1) · ช่วงที่จบแล้วเทียบช่วงก่อนยาวเท่ากัน
  const p = partial ? sameTime : report.previous
  // เทียบเฉพาะโหมดคาดการณ์ (ตัวเทียบคิดชุดเดียว)
  const cmp = mode === 'expected' && p !== null
  const d = (cur: number | null, prev: number | null) => (cmp && cur !== null ? <DeltaBadge value={pctChangeVsPrev(cur, prev)} /> : undefined)
  const prevAfter = p == null || p.spend === null ? null : p.profitBefore - p.spend

  const kpis: KpiSpec[] = [
    {
      key: 'spend', title: t.kpiSpend, icon: 'speakerphone', iconBg: kpiBg(2), value: totals.spend === null ? '—' : formatBaht(totals.spend),
      badge: d(totals.spend, p?.spend ?? null), sub: totals.spend === null ? t.noSpend : undefined,
      spark: daily.length > 1 && totals.spend !== null ? { data: daily.map((x) => x.spend ?? 0), kind: 'area', name: t.kpiSpend } : undefined,
    },
    {
      key: 'orders', title: fmt(t.kpiOrders, { noun }), icon: 'shopping-cart', iconBg: kpiBg(1), value: formatNumberNoSymbol(parts.orders),
      badge: d(parts.orders, p?.orders ?? null),
      spark: daily.length > 1 ? { data: daily.map((x) => x.orders[mode]), kind: 'bar', name: fmt(t.kpiOrders, { noun }) } : undefined,
    },
    {
      key: 'after', title: t.kpiProfitAfter, icon: 'trending-up', iconBg: kpiBg(0), value: <Signed v={m.profitAfter} />,
      badge: d(m.profitAfter, prevAfter),
      sub: parts.incomplete > 0 ? fmt(t.costIncomplete, { n: parts.incomplete }) : fmt(t.kpiProfitBefore, { v: money(m.profitBefore) }),
      spark: daily.length > 1 ? { data: daily.map((x) => x.profitBefore[mode] - (x.spend ?? 0)), kind: 'area', name: t.kpiProfitAfter } : undefined,
    },
    { key: 'ppo', title: fmt(t.kpiProfitPerOrder, { noun }), icon: 'coin', iconBg: kpiBg(3), value: <Signed v={m.profitPerOrder} /> },
  ]
  const strip: { label: string; value: string; tip?: string }[] = [
    { label: t.kpiRevenue, value: money(parts.revenue) },
    { label: t.kpiRoas, value: m.roas === null ? '—' : fmtRoas(m.roas), tip: t.roasTip },
    { label: fmt(t.kpiCpo, { noun }), value: money(m.costPerOrder) },
    { label: fmt(t.kpiAov, { noun }), value: money(m.aov) },
  ]

  return (
    <>
      {partial && (
        <p className="bg-info/10 text-info-ink mb-base flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
          {sameTime && mode === 'expected'
            ? <>{fmt(t.sameTimeNote, { h: String(sameTime.cutoffHour).padStart(2, '0') })}<InfoTip text={t.sameTimeTip} /></>
            : <>{t.todayPartial}<InfoTip text={t.cohortTip} /></>}
        </p>
      )}
      <KpiGrid items={kpis} />
      <div className="card mb-base">
        <div className="grid grid-cols-2 xl:grid-cols-4">
          {strip.map((s, i) => (
            <div key={s.label} className={cn('border-default-300 border-dashed px-5 py-3.5', i % 2 === 0 && 'border-e', i < 2 && 'max-xl:border-b', i === 1 && 'xl:border-e', i === 2 && 'xl:border-e')}>
              <p className="text-default-700 mb-0.5 flex items-center gap-1 text-xs">{s.label}{s.tip && <InfoTip text={s.tip} />}</p>
              <p className="text-default-900 mb-0 text-lg font-bold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
