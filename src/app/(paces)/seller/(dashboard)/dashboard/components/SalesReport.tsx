/**
 * SalesReport — กราฟรายงานยอดขาย (area+line chart)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/SalesReport.tsx
 *
 * เปลี่ยน copy เป็นภาษาไทย: Today/Monthly/Annual → วันนี้/รายเดือน/รายปี
 * Revenue/Orders/Growth Rate → รายได้/ออเดอร์/อัตราการเติบโต
 */
'use client'
import ApexChart from '@/components/wrappers/ApexChart'
import { CountUp } from '@/components/wrappers/CountUp'
import Icon from '@/components/wrappers/Icon'
import { getColor } from '@/utils/helpers'
import { ApexOptions } from 'apexcharts'

export const getSalesReportChart = (): ApexOptions => ({
  series: [
    {
      name: 'รายได้รวม',
      type: 'area',
      data: [21, 21, 21, 35, 35, 35, 44, 44, 44, 54, 54, 54, 48, 48, 76, 76, 95, 95, 76, 76, 32, 32, 46, 48, 48],
    },
    {
      name: 'ออเดอร์',
      type: 'line',
      data: [40, 40, 40, 50, 50, 35, 27, 27, 27, 15, 15, 27, 27, 36, 36, 33, 33, 34, 35, 33, 50, 50, 55, 55, 55],
    },
  ],
  chart: {
    type: 'line',
    height: 359,
    toolbar: {
      show: false,
    },
    offsetX: 0,
  },
  stroke: {
    width: [3, 2],
    curve: 'smooth',
    dashArray: [0, 8],
  },
  colors: [getColor('chart-secondary'), getColor('chart-alpha')],
  grid: {
    strokeDashArray: 7,
  },
  xaxis: {
    axisBorder: {
      show: false,
    },
    labels: {
      offsetY: 2,
    },
  },
  yaxis: {
    tickAmount: 4,
    min: 0,
    max: 100,
    labels: {
      show: true,
      formatter: function (value) {
        return value + 'k'
      },
      offsetX: -10,
    },
    axisBorder: {
      show: false,
    },
  },
  dataLabels: {
    enabled: false,
  },
  markers: {
    size: 0,
  },
  tooltip: {
    x: {
      format: 'dd MMM yyyy',
    },
    y: {
      formatter: function (val) {
        return '฿' + val + 'k'
      },
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
  legend: {
    offsetY: 15,
  },
})

const SalesReport = () => {
  return (
    <div className="card h-full">
      <div className="card-header md:py-0 pt-6 pb-0">
        <h4 className="card-title">
          รายงานยอดขาย
        </h4>
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
      <div>
        <div className="bg-light/25 border-b border-default-300 border-dashed">
          <div className="grid md:grid-cols-3 grid-cols-2 md:gap-base text-center">
            <div>
              <p className="text-default-400 mt-5 mb-1.25">รายได้</p>
              <h4 className="flex justify-center items-center mb-4 text-lg font-semibold">
                <Icon icon="wallet" className="text-success me-2" />
                <span>
                  <CountUp start={0} end={0} prefix="฿" duration={1} decimals={2} />
                </span>
              </h4>
            </div>
            <div>
              <p className="text-default-400 mt-5 mb-1.25">ออเดอร์</p>
              <h4 className="flex justify-center items-center mb-4 text-lg font-semibold">
                <Icon icon="basket" className="text-success me-2" />
                <span>
                  <CountUp start={0} end={0} duration={1} />
                </span>
              </h4>
            </div>
            <div>
              <p className="text-default-400 mt-5 mb-1.25">อัตราการเติบโต</p>
              <h4 className="flex justify-center items-center mb-4 text-lg font-semibold">
                <Icon icon="trending-up" className="text-success me-2" />
                <span>
                  <CountUp start={0} end={0} duration={1} decimals={2} suffix="%" />
                </span>
              </h4>
            </div>
          </div>
        </div>
        <div className="p-5 pt-1.25 relative">
          <div>
            <div className="apex-charts">
              <ApexChart getOptions={getSalesReportChart} series={getSalesReportChart().series} type="line" height={359} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SalesReport
