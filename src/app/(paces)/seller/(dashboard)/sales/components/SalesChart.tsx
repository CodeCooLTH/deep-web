/**
 * SalesChart — สรุปยอดขาย/กำไร + กราฟแท่งรายวัน (feature 00016)
 *
 * v3 (2026-08-02):
 *   1. แถบสรุปเปลี่ยนจาก div พื้นเทา → **การ์ดแยกใบ** ให้ตรงกับหน้าสินค้า
 *      Base: src/app/(paces)/seller/(dashboard)/products/components/ProductStats.tsx
 *      (card > card-body > card-title text-sm + icon chip กลม size-9 + ตัวเลข text-xl)
 *   2. กราฟเปลี่ยนจาก area+line 2 แกน → **แท่งรายวันแบบชีตยอดขายบนมือถือ**
 *      Base: dashboard/components/SalesChartSheet.tsx::buildSalesChartOptions
 *      (bar + stacked group; ค่าใช้จ่ายอยู่คนละ group จึงวางข้างกันไม่ต่อยอดทับ)
 *      ตัด series "ออเดอร์" ทิ้ง — มันบังคับให้มีแกนขวาคนละหน่วยจนเทียบความสูงแท่งไม่ได้
 *      และจำนวนออเดอร์อ่านได้จากการ์ดสรุปกับตารางด้านล่างอยู่แล้ว
 *
 * series ทั้งหมดมาจาก real DailyRow[] ที่ RSC คำนวณ — ไม่มี demo data จาก theme
 * PDPA: ข้อมูลเป็น aggregate ตามวัน ไม่มี buyer PII ใด ๆ
 */
'use client'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { getColor, cn } from '@/utils/helpers'
import { formatBaht, profitDisplay, NET_PROFIT_FORMULA } from '@/lib/format-money'
import { useCallback } from 'react'
import type { DailyRow, SummaryData } from './data'

type Props = {
  daily: DailyRow[]
  summary: SummaryData
}

const SalesChart = ({ daily, summary }: Props) => {
  const categories = daily.map((d) => d.label)
  const revenueSeries = daily.map((d) => d.revenue)
  const unconfirmedSeries = daily.map((d) => d.unconfirmedRevenue)
  // ค่าใช้จ่าย (feature 00016) — undefined ทั้งชุด = ไม่มีสิทธิ์ดูข้อมูลการเงิน ซ่อนทั้ง series และการ์ด
  const showFinance = summary.totalExpense != null
  const expenseSeries = daily.map((d) => d.expense ?? 0)
  const profit = profitDisplay(summary.netProfit ?? 0)

  /**
   * ยืนยันแล้ว + รอยืนยัน stack กันใน group 'sales' (เงินก้อนเดียวกันคนละสถานะ)
   * ค่าใช้จ่ายอยู่ group 'expense' จึงวางเป็นแท่งแยกข้างกัน ไม่ต่อยอดทับ
   * — โครงเดียวกับชีตยอดขายบนมือถือเป๊ะ เพื่อให้สอง surface เล่าเรื่องเดียวกัน
   */
  const series = [
    { name: 'ลูกค้ายืนยันแล้ว', group: 'sales', data: revenueSeries },
    { name: 'รอลูกค้ายืนยัน', group: 'sales', data: unconfirmedSeries },
    ...(showFinance ? [{ name: 'ค่าใช้จ่าย', group: 'expense', data: expenseSeries }] : []),
  ]

  const getOptions = useCallback(
    () => ({
      series,
      chart: { type: 'bar' as const, height: 320, stacked: true, toolbar: { show: false } },
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 3 } },
      dataLabels: { enabled: false },
      // น้ำเงิน = ยอดขาย, แดง = ค่าใช้จ่าย — token เท่านั้น (Hard Rule 10 ห้าม hardcode hex)
      // น้ำเงิน = ยืนยันแล้ว, เหลือง = รอยืนยัน, แดง = ค่าใช้จ่าย — ชุดสีเดียวกับชีตมือถือ
      colors: showFinance
        ? [getColor('chart-primary'), getColor('warning'), getColor('chart-beta')]
        : [getColor('chart-primary'), getColor('warning')],
      legend: { show: true, position: 'top' as const, horizontalAlign: 'right' as const, fontSize: '13px' },
      xaxis: {
        categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        // 30 วันชนกันแน่บนจอแคบ — ให้ Apex thin label เอง + ซ่อนตัวที่ทับ
        tickAmount: 10,
        labels: { hideOverlappingLabels: true, rotate: 0, style: { fontSize: '13px' } },
      },
      yaxis: { labels: { formatter: (val: number) => formatBaht(val) } },
      grid: { strokeDashArray: 4 },
      tooltip: { shared: true, intersect: false, y: { formatter: (val: number) => formatBaht(val) } },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daily, showFinance],
  )

  return (
    <div>
      {/* การ์ดสรุป — โครงเดียวกับหน้าสินค้า */}
      <div className="mb-1.25 grid grid-cols-1 gap-1.25 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          icon="cash"
          iconClass="bg-success/15 text-success-ink"
          title="ยอดขายที่ยืนยันแล้ว"
          text={formatBaht(summary.totalRevenue)}
          valueClass="text-success-ink"
        />
        <SummaryCard
          icon="clock"
          iconClass="bg-warning/15 text-warning-ink"
          title="รอลูกค้ายืนยัน"
          text={formatBaht(summary.totalUnconfirmed)}
          valueClass="text-warning-ink"
        />
        <SummaryCard
          icon="receipt-2"
          iconClass="bg-primary/15 text-primary"
          title="ออเดอร์ทั้งหมด"
          text={summary.totalOrders.toLocaleString('th-TH')}
          valueClass="text-default-800"
        />
        <SummaryCard
          icon="circle-check"
          iconClass="bg-success/15 text-success-ink"
          title="สำเร็จ"
          text={summary.totalCompleted.toLocaleString('th-TH')}
          valueClass="text-success-ink"
        />
        <SummaryCard
          icon="calculator"
          iconClass="bg-info/15 text-info-ink"
          title="เฉลี่ย/ออเดอร์"
          text={formatBaht(summary.avgOrderValue)}
          valueClass="text-default-800"
        />
        {showFinance && (
          <>
            <SummaryCard
              icon="report-money"
              iconClass="bg-danger/15 text-danger-ink"
              title="ค่าใช้จ่าย"
              text={formatBaht(summary.totalExpense ?? 0)}
              valueClass="text-danger-ink"
            />
            {/* สี chip/ตัวเลขตามทิศทางของค่า — เดิมการ์ดนี้พื้นเขียวเสมอ ทำให้ "ขาดทุน" ถูกทาเขียว
                ซึ่งขัด Verified-Means-Green ตรง ๆ */}
            <SummaryCard
              icon={profit.positive ? 'trending-up' : 'trending-down'}
              iconClass={profit.positive ? 'bg-success/15 text-success-ink' : 'bg-danger/15 text-danger-ink'}
              title={profit.label}
              text={profit.text}
              valueClass={profit.toneClass}
              note={NET_PROFIT_FORMULA}
            />
          </>
        )}
      </div>

      <div className="card">
        <div className="card-body">
          <ApexChart getOptions={getOptions} series={series} type="bar" height={320} />
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  icon,
  iconClass,
  title,
  text,
  valueClass,
  note,
}: {
  icon: string
  iconClass: string
  title: string
  text: string
  valueClass: string
  note?: string
}) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-center gap-1.5">
          <h5 className="card-title text-sm" title={title}>
            {title}
          </h5>
          {/* วิธีคำนวณอ่านตอน hover — ไม่กินพื้นที่ถาวรบนการ์ด */}
          {note && (
            <span className="text-default-700" title={note} aria-label={note}>
              <Icon icon="info-circle" className="text-base" />
            </span>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2.5">
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', iconClass)}>
            <Icon icon={icon} className="text-2xl" />
          </div>
          <span className={cn('text-xl font-semibold', valueClass)}>{text}</span>
        </div>
      </div>
    </div>
  )
}

export default SalesChart
