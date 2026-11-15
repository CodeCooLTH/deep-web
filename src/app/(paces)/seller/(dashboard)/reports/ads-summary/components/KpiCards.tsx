'use client'

/**
 * KpiCards — ตัวเลขหลัก 4 ใบ: ค่าโฆษณา · ยอดขายจากโฆษณา · ROAS · ต้นทุนต่อออเดอร์ (00094 FR-002)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 *   (ชื่อซ้ายบน · ไอคอนวงกลม primary/15 ขวาบน · ตัวเลข text-xl · ลูกศร + % ข้อความสี + ป้ายช่วง)
 * ตัด: CountUp (ตัวเลขนิ่งตั้งแต่ paint แรก) · uppercase · ไม่มี sparkline (มติ user: ตามธีมตรง ๆ)
 * Meta ไม่ OK → ค่าโฆษณา/ROAS/ต้นทุนต่อออเดอร์ = "—" (BR-AIR-12 ไม่ใช่ 0) · ยอดขายยังแสดง
 */
import Icon from '@/components/wrappers/Icon'
import { formatBaht } from '@/lib/format-money'
import { TONE, formatValue } from '@/lib/ad-summary/view'
import type { AdSummaryReport } from '@/lib/ad-summary/types'
import { useT } from '@/i18n/LocaleProvider'
import { DeltaText, InfoTip, NoValue } from './Bits'

export default function KpiCards({ report }: { report: AdSummaryReport }) {
  const t = useT().adSummary
  const { kpi } = report
  const cards = [
    { key: 'spend', icon: 'speakerphone', title: t.kSpend, tip: t.kSpendTip, pair: kpi.spend, value: kpi.spend.cur === null ? null : formatBaht(kpi.spend.cur) },
    { key: 'sales', icon: 'cash', title: t.kSales, tip: t.kSalesTip, pair: kpi.sales, value: formatBaht(kpi.sales.cur ?? 0) },
    { key: 'roas', icon: 'chart-arrows-vertical', title: t.kRoas, tip: t.kRoasTip, pair: kpi.roas, value: kpi.roas.cur === null ? null : formatValue('x2', kpi.roas.cur) },
    { key: 'cpa', icon: 'receipt', title: t.kCpa, tip: t.kCpaTip, pair: kpi.cpa, value: kpi.cpa.cur === null ? null : formatBaht(kpi.cpa.cur) },
  ] as const
  return (
    <div className="gap-base mb-base grid grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div key={c.key} className="card h-full min-w-0">
          <div className="card-body">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h5 className="text-default-600 mb-2 flex items-center gap-1 text-sm font-medium">
                  {c.title}
                  <InfoTip text={c.tip} />
                </h5>
                <h3 className="text-default-900 my-5 py-1.25 text-xl font-semibold tabular-nums">{c.value ?? <NoValue />}</h3>
                <p className="text-default-600 flex items-center gap-3.25 text-sm">
                  {c.value !== null && <DeltaText pair={c.pair} tone={TONE[c.key]} />}
                  <span>{t.vsPrev}</span>
                </p>
              </div>
              <div className="bg-primary/15 text-primary-ink flex size-9 shrink-0 items-center justify-center rounded-full">
                <Icon icon={c.icon} className="size-5.5" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
