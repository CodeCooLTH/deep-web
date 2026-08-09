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
import { formatBaht, profitDisplay, SALES_PROFIT_FORMULA, pctChangeVsPrev } from '@/lib/format-money'
import PacesStatCard from '../../_shared/PacesStatCard'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
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
  // ค่าส่ง (feature 00016 ส่วนขยาย 2026-08-09) — undefined ทั้งชุด = ไม่มีสิทธิ์ดูข้อมูลการเงิน
  // ซ่อนทั้ง series และการ์ด (ไม่ใช่ส่ง 0 ลงไปแล้วให้ดูเหมือนไม่มีค่าส่ง)
  const showFinance = summary.totalShippingCost != null
  const shippingSeries = daily.map((d) => d.shippingCost ?? 0)
  const profit = profitDisplay(summary.netProfit ?? 0)

  /**
   * ยืนยันแล้ว + รอยืนยัน stack กันใน group 'sales' (เงินก้อนเดียวกันคนละสถานะ)
   * ค่าใช้จ่ายอยู่ group 'expense' จึงวางเป็นแท่งแยกข้างกัน ไม่ต่อยอดทับ
   * — โครงเดียวกับชีตยอดขายบนมือถือเป๊ะ เพื่อให้สอง surface เล่าเรื่องเดียวกัน
   */
  const series = [
    { name: 'ลูกค้ายืนยันแล้ว', group: 'sales', data: revenueSeries },
    { name: 'รอลูกค้ายืนยัน', group: 'sales', data: unconfirmedSeries },
    ...(showFinance ? [{ name: 'ค่าส่ง', group: 'expense', data: shippingSeries }] : []),
  ]

  const getOptions = useCallback(
    () => ({
      series,
      chart: { type: 'bar' as const, height: 320, stacked: true, toolbar: { show: false } },
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 3 } },
      dataLabels: { enabled: false },
      // token เท่านั้น (Hard Rule 10 ห้าม hardcode hex)
      // น้ำเงิน = ยืนยันแล้ว, เหลือง = รอยืนยัน, แดง = ค่าส่ง — ชุดสีเดียวกับชีตมือถือ
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

  const pendingShipments = showFinance ? (summary.pendingShipmentCount ?? 0) : 0

  return (
    <div>
      {/* แถบเตือน "ยังไม่รู้ค่าส่งจริง" — โครง/tone คัดลอกจากแถบต้นทุนขาดใน ExpenseWorkspace.tsx:183-199
          (ปัญหาชนิดเดียวกัน: ตัวเลขที่แสดงเป็นเพดานบนเพราะข้อมูลบางส่วนยังไม่มา)

          ไม่มีปุ่ม "แก้ไข" ต่างจากแถบต้นทุนขาด — ร้านทำอะไรให้ขนส่งแจ้งราคาเร็วขึ้นไม่ได้
          ปุ่มที่สั่งทำในสิ่งที่ทำไม่ได้แย่กว่าไม่มีปุ่ม เหลือแค่ลิงก์ "ดู" */}
      {pendingShipments > 0 && (
        <div
          role="alert"
          aria-live="polite"
          className="border-warning/20 bg-warning/10 text-warning-ink mb-1.25 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-medium"
        >
          <span className="flex items-start gap-2">
            <Icon icon="alert-triangle" className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            กำไรที่แสดงอาจสูงกว่าจริง — {pendingShipments.toLocaleString('th-TH')} ใบยังไม่รู้ค่าส่งจริง
            (ขนส่งยังไม่แจ้งราคา)
          </span>
          <Link href="/orders?stage=AWAITING_PICKUP" className="font-semibold underline">
            ดูออเดอร์ที่รอรับเข้า →
          </Link>
        </div>
      )}

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
              icon="truck"
              iconClass="bg-danger/15 text-danger-ink"
              title="ค่าส่ง"
              text={formatBaht(summary.totalShippingCost ?? 0)}
              valueClass="text-danger-ink"
              // ค่าส่งเพิ่มขึ้นไม่ใช่ข่าวดี — invert ทิศทางสี
              changePercent={pctChangeVsPrev(
                summary.totalShippingCost ?? 0,
                summary.prevShippingCost ?? null,
                true,
              )}
              changeHint="เทียบช่วงก่อนหน้า — ค่าส่งลดลงคือดีขึ้น"
              bulletClass="text-danger"
              note="ค่าส่งที่ขนส่งคิดจริง + ค่าธรรมเนียมเก็บเงินปลายทาง (ไม่รวมค่าใช้จ่ายอื่นของร้าน)"
              /* แถวล่างของการ์ดมีได้บรรทัดเดียว (การ์ดทั้งแถวต้องสูงเท่ากัน) — เลือกโชว์ส่วนย่อยที่
                 ผู้ขายมักไม่รู้ว่ามี: ค่าธรรมเนียมเก็บเงินปลายทางที่ขนส่งหักจากยอดโอนคืน
                 🛑 เป็นส่วนย่อยของตัวเลขด้านบน ไม่ใช่ยอดที่ต้องเอาไปบวกเพิ่ม */
              metric="ในนี้เป็นค่าบริการ COD"
              metricValue={formatBaht(summary.totalCodFee ?? 0)}
            />
            <PacesStatCard
              icon={profit.positive ? 'trending-up' : 'trending-down'}
              iconClass={profit.positive ? 'bg-success/15 text-success-ink' : 'bg-danger/15 text-danger-ink'}
              /* 🛑 ห้ามใช้คำว่า "กำไรสุทธิ" ที่หน้านี้ — ตัวเลขนี้ยังไม่หักค่าใช้จ่ายอื่นของร้าน
                 จึงไม่เท่ากับกำไรสุทธิที่หน้า /expenses (ดู SALES_PROFIT_FORMULA) การใช้คำเดียวกัน
                 กับตัวเลขคนละสูตรคือคลาสของบั๊กที่ critique จับได้เมื่อ 2026-08-08 */
              title={profit.positive ? 'กำไรจากการขาย' : 'ขาดทุนจากการขาย'}
              note={SALES_PROFIT_FORMULA}
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
