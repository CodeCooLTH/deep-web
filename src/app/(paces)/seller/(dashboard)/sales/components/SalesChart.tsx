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
import { getColor } from '@/utils/helpers'
import { formatBaht, profitDisplay, NET_PROFIT_FORMULA, pctChangeVsPrev } from '@/lib/format-money'
import { EXPENSE_CATEGORY_LABEL_TH, type ExpenseCategory } from '@/lib/expense'
import PacesStatCard from '../../_shared/PacesStatCard'
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
      {/* การ์ดสรุป — โครง 3 แถวของธีม ผ่าน PacesStatCard ที่ใช้ร่วมกับ /expenses
          เดิมเป็น SummaryCard ที่เขียนซ้ำในไฟล์นี้เองและมีแค่ 2 แถว (ไม่มี badge ไม่มีแถวล่าง) */}
      <div className={`mb-1.25 grid grid-cols-1 gap-1.25 md:grid-cols-2 ${showFinance ? 'lg:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-4'}`}>
        <PacesStatCard
          icon="cash"
          iconClass="bg-success/15 text-success-ink"
          title="ยอดขายที่ยืนยันแล้ว"
          text={formatBaht(summary.totalRevenue)}
          valueClass="text-success-ink"
          changePercent={pctChangeVsPrev(summary.totalRevenue, summary.prevRevenue)}
          bulletClass="text-success"
          metric="เฉลี่ยต่อวัน"
          metricValue={summary.days > 0 ? formatBaht(summary.totalRevenue / summary.days) : '—'}
        />
        <PacesStatCard
          icon="clock"
          iconClass="bg-warning/15 text-warning-ink"
          title="รอลูกค้ายืนยัน"
          text={formatBaht(summary.totalUnconfirmed)}
          valueClass="text-warning-ink"
          changePercent={pctChangeVsPrev(summary.totalUnconfirmed, summary.prevUnconfirmed)}
          bulletClass="text-warning"
          metric="รอยืนยัน"
          metricValue={`${summary.unconfirmedCount.toLocaleString('th-TH')} ออเดอร์`}
        />
        <PacesStatCard
          icon="receipt-2"
          iconClass="bg-primary/15 text-primary"
          title="ออเดอร์ทั้งหมด"
          text={summary.totalOrders.toLocaleString('th-TH')}
          valueClass="text-default-800"
          changePercent={pctChangeVsPrev(summary.totalOrders, summary.prevOrders)}
          bulletClass="text-primary"
          metric="ยกเลิก"
          metricValue={`${summary.cancelledCount.toLocaleString('th-TH')} ออเดอร์`}
        />
        <PacesStatCard
          icon="calculator"
          iconClass="bg-info/15 text-info-ink"
          title="เฉลี่ย/ออเดอร์"
          text={formatBaht(summary.avgOrderValue)}
          valueClass="text-default-800"
          changePercent={pctChangeVsPrev(summary.avgOrderValue, summary.prevAvgOrder)}
          bulletClass="text-info"
          metric="จากออเดอร์สำเร็จ"
          metricValue={`${summary.totalCompleted.toLocaleString('th-TH')} ออเดอร์`}
        />
        {showFinance && (
          <>
            <PacesStatCard
              icon="report-money"
              iconClass="bg-danger/15 text-danger-ink"
              title="ค่าใช้จ่าย"
              text={formatBaht(summary.totalExpense ?? 0)}
              valueClass="text-danger-ink"
              // ค่าใช้จ่ายเพิ่มขึ้นไม่ใช่ข่าวดี — invert ทิศทางสี
              changePercent={pctChangeVsPrev(summary.totalExpense ?? 0, summary.prevExpense ?? null, true)}
              changeHint="เทียบช่วงก่อนหน้า — ค่าใช้จ่ายลดลงคือดีขึ้น"
              bulletClass="text-danger"
              metric="หมวดที่จ่ายมากสุด"
              metricValue={
                summary.topExpenseCategory
                  ? EXPENSE_CATEGORY_LABEL_TH[summary.topExpenseCategory as ExpenseCategory]
                  : 'ยังไม่มีรายการ'
              }
            />
            <PacesStatCard
              icon={profit.positive ? 'trending-up' : 'trending-down'}
              iconClass={profit.positive ? 'bg-success/15 text-success-ink' : 'bg-danger/15 text-danger-ink'}
              title={profit.label}
              note={NET_PROFIT_FORMULA}
              text={profit.text}
              valueClass={profit.toneClass}
              changePercent={null}
              bulletClass={profit.positive ? 'text-success' : 'text-danger'}
              metric="อัตรากำไรสุทธิ"
              metricValue={
                summary.totalRevenue > 0
                  ? `${(((summary.netProfit ?? 0) / summary.totalRevenue) * 100).toFixed(1)}%`
                  : 'ยังไม่มียอดขาย'
              }
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

export default SalesChart
