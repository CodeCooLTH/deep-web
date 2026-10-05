/**
 * PortfolioSummaryCard — การ์ดสรุปรวมทุกธุรกิจ: หัว + ตัวเลือกช่วงเวลา + แถบ 3 ตัวเลข + หมายเหตุ + กราฟ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx
 *   (.card h-full > card-header + แถบ bg-light/25 border-b border-dashed + กราฟ) ผ่านต้นแบบใน repo
 *   dashboard/components/SalesReport.tsx
 *   ตัด: แท็บ Today/Monthly/Annual · CountUp · ไอคอนเขียว wallet/basket · growth rate · area gradient
 *   (CountUp ทำให้ ฿1,234.00 ไม่เท่าการ์ดร้าน ฿1,234 และเลขวิ่งขัดกับหน้าคอนโซล)
 *
 * server component — ตัวเลือกช่วงเวลา (SalesDateRange) และกราฟเป็น client child
 */
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatBaht } from '@/lib/format-money'
import { formatMonthYearTH } from '@/lib/format-date'
import type { DateRangePreset } from '@/lib/date-range'
import type { OverviewTotals } from '@/lib/business-overview'
import {
  chartDates, chartMonthNote, excludedShopsNote, financeBasisNote, hasChartData,
  profitHeading, profitToneClass, rangeSubtitle,
} from '@/lib/portfolio-display'
import SalesDateRange from '../../sales/components/SalesDateRange'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import PortfolioChart from './PortfolioChart'

type Props = {
  totals: OverviewTotals
  preset: DateRangePreset
  custom: [string, string] | null
  label: { start: string; end: string }
  series: { labels: string[]; revenue: number[]; netProfit: number[] } | null
  seriesMonth: string
  /** ชื่อร้านที่คำนวณล้ม — ไม่รวมในยอดรวม */
  failedShopNames: string[]
}

const PortfolioSummaryCard = ({ totals, preset, custom, label, series, seriesMonth, failedShopNames }: Props) => {
  const basisNote = financeBasisNote(totals.mixedFinanceRules)
  const excludedNote = excludedShopsNote(failedShopNames)
  const monthText = formatMonthYearTH(`${seriesMonth}-01`)
  const monthNote = chartMonthNote(preset, seriesMonth)

  return (
    <div className="card mb-1.25">
      <div className="card-header flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h2 id="portfolio-title" className="card-title">
            ภาพรวมทุกธุรกิจ
          </h2>
          <p className="text-default-700 mt-1 text-xs">{rangeSubtitle(preset, label)}</p>
        </div>
        <SalesDateRange range={preset} customDates={custom} ariaLabel="ช่วงเวลาของภาพรวมทุกธุรกิจ" />
      </div>

      <div className="bg-light/25 border-b border-default-300 border-dashed">
        <div className="grid grid-cols-2 gap-base px-5 py-4 md:grid-cols-3">
          <div className="order-first col-span-2 min-w-0 md:order-none md:col-span-1 md:col-start-2 md:row-start-1">
            <p className="text-default-700 text-sm">{profitHeading(totals.netProfit, 'total')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <p className={cn('text-xl font-semibold tabular-nums break-words', profitToneClass(totals.netProfit, totals.incomplete))}>
                {formatBaht(totals.netProfit)}
              </p>
              {totals.incomplete && (
                <span
                  className="badge bg-warning/15 text-warning-ink gap-1.5"
                  title="มีร้านที่ยังไม่ตั้งราคาทุนหรือยังไม่บันทึกค่าใช้จ่าย กำไรจริงจะน้อยกว่าตัวเลขนี้"
                >
                  <Icon icon="alert-triangle" className="text-sm" aria-hidden="true" />
                  ข้อมูลยังไม่ครบ
                </span>
              )}
            </div>
          </div>
          <div className="min-w-0 md:col-start-1 md:row-start-1">
            <p className="text-default-700 text-sm">ยอดขายรวม</p>
            <p className="text-lg font-medium tabular-nums break-words">{formatBaht(totals.revenue)}</p>
          </div>
          <div className="min-w-0 md:col-start-3 md:row-start-1">
            <p className="text-default-700 text-sm">ออเดอร์รวม</p>
            <p className="text-lg font-medium tabular-nums">{totals.orderCount.toLocaleString('th-TH')}</p>
            <p className="text-default-700 text-xs">นับเฉพาะที่เป็นยอดขาย</p>
          </div>
        </div>
        {(basisNote || excludedNote) && (
          <div className="text-default-700 flex flex-col gap-1 px-5 pb-4 text-xs">
            {basisNote && (
              <p className="flex items-start gap-1.5">
                <Icon icon="info-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
                {basisNote}
              </p>
            )}
            {excludedNote && (
              <p className="text-warning-ink flex items-start gap-1.5">
                <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
                {excludedNote}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="p-5 pt-3">
        {series && hasChartData(series) ? (
          <>
            <PortfolioChart
              dates={chartDates(seriesMonth, series.labels)}
              revenue={series.revenue}
              netProfit={series.netProfit}
              ariaLabel={`กราฟรายวันของยอดขายรวมและกำไรสุทธิรวม เดือน ${monthText} ตัวเลขรวมอยู่ในสรุปด้านบน`}
            />
            <p className="text-default-700 mt-2 text-xs">กราฟใช้ดูแนวโน้ม ตัวเลขรวมดูที่แถบสรุปด้านบน</p>
            {monthNote && <p className="text-default-700 mt-1 text-xs">{monthNote}</p>}
          </>
        ) : (
          <SellerEmptyState compact icon="chart-bar-off" title="ยังไม่มียอดขายในช่วงนี้" description="ลองเลือกช่วงเวลาที่กว้างขึ้น" />
        )}
      </div>
    </div>
  )
}

export default PortfolioSummaryCard
