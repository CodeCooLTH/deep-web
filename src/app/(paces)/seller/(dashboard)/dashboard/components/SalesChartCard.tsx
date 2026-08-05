'use client'

/**
 * SalesChartCard — การ์ดยอดขายบน command center (มือถือ) จิ้ม → เปิด SalesChartSheet เต็มจอ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 *   (.card shell + hero number + chg indicator arrow-up/arrow-down)
 * Base (chart): theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/FinancialOverview.tsx
 *   (plotOptions.bar + colors array ผ่าน getColor + grid.borderColor) ผ่าน @/components/wrappers/ApexChart (HR10)
 * Base (footer): src/assets/css/custom/_card.css `.card-footer` primitive
 * Base (pill): SalesChartSheet.tsx segmented control (in-app precedent) — เปลี่ยน label + ยก tap target
 *
 * ── v3 2026-08-04: การ์ดพูดเรื่อง "ยอดขาย" อย่างเดียว ไม่หักอะไรทั้งสิ้น ──────────────────────
 * เดิม hero เป็นกำไรสุทธิ ซึ่งทำให้การ์ดใบเดียวมีสองหน้าตา: ร้านที่ผ่าน gate สิทธิ์ค่าใช้จ่ายเห็น
 * ตัวแดง "ขาดทุนสุทธิ" ส่วนร้านที่ไม่ผ่านเห็นคำว่า "ยอดขาย" เฉย ๆ — เราออกแบบให้กลุ่มที่เล็กกว่า
 * แล้วอีกกลุ่มได้ของเหลือ ยิ่งร้านที่เปิดสิทธิ์แต่ยังไม่เคยคีย์ค่าใช้จ่ายเลยยิ่งแย่ (กำไร = ยอดขายเป๊ะ
 * เปลืองพื้นที่ไปกับเลขที่ไม่บอกอะไร) และต้นเดือนทุกร้านจะขึ้นแดงเพราะค่าเช่า/ซื้อของลงเป็นก้อนเดียว
 * ขณะที่ยอดขายทยอยเข้า — ตัวเลขจริงแต่สื่อความหมายผิด
 * พอเหลือยอดขายล้วน ทุกร้านเห็นเหมือนกันหมด ไม่มีเงื่อนไขสิทธิ์ในการ์ดนี้อีกเลย
 * กำไรยังอยู่ครบที่ชีตเต็มจอกับ /expenses — มีปุ่มท้ายการ์ดพาไป
 * (user ตัดสิน 2026-08-04 หลังไล่ดู mockup 6 รอบ)
 */
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import ApexChart from '@/components/wrappers/ApexChart'
import { getColor } from '@/utils/helpers'
import type { ApexOptions } from 'apexcharts'
import { formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
import type { SalesSeries } from '../_constants/command-center'
import SalesChartSheet from './SalesChartSheet'

type Props = {
  /** null/undefined = fetch เดือนนี้ล้มตอน SSR → ซ่อนการ์ดทั้งหมด (honest-hide) */
  initialSeries: SalesSeries | null | undefined
}

/** ช่วงที่การ์ดโชว์ — ตั้งชื่อ Period แยกจาก Mode ('daily'|'monthly') ของชีตโดยตั้งใจ:
 *  ชีต = granularity ที่เลื่อนข้ามเดือน/ปีได้ · การ์ด = snapshot คงที่ 2 อัน เลื่อนไม่ได้ */
type Period = 'today' | 'month'

/** วันที่ปักหมุดบนแกน x — 31 แท่งบนความกว้าง ~300px = แท่งละ ~7px ใส่ครบทุกวันชนกันแน่ */
const AXIS_ANCHOR_DAYS = [1, 8, 15, 22, 29]

export default function SalesChartCard({ initialSeries }: Props) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<Period>('month')

  if (!initialSeries) return null

  const {
    labels, confirmedValues, unconfirmedValues, orderCounts, total,
    prevTotalToDate, futureFromIndex, last7Days, last7Labels,
  } = initialSeries

  const bucketCount = labels.length
  // futureFromIndex = getUTCDate() ของวันนี้ (≥1 เสมอ) เมื่อกำลังดูเดือนปัจจุบัน
  const todayIndex = Math.min(Math.max(futureFromIndex - 1, 0), bucketCount - 1)
  const isToday = period === 'today'

  const todayConfirmed = confirmedValues[todayIndex] ?? 0
  const todayUnconfirmed = unconfirmedValues[todayIndex] ?? 0

  const heroValue = isToday ? todayConfirmed + todayUnconfirmed : total
  const legendConfirmed = isToday ? todayConfirmed : confirmedValues.reduce((s, v) => s + v, 0)
  const legendUnconfirmed = isToday ? todayUnconfirmed : unconfirmedValues.reduce((s, v) => s + v, 0)
  const legendOrderCount = orderCounts.reduce((s, v) => s + v, 0)

  /** ค่าเฉลี่ยของ 7 แท่งที่วาดจริง (รวมวันนี้) — ตัวเลขต้องตรงกับเส้นประบนกราฟเป๊ะ
   *  ถ้าใช้ค่าเฉลี่ย 6 วันก่อนแทน เส้นที่เห็นกับ % ที่อ่านจะเป็นคนละตัว */
  const avg7 = last7Days && last7Days.length === 7
    ? last7Days.reduce((s, v) => s + v, 0) / 7
    : null

  // pctChangeVsPrev คืน null เมื่อฐาน ≤ 0 (หารไม่ได้/อ่านกลับหัว) → ซ่อน badge ทั้งก้อน
  const chgRaw = isToday ? pctChangeVsPrev(heroValue, avg7) : pctChangeVsPrev(total, prevTotalToDate)
  const chg = chgRaw != null ? Math.round(chgRaw) : null
  const compareWord = isToday ? 'จากค่าเฉลี่ย 7 วัน' : 'จากเดือนก่อน'

  /**
   * วันในอนาคตส่งเป็น `null` ไม่ใช่ตัดทิ้ง — ApexCharts ไม่วาดอะไรให้ null แต่ยังนับเป็น category
   * แกน x จึงยาวเท่าจำนวนวันของเดือนเสมอ (user ยืนยัน 2026-08-04 ว่าแสดงทั้งเดือนถูกแล้ว
   * เคย .slice() ตัดทิ้งจริงแล้วพัง: วันที่ 2 เหลือ 2 แท่งยืดเต็มการ์ด อ่านไม่ออกว่าเป็นทั้งเดือน)
   */
  const maskFuture = (arr: number[]) => arr.map((v, i) => (i < futureFromIndex ? v : null))

  // วันนี้ = ป้ายคำ ไม่ใช่เลขวันที่ — คนอ่านหาตัวเองเจอเร็วกว่าไล่นับวันที่
  const todayLabels = last7Labels ? [...last7Labels.slice(0, 6), 'วันนี้'] : []
  const anchorDays = new Set([...AXIS_ANCHOR_DAYS.filter((d) => d <= bucketCount), futureFromIndex])

  /**
   * เส้น = จำนวนคำสั่งซื้อต่อวัน (user สั่ง 2026-08-05)
   *
   * ทีแรกทำเป็น "ยอดรวม" ซึ่งเท่ากับหัวแท่งซ้อนพอดี — เส้นจึงทับหัวแท่งและไม่ได้บอกอะไรใหม่เลย
   * เปลี่ยนเป็นจำนวนใบแทน ทำให้แยกออกได้ว่า "วันที่ยอดสูงเพราะขายหลายใบ" ต่างจาก
   * "วันที่ยอดสูงเพราะใบเดียวก้อนใหญ่" ซึ่งดูจากความสูงแท่งอย่างเดียวไม่มีทางรู้
   *
   * คนละหน่วยกับแท่ง (ใบ vs บาท) จึงต้องมีแกน y ที่สอง — ถ้าใช้แกนเดียวกัน เส้นจะแบนติดพื้น
   * เพราะเลขหลักหน่วยเทียบกับหลักพัน. `stackOnlyBar` กันไม่ให้ ApexCharts เอาเส้นไปซ้อนยอดสะสม
   */
  const monthSeries = [
    { name: 'ยืนยันแล้ว', type: 'column', data: maskFuture(confirmedValues) },
    { name: 'รอยืนยัน', type: 'column', data: maskFuture(unconfirmedValues) },
    { name: 'ออเดอร์', type: 'line', data: maskFuture(orderCounts) },
  ]
  const todaySeries = [{ name: 'ยอดขาย', data: last7Days ?? [] }]

  const axisLabelStyle = { fontSize: '10px', colors: getColor('default-700') }

  const getMonthOptions = (): ApexOptions => ({
    // สูงขึ้นจาก 104 → 168 และแท่งกว้างขึ้นจาก 70% → 92% (user: "ความสูงมันสูงได้อีก
    // bar แต่ละอัน ... กว้างอีกจะได้เด่นขึ้น") — แท่งซ้อนอ่านเป็นก้อนเดียวชัดขึ้นมาก
    chart: {
      type: 'line',
      height: 168,
      stacked: true,
      stackOnlyBar: true, // ไม่ให้ line ถูกซ้อนทับยอดสะสม (ไม่งั้นเส้นไปอยู่ที่ 2 เท่า)
      toolbar: { show: false },
      parentHeightOffset: 0,
    },
    plotOptions: { bar: { columnWidth: '92%', borderRadius: 1 } },
    /** เขียว = ยืนยันแล้ว ให้ตรงกับ OrderStatusBand ที่อยู่ติดกันข้างล่างบนจอเดียวกัน (ทา CONFIRMED
     *  เป็น text-success) — เดิมการ์ดนี้ใช้น้ำเงิน สถานะเดียวกันจึงมีสองสีในจอเดียว */
    colors: [getColor('success'), getColor('warning'), getColor('primary')],
    /**
     * ไม่มีขอบทั้งสองแท่ง (user เคาะ 2026-08-05 หลังดู mockup: "รอยืนยันมีขอบ ยืนยันแล้วไม่มี
     * ทำให้ดูต่างกัน ลองตัดขอบออก")
     *
     * ที่บันทึกไว้ให้คนอ่านทีหลัง: ขอบเดิมมีเพื่อคอนทราสต์ — เหลือง #f9bf59 บนขาวได้ ~1.8:1
     * เขียว #02bc9c ได้ ~2.4:1 ทั้งคู่ต่ำกว่าเกณฑ์กราฟิก 3:1 ถ้าจะแก้ทีหลังให้ปรับ "ความเข้ม
     * ของสีเดิม" ไม่ใช่เติมขอบกลับมาข้างเดียว (docs/conventions/contrast-fix-keeps-hue.md)
     *
     * width ตัวที่ 3 = ความหนาเส้นจำนวนออเดอร์ — 2 ตัวแรกเป็นแท่งซึ่งไม่มีขอบแล้ว
     */
    stroke: { show: true, width: [0, 0, 2], curve: 'straight', colors: ['transparent', 'transparent', getColor('primary')] },
    markers: { size: 2, strokeWidth: 0, colors: [getColor('primary')] },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: labels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        // user สั่งให้แสดงวันที่ครบทุกแท่ง (2026-08-05) — 31 label บนความกว้าง ~330px ทับกันแน่
        // ถ้าวางแนวนอน จึงหมุน -60° + ลดเหลือ 9px และปิด hideOverlappingLabels ไม่ให้ ApexCharts
        // ตัดทิ้งเองแบบเดาไม่ได้ว่าจะเหลือวันไหน
        style: { ...axisLabelStyle, fontSize: '9px' },
        rotate: -60,
        rotateAlways: true,
        hideOverlappingLabels: false,
        trim: false,
      },
    },
    /**
     * ไม่โชว์ตัวเลขแกน y — กินความกว้าง ~30px จาก 31 แท่งที่แคบอยู่แล้ว เส้นสเกลอย่างเดียวพอ
     * แกนที่ 3 เป็นของเส้นจำนวนออเดอร์ (หน่วย "ใบ") แยก scale จากแท่ง (หน่วยบาท)
     * 2 ตัวแรกผูก seriesName เดียวกันเพื่อให้แท่งซ้อนใช้สเกลร่วมกัน
     */
    yaxis: [
      { show: false, tickAmount: 2, seriesName: 'ยืนยันแล้ว' },
      { show: false, tickAmount: 2, seriesName: 'ยืนยันแล้ว' },
      { show: false, opposite: true, seriesName: 'ออเดอร์', min: 0 },
    ],
    grid: {
      show: true,
      borderColor: getColor('chart-border-color'),
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    // tooltip ปิด — การ์ดทั้งโซนเป็นปุ่มเปิดชีต การมี tooltip แย่งการแตะบนมือถือ (ตัวเลขเป๊ะอยู่ในชีต)
    tooltip: { enabled: false },
  })

  const getTodayOptions = (): ApexOptions => ({
    chart: { type: 'bar', height: 104, toolbar: { show: false }, parentHeightOffset: 0 },
    // distributed = ระบายสีรายแท่ง (ซีรีส์เดียว) เพื่อเน้นวันนี้ให้เข้มกว่าอีก 6 วัน
    plotOptions: { bar: { columnWidth: '58%', borderRadius: 2, distributed: true } },
    colors: [...Array(6).fill(getColor('success', 0.28)), getColor('success')],
    stroke: { show: false },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: todayLabels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: axisLabelStyle },
    },
    yaxis: { show: false },
    grid: {
      show: true,
      borderColor: getColor('chart-border-color'),
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: false } },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    /** เส้นค่าเฉลี่ย = "เส้นที่ควรทำให้ถึง" — คำตอบของคำถามที่ผู้ขายถามจริงว่าวันนี้ดีกว่าปกติไหม
     *  ซึ่งกราฟทั้งเดือนตอบไม่ได้ (ไม่มีเส้นอ้างอิงให้เทียบ) */
    annotations: avg7 != null && avg7 > 0
      ? {
          yaxis: [{
            y: avg7,
            borderColor: getColor('warning-ink'),
            strokeDashArray: 4,
            /** ป้ายอยู่ซ้ายและลอยเหนือเส้น — เดิมชิดขวาแล้วไปทับแท่ง "วันนี้" ซึ่งเป็นแท่งที่ตั้งใจ
             *  ให้เด่นที่สุด (สีเข้มกว่าอีก 6 แท่ง) พบตอนดูของจริงบน prod 2026-08-04 */
            label: {
              text: `เฉลี่ย ${formatNumberNoSymbol(Math.round(avg7))}`,
              position: 'left',
              textAnchor: 'start',
              offsetY: -6,
              borderWidth: 0,
              style: { background: 'transparent', color: getColor('warning-ink'), fontSize: '10px' },
            },
          }],
        }
      : undefined,
    tooltip: { enabled: false },
  })

  const pillClass = (on: boolean) =>
    `min-h-11 rounded-md px-3 text-xs font-medium transition-colors ${
      on ? 'bg-card text-primary shadow' : 'text-default-700'
    }`

  return (
    <>
      {/* การ์ดทั้งใบเคยเป็น <button> ก้อนเดียว — ใส่ pill กับปุ่มกำไรขาดทุนเข้าไปข้างในไม่ได้
          (nested interactive element ผิด HTML + แตะ pill แล้ว event bubble ไปเปิดชีต)
          จึงแยกเป็น 3 โซน sibling: header+pill / โซนที่กดเปิดชีต / ปุ่มท้ายการ์ด */}
      <div className="card">
        {/* !p-4: ลดจาก p-5 ตาม feedback "section ห่างกันเกินไป และใหญ่เกินไป" (2026-08-04)
            per-instance override ตาม pattern เดิมของโปรเจกต์ (AuctionStatStrip/OrderCard/CustomerSelectBlock)
            ไม่แตะ `.card-body` กลางใน _card.css ที่หน้าอื่นทั้งระบบใช้อยู่ */}
        <div className="card-body !p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Icon icon="chart-bar" className="size-4 text-primary" />
              <span className="text-sm font-bold text-dark">ยอดขาย</span>
            </div>
            {/* segmented — Base: SalesChartSheet.tsx (in-app precedent) แต่คนละความหมาย จึงคนละคำ:
                ของชีตคือ granularity ที่เลื่อนข้ามเดือน/ปีได้ ของที่นี่คือ snapshot คงที่ 2 อัน */}
            <div role="group" aria-label="ช่วงเวลา" className="flex items-center gap-0.5 rounded-lg bg-default-100 p-0.5">
              <button type="button" onClick={() => setPeriod('today')} aria-pressed={isToday} className={pillClass(isToday)}>
                วันนี้
              </button>
              <button type="button" onClick={() => setPeriod('month')} aria-pressed={!isToday} className={pillClass(!isToday)}>
                เดือนนี้
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block w-full text-start"
            aria-label={`ยอดขาย${isToday ? 'วันนี้' : 'เดือนนี้'} ${formatNumberNoSymbol(heroValue)} บาท กดเพื่อดูรายงานฉบับเต็ม`}
          >
            <div className="flex items-center justify-between gap-2">
              {/* ไม่มี ฿ และไม่มีคำนำหน้า — user สั่งตรง ๆ ("ไม่ต้อง ฿ มาก็ได้ เพราะเราขายคนไทย",
                  "แค่ตัวเลขก็เพียงพอ") ตัวเลขนี้ติดลบไม่ได้อยู่แล้วเพราะนับเฉพาะออเดอร์ที่ไม่ถูกยกเลิก */}
              {/* ramp "Metric" ของ DESIGN.md (ตัวเลขที่ทำหน้าที่เป็นภาพ ไม่ใช่ข้อความ): 800 + tabular-nums
                  + letter-spacing ติดลบ — user บอกว่าเดิม (text-3xl/700) ยังไม่เด่นพอ */}
              <p className="text-4xl font-extrabold tracking-tight tabular-nums text-dark">
                {formatNumberNoSymbol(heroValue)}
              </p>
              <Icon icon="chevron-right" className="size-4 shrink-0 text-default-500" aria-hidden="true" />
            </div>

            {/* min-h กันการ์ดกระเด้งตอนสลับ pill แล้วฐานเทียบหาย (chg = null) */}
            <div className="min-h-5 -mt-0.5">
              {chg != null && (
                <span
                  className={`inline-flex items-center gap-0.5 text-sm font-semibold ${
                    chg > 0 ? 'text-success-ink' : chg < 0 ? 'text-danger-ink' : 'text-default-700'
                  }`}
                >
                  {chg !== 0 && (
                    <Icon icon={chg > 0 ? 'arrow-up' : 'arrow-down'} className="size-3.5" aria-hidden="true" />
                  )}
                  {Math.abs(chg)}% <span className="font-normal text-default-700">{compareWord}</span>
                </span>
              )}
            </div>

            {/* แถวนี้ทำสองหน้าที่: บอกว่าเงินก้อนไหนยังไม่ชัวร์ + เป็น legend ของสีในกราฟ (จุดสี 1:1)
                เดิมกราฟมี 2-3 สีโดยไม่มีคำอธิบายเลยบนการ์ด ต้องเปิดชีตถึงจะรู้ว่าสีไหนคืออะไร */}
            <div className="mb-2 flex items-center gap-4 text-xs text-default-700">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
                ยืนยันแล้ว <b className="font-semibold text-default-800">{formatNumberNoSymbol(legendConfirmed)}</b>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                รอยืนยัน <b className="font-semibold text-default-800">{formatNumberNoSymbol(legendUnconfirmed)}</b>
              </span>
              {/* legend ของเส้น — ใช้ขีดไม่ใช่จุดกลม เพราะบนกราฟมันเป็นเส้น ไม่ใช่แท่ง
                  โชว์เฉพาะโหมดเดือนที่มีเส้นจริง (โหมดวันนี้เป็นกราฟ 7 วันไม่มีเส้น) */}
              {!isToday && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="bg-primary h-0.5 w-3 shrink-0" aria-hidden="true" />
                  ออเดอร์ <b className="font-semibold text-default-800">{legendOrderCount}</b>
                </span>
              )}
            </div>

            {isToday && last7Days ? (
              <ApexChart key="today" getOptions={getTodayOptions} series={todaySeries} type="bar" height={104} />
            ) : (
              <ApexChart key="month" getOptions={getMonthOptions} series={monthSeries} type="bar" height={104} />
            )}
          </button>
        </div>

        {/* เดิมมีปุ่ม "กำไรขาดทุน" ท้ายการ์ดพาไป /expenses — ตัดออกตามที่ user สั่ง (2026-08-05)
            ยังเข้าถึงได้จากเมนูซ้าย 2 ทาง: "ภาพรวมกำไร/ขาดทุน" และ "ค่าใช้จ่าย"
            (seller-menu.ts:84 slug seller:expenses) จึงไม่มีทางเข้าไหนหายไปจากการตัดนี้ */}
      </div>

      {open && <SalesChartSheet initialSeries={initialSeries} onClose={() => setOpen(false)} />}
    </>
  )
}
