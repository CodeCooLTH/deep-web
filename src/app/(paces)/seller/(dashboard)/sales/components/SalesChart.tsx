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
 * v4 (2026-10-01) — การ์ดกราฟออกแบบใหม่ (user: "ไม่สวยเลย · วันที่ยาวไป · กราฟให้ใหญ่และสวยกว่านี้")
 *   Base: dashboard/components/SalesChartSheet.tsx (ภาษาเดียวกับชีตบนหน้าหลักที่ user อนุมัติแล้ว)
 *   - legend ของ Apex (2 แถวลอยขวา กินพื้นที่เหนือกราฟ ~110px บนมือถือ) → แถบจุดสี+ยอดรวมในหัวการ์ด
 *   - ป้ายแกน x "2569-09-01" แนวตั้ง → "01-09" แนวนอน (formatDayMonth ตัวกลาง) · วันที่เต็มอยู่ใน tooltip
 *   - แกน y "฿40,000" → "฿40k" (formatBahtCompact) คืนความกว้างให้แท่ง · แท่งกว้างขึ้น มุมโค้งบนสุด
 *   - สีเขียว = ยืนยันแล้ว ให้ตรงกับการ์ดสรุปข้างบนและชีตหน้าหลัก (เดิมน้ำเงิน — สถานะเดียวสองสี)
 *   - ปิด drag-to-zoom (จิ้มลากบนมือถือแล้วเกิดกล่อง selection ค้าง — บั๊กเดียวกับที่ชีตแก้ไปแล้ว)
 *
 * series ทั้งหมดมาจาก real DailyRow[] ที่ RSC คำนวณ — ไม่มี demo data จาก theme
 * PDPA: ข้อมูลเป็น aggregate ตามวัน ไม่มี buyer PII ใด ๆ
 */
'use client'

import ApexChart from '@/components/wrappers/ApexChart'
import { getColor } from '@/utils/helpers'
import { formatBaht, formatBahtCompact, profitDisplay, SALES_PROFIT_FORMULA, pctChangeVsPrev } from '@/lib/format-money'
import { formatDate, formatDayMonth } from '@/lib/format-date'
import PacesStatCard from '../../_shared/PacesStatCard'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import { useCallback } from 'react'
import type { DailyRow, SummaryData } from './data'

type Props = {
  daily: DailyRow[]
  summary: SummaryData
  /** "01-09-2569 – 30-09-2569" — ปีของป้ายแกน x (ที่ตัดปีออก) อ่านได้จากตรงนี้ */
  periodLabel: string
}

const SalesChart = ({ daily, summary, periodLabel }: Props) => {
  // category = ISO ดิบ ("2026-09-01") — จัดรูปตอนแสดงเท่านั้น ทั้งแกน (สั้น) และ tooltip (เต็ม)
  const categories = daily.map((d) => d.date)
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
    { name: 'ยืนยันแล้ว', group: 'sales', data: revenueSeries },
    { name: 'รอยืนยัน', group: 'sales', data: unconfirmedSeries },
    ...(showFinance ? [{ name: 'ค่าส่ง', group: 'expense', data: shippingSeries }] : []),
  ]
  const hasAnyValue = daily.some((d) => d.revenue > 0 || d.unconfirmedRevenue > 0 || (d.shippingCost ?? 0) > 0)

  /**
   * ยืนยันแล้ว + รอยืนยัน stack กันใน group 'sales' (เงินก้อนเดียวกันคนละสถานะ)
   * ค่าส่งอยู่ group 'expense' จึงวางเป็นแท่งแยกข้างกัน ไม่ต่อยอดทับ — โครงเดียวกับชีตบนหน้าหลัก
   */
  const getOptions = useCallback(
    () => ({
      series,
      chart: {
        type: 'bar' as const,
        height: 320,
        stacked: true,
        toolbar: { show: false },
        zoom: { enabled: false },
        selection: { enabled: false },
        parentHeightOffset: 0,
        fontFamily: 'inherit',
      },
      plotOptions: {
        bar: {
          columnWidth: daily.length > 20 ? '72%' : '55%',
          borderRadius: 3,
          borderRadiusApplication: 'end' as const,
          borderRadiusWhenStacked: 'last' as const,
        },
      },
      dataLabels: { enabled: false },
      // legend ของ Apex ถูกแทนด้วยแถบในหัวการ์ด (จุดสี = ซีรีส์ 1:1 + ยอดรวม)
      legend: { show: false },
      // token เท่านั้น (Hard Rule 10) — เขียว=ยืนยันแล้ว เหลือง=รอยืนยัน แดง=ค่าส่ง (ชุดเดียวกับชีตหน้าหลัก)
      colors: showFinance
        ? [getColor('success'), getColor('warning'), getColor('chart-beta')]
        : [getColor('success'), getColor('warning')],
      xaxis: {
        categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
        labels: {
          // "01-09" สั้นพอวางแนวนอน — จอแคบ Apex ข้ามบางวันเอง (hideOverlappingLabels) ไม่มีวันทับกัน
          rotate: 0,
          hideOverlappingLabels: true,
          trim: false,
          style: { fontSize: '11px', colors: getColor('default-500') },
          formatter: (v: string) => formatDayMonth(v),
        },
      },
      yaxis: {
        min: 0,
        forceNiceScale: true,
        tickAmount: 4,
        labels: {
          style: { fontSize: '11px', colors: getColor('default-500') },
          formatter: (val: number) => formatBahtCompact(val),
        },
      },
      grid: {
        strokeDashArray: 4,
        borderColor: getColor('default-200'),
        xaxis: { lines: { show: false } },
        padding: { top: -8, right: 8, bottom: 0, left: 4 },
      },
      tooltip: {
        shared: true,
        intersect: false,
        x: { formatter: (_v: unknown, o?: { dataPointIndex?: number }) => formatDate(daily[o?.dataPointIndex ?? -1]?.date) },
        y: { formatter: (val: number) => formatBaht(val) },
      },
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
        <div className="card-header flex-nowrap gap-2">
          <h5 className="card-title min-w-0 truncate">ยอดขายรายวัน</h5>
          <span className="text-default-500 shrink-0 text-xs whitespace-nowrap">{periodLabel}</span>
        </div>
        {/* แถบนี้คือ legend ของกราฟ — จุดสี = สีแท่ง 1:1 พร้อมยอดรวมของช่วง */}
        <div className="border-default-200 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-dashed px-5 py-2.5">
          <LegendItem dot="bg-success" label="ยืนยันแล้ว" value={summary.totalRevenue} />
          <LegendItem dot="bg-warning" label="รอยืนยัน" value={summary.totalUnconfirmed} />
          {showFinance && <LegendItem dot="bg-danger" label="ค่าส่ง" value={summary.totalShippingCost ?? 0} />}
        </div>
        <div className="card-body px-1 pt-3 pb-1 sm:px-3">
          {hasAnyValue ? (
            <ApexChart getOptions={getOptions} series={series} type="bar" height={320} />
          ) : (
            <SellerEmptyState compact icon="chart-bar-off" title="ยังไม่มียอดขายในช่วงนี้" />
          )}
        </div>
      </div>
    </div>
  )
}

export default SalesChart

/** ช่องหนึ่งของแถบ legend — จุดสีต้องตรงกับสีซีรีส์ในกราฟเสมอ (Base: SalesChartSheet.tsx::LegendCell) */
function LegendItem({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <span className="text-default-600">{label}</span>
      <span className="text-default-800 font-semibold tabular-nums">{formatBaht(value)}</span>
    </span>
  )
}
