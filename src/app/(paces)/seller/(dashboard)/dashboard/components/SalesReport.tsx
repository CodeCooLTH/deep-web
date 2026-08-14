/**
 * SalesReport — กราฟรายงานยอดขาย (area+line chart)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/SalesReport.tsx
 *
 * เปลี่ยน copy เป็นภาษาไทย: Today/Monthly/Annual → วันนี้/รายเดือน/รายปี
 * Revenue/Orders/Growth Rate → รายได้/ออเดอร์/อัตราการเติบโต
 * รับ real series+summary จาก page แทน fixture — ถ้า orders=0 แสดง SellerEmptyState
 * growth ซ่อนเมื่อคำนวณไม่ได้ (ไม่มี prev period) — หลักเดียวกับ change indicator ใน StatisticCard
 */
'use client'
import ApexChart from '@/components/wrappers/ApexChart'
import { CountUp } from '@/components/wrappers/CountUp'
import Icon from '@/components/wrappers/Icon'
import { getColor } from '@/utils/helpers'
import { ApexOptions } from 'apexcharts'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import { useT } from '@/i18n/LocaleProvider'

/** แต่ละ data point ต่อเดือน — ส่งผ่าน RSC boundary เป็น plain object */
export type SalesSeriesPoint = {
  label: string    // e.g. "ม.ค.", "ก.พ."
  revenue: number  // บาท
  orderCount: number
}

export type SalesSummary = {
  totalRevenue: number
  totalOrders: number
  /** growth percentage เทียบ period ก่อน — null เมื่อคำนวณไม่ได้ */
  growth: number | null
}

type SalesReportProps = {
  series: SalesSeriesPoint[]
  summary: SalesSummary
}

/**
 * สร้าง ApexOptions จาก real series data
 *
 * ชื่อเส้นรับเข้ามาเป็นพารามิเตอร์ ไม่ได้อ่าน dictionary เอง — ฟังก์ชันนี้อยู่ระดับ module
 * จึงเรียก hook ไม่ได้ และการฝังข้อความไว้ตรงนี้จะทำให้กราฟเป็นภาษาเดียวตลอดอายุ bundle
 */
export const buildSalesReportChart = (
  series: SalesSeriesPoint[],
  seriesNames: { revenue: string; orders: string },
): ApexOptions => ({
  series: [
    {
      name: seriesNames.revenue,
      type: 'area',
      data: series.map((s) => Math.round(s.revenue / 1000)), // แสดงในหน่วย k
    },
    {
      name: seriesNames.orders,
      type: 'line',
      data: series.map((s) => s.orderCount),
    },
  ],
  chart: {
    type: 'line',
    height: 359,
    toolbar: { show: false },
    offsetX: 0,
  },
  stroke: {
    width: [3, 2],
    curve: 'smooth',
    dashArray: [0, 8],
  },
  colors: [getColor('chart-secondary'), getColor('chart-alpha')],
  grid: { strokeDashArray: 7 },
  xaxis: {
    categories: series.map((s) => s.label),
    axisBorder: { show: false },
    labels: { offsetY: 2 },
  },
  yaxis: {
    tickAmount: 4,
    min: 0,
    labels: {
      show: true,
      formatter: (value) => value + 'k',
      offsetX: -10,
    },
    axisBorder: { show: false },
  },
  dataLabels: { enabled: false },
  markers: { size: 0 },
  tooltip: {
    x: { show: true },
    y: {
      formatter: (val) => '฿' + val + 'k',
    },
  },
  fill: {
    opacity: [1, 0.5],
    type: ['gradient', 'solid'],
    gradient: {
      type: 'vertical',
      inverseColors: false,
      opacityFrom: 0.5,
      opacityTo: 0,
      stops: [0, 70],
    },
  },
  legend: { offsetY: 15 },
})

const SalesReport = ({ series, summary }: SalesReportProps) => {
  const t = useT()
  const isEmpty = summary.totalOrders === 0
  const seriesNames = { revenue: t.dashboard.salesSeriesRevenue, orders: t.dashboard.salesSeriesOrders }

  return (
    <div className="card h-full">
      <div className="card-header md:py-0 pt-6 pb-0">
        <h4 className="card-title">{t.dashboard.salesTitle}</h4>
        {/* เดิมตรงนี้เป็นแท็บ "วันนี้/รายเดือน/รายปี" ที่ติดมากับธีมแต่กดแล้วไม่ทำอะไรเลย
            (hs-tab ชี้ panel ที่ไม่มีจริง — id "annual-atb" สะกดผิดด้วยซ้ำ) พอหน้ามี filter
            วันนี้/เดือนนี้ ของจริงที่แถวหัวแล้ว ปุ่มปลอมชุดนี้ยิ่งหลอกตา — ตัดทิ้ง เหลือป้ายนิ่ง
            บอกตรง ๆ ว่ากราฟใบนี้เป็นรายเดือนย้อนหลัง (ไม่ตาม filter ระดับหน้า) */}
        <span className="text-default-500 text-xs">{t.dashboard.salesSubtitle}</span>
      </div>

      {isEmpty ? (
        // ยังไม่มีออเดอร์ — ซ่อน chart ทั้งหมด แสดง empty state
        <div className="card-body">
          <SellerEmptyState
            compact
            icon="chart-bar-off"
            title={t.dashboard.salesEmptyTitle}
            description={t.dashboard.salesEmptyDesc}
          />
        </div>
      ) : (
        <div>
          {/* Headline summary — real data จาก orders */}
          <div className="bg-light/25 border-b border-default-300 border-dashed">
            <div className={`grid ${summary.growth != null ? 'md:grid-cols-3' : 'md:grid-cols-2'} grid-cols-2 md:gap-base text-center`}>
              <div>
                <p className="text-default-400 mt-5 mb-1.25">{t.dashboard.salesSummaryRevenue}</p>
                <h4 className="flex justify-center items-center mb-4 text-lg font-semibold">
                  <Icon icon="wallet" className="text-success me-2" />
                  <span>
                    <CountUp start={0} end={summary.totalRevenue} prefix="฿" duration={1} decimals={2} />
                  </span>
                </h4>
              </div>
              <div>
                <p className="text-default-400 mt-5 mb-1.25">{t.dashboard.salesSummaryOrders}</p>
                <h4 className="flex justify-center items-center mb-4 text-lg font-semibold">
                  <Icon icon="basket" className="text-success me-2" />
                  <span>
                    <CountUp start={0} end={summary.totalOrders} duration={1} />
                  </span>
                </h4>
              </div>
              {/* ซ่อน growth column เมื่อคำนวณไม่ได้ (ไม่มี prev period) */}
              {summary.growth != null && (
                <div>
                  <p className="text-default-400 mt-5 mb-1.25">{t.dashboard.salesSummaryGrowth}</p>
                  <h4 className="flex justify-center items-center mb-4 text-lg font-semibold">
                    <Icon icon="trending-up" className="text-success me-2" />
                    <span>
                      <CountUp start={0} end={summary.growth} duration={1} decimals={2} suffix="%" />
                    </span>
                  </h4>
                </div>
              )}
            </div>
          </div>
          <div className="p-5 pt-1.25 relative">
            <div>
              <div className="apex-charts">
                <ApexChart
                  getOptions={() => buildSalesReportChart(series, seriesNames)}
                  series={buildSalesReportChart(series, seriesNames).series}
                  type="line"
                  height={359}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SalesReport
