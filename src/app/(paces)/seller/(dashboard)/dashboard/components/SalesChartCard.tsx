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
// กติกาป้ายวันบนแกน x อยู่ในไฟล์กลาง — ชีตเต็มจอใช้ชุดเดียวกัน (ย้ายออกมาเพราะไฟล์นี้ import ชีต
// อยู่แล้ว ถ้าชีตย้อนมา import จากที่นี่จะเป็น circular import)
import { axisAnchorDays } from './sales-chart-axis'
import SalesChartSheet from './SalesChartSheet'

type Props = {
  /** null/undefined = fetch เดือนนี้ล้มตอน SSR → ซ่อนการ์ดทั้งหมด (honest-hide) */
  initialSeries: SalesSeries | null | undefined
  /** ชื่อของสิ่งที่นับเป็น "ใบ" ผันตาม vertical (ORDER_VOCAB.noun) — default = ชุด ONLINE_SALES */
  orderNoun?: string
}

/** ช่วงที่การ์ดโชว์ — ตั้งชื่อ Period แยกจาก Mode ('daily'|'monthly') ของชีตโดยตั้งใจ:
 *  ชีต = granularity ที่เลื่อนข้ามเดือน/ปีได้ · การ์ด = snapshot คงที่ 2 อัน เลื่อนไม่ได้ */
type Period = 'today' | 'month'

/** ความยาวหน้าต่างของแท็บ "วันนี้" — ต้องตรงกับ RECENT_DAYS ใน dashboard.service.ts */
const RECENT_DAYS = 14

/**
 * ตำแหน่งที่โชว์ป้ายวันบนกราฟ 14 วัน — แท่งครบ 14 แต่ป้ายเหลือ 5 จุด
 *
 * 14 ช่องบนการ์ด ~330px = ช่องละ ~23px ส่วนเลข 2 หลักที่ 10px กว้าง ~13px ใส่ครบก็พอได้
 * แต่ตัวแรกมีชื่อเดือนติดมาด้วย ("24 ก.ค." ~40px) จะไปเบียดตัวที่สอง — เว้นระยะ 3-4 ช่อง
 * ทั้งแถวจึงอ่านง่ายกว่า และ index 13 ต้องอยู่ในชุดเสมอเพราะเป็นป้าย "วันนี้"
 */
const TODAY_AXIS_ANCHOR_INDEXES = [0, 4, 7, 10, RECENT_DAYS - 1]

export default function SalesChartCard({ initialSeries, orderNoun = 'คำสั่งซื้อ' }: Props) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<Period>('month')

  if (!initialSeries) return null

  const {
    labels, confirmedValues, unconfirmedValues, orderCounts, total,
    prevTotalToDate, futureFromIndex, last14Confirmed, last14Unconfirmed, last14Labels,
  } = initialSeries

  /** ยอดรวมรายวันของหน้าต่าง 14 วัน (ซ้อน 2 ก้อน) — ใช้คิดค่าเฉลี่ยและเช็คว่ามีข้อมูลพอวาดไหม */
  const last14Totals =
    last14Confirmed && last14Unconfirmed && last14Confirmed.length === RECENT_DAYS
      ? last14Confirmed.map((v, i) => v + (last14Unconfirmed[i] ?? 0))
      : null

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
  const todayOrderCount = orderCounts[todayIndex] ?? 0

  /** ค่าเฉลี่ยของ 14 แท่งที่วาดจริง (รวมวันนี้) — ตัวเลขต้องตรงกับเส้นประบนกราฟเป๊ะ
   *  ถ้าใช้ค่าเฉลี่ย 13 วันก่อนแทน เส้นที่เห็นกับ % ที่อ่านจะเป็นคนละตัว
   *  เฉลี่ยจาก "ยอดรวมรายวัน" (ยืนยันแล้ว+รอยืนยัน) ให้เทียบกับ heroValue ซึ่งก็รวมทั้งสองก้อน */
  const avgRecent = last14Totals
    ? last14Totals.reduce((s, v) => s + v, 0) / RECENT_DAYS
    : null

  // pctChangeVsPrev คืน null เมื่อฐาน ≤ 0 (หารไม่ได้/อ่านกลับหัว) → ซ่อน badge ทั้งก้อน
  const chgRaw = isToday ? pctChangeVsPrev(heroValue, avgRecent) : pctChangeVsPrev(total, prevTotalToDate)
  const chg = chgRaw != null ? Math.round(chgRaw) : null
  const compareWord = isToday ? `จากค่าเฉลี่ย ${RECENT_DAYS} วัน` : 'จากเดือนก่อน'

  /**
   * วันในอนาคตส่งเป็น `null` ไม่ใช่ตัดทิ้ง — ApexCharts ไม่วาดอะไรให้ null แต่ยังนับเป็น category
   * แกน x จึงยาวเท่าจำนวนวันของเดือนเสมอ (user ยืนยัน 2026-08-04 ว่าแสดงทั้งเดือนถูกแล้ว
   * เคย .slice() ตัดทิ้งจริงแล้วพัง: วันที่ 2 เหลือ 2 แท่งยืดเต็มการ์ด อ่านไม่ออกว่าเป็นทั้งเดือน)
   */
  const maskFuture = (arr: number[]) => arr.map((v, i) => (i < futureFromIndex ? v : null))

  // วันนี้ = ป้ายคำ ไม่ใช่เลขวันที่ — คนอ่านหาตัวเองเจอเร็วกว่าไล่นับวันที่
  const todayLabels = last14Labels ? [...last14Labels.slice(0, RECENT_DAYS - 1), 'วันนี้'] : []
  /** ป้ายที่จะโชว์จริง — เทียบด้วย "ค่าของ label" ไม่ใช่ index เพราะ formatter ของ ApexCharts
   *  ได้ค่า category มา ไม่ได้ index ที่เชื่อถือได้ (ชุดเดียวกับที่โหมดเดือนใช้อยู่)
   *  14 วันติดกันบวก 'วันนี้' ไม่มีทางซ้ำค่ากัน จึงใช้ค่าเป็นกุญแจได้ปลอดภัย */
  const todayAnchorLabels = new Set(
    TODAY_AXIS_ANCHOR_INDEXES.map((i) => todayLabels[i]).filter(Boolean),
  )
  const anchorDays = axisAnchorDays(bucketCount, futureFromIndex)

  /**
   * วันนี้อยู่วันที่เท่าไร — ใช้ปักเส้นคั่น "วันนี้" บนกราฟ
   *
   * `futureFromIndex === bucketCount` = เดือนนั้นจบไปแล้ว (service คืนค่านี้เมื่อไม่ใช่เดือนปัจจุบัน
   * หรือเมื่อวันนี้เป็นวันสุดท้ายของเดือน) → ไม่ปักเส้น เพราะไม่มีช่องว่างฝั่งขวาให้ต้องอธิบาย
   * และวันสุดท้ายมีป้ายท้ายเดือนยืนอยู่แล้ว
   */
  const todayDay = futureFromIndex < bucketCount ? futureFromIndex : null

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
    // ชื่อซีรีส์นี้ถูกอ้างซ้ำที่ yaxis[2].seriesName — ต้องมาจากตัวแปรเดียวกัน ไม่งั้นร้านที่ผันคำ
    // แล้วสองที่ไม่ตรงกัน ApexCharts จะผูกเส้นเข้าแกนผิด (เส้นแบนติดพื้น) โดยไม่มี error
    { name: orderNoun, type: 'line', data: maskFuture(orderCounts) },
  ]
  /** ซ้อน 2 ก้อนเหมือนกราฟเดือนเป๊ะ — ชื่อ/ลำดับ/สีต้องตรงกัน ไม่งั้นสลับแท็บแล้วสีเดียวกัน
   *  หมายถึงคนละสถานะ (แถว legend ใต้เลขฮีโร่เป็นตัวเดียวกันทั้งสองโหมด ไม่ได้เปลี่ยนตามแท็บ) */
  const todaySeries = [
    { name: 'ยืนยันแล้ว', data: last14Confirmed ?? [] },
    { name: 'รอยืนยัน', data: last14Unconfirmed ?? [] },
  ]

  const axisLabelStyle = { fontSize: '10px', colors: getColor('default-700') }

  const maxOrderCount = orderCounts.reduce((m, v) => Math.max(m, v), 0)

  /** ระยะยกป้ายชั้นที่สอง (px) — 11px = สูงกว่ากล่องข้อความ 10px หนึ่งขั้น สองชั้นจึงไม่แตะกัน */
  const LABEL_TIER_STEP = 11

  /**
   * ป้ายจำนวนคำสั่งซื้อบนเส้น — ติดครบ "ทุกวันที่ขายได้" ไม่เว้นวันแล้ว (user สั่ง 2026-08-07)
   *
   * รอบก่อน (2026-08-06) เว้นระยะขั้นต่ำ 2 ช่องเพราะ 31 ช่องบนการ์ด ~330px = ช่องละ ~10.6px
   * ส่วนเลข 2 หลักที่ 10px กว้าง ~11px ป้ายของสองวันติดกันจึงเบียดกัน และ ApexCharts ไม่ซ่อน
   * ป้ายที่ทับกันเองให้ (ต่างจากป้ายแกน x ที่มี hideOverlappingLabels) — แต่ผลข้างเคียงคือวันที่
   * ขายได้จริงบางวันไม่มีตัวเลขเลย ซึ่งอ่านกำกวมว่า "วันนั้นไม่มีออเดอร์" ทั้งที่แท่งตั้งอยู่ตำตา
   *
   * เปลี่ยนวิธีกันชน: ไม่ตัดป้ายทิ้งแล้ว แต่แยก "ระดับความสูง" แทน — วันที่ติดกันสลับสองชั้น
   * (ชั้น 0 ชิดจุด / ชั้น 1 ยกขึ้นอีก LABEL_TIER_STEP) คนละแนวนอนก็ไม่ทับกันแม้กล่องกว้างเกินช่อง
   * เว้นช่วง ≥2 วันเมื่อไหร่รีเซ็ตกลับชั้น 0 — เดือนที่ขายห่าง ๆ ป้ายจึงยังเรียงเป็นแนวเดียว
   * ไม่กระโดดขึ้นลงโดยไม่จำเป็น
   *
   * ทั้งสองชั้นอยู่ "เหนือจุด" เสมอ ไม่ห้อยลงข้างล่าง: ใต้จุดคือแท่งเขียว/เหลือง เลขสี primary
   * บนนั้นทั้งคอนทราสต์ไม่ผ่านและอ่านสับสนว่าเป็นป้ายของแท่ง ไม่ใช่ของเส้น
   *
   * ข้อเดิมที่ยังอยู่: ติดเฉพาะวันที่มีออเดอร์จริง — 0 ใบไม่มีอะไรต้องบอก และเลข 0 เรียงพรืด
   * ตามแนวพื้นจะกลบจุดที่มีของ (user ยืนยัน 2026-08-07 ว่าไม่เอาเลข 0)
   */
  const orderCountLabels = (() => {
    const out: { index: number; tier: 0 | 1 }[] = []
    let prevIndex = -Infinity
    let tier: 0 | 1 = 0
    orderCounts.forEach((v, i) => {
      if (v <= 0 || i >= futureFromIndex) return
      tier = i - prevIndex === 1 ? ((1 - tier) as 0 | 1) : 0
      out.push({ index: i, tier })
      prevIndex = i
    })
    return out
  })()
  const hasStaggeredLabel = orderCountLabels.some((p) => p.tier === 1)

  const getMonthOptions = (): ApexOptions => ({
    // สูงขึ้นจาก 104 → 168 และแท่งกว้างขึ้นจาก 70% → 92% (user: "ความสูงมันสูงได้อีก
    // bar แต่ละอัน ... กว้างอีกจะได้เด่นขึ้น") — แท่งซ้อนอ่านเป็นก้อนเดียวชัดขึ้นมาก
    chart: {
      type: 'line',
      height: 168,
      stacked: true,
      stackOnlyBar: true, // ไม่ให้ line ถูกซ้อนทับยอดสะสม (ไม่งั้นเส้นไปอยู่ที่ 2 เท่า)
      toolbar: { show: false },
      /** ปิด drag-to-zoom — toolbar:false ซ่อนแค่ปุ่ม ไม่ได้ปิดพฤติกรรมลาก: จิ้มลากบนมือถือ
       *  แล้วเกิดกล่อง selection ฟ้าค้างบนกราฟ (user รายงาน 2026-08-05) กราฟนี้เป็น snapshot
       *  อ่านอย่างเดียว ไม่มี use case ซูม · selection:false เป็นกันเหนียว (ตัวแก้จริงคือ zoom) */
      zoom: { enabled: false },
      selection: { enabled: false },
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
     * ที่บันทึกไว้ให้คนอ่านทีหลัง: ขอบเดิมมีเพื่อคอนทราสต์ — token `warning` บนขาวได้ ~1.8:1
     * `success` ได้ ~2.4:1 ทั้งคู่ต่ำกว่าเกณฑ์กราฟิก 3:1 ถ้าจะแก้ทีหลังให้ปรับ "ความเข้ม
     * ของสีเดิม" ไม่ใช่เติมขอบกลับมาข้างเดียว (docs/conventions/contrast-fix-keeps-hue.md)
     *
     * width ตัวที่ 3 = ความหนาเส้นจำนวนออเดอร์ — 2 ตัวแรกเป็นแท่งซึ่งไม่มีขอบแล้ว
     */
    stroke: { show: true, width: [0, 0, 2], curve: 'straight', colors: ['transparent', 'transparent', getColor('primary')] },
    markers: { size: 2, strokeWidth: 0, colors: [getColor('primary')] },
    /**
     * ป้ายจำนวนใบย้ายไปเป็น point annotation แล้ว (ดู annotations.points ข้างล่าง) — dataLabels
     * ปิดทั้งกราฟ เพราะ `dataLabels.offsetY` ของ ApexCharts เป็นค่าเดียวทั้งกราฟ
     * (`DataLabels.js:136` — `y = pos.y[q] + dataLabelsConfig.offsetY` อ่านจาก config ตรง ๆ
     * ไม่มีรูปแบบต่อจุดหรือต่อซีรีส์) จึงทำป้ายสองชั้นไม่ได้ ส่วน point annotation
     * มี `label.offsetY` แยกรายจุด ซึ่งเป็นสิ่งเดียวที่กติกาสลับชั้นต้องการ
     */
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: labels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        /**
         * ป้ายวันแนวนอน โชว์เฉพาะหมุด (ดู axisAnchorDays) — แท่งยังครบทุกวัน
         *
         * รอบก่อนโชว์ครบ 31 ตัวโดยหมุน -60° ที่ 9px แล้ว user อ่านไม่ออก ("มันดูยากมาก")
         * ปิด hideOverlappingLabels ไว้เหมือนเดิม เพื่อไม่ให้ ApexCharts ตัดป้ายเองแบบเดาไม่ได้ว่า
         * จะเหลือวันไหน — เราคุมเองหมดผ่าน formatter แล้ว
         */
        style: axisLabelStyle,
        rotate: 0,
        rotateAlways: false,
        hideOverlappingLabels: false,
        trim: false,
        formatter: (v: string) => (anchorDays.has(Number(v)) ? String(v) : ''),
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
      /** max เผื่อหัว 30% ตั้งแต่มีป้ายตัวเลขบนจุด (2026-08-06): ป้ายอยู่ "เหนือ" จุด ถ้าจุดสูงสุด
       *  แตะเพดานกราฟพอดี ป้ายของวันที่ขายดีที่สุด — ใบที่คนอยากอ่านที่สุด — จะถูกขอบบนตัดหาย
       *  เผื่อเป็น 45% เมื่อเดือนนั้นมีป้ายชั้นที่สอง (2026-08-07): ป้ายชั้นบนสูงกว่าอีก 11px
       *  ซึ่งกินพื้นที่หัวกราฟจนเกือบหมดถ้ายังเผื่อแค่ 30% */
      {
        show: false,
        opposite: true,
        seriesName: orderNoun,
        min: 0,
        max: maxOrderCount > 0 ? Math.ceil(maxOrderCount * (hasStaggeredLabel ? 1.45 : 1.3)) : undefined,
      },
    ],
    grid: {
      show: true,
      borderColor: getColor('chart-border-color'),
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    /**
     * เส้นประคั่นตรงวันนี้ (user เลือก 2026-08-05 จาก mockup ตัวเลือก ค.)
     *
     * ต้นเดือนข้อมูลกินแค่ไม่กี่วันจาก 31 ที่เหลือว่างทั้งแถบ — เส้นนี้เปลี่ยนความหมายของที่ว่าง
     * จาก "ขายไม่ได้" เป็น "ยังมาไม่ถึง" โดยไม่ต้องตัดวันในอนาคตทิ้ง (ซึ่ง user เคาะไว้แล้วว่าไม่เอา:
     * เคย .slice() จริงแล้วพัง วันที่ 2 เหลือ 2 แท่งยืดเต็มการ์ด อ่านไม่ออกว่าเป็นทั้งเดือน)
     */
    annotations: {
      xaxis: todayDay
        ? [{
            x: String(todayDay),
            borderColor: getColor('default-400'),
            strokeDashArray: 3,
            label: {
              text: 'วันนี้',
              position: 'top',
              orientation: 'horizontal',
              offsetY: -4,
              borderWidth: 0,
              style: { background: 'transparent', color: getColor('default-700'), fontSize: '10px' },
            },
          }]
        : [],
      /**
       * ตัวเลขจำนวนใบเหนือจุดบนเส้น (แทน dataLabels — ดูเหตุผลที่ `dataLabels` ข้างบน)
       *
       * yAxisIndex 2 = แกนของซีรีส์ "คำสั่งซื้อ" ต้องระบุให้ตรง ไม่งั้น annotation ไปคิดตำแหน่ง
       * จากสเกลของแท่ง (หน่วยบาท) แล้วเลขจะไปกองอยู่ก้นกราฟทั้งแถว
       * marker size/strokeWidth = 0 เพราะจุดจริงวาดโดย `markers` ของซีรีส์อยู่แล้ว
       * (ปล่อย strokeWidth ไว้ตามค่าตั้งต้น 2 จะได้จุดซ้อนอีกจุดทั้งที่ size 0)
       * padding 0 รอบทุกด้าน: ค่าตั้งต้นของ ApexCharts มี padding ซ้าย/ขวา 5px ซึ่งกินความกว้าง
       * กล่องเกินตัวเลขไปเกือบเท่าตัว — บนช่องละ 10.6px ป้ายจะชนกันตั้งแต่ยังไม่ทันสลับชั้น
       */
      points: orderCountLabels.map(({ index, tier }) => ({
        x: labels[index],
        y: orderCounts[index],
        yAxisIndex: 2,
        marker: { size: 0, strokeWidth: 0 },
        label: {
          text: String(orderCounts[index]),
          textAnchor: 'middle',
          offsetY: -2 - tier * LABEL_TIER_STEP,
          borderWidth: 0,
          // 10px = ขั้นเดียวกับป้ายแกน x/ป้าย "วันนี้" ของกราฟนี้ (ไม่สร้างขั้นใหม่นอก DESIGN.md)
          // สีเดียวกับเส้น (primary) เพื่อให้อ่านออกว่าเลขนี้เป็นของเส้น ไม่ใช่ของแท่งที่อยู่ใต้มัน
          style: {
            background: 'transparent',
            color: getColor('primary'),
            fontSize: '10px',
            fontWeight: 600,
            padding: { left: 0, right: 0, top: 0, bottom: 0 },
          },
        },
      })),
    },
    // tooltip ปิด — การ์ดทั้งโซนเป็นปุ่มเปิดชีต การมี tooltip แย่งการแตะบนมือถือ (ตัวเลขเป๊ะอยู่ในชีต)
    tooltip: { enabled: false },
  })

  const getTodayOptions = (): ApexOptions => ({
    /** สูง 168 เท่าโหมดเดือนเป๊ะ ๆ — user สั่ง 2026-08-05 ("ความสูง card มันขยับ อยากให้เท่ากับเดือนนี้เสมอ")
     *  เดิม 104 การ์ดจึงเตี้ยลง 64px ตอนกดแท็บ "วันนี้" แล้วเนื้อหาใต้การ์ดกระโดดตาม */
    // zoom/selection ปิดด้วยเหตุผลเดียวกับโหมดเดือน (ดูคอมเมนต์ใน getMonthOptions)
    chart: { type: 'bar', height: 168, stacked: true, toolbar: { show: false }, zoom: { enabled: false }, selection: { enabled: false }, parentHeightOffset: 0 },
    /** columnWidth 58% → 76%: แท่งเพิ่มจาก 7 เป็น 14 ช่องละ ~23px ถ้าคง 58% จะได้แท่งกว้าง ~13px
     *  ซึ่งบางเกินกว่าจะเห็นรอยต่อของสองสีที่ซ้อนกัน (จุดประสงค์ทั้งหมดของรอบนี้) */
    plotOptions: { bar: { columnWidth: '76%', borderRadius: 1 } },
    /** เลิกใช้ distributed แล้ว — มันระบายสี "รายแท่งของซีรีส์เดียว" ซึ่งใช้ร่วมกับแท่งซ้อน
     *  2 ซีรีส์ไม่ได้ (สีจะไปตามลำดับแท่ง ไม่ใช่ตามสถานะ) ผลข้างเคียงที่ยอมรับ: แท่ง "วันนี้"
     *  ไม่ได้เข้มกว่าเพื่อนอีกต่อไป — ป้าย "วันนี้" ใต้แกน x ยังชี้ตำแหน่งอยู่
     *  สีชุดเดียวกับกราฟเดือน: เขียว = ยืนยันแล้ว, เหลือง = รอยืนยัน */
    colors: [getColor('success'), getColor('warning')],
    stroke: { show: false },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: todayLabels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: axisLabelStyle,
        rotate: 0,
        rotateAlways: false,
        hideOverlappingLabels: false,
        trim: false,
        formatter: (v: string) => (todayAnchorLabels.has(v) ? v : ''),
      },
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
    annotations: avgRecent != null && avgRecent > 0
      ? {
          yaxis: [{
            y: avgRecent,
            borderColor: getColor('warning-ink'),
            strokeDashArray: 4,
            /** ป้ายอยู่ซ้ายและลอยเหนือเส้น — เดิมชิดขวาแล้วไปทับแท่ง "วันนี้" ซึ่งเป็นแท่งที่ตั้งใจ
             *  ให้เด่นที่สุด (สีเข้มกว่าอีก 6 แท่ง) พบตอนดูของจริงบน prod 2026-08-04 */
            label: {
              text: `เฉลี่ย ${formatNumberNoSymbol(Math.round(avgRecent))}`,
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

          {/* aria-label ทับเนื้อหาในปุ่มทั้งก้อน — ต้องพูดแทนแถว legend ให้ครบ (คำสั่งซื้อ/ยืนยันแล้ว/รอยืนยัน)
              ไม่งั้น screen reader ไม่มีทางรู้ว่าเงินก้อนไหนยังไม่ชัวร์ ทั้งที่นั่นคือหน้าที่หลักของแถวนั้น */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block w-full text-start"
            aria-label={`ยอดขาย${isToday ? 'วันนี้' : 'เดือนนี้'} ${formatNumberNoSymbol(heroValue)} บาท จาก ${isToday ? todayOrderCount : legendOrderCount} ${orderNoun} ยืนยันแล้ว ${formatNumberNoSymbol(legendConfirmed)} บาท รอยืนยัน ${formatNumberNoSymbol(legendUnconfirmed)} บาท กดเพื่อดูรายงานฉบับเต็ม`}
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
            {/* flex-wrap: โหมดวันนี้มี 3 รายการเป็นครั้งแรก (คำสั่งซื้อ + ยืนยันแล้ว + รอยืนยัน)
                จอแคบ 320-375px กับตัวเลขหลักหมื่นทำให้แถวล้นได้ — ให้ตกบรรทัดแทนการเบียด */}
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-default-700">
              {/* จำนวนคำสั่งซื้อวันนี้ (user ขอ 2026-08-05: ดูยอดแล้วไม่รู้ว่ามาจากกี่ใบ)
                  ใช้ icon แทนจุดสี — จุดสีในแถวนี้ = legend ของ series บนกราฟ 1:1
                  ซึ่งกราฟ 7 วันของโหมดวันนี้ไม่มี series จำนวนออเดอร์ จุดสีจะโกหก */}
              {isToday && (
                <span className="inline-flex items-center gap-1.5">
                  <Icon icon="receipt-2" className="size-3.5 shrink-0 text-default-500" aria-hidden="true" />
                  <b className="font-semibold text-default-800">{todayOrderCount}</b> {orderNoun}
                </span>
              )}
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
                  {orderNoun} <b className="font-semibold text-default-800">{legendOrderCount}</b>
                </span>
              )}
            </div>

            {/* height/type ต้องตรงกับ getXxxOptions() เป๊ะ — ApexChart wrapper ให้ prop ชนะ options
                (`height ?? options.chart?.height`) ถ้าลืมแก้ prop ตอนแก้ options ตัวเลขใน options
                จะถูกทิ้งเงียบ ๆ โดยไม่มี error: 2026-08-05 ตั้ง height 168 ใน options แต่ prop ยังค้าง
                104 กราฟจึงเรนเดอร์ 104 ทั้งที่โค้ดอ่านแล้วเหมือนสูง 168 (ป้ายวันหมุน -60° กิน ~40px
                เหลือพื้นที่วาด ~55px แท่งวันที่ยอดน้อยเตี้ยกว่า 1px = หายไปทั้งแท่ง) */}
            {isToday && last14Totals ? (
              <ApexChart key="today" getOptions={getTodayOptions} series={todaySeries} type="bar" height={168} />
            ) : (
              <ApexChart key="month" getOptions={getMonthOptions} series={monthSeries} type="line" height={168} />
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
