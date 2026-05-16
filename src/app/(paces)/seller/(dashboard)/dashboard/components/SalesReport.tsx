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

/** สร้าง ApexOptions จาก real series data */
export const buildSalesReportChart = (series: SalesSeriesPoint[]): ApexOptions => ({
  series: [
    {
      name: 'รายได้รวม',
      type: 'area',
      data: series.map((s) => Math.round(s.revenue / 1000)), // แสดงในหน่วย k
    },
    {
      name: 'ออเดอร์',
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
  const isEmpty = summary.totalOrders === 0

  return (
    <div className="card h-full">
      <div className="card-header md:py-0 pt-6 pb-0">
        <h4 className="card-title">รายงานยอดขาย</h4>
        <div>
          <nav className="flex gap-x-1" aria-label="Tabs" role="tablist" aria-orientation="horizontal">
            <button
              type="button"
              className="hs-tab-active:font-semibold hs-tab-active:border-primary hs-tab-active:text-primary md:py-4.25 py-3 px-4 inline-flex items-center border-b border-transparent text-sm whitespace-nowrap hover:text-primary focus:outline-hidden focus:text-primary disabled:opacity-50 disabled:pointer-events-none"
              id="today"
              aria-selected="true"
              data-hs-tab="#today-tab"
              aria-controls="today-tab"
              role="tab"
            >
              วันนี้
            </button>
            <button
              type="button"
              className="hs-tab-active:font-semibold hs-tab-active:border-primary hs-tab-active:text-primary md:py-4.25 py-3 px-4 inline-flex items-center border-b border-transparent text-sm whitespace-nowrap hover:text-primary focus:outline-hidden focus:text-primary disabled:opacity-50 disabled:pointer-events-none active"
              id="monthly"
              aria-selected="false"
              data-hs-tab="#monthly-tab"
              aria-controls="monthly-tab"
              role="tab"
            >
              รายเดือน
            </button>
            <button
              type="button"
              className="hs-tab-active:font-semibold hs-tab-active:border-primary hs-tab-active:text-primary md:py-4.25 py-3 px-4 inline-flex items-center border-b border-transparent text-sm whitespace-nowrap hover:text-primary focus:outline-hidden focus:text-primary disabled:opacity-50 disabled:pointer-events-none"
              id="annual"
              aria-selected="false"
              data-hs-tab="#annual-atb"
              aria-controls="annual-atb"
              role="tab"
            >
              รายปี
            </button>
          </nav>
        </div>
      </div>

      {isEmpty ? (
        // ยังไม่มีออเดอร์ — ซ่อน chart ทั้งหมด แสดง empty state
        <div className="card-body">
          <SellerEmptyState
            compact
            icon="chart-bar-off"
            title="ยังไม่มียอดขาย"
            description="กราฟจะแสดงเมื่อเริ่มมีออเดอร์"
          />
        </div>
      ) : (
        <div>
          {/* Headline summary — real data จาก orders */}
          <div className="bg-light/25 border-b border-default-300 border-dashed">
            <div className={`grid ${summary.growth != null ? 'md:grid-cols-3' : 'md:grid-cols-2'} grid-cols-2 md:gap-base text-center`}>
              <div>
                <p className="text-default-400 mt-5 mb-1.25">รายได้</p>
                <h4 className="flex justify-center items-center mb-4 text-lg font-semibold">
                  <Icon icon="wallet" className="text-success me-2" />
                  <span>
                    <CountUp start={0} end={summary.totalRevenue} prefix="฿" duration={1} decimals={2} />
                  </span>
                </h4>
              </div>
              <div>
                <p className="text-default-400 mt-5 mb-1.25">ออเดอร์</p>
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
                  <p className="text-default-400 mt-5 mb-1.25">อัตราเติบโต</p>
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
                  getOptions={() => buildSalesReportChart(series)}
                  series={buildSalesReportChart(series).series}
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
