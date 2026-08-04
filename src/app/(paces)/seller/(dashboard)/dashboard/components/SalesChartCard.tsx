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
import Link from 'next/link'
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
    labels, confirmedValues, unconfirmedValues, total,
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

  const monthSeries = [
    { name: 'ยืนยันแล้ว', data: maskFuture(confirmedValues) },
    { name: 'รอยืนยัน', data: maskFuture(unconfirmedValues) },
  ]
  const todaySeries = [{ name: 'ยอดขาย', data: last7Days ?? [] }]

  const axisLabelStyle = { fontSize: '10px', colors: getColor('default-700') }

  const getMonthOptions = (): ApexOptions => ({
    chart: { type: 'bar', height: 104, stacked: true, toolbar: { show: false }, parentHeightOffset: 0 },
    plotOptions: { bar: { columnWidth: '70%', borderRadius: 1 } },
    /** เขียว = ยืนยันแล้ว ให้ตรงกับ OrderStatusBand ที่อยู่ติดกันข้างล่างบนจอเดียวกัน (ทา CONFIRMED
     *  เป็น text-success) — เดิมการ์ดนี้ใช้น้ำเงิน สถานะเดียวกันจึงมีสองสีในจอเดียว */
    colors: [getColor('success'), getColor('warning')],
    /** เหลือง #f9bf59 บนพื้นขาวได้คอนทราสต์ ~1.8:1 ต่ำกว่าเกณฑ์กราฟิก 3:1 แท่งจึงกลืนพื้น
     *  แก้ด้วยขอบเข้มขึ้น "ในตระกูลสีเดิม" (warning-ink) ไม่ใช่สลับเฉด — docs/conventions/contrast-fix-keeps-hue.md */
    stroke: { show: true, width: [0, 1], colors: ['transparent', getColor('warning-ink')] },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: labels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: axisLabelStyle,
        // โชว์เฉพาะวันปักหมุด + วันนี้ — ที่เหลือคืนสตริงว่าง (ApexCharts ไม่มีทางจัด 31 label ไม่ให้ทับ
        // บนแท่งกว้าง ~7px; hideOverlappingLabels ตัดแบบเดาไม่ได้ว่าจะเหลือวันไหน)
        formatter: (val: string) => (anchorDays.has(Number(val)) ? val : ''),
      },
    },
    // ไม่โชว์ตัวเลขแกน y — กินความกว้าง ~30px จาก 31 แท่งที่แคบอยู่แล้ว เส้นสเกลอย่างเดียวพอให้เทียบสูงต่ำ
    yaxis: { show: false, tickAmount: 2 },
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
              <p className="text-3xl font-bold tabular-nums text-dark">{formatNumberNoSymbol(heroValue)}</p>
              <Icon icon="chevron-right" className="size-4 shrink-0 text-default-500" aria-hidden="true" />
            </div>

            {/* min-h กันการ์ดกระเด้งตอนสลับ pill แล้วฐานเทียบหาย (chg = null) */}
            <div className="min-h-5">
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
            <div className="mt-1 mb-1.5 flex items-center gap-4 text-xs text-default-700">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
                ยืนยันแล้ว <b className="font-semibold text-default-800">{formatNumberNoSymbol(legendConfirmed)}</b>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="ring-warning-ink size-2 shrink-0 rounded-full bg-warning ring-1" aria-hidden="true" />
                รอยืนยัน <b className="font-semibold text-default-800">{formatNumberNoSymbol(legendUnconfirmed)}</b>
              </span>
            </div>

            {isToday && last7Days ? (
              <ApexChart key="today" getOptions={getTodayOptions} series={todaySeries} type="bar" height={104} />
            ) : (
              <ApexChart key="month" getOptions={getMonthOptions} series={monthSeries} type="bar" height={104} />
            )}
          </button>
        </div>

        {/* กำไร/ค่าใช้จ่ายย้ายออกจากการ์ดไปอยู่ /expenses ทั้งหมด — ปุ่มนี้คือทางเข้าเดียว
            ลิงก์ตรงเสมอไม่มีเงื่อนไข: /expenses มี state รองรับครบแล้ว (ExpenseLockedCard เมื่อ
            แพ็กเกจล็อก/พนักงานไม่มีสิทธิ์ + หน้า "ยังไม่มีร้านค้า") ไม่ต้องแตกเงื่อนไขซ้ำที่นี่ */}
        <Link href="/expenses" className="card-footer !py-3 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-default-800">
            <Icon icon="report-money" className="size-4 text-default-700" />
            กำไรขาดทุน
          </span>
          <Icon icon="chevron-right" className="size-4 text-default-700" aria-hidden="true" />
        </Link>
      </div>

      {open && <SalesChartSheet initialSeries={initialSeries} onClose={() => setOpen(false)} />}
    </>
  )
}
