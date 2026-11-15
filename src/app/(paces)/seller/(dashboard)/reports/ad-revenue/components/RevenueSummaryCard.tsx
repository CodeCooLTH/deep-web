'use client'

/**
 * RevenueSummaryCard — แท็บสรุป: การ์ด KPI 4 ใบ + แนวโน้ม + ตัวเลขอื่น ๆ แสดงตลอด (00091 เฟส 3 FR-011/016)
 *
 * Base (KPI): theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 *   (ชื่อซ้ายบน · ไอคอนวงกลม `size-9 bg-primary/15 text-primary rounded-full` ขวาบน · ตัวเลข `my-5 py-1.25 text-xl` · แถวล่าง ลูกศร + % + "เทียบช่วงก่อน")
 *   ต่างจากธีม: ชื่อไม่ uppercase + text-default-600 (ธีมใช้ 400 คอนทราสต์ต่ำ) · ไม่มี CountUp · % เป็นข้อความสีตามทิศดี/แย่ (success-ink/warning-ink/default-700 ไม่ใช้แดง)
 *   🛑 ไม่มี sparkline ในการ์ด KPI (มติ user) · ข้อยกเว้น badge: เฉพาะการ์ด KPI — ที่อื่นใช้ DeltaBadge
 * 🛑 รับเงินแล้ว = ยืนยันแล้วเท่านั้น · กำไรส่วนเกินไม่ลงสีเขียว · Meta ไม่ OK → ซ่อนแถวกำไรส่วนเกิน (ไม่แสดง "—" ตาม FR-010)
 */
import { contribution } from '@/lib/ad-revenue-view'
import Icon from '@/components/wrappers/Icon'
import { formatBaht, formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'
import { deltaDir, type DeltaTone } from './DeltaBadge'
import InfoTip from './InfoTip'
import SalesTrendCard from './SalesTrendCard'
import { fmtPct, spendIsOk, type AdRevenueReport } from './data'

type Props = { summary: AdRevenueReport['summary']; previous: AdRevenueReport['previous']; spend: AdRevenueReport['spend']; daily: AdRevenueReport['daily']; prevDaily: AdRevenueReport['prevDaily']; serviceRules: boolean; noun: string }

/** % เปลี่ยนเป็นข้อความสี (ข้อยกเว้นเฉพาะการ์ด KPI) — ฐาน 0/null = ไม่แสดง */
function DeltaInline({ value, tone }: { value: number | null; tone: DeltaTone }) {
  const t = useT().adReport
  if (value === null) return null
  const dir = deltaDir(value, tone)
  return (
    <span className={cn('flex items-center gap-1 tabular-nums', dir === 'good' ? 'text-success-ink' : dir === 'bad' ? 'text-warning-ink' : 'text-default-700')}>
      {value !== 0 && <Icon icon={value > 0 ? 'arrow-up' : 'arrow-down'} aria-hidden="true" />}
      {value !== 0 && <span className="sr-only">{value > 0 ? t.deltaUp : t.deltaDown}</span>}
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}

export default function RevenueSummaryCard({ summary: s, previous: p, spend, daily, prevDaily, serviceRules, noun }: Props) {
  const t = useT().adRevenue
  const lostN = s.cancelled + s.returned
  const showProfit = spendIsOk(spend)
  const profit = contribution(s.profitBeforeAds, s.spend)
  const sharePct = s.sales > 0 ? Math.round((s.collected / s.sales) * 1000) / 10 : null

  const cards: { key: string; title: string; icon: string; value: React.ReactNode; delta: React.ReactNode; sub?: React.ReactNode }[] = [
    { key: 'collected', title: t.collected, icon: 'wallet', value: formatBaht(s.collected), delta: <DeltaInline value={pctChangeVsPrev(s.collected, p.collected)} tone="higher" />, sub: `${fmtPct(sharePct)} ${t.shareOfAdSales}` },
    { key: 'sales', title: t.sumSales, icon: 'cash', value: formatBaht(s.sales), delta: <DeltaInline value={pctChangeVsPrev(s.sales, p.sales)} tone="higher" />, sub: `${t.sumAvg} ${s.avgPerOrder === null ? '—' : formatBaht(s.avgPerOrder)}` },
    { key: 'orders', title: noun, icon: 'shopping-cart', value: formatNumberNoSymbol(s.orders), delta: <DeltaInline value={pctChangeVsPrev(s.orders, p.orders)} tone="higher" /> },
    // ช่วงก่อนไม่มีฐาน % ยกเลิกที่เทียบได้ (คนละชุดใบ) → แสดงอัตราของช่วงนี้แทนตัวเทียบ
    { key: 'lost', title: t.sumLost, icon: 'arrow-back-up', value: fmt(t.sumLostValue, { n: formatNumberNoSymbol(lostN), unit: t.unit }), delta: null, sub: s.lostRatePct === null ? undefined : fmt(t.lostBase, { p: fmtPct(s.lostRatePct), noun }) },
  ]

  const more: { label: string; value: React.ReactNode }[] = [
    { label: t.notCollected, value: formatBaht(s.unrecorded) },
    ...(s.medianClickToOrderDays !== null ? [{ label: fmt(t.sumClickToOrder, { noun }), value: fmt(t.daysValue, { n: formatNumberNoSymbol(s.medianClickToOrderDays) }) }] : []),
    ...(showProfit ? [{
      label: t.sumProfit,
      value: (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className={cn(profit.value < 0 && 'text-danger-ink')}>{profit.value < 0 ? '−' : ''}{formatBaht(profit.value)}</span>
          {s.incompleteProfitOrders > 0 && <span className="badge bg-warning/15 text-warning-ink">{fmt(t.costIncomplete, { n: s.incompleteProfitOrders })}</span>}
        </span>
      ),
    }] : []),
  ]

  return (
    <div className="gap-base grid grid-cols-1">
      <div className="gap-base grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.key} className="card h-full min-w-0">
            <div className="card-body">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h5 className="text-default-600 mb-2 truncate text-sm font-medium" title={c.title}>{c.title}</h5>
                  <h3 className="text-default-900 my-5 py-1.25 text-xl font-bold tabular-nums">{c.value}</h3>
                  {/* สองบรรทัดคงที่ทุกใบ (เทียบช่วงก่อน · บรรทัดรอง) ให้การ์ดสูงเท่ากัน */}
                  <p className="text-default-700 mb-1 flex min-h-5 items-center gap-x-3.25 text-sm whitespace-nowrap">
                    {c.delta && <>{c.delta}<span className="text-default-600">{t.vsPrevCol}</span></>}
                  </p>
                  <p className="text-default-600 mb-0 min-h-5 text-xs tabular-nums">{c.sub}</p>
                </div>
                <div className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                  <Icon icon={c.icon} className="size-5.5" aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <SalesTrendCard summary={s} daily={daily} prevDaily={prevDaily} noun={noun} />
      <div className="card min-w-0">
        <div className="card-header">
          <h4 className="card-title">{t.moreMetrics}</h4>
          {showProfit && <InfoTip text={serviceRules ? t.profitFormulaService : t.profitFormula} />}
        </div>
        <div className="card-body">
          <dl className="gap-base mb-0 grid grid-cols-1 md:grid-cols-3">
            {more.map((m) => (
              <div key={m.label} className="min-w-0">
                <dt className="text-default-600 text-xs">{m.label}</dt>
                <dd className="text-default-900 mb-0 text-xl font-bold tabular-nums">{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
