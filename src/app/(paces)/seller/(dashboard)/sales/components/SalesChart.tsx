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
import { bucketForChart } from '@/lib/sales-chart-buckets'
import PacesStatCard from '../../_shared/PacesStatCard'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import { useCallback } from 'react'
import type { DailyRow, SummaryData } from './data'
import type { ReceivableSummary } from '@/services/receivable.service'

type Props = {
  daily: DailyRow[]
  summary: SummaryData
  /** "01-09-2569 – 30-09-2569" — ปีของป้ายแกน x (ที่ตัดปีออก) อ่านได้จากตรงนี้ */
  periodLabel: string
  /**
   * ร้านบริการ (feature 00067): แท็บนี้คือ "ยอดเก็บเงิน" — ไม่แสดงกำไร/ค่าส่ง (กำไรอยู่แท็บกำไรขาดทุน
   * ที่ดึงจาก SSOT เดียวกับ /expenses) และนับเป็น "งาน" ไม่ใช่ "ออเดอร์" — กติกาเดียวกับชีตบนหน้าหลัก
   */
  isServiceQueue?: boolean
  /**
   * แกนเงินของร้านบริการ (รับจริง + ค้างรับ = ยอดขาย) จาก receivable.service — ตัวเดียวกับรายการ
   * "ต้องตามเก็บ" ใต้การ์ด และชุดเดียวกับชีตบนหน้าหลัก (review HR8 2026-10-01 P1: เดิมแท็บนี้พูดแกน
   * "ยืนยันแล้ว/รอยืนยัน" ขณะที่ชีตแท็บชื่อเดียวกันพูดแกนเงิน — user เคยถาม "ทำไมไม่ตรงกัน" มาแล้ว 2 รอบ)
   * undefined = ไม่มีสิทธิ์ดูการเงิน → ถอยไปแกนเดิม
   */
  collect?: ReceivableSummary
}

const SalesChart = ({ daily, summary, periodLabel, isServiceQueue = false, collect }: Props) => {
  const moneyAxis = isServiceQueue && collect != null
  /**
   * ถ้อยคำ/สีชุดเดิม (ก่อน 00067) สำหรับร้านที่ไม่ใช่บริการ — มติ user 2026-10-02 "กลับเป็นคำเดิมด้วย"
   * (src/lib/finance-rules.ts) · หน้าตา/โครงการ์ดที่ใหม่ (หัวการ์ด · แถบ legend · แกน · รายสัปดาห์) ใช้ทุกร้าน
   */
  const legacyWords = !isServiceQueue
  const confirmedName = legacyWords ? 'ลูกค้ายืนยันแล้ว' : 'ยืนยันแล้ว'
  const unconfirmedName = legacyWords ? 'รอลูกค้ายืนยัน' : 'รอยืนยัน'
  const noun = isServiceQueue ? 'งาน' : 'ออเดอร์'
  // category = ISO ดิบ ("2026-09-01") — จัดรูปตอนแสดงเท่านั้น ทั้งแกน (สั้น) และ tooltip (เต็ม)
  /**
   * ช่วงยาวเกิน 62 วัน → รวมเป็นแท่งรายสัปดาห์ (เฉพาะกราฟ — ตารางยังรายวัน) · ดู lib/sales-chart-buckets
   * ชื่อการ์ดและ tooltip ต้องบอกด้วยว่าเป็นรายสัปดาห์ ไม่งั้นผู้ใช้อ่านแท่งเป็นยอดวันเดียว
   */
  const { weekly, buckets } = bucketForChart(daily)
  const categories = buckets.map((b) => b.start)
  const revenueSeries = buckets.map((b) => b.revenue)
  const unconfirmedSeries = buckets.map((b) => b.unconfirmedRevenue)
  // ค่าส่ง (feature 00016 ส่วนขยาย 2026-08-09) — undefined ทั้งชุด = ไม่มีสิทธิ์ดูข้อมูลการเงิน
  // ซ่อนทั้ง series และการ์ด (ไม่ใช่ส่ง 0 ลงไปแล้วให้ดูเหมือนไม่มีค่าส่ง)
  const showFinance = summary.totalShippingCost != null && !isServiceQueue
  const shippingSeries = buckets.map((b) => b.shippingCost)
  const profit = profitDisplay(summary.netProfit ?? 0)
  /**
   * ยังตั้งต้นทุนไม่ครบ = กำไรเป็นเพดานบน (ต้นทุนที่ขาดถูกข้าม) — คำ "ไม่เกิน/อย่างน้อย" ชุดเดียวกับ
   * กำไรรายใบ (order-profit-presentation.ts) · สีเตือนไม่ใช่เขียว (Verified-Means-Green) ·
   * อัตรากำไรห้ามเป็นตัวเลข (เดิมร้านที่ไม่เคยตั้งต้นทุนเห็น "100%")
   */
  const profitCapped = summary.hasMissingCost === true
  const profitTitle = profit.positive
    ? profitCapped ? 'กำไรจากการขายไม่เกิน' : 'กำไรจากการขาย'
    : profitCapped ? 'ขาดทุนจากการขายอย่างน้อย' : 'ขาดทุนจากการขาย'
  const profitTone = profitCapped && profit.positive ? 'text-warning-ink' : profit.toneClass

  /**
   * ยืนยันแล้ว + รอยืนยัน stack กันใน group 'sales' (เงินก้อนเดียวกันคนละสถานะ)
   * ค่าใช้จ่ายอยู่ group 'expense' จึงวางเป็นแท่งแยกข้างกัน ไม่ต่อยอดทับ
   * — โครงเดียวกับชีตยอดขายบนมือถือเป๊ะ เพื่อให้สอง surface เล่าเรื่องเดียวกัน
   */
  const series = moneyAxis
    ? /* แกนเงิน: แท่งซ้อน รับจริง (เขียว) + ค้างรับ (เหลือง) = ยอดขายของบิลที่เปิดวันนั้น
         ชุดสีและการตัดวันเดียวกับชีตหน้าหลัก · รับจริงรายวันมาจาก receivable.service.daily
         (แถวชุดเดียวกับ summary ⇒ ผลรวมทั้งช่วงเท่ากับแถบ legend พอดี)
         ค้างรับติดลบ (บันทึกรับเกินบิล) วาดเป็น 0 — แท่งติดลบซ้อนอ่านไม่ออก ตัวเลขจริงยังอยู่ในตาราง */
      [
        { name: 'รับจริง', group: 'sales', data: buckets.map((b) => b.received) },
        {
          name: 'ค้างรับ',
          group: 'sales',
          data: buckets.map((b) => Math.max(0, b.revenue + b.unconfirmedRevenue - b.received)),
        },
      ]
    : [
        { name: confirmedName, group: 'sales', data: revenueSeries },
        { name: unconfirmedName, group: 'sales', data: unconfirmedSeries },
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
      colors: moneyAxis
        ? [getColor('success'), getColor('warning')]
        : showFinance
          ? [getColor(legacyWords ? 'chart-primary' : 'success'), getColor('warning'), getColor('chart-beta')]
          : [getColor(legacyWords ? 'chart-primary' : 'success'), getColor('warning')],
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
        x: {
          formatter: (_v: unknown, o?: { dataPointIndex?: number }) => {
            const b = buckets[o?.dataPointIndex ?? -1]
            if (!b) return '—'
            return b.start === b.end ? formatDate(b.start) : `${formatDate(b.start)} – ${formatDate(b.end)}`
          },
        },
        y: { formatter: (val: number) => formatBaht(val) },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daily, showFinance, moneyAxis, legacyWords],
  )

  return (
    <div>
      {/* การ์ดสรุป — โครง 3 แถวของธีม ผ่าน PacesStatCard ที่ใช้ร่วมกับ /expenses
          เดิมเป็น SummaryCard ที่เขียนซ้ำในไฟล์นี้เองและมีแค่ 2 แถว (ไม่มี badge ไม่มีแถวล่าง) */}
      {/* 6 ใบ → 3 คอลัมน์ตั้งแต่ lg (3×2) · 4 ใบ → 4 คอลัมน์เฉพาะ ≥xl
          เดิม xl:grid-cols-6 ที่ 1280 เหลือใบละ ~122px และ lg:grid-cols-4 ที่ 1024 เหลือ ~141px
          ตัวเลขเงิน 6–7 หลัก + badge ล้นการ์ด (audit 2026-10-01 — 1024 แคบกว่า tablet เพราะ sidebar 245px) */}
      <div className={`mb-1.25 grid grid-cols-1 gap-1.25 md:grid-cols-2 ${showFinance ? 'lg:grid-cols-3' : 'xl:grid-cols-4'}`}>
        {moneyAxis && collect ? (
          <>
            <PacesStatCard
              icon="cash"
              iconClass="bg-success/15 text-success-ink"
              title="เงินที่รับจริง"
              text={formatBaht(collect.receivedTotal)}
              valueClass="text-success-ink"
              changePercent={null}
              bulletClass="text-success"
              metric="เฉลี่ยต่อวัน"
              metricValue={summary.days > 0 ? formatBaht(collect.receivedTotal / summary.days) : '—'}
            />
            <PacesStatCard
              icon="clock"
              iconClass="bg-warning/15 text-warning-ink"
              title="ค้างรับ"
              note="ยอดที่ยังไม่ได้บันทึกการรับเงิน ไม่ได้แปลว่าลูกค้าไม่จ่าย"
              text={formatBaht(collect.outstandingTotal)}
              valueClass="text-warning-ink"
              changePercent={null}
              bulletClass="text-warning"
              metric="ค้างอยู่"
              metricValue={`${collect.outstandingCount.toLocaleString('th-TH')} ${noun}`}
            />
            <PacesStatCard
              icon="receipt-2"
              iconClass="bg-primary/15 text-primary"
              title={`${noun}ทั้งหมด`}
              text={collect.orderCount.toLocaleString('th-TH')}
              valueClass="text-default-800"
              changePercent={null}
              bulletClass="text-primary"
              metric="ยกเลิก"
              metricValue={`${summary.cancelledCount.toLocaleString('th-TH')} ${noun}`}
            />
            <PacesStatCard
              icon="calculator"
              iconClass="bg-info/15 text-info-ink"
              title={`เฉลี่ย/${noun}`}
              text={formatBaht(collect.orderCount > 0 ? collect.salesTotal / collect.orderCount : 0)}
              valueClass="text-default-800"
              changePercent={null}
              bulletClass="text-info"
              metric="ยอดขายรวม"
              metricValue={formatBaht(collect.salesTotal)}
            />
          </>
        ) : (
          <>
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
          // ยอดรอยืนยันเพิ่มขึ้นไม่ใช่ข่าวดีหรือร้าย — badge สีกลาง ไม่ใช่เขียว (Verified-Means-Green)
          changeTone={legacyWords ? undefined : 'neutral'}
          bulletClass="text-warning"
          metric="รอยืนยัน"
          metricValue={`${summary.unconfirmedCount.toLocaleString('th-TH')} ${noun}`}
        />
        <PacesStatCard
          icon="receipt-2"
          iconClass="bg-primary/15 text-primary"
          title={`${noun}ทั้งหมด`}
          text={summary.totalOrders.toLocaleString('th-TH')}
          valueClass="text-default-800"
          changePercent={pctChangeVsPrev(summary.totalOrders, summary.prevOrders)}
          bulletClass="text-primary"
          metric="ยกเลิก"
          metricValue={`${summary.cancelledCount.toLocaleString('th-TH')} ${noun}`}
        />
        <PacesStatCard
          icon="calculator"
          iconClass="bg-info/15 text-info-ink"
          title={`เฉลี่ย/${noun}`}
          text={formatBaht(summary.avgOrderValue)}
          valueClass="text-default-800"
          changePercent={pctChangeVsPrev(summary.avgOrderValue, summary.prevAvgOrder)}
          bulletClass="text-info"
          metric={`จาก${noun}สำเร็จ`}
          metricValue={`${summary.totalCompleted.toLocaleString('th-TH')} ${noun}`}
        />
          </>
        )}
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
              icon={profitCapped ? 'alert-triangle' : profit.positive ? 'trending-up' : 'trending-down'}
              iconClass={
                profitCapped && profit.positive
                  ? 'bg-warning/15 text-warning-ink'
                  : profit.positive
                    ? 'bg-success/15 text-success-ink'
                    : 'bg-danger/15 text-danger-ink'
              }
              /* 🛑 ห้ามใช้คำว่า "กำไรสุทธิ" ที่หน้านี้ — ตัวเลขนี้ยังไม่หักค่าใช้จ่ายอื่นของร้าน
                 จึงไม่เท่ากับกำไรสุทธิที่หน้า /expenses (ดู SALES_PROFIT_FORMULA) การใช้คำเดียวกัน
                 กับตัวเลขคนละสูตรคือคลาสของบั๊กที่ critique จับได้เมื่อ 2026-08-08 */
              title={profitTitle}
              note={
                profitCapped
                  ? `${SALES_PROFIT_FORMULA} · บางรายการยังไม่ได้ตั้งต้นทุน กำไรจริงต่ำกว่านี้`
                  : SALES_PROFIT_FORMULA
              }
              text={profit.text}
              valueClass={profitTone}
              changePercent={null}
              bulletClass={profitCapped && profit.positive ? 'text-warning' : profit.positive ? 'text-success' : 'text-danger'}
              /* "อัตรากำไร" ไม่ใช่ "อัตรากำไรสุทธิ" — หน้านี้ห้ามใช้คำว่ากำไรสุทธิ (ดูคอมเมนต์ข้างบน) */
              caption={profitCapped ? 'ยังตั้งต้นทุนไม่ครบ — กำไรจริงต่ำกว่านี้' : undefined}
              metric={legacyWords ? 'อัตรากำไรสุทธิ' : 'อัตรากำไร'}
              metricValue={
                summary.totalRevenue <= 0
                  ? 'ยังไม่มียอดขาย'
                  : profitCapped
                    ? 'ตั้งต้นทุนไม่ครบ'
                    : `${(((summary.netProfit ?? 0) / summary.totalRevenue) * 100).toFixed(1)}%`
              }
            />
          </>
        )}
      </div>

      <div className="card">
        <div className="card-header flex-nowrap gap-2">
          <h5 className="card-title min-w-0 truncate">{weekly ? 'ยอดขายรายสัปดาห์' : 'ยอดขายรายวัน'}</h5>
          <span className="text-default-500 shrink-0 text-xs whitespace-nowrap">{periodLabel}</span>
        </div>
        {/* แถบนี้คือ legend ของกราฟ — จุดสี = สีแท่ง 1:1 พร้อมยอดรวมของช่วง */}
        {/* ไม่มียอดเลย = ไม่มีอะไรให้อธิบาย — ซ่อนแถบ ไม่โชว์ ฿0 ซ้อนเหนือ empty state */}
        {hasAnyValue && (
          <div className="border-default-300 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-dashed px-5 py-2.5">
            {moneyAxis && collect ? (
              /* สมการที่ไล่บวกตามได้ ชุดเดียวกับแถบหัวชีตบนหน้าหลัก — จุดสี = แท่งในกราฟ 1:1
                 "ยอดขาย" ไม่มีจุดเพราะเป็นผลรวมของสองแท่ง ไม่ใช่ซีรีส์ */
              <>
                <LegendItem dot="bg-success" label="รับจริง" value={collect.receivedTotal} />
                <span className="text-default-700 text-xs" aria-hidden="true">+</span>
                <LegendItem dot="bg-warning" label="ค้างรับ" value={collect.outstandingTotal} />
                <span className="text-default-700 text-xs" aria-hidden="true">=</span>
                <LegendItem label="ยอดขาย" value={collect.salesTotal} />
              </>
            ) : (
              <>
                <LegendItem dot={legacyWords ? 'bg-primary' : 'bg-success'} label={confirmedName} value={summary.totalRevenue} />
                <LegendItem dot="bg-warning" label={unconfirmedName} value={summary.totalUnconfirmed} />
                {showFinance && <LegendItem dot="bg-danger" label="ค่าส่ง" value={summary.totalShippingCost ?? 0} />}
              </>
            )}
          </div>
        )}
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
function LegendItem({ dot, label, value }: { dot?: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      {/* ไม่มี dot = ช่องนี้ไม่มีแท่งในกราฟ (ตัวเลขประกอบสมการ) — ใส่จุดให้จะทำให้จุดสีเลิกแปลว่า "แท่งไหน" */}
      {dot && <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />}
      <span className="text-default-700">{label}</span>
      <span className="text-default-800 font-semibold tabular-nums">{formatBaht(value)}</span>
    </span>
  )
}
