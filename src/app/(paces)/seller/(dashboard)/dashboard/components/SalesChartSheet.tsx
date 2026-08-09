'use client'

/**
 * SalesChartSheet — full-screen sheet รายงานยอดขาย (จาก SalesChartCard บน command center)
 *
 * Shell: copy pattern จาก orders/new/components/AddressSearchSheet.tsx
 *   (fixed inset-0 z-80 flex flex-col bg-card, header back+title, ESC ปิด, role="dialog")
 * Chart: Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/FinancialOverview.tsx
 *   (plotOptions.bar + multi-series colors array pattern) ผ่าน @/components/wrappers/ApexChart (HR10)
 *   — ห้าม import react-apexcharts ตรง; อ้าง in-app precedent SalesReport.tsx (ApexChart + getColor + build-options fn)
 *   Stacked bar (ยืนยันแล้ว=เขียว / รอยืนยัน=เหลือง / เงินออก=แดง): ใช้ ApexCharts `stacked: true`
 *   มาตรฐานบนโครง plotOptions.bar เดิมจาก FinancialOverview.tsx + สี token getColor() ทั้งหมด
 *
 * ── v2 2026-08-04 ────────────────────────────────────────────────────────────
 * - เขียวแทนน้ำเงินสำหรับ "ยืนยันแล้ว" ให้ตรงกับ OrderStatusBand (สถานะเดียวกันเคยมีสองสีในแอปเดียว)
 * - เปิดแกน y + เส้นสเกลประ — เดิมปิดทั้งคู่ อ่านไม่ออกว่าแท่งไหนกี่บาท และพื้นที่ของวันที่ยังไม่ถึง
 *   อ่านเป็น "กราฟพัง" แทน "เดือนที่ยังเดินไม่ครบ"
 * - ตัวเลขทุกจุดตัด ฿ ออก + ค่าติดลบแสดงเครื่องหมายลบตรง ๆ (user สั่ง 2026-08-04)
 * - ต้นทุนสินค้า + ค่าใช้จ่าย ยุบเป็น "เงินออก" ก้อนเดียว เพื่อให้ ยืนยันแล้ว − เงินออก = hero ลบตามได้จริง
 *   (สูตรเดิมที่เขียนเป็นประโยคอ้าง "ต้นทุนสินค้า" ซึ่งไม่เคยโผล่บนจอ ผู้ใช้ตรวจตามไม่ได้)
 * - %เทียบใช้ prevTotalToDate ไม่ใช่ prevTotal (เดิมเอาเดือนนี้ 4 วันไปหารกับเดือนก่อน 31 วัน)
 *
 * ── v3 2026-08-07 (user สั่งไล่ทีละข้อจากภาพหน้าจอ) ──────────────────────────
 * - กราฟใช้ทรงเดียวกับการ์ดยอดขายหน้าแรก (SalesChartCard): แท่งกว้าง 92% + เส้นจำนวนคำสั่งซื้อ
 *   บนแกนขวา + เส้นประ "วันนี้" + ไม่มีตัวเลขแกน y (ตัวเลขเป๊ะอยู่ในตารางข้างล่างซึ่งตอนนี้ครบทุกช่อง)
 * - [สำคัญ] สูตรกำไรบนหน้านี้ = **ยอดขาย − ค่าใช้จ่าย** (user เคาะ 2026-08-07 หลังเห็นทั้งสองทางเลือก)
 *   ต่างจาก `netProfit` ของ service (ยืนยันแล้ว − ต้นทุนสินค้า − ค่าใช้จ่าย) ที่หน้า /expenses
 *   กับการ์ด P&L ใช้อยู่ — ตั้งใจให้ต่าง เพื่อให้ทุกแถวในตารางบวกกันแล้วเท่ากับตัวเลขใหญ่ด้านบนพอดี
 *   โดยผู้ขายไม่ต้องรู้จักคำว่า "ต้นทุนสินค้า" ซึ่งไม่เคยโผล่บนจอนี้เลย
 *   ผลข้างเคียงที่รับไว้แล้ว: เลข "กำไร" ที่นี่กับที่ /expenses ไม่เท่ากันเมื่อร้านตั้งต้นทุนสินค้าไว้
 * - แถบสรุปเรียงเป็นสมการตามลำดับที่ user สั่ง: รอยืนยัน + ยืนยันแล้ว − ค่าใช้จ่าย = ตัวเลขใหญ่
 *
 * ── v4 2026-08-07 (user สั่งจากภาพหน้าจอมือถือ) ─────────────────────────────
 * - ทั้งสามซีรีส์ซ้อนเป็นแท่งเดียว (stacked จริง) — เดิมค่าใช้จ่ายอยู่คนละ `group` ApexCharts
 *   จึงวางเป็นแท่งที่สองข้าง ๆ แล้วซอย columnWidth 92% ออกเป็นสองแท่งผอม ๆ ต่อวัน
 *   ผลพลอยได้: แท่งกว้างขึ้นเท่าตัวโดยไม่ต้องแตะ columnWidth (user ขอมาพร้อมกันสองข้อ)
 *   ข้อแลกเปลี่ยนที่รับไว้แล้ว: ความสูงรวมของแท่ง = ยอดขาย + ค่าใช้จ่าย จึงอ่านเป็น "ยอดขาย"
 *   ทั้งก้อนไม่ได้อีก — ตัวเลขแยกซีรีส์อ่านได้จาก tooltip กับตารางข้างล่างแทน
 * - คอลัมน์ วันที่ / คำสั่งซื้อ จัดกึ่งกลาง (user สั่ง) — ทั้งสองเป็นค่าสั้นความยาวคงที่
 *   ต่างจากคอลัมน์เงินที่ต้องชิดขวาให้หลักหน่วยตรงกันทั้งคอลัมน์
 *
 * ── v5 2026-08-08 (user สั่ง: ถอด "รอ COD" ออก · เพิ่ม "ต้นทุนสินค้า" หน้าค่าใช้จ่าย) ────────
 * - [สำคัญ] สูตรกำไรเปลี่ยนเป็น **ยอดขาย − (ต้นทุนสินค้า + ค่าใช้จ่าย)** — user เคาะ 2026-08-08
 *   ยกเลิกสูตร v3 (ยอดขาย − ค่าใช้จ่าย) ที่จงใจไม่หักต้นทุน เพราะตอนนั้นต้นทุนไม่เคยโผล่บนจอนี้เลย
 *   ตอนนี้มันเป็นคอลัมน์จริงบนตารางแล้ว การไม่หักจึงกลายเป็นสิ่งที่ตรวจตามด้วยตาแล้วผิด
 * - hero + แถบสมการเปลี่ยนตามในคอมมิตเดียวกัน (user เลือกเอง): รอยืนยัน + ยืนยันแล้ว
 *   − ต้นทุนสินค้า − ค่าใช้จ่าย = ตัวเลขใหญ่ — invariant เดิมยังอยู่: ทุกแถวในตารางบวกกันต้องได้ hero
 * - ต้นทุนที่ใช้คือ `series.cogsValues` (ต้นทุนของ **ทุกออเดอร์** ใน bucket) ไม่ใช่ `cogsConfirmedValues`
 *   เพราะตัวตั้งที่มันลบออกคือคอลัมน์ "ยอดขาย" ซึ่งรวมใบรอยืนยัน — หยิบผิดชุดแล้วแถวจะลบไม่ลงตัว
 *   (ยังต่างจาก `netProfit` ของ /expenses ที่ลบออกจาก "ยืนยันแล้ว" — สองหน้าจึงยังไม่เท่ากันโดยตั้งใจ)
 * - ต้นทุนที่ยังไม่ตั้ง (cost = null) ถูก **ข้าม** ไม่ใช่นับเป็น 0 → กำไรที่เห็นเป็น "เพดานบน" เสมอ
 * - แถบสมการ: ช่อง "ต้นทุนสินค้า" ไม่มีจุดสี เพราะกราฟไม่มีซีรีส์นี้ (จุดสี = ซีรีส์ในกราฟ 1:1
 *   ใส่จุดให้ของที่ไม่มีในกราฟจะกลายเป็นคำโกหกเรื่องสี) — แถบนี้ทำหน้าที่สมการเป็นหลักอยู่แล้ว
 */
import { useState, useEffect, useRef } from 'react'
import Icon from '@/components/wrappers/Icon'
import ApexChart from '@/components/wrappers/ApexChart'
import { getColor } from '@/utils/helpers'
import { formatMonthYearTH } from '@/lib/format-date'
import { formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
import type { ApexOptions } from 'apexcharts'
import type { SalesSeries } from '../_constants/command-center'
import { axisAnchorDays } from './sales-chart-axis'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

type Mode = 'daily' | 'monthly'

type Props = {
  initialSeries: SalesSeries
  onClose: () => void
}

/**
 * สร้าง ApexOptions จาก SalesSeries จริง — ทรงเดียวกับการ์ดยอดขายบนหน้าแรก (user สั่ง 2026-08-07
 * ว่า "ปรับ bar ให้เหมือน SalesChart" = การ์ดใบนั้น):
 *   ยืนยันแล้ว = เขียว (success) · รอยืนยัน = เหลือง (warning) · ค่าใช้จ่าย = แดง (chart-beta)
 *   · คำสั่งซื้อ = เส้นน้ำเงิน (primary) บนแกนขวา
 *
 * v4: ทั้งสามซีรีส์อยู่สแต็กเดียวกัน (ไม่มี `group` เลย — ทรงเดียวกับ getStackedColumnChart ของธีม)
 * เดิมค่าใช้จ่ายถูกแยก `group: 'cost'` เพื่อไม่ให้ความสูงรวมถูกอ่านว่า "ยอดขาย" ทั้งก้อน แต่ผลคือ
 * ApexCharts ซอยความกว้าง 92% ออกเป็นสองแท่งผอมต่อวัน — user เลือกแท่งเดียวหนา ๆ แทน (2026-08-07)
 * โดยรับข้อแลกเปลี่ยนเรื่องการอ่านความสูงรวมไว้แล้ว
 */
export const buildSalesChartOptions = (series: SalesSeries, mode: Mode): ApexOptions => {
  const { labels, confirmedValues, unconfirmedValues, orderCounts, expenseValues, futureFromIndex } = series
  const isDaily = mode === 'daily'
  // undefined = ไม่มีสิทธิ์ดูข้อมูลการเงิน (feature 00016) → ไม่มีแท่งค่าใช้จ่ายเลย
  const showExpense = expenseValues != null
  const bucketCount = labels.length

  /**
   * bucket ในอนาคตส่งเป็น `null` ไม่ใช่ตัดทิ้ง — ApexCharts ไม่วาดอะไรให้ null แต่ยังนับเป็น
   * category แกน x จึงยาวเท่าจำนวนวันของเดือนเสมอ (ชุดเดียวกับการ์ดหน้าแรก ซึ่ง user ยืนยัน
   * 2026-08-04 ว่าแสดงทั้งเดือนถูกแล้ว — เคย .slice() ตัดทิ้งจริงแล้วพัง)
   */
  const maskFuture = (arr: number[]) => arr.map((v, i) => (i < futureFromIndex ? v : null))

  /** ป้ายวันบนแกน x โหมดรายวัน — โชว์เฉพาะหมุด (กติกาเดียวกับการ์ด ดู sales-chart-axis.ts)
   *  โหมดรายเดือนมี 12 ป้ายเดือนไทยอยู่แล้ว โชว์ครบไม่ต้องคัด */
  const anchorDays = axisAnchorDays(bucketCount, futureFromIndex)

  /** วันนี้/เดือนนี้อยู่ตำแหน่งไหน — ใช้ปักเส้นประคั่นช่วงที่ยังมาไม่ถึง
   *  futureFromIndex === bucketCount = ช่วงนั้นจบไปแล้ว → ไม่ปักเส้น (ไม่มีที่ว่างให้ต้องอธิบาย) */
  const todayLabel = futureFromIndex < bucketCount ? labels[futureFromIndex - 1] : null

  return {
    series: [
      { name: 'ยืนยันแล้ว', type: 'column', data: maskFuture(confirmedValues) },
      { name: 'รอยืนยัน', type: 'column', data: maskFuture(unconfirmedValues) },
      ...(showExpense
        ? [{ name: 'ค่าใช้จ่าย', type: 'column', data: maskFuture(expenseValues) }]
        : []),
      /** เส้น = จำนวนคำสั่งซื้อ คนละหน่วยกับแท่ง (ใบ vs บาท) จึงต้องมีแกน y ที่สอง ไม่งั้นเส้นจะแบน
       *  ติดพื้นเพราะเลขหลักหน่วยเทียบกับหลักพัน · `stackOnlyBar` กันไม่ให้ Apex เอาเส้นไปซ้อนยอดสะสม */
      { name: 'คำสั่งซื้อ', type: 'line', data: maskFuture(orderCounts) },
    ],
    chart: {
      type: 'line', height: 220, stacked: true, stackOnlyBar: true, toolbar: { show: false },
      /** ปิด drag-to-zoom — toolbar:false ซ่อนแค่ปุ่ม ไม่ได้ปิดพฤติกรรมลาก: จิ้มลากบนมือถือ
       *  แล้วเกิดกล่อง selection ฟ้าค้างบนกราฟ (user รายงาน 2026-08-05 บน SalesChartCard —
       *  ชีตใช้กราฟตระกูลเดียวกันจึงปิดพร้อมกัน) · selection:false เป็นกันเหนียว */
      zoom: { enabled: false },
      selection: { enabled: false },
      // กัน ApexCharts เว้น padding ในกรอบ SVG เอง — เป็นที่มาของช่องว่างก้อนใหญ่เหนือกราฟที่
      // หาไม่เจอใน JSX (ไม่มี margin ตัวไหนสร้างมัน)
      parentHeightOffset: 0,
    },
    // 92% + มุมโค้ง 1 = ทรงของการ์ดหน้าแรก · v4 ทุกซีรีส์อยู่สแต็กเดียว 92% จึงตกเป็นของแท่งเดียว
    // เต็ม ๆ (เดิมถูกหารกับแท่งค่าใช้จ่าย) = ความกว้างที่เห็นจริงเพิ่มขึ้นเท่าตัวตามที่ user ขอ
    plotOptions: { bar: { columnWidth: '92%', borderRadius: 1 } },
    // legend ของ Apex ถูกแทนด้วยแถบสรุปเหนือกราฟ (จุดสี = ซีรีส์ 1:1 พร้อมยอดรวม) — ของเดิม
    // 3 label ไทยตัดเป็น 2 บรรทัดบนจอ 390 และบอกได้แค่ "สีนี้ชื่ออะไร" ทั้งที่แถบบอกตัวเลขด้วย
    legend: { show: false },
    dataLabels: { enabled: false },
    /** เขียว = ยืนยันแล้ว (ตรงกับ OrderStatusBand ที่ทา CONFIRMED เป็น text-success — เดิมที่นี่ใช้
     *  น้ำเงิน สถานะเดียวกันจึงมีสองสีในแอปเดียว), เหลือง = รอยืนยัน, แดง = ค่าใช้จ่าย — token ทั้งหมด */
    colors: showExpense
      ? [getColor('success'), getColor('warning'), getColor('chart-beta'), getColor('primary')]
      : [getColor('success'), getColor('warning'), getColor('primary')],
    /**
     * ไม่มีขอบทั้งแท่ง (user เคาะ 2026-08-05 บนการ์ด: "รอยืนยันมีขอบ ยืนยันแล้วไม่มี ทำให้ดูต่างกัน")
     * ตัวสุดท้าย = ความหนาเส้นจำนวนคำสั่งซื้อ
     */
    stroke: showExpense
      ? { show: true, width: [0, 0, 0, 2], curve: 'straight', colors: ['transparent', 'transparent', 'transparent', getColor('primary')] }
      : { show: true, width: [0, 0, 2], curve: 'straight', colors: ['transparent', 'transparent', getColor('primary')] },
    markers: { size: 2, strokeWidth: 0, colors: [getColor('primary')] },
    xaxis: {
      categories: labels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { fontSize: '10px', colors: getColor('default-700') },
        rotate: 0,
        rotateAlways: false,
        // คุมป้ายเองทั้งหมดผ่าน formatter — ปล่อยให้ Apex ตัดเองจะเดาไม่ได้ว่าจะเหลือวันไหน
        hideOverlappingLabels: false,
        trim: false,
        formatter: (v: string) => (isDaily ? (anchorDays.has(Number(v)) ? v : '') : v),
      },
    },
    /**
     * ไม่โชว์ตัวเลขแกน y — กินความกว้างจาก 31 แท่งที่แคบอยู่แล้ว เส้นสเกลอย่างเดียวพอ (ทรงการ์ด)
     * ตัวเลขที่ต้องอ่านเป๊ะอยู่ในตารางข้างล่าง ซึ่งครบทุกช่องแล้ว (คำสั่งซื้อ/ยอดขาย/ต้นทุน/
     * ค่าใช้จ่าย/กำไร) — เดิมตารางมีแค่ 2 คอลัมน์ แกน y จึงยังต้องทำหน้าที่นั้นแทน
     *
     * แท่งทุกตัวต้องผูก seriesName เดียวกันเพื่อใช้สเกลร่วมกัน (หน่วยบาทเหมือนกัน)
     * แกนสุดท้ายเป็นของเส้นคำสั่งซื้อ (หน่วย "ใบ") จึงแยกสเกล
     */
    yaxis: [
      { show: false, tickAmount: 3, seriesName: 'ยืนยันแล้ว' },
      { show: false, tickAmount: 3, seriesName: 'ยืนยันแล้ว' },
      ...(showExpense ? [{ show: false, tickAmount: 3, seriesName: 'ยืนยันแล้ว' }] : []),
      { show: false, opposite: true, seriesName: 'คำสั่งซื้อ', min: 0 },
    ],
    grid: {
      show: true,
      borderColor: getColor('chart-border-color'),
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 4, bottom: 0, left: 4 },
    },
    /** เส้นประคั่นตรงวันนี้ — เปลี่ยนความหมายของที่ว่างฝั่งขวาจาก "ขายไม่ได้" เป็น "ยังมาไม่ถึง"
     *  (ชุดเดียวกับการ์ดหน้าแรก user เลือก 2026-08-05) */
    annotations: todayLabel
      ? {
          xaxis: [{
            x: todayLabel,
            borderColor: getColor('default-400'),
            strokeDashArray: 3,
            label: {
              text: isDaily ? 'วันนี้' : 'เดือนนี้',
              position: 'top',
              orientation: 'horizontal',
              offsetY: -4,
              borderWidth: 0,
              style: { background: 'transparent', color: getColor('default-700'), fontSize: '10px' },
            },
          }],
        }
      : undefined,
    /** custom tooltip — ตัวเดียวที่บอกตัวเลขของแท่งได้หลังปิดแกน y (การ์ดหน้าแรกปิด tooltip
     *  เพราะทั้งการ์ดเป็นปุ่ม แต่ชีตนี้ไม่ใช่ปุ่ม แตะดูค่าได้เต็มที่) จุดสีจาก token ไม่ hardcode hex */
    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ series, dataPointIndex, w }: { series: number[][]; dataPointIndex: number; w: { globals: { labels: string[] } } }) => {
        const conf = Number(series?.[0]?.[dataPointIndex] ?? 0)
        const unconf = Number(series?.[1]?.[dataPointIndex] ?? 0)
        const exp = showExpense ? Number(series?.[2]?.[dataPointIndex] ?? 0) : null
        const orders = Number(series?.[showExpense ? 3 : 2]?.[dataPointIndex] ?? 0)
        const label = w?.globals?.labels?.[dataPointIndex] ?? ''
        const dot = (c: string) =>
          `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${c};margin-right:6px"></span>`
        return (
          // 13px = ขั้น Label/Caption ของ ramp ("chip, caption, meta" — DESIGN.md §Hierarchy) ซึ่งคือ
          // บทบาทของ tooltip ตัวนี้พอดี · เขียนเป็น inline style เพราะ Apex เรนเดอร์ HTML ก้อนนี้เอง
          // นอก React tree — Tailwind class ใช้ไม่ได้ (ต่างจากป้ายแกน 10px ที่ยกเว้นไว้แล้วใน config
          // เพราะ 31 วันเบียดกัน · tooltip ไม่มีข้อจำกัดนั้น จึงไม่มีเหตุให้หลุด ramp)
          `<div style="padding:6px 10px;font-size:13px;line-height:1.6">` +
          `<div style="font-weight:600;margin-bottom:2px">${label} · ${formatNumberNoSymbol(orders)} คำสั่งซื้อ</div>` +
          `<div>${dot(getColor('success'))}ยืนยันแล้ว ${formatNumberNoSymbol(conf)}</div>` +
          `<div>${dot(getColor('warning'))}รอยืนยัน ${formatNumberNoSymbol(unconf)}</div>` +
          (exp != null ? `<div>${dot(getColor('chart-beta'))}ค่าใช้จ่าย ${formatNumberNoSymbol(exp)}</div>` : '') +
          `<div style="font-weight:600;margin-top:4px">ยอดขายรวม ${formatNumberNoSymbol(conf + unconf)}</div>` +
          `</div>`
        )
      },
    },
  }
}

export default function SalesChartSheet({ initialSeries, onClose }: Props) {
  // overlay นี้ mount เฉพาะตอนเปิด จึงตรึงหน้าข้างหลังตลอดอายุของมัน (ดู useLockBodyScroll)
  useLockBodyScroll(true)

  const now = new Date()
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth() + 1

  const [mode, setMode] = useState<Mode>('daily')
  const [year, setYear] = useState(nowYear)
  const [month, setMonth] = useState(nowMonth)
  const [series, setSeries] = useState<SalesSeries>(initialSeries)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  // เปิดครั้งแรกใช้ initialSeries ที่มีอยู่แล้ว — ข้าม fetch รอบแรก
  const isFirstRun = useRef(true)

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    let cancelled = false
    setLoading(true)
    setError(false)
    const qs = new URLSearchParams({ mode, year: String(year) })
    if (mode === 'daily') qs.set('month', String(month))
    fetch(`/api/seller/sales-series?${qs.toString()}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json() as Promise<SalesSeries>
      })
      .then((data) => {
        if (!cancelled) setSeries(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, year, month])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const isCurrentPeriod = mode === 'daily' ? year === nowYear && month === nowMonth : year === nowYear

  const goPrev = () => {
    if (mode === 'daily') {
      if (month === 1) {
        setYear((y) => y - 1)
        setMonth(12)
      } else {
        setMonth((m) => m - 1)
      }
    } else {
      setYear((y) => y - 1)
    }
  }

  const goNext = () => {
    if (isCurrentPeriod) return
    if (mode === 'daily') {
      if (month === 12) {
        setYear((y) => y + 1)
        setMonth(1)
      } else {
        setMonth((m) => m + 1)
      }
    } else {
      setYear((y) => y + 1)
    }
  }

  const switchMode = (m: Mode) => {
    if (m === mode) return
    setMode(m)
    setYear(nowYear)
    if (m === 'daily') setMonth(nowMonth)
  }

  const retry = () => {
    // trigger re-fetch โดยไม่เปลี่ยน period — ใช้ trick set state เดิมไม่ได้ (ไม่ trigger effect)
    // → เรียก fetch ตรง ๆ ซ้ำ logic เดิม (สั้นกว่าแยกฟังก์ชัน fetch ออกมา ณ ตอนนี้)
    setLoading(true)
    setError(false)
    const qs = new URLSearchParams({ mode, year: String(year) })
    if (mode === 'daily') qs.set('month', String(month))
    fetch(`/api/seller/sales-series?${qs.toString()}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json() as Promise<SalesSeries>
      })
      .then((data) => setSeries(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  /**
   * เทียบกับช่วงก่อนหน้า "ณ วันเดียวกัน" ไม่ใช่ทั้งเดือนก่อน — `prevTotal` คือเดือนก่อนทั้ง 31 วัน
   * แต่ `total` คือเดือนนี้เท่าที่ผ่านมา วันที่ 4 จึงเอา 4 วันไปหารกับ 31 วัน ได้ ▼80%+ ทุกต้นเดือน
   * ทั้งที่อาจขายดีกว่าเดิม (บั๊กที่มีมาตลอด — ซ่อนอยู่เพราะร้านที่เดือนก่อนยอด 0 จะไม่แสดง % อยู่แล้ว)
   */
  const chgRaw = pctChangeVsPrev(series.total, series.prevTotalToDate)
  const chg = chgRaw != null ? Math.round(chgRaw) : null
  const confirmedTotal = series.confirmedValues.reduce((s, v) => s + v, 0)
  const unconfirmedTotal = series.total - confirmedTotal
  // ไม่ผ่าน gate สิทธิ์ → ไม่มีค่าใช้จ่าย/กำไรเลย: hero กลับไปเป็นยอดขายเหมือนเดิม ไม่ใช่โชว์ 0
  const hasFinance = series.totalExpense != null
  const expenseTotal = series.totalExpense ?? 0
  const cogsTotal = series.totalCogs ?? 0
  /**
   * กำไร = ยอดขายทั้งหมด (ยืนยันแล้ว + รอยืนยัน) − ต้นทุนสินค้า − ค่าใช้จ่าย (user เคาะ 2026-08-08)
   * ต้องเป็นสูตรเดียวกับคอลัมน์ "กำไร" ในตารางข้างล่างเป๊ะ ๆ ไม่งั้นแถวทั้งเดือนบวกกันแล้วไม่ได้
   * ตัวเลขนี้ — invariant ที่เป็นเหตุผลทั้งหมดที่หน้านี้ไม่ใช้ netProfit ของ service ตรง ๆ
   * (ดูหมายเหตุ v5 หัวไฟล์ — /expenses ลบออกจาก "ยืนยันแล้ว" สองหน้าจึงไม่เท่ากันโดยตั้งใจ)
   */
  const profit = series.total - cogsTotal - expenseTotal
  const heroValue = hasFinance ? profit : series.total
  const heroTone = !hasFinance ? 'text-dark' : profit >= 0 ? 'text-success-ink' : 'text-danger-ink'

  const periodLabel =
    mode === 'daily'
      ? formatMonthYearTH(new Date(Date.UTC(year, month - 1, 15)))
      : `ปี ${year + 543}`

  const compareWord = mode === 'daily' ? 'เดือนก่อน' : 'ปีก่อน'

  const isEmpty = !loading && !error && series.total === 0

  // แสดงเฉพาะ bucket ที่มีความเคลื่อนไหวจริง — เดือนที่ขายจริง 3 วันไม่ควรต้องเลื่อนผ่าน "0" อีก 28 แถว
  const detailRows = series.labels
    .map((label, i) => ({
      // วันที่โชว์เลขล้วน "1, 2, 3" (user สั่ง 2026-08-07) — ชื่อเดือนอยู่บนหัวชีตบรรทัดเดียวกันอยู่แล้ว
      label,
      orders: series.orderCounts[i] ?? 0,
      value: series.values[i] ?? 0,
      // ต้นทุนของ "ทุกออเดอร์" ใน bucket — ชุดเดียวกับ value ที่มันจะถูกลบออก (ดู v5 หัวไฟล์)
      cogs: series.cogsValues?.[i] ?? 0,
      expense: series.expenseValues?.[i] ?? 0,
    }))
    .filter((r) => r.orders > 0 || r.value > 0 || r.cogs > 0 || r.expense > 0)
    // วันล่าสุดอยู่บนสุดเสมอ (user สั่ง 2026-08-07) — สิ่งที่ผู้ขายอยากรู้ตอนเปิดคือ "วันนี้เป็นไง"
    // ไม่ใช่ต้องเลื่อนผ่านทั้งเดือนไปหาแถวล่างสุด
    .reverse()

  return (
    // HR7: fixed inset-0 z-80 = full-screen viewport-lock (Paces ไม่มี token) — pattern เดียวกับ AddressSearchSheet
    <div className="fixed inset-0 z-80 flex flex-col bg-card" role="dialog" aria-label="รายงานยอดขายและกำไร">
      <div className="flex shrink-0 items-center gap-3 border-b border-default-200 px-4 py-3">
        <button type="button" onClick={onClose} aria-label="ปิด" className="shrink-0 text-default-700">
          <Icon icon="chevron-left" className="size-6" />
        </button>
        <h3 className="flex-1 text-base font-semibold text-dark">ยอดขายและกำไร</h3>

        {/* segmented [รายวัน|รายเดือน] — ไม่มี named component ใน theme (Preline) — utility ล้วน ไม่ arbitrary */}
        <div className="flex items-center gap-0.5 rounded-lg bg-default-100 p-0.5">
          <button
            type="button"
            onClick={() => switchMode('daily')}
            className={`min-h-11 rounded-md px-3 text-xs font-medium transition-colors ${
              mode === 'daily' ? 'bg-card text-primary shadow' : 'text-default-700'
            }`}
          >
            รายวัน
          </button>
          <button
            type="button"
            onClick={() => switchMode('monthly')}
            className={`min-h-11 rounded-md px-3 text-xs font-medium transition-colors ${
              mode === 'monthly' ? 'bg-card text-primary shadow' : 'text-default-700'
            }`}
          >
            รายเดือน
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[env(safe-area-inset-bottom)]">
        {/* tablet: content จำกัดความกว้าง max-w-lg (mobile เต็มจอ) */}
        <div className="mx-auto w-full max-w-lg py-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={goPrev}
              aria-label="ช่วงก่อนหน้า"
              className="btn btn-icon min-h-11 min-w-11 border-default-300"
            >
              <Icon icon="chevron-left" className="size-5" />
            </button>
            {/* ตัด "1 – 31 ส.ค." ออก — ซ้ำกับชื่อเดือนที่อยู่บรรทัดเดียวกัน และแกน x ก็บอกช่วงวันอยู่แล้ว */}
            <div className="text-center">
              <p className="text-lg font-bold text-dark">{periodLabel}</p>
            </div>
            <button
              type="button"
              onClick={goNext}
              disabled={isCurrentPeriod}
              aria-label="ช่วงถัดไป"
              className={`btn btn-icon min-h-11 min-w-11 border-default-300 ${
                isCurrentPeriod ? 'pointer-events-none opacity-40' : ''
              }`}
            >
              <Icon icon="chevron-right" className="size-5" />
            </button>
          </div>

          {/* HERO = กำไร/ขาดทุนของช่วงนี้ (ร้านที่ไม่ผ่าน gate สิทธิ์ = ยอดขายแทน)
              ไม่มี ฿ — user สั่งตรง ๆ ว่าแค่ตัวเลขพอ (2026-08-04) ทิศทางสื่อด้วยเครื่องหมายลบ + สี
              ป้ายบอก "มันคือตัวเลขอะไร" ตรง ๆ ว่า "กำไร/ขาดทุน" (user สั่ง 2026-08-07 — เดิมเขียนว่า
              "ทั้งเดือน" ซึ่งบอกแค่ *ช่วงเวลา* ทั้งที่ช่วงเวลาอยู่บนหัวบรรทัดถัดขึ้นไปแล้ว
              ตัวเลขจึงไม่มีอะไรบอกเลยว่าเป็นเงินอะไร) ส่วนที่มาของมันอ่านได้จากแถบสมการข้างล่างทันที */}
          <div className="mb-3 text-center">
            <p className="text-xs text-default-700">{hasFinance ? 'กำไร/ขาดทุน' : 'ยอดขาย'}</p>
            <p className={`text-3xl font-bold tabular-nums ${heroTone}`}>{formatNumberNoSymbol(heroValue)}</p>
            {chg != null && (
              <p className="mt-0.5 flex items-center justify-center gap-1 text-sm text-default-700">
                <span
                  className={`inline-flex items-center gap-0.5 font-semibold ${
                    chg > 0 ? 'text-success-ink' : chg < 0 ? 'text-danger-ink' : 'text-default-700'
                  }`}
                >
                  {chg !== 0 && (
                    <Icon icon={chg > 0 ? 'arrow-up' : 'arrow-down'} className="size-4" aria-hidden="true" />
                  )}
                  {Math.abs(chg)}%
                </span>
                <span>ยอดขายจาก{compareWord}</span>
              </p>
            )}
          </div>

          {/* แถบนี้ทำสามหน้าที่: legend ของกราฟ (จุดสี = ซีรีส์ 1:1) + ยอดรวมของแต่ละซีรีส์ +
              **สมการที่ตรวจสอบตามได้** — รอยืนยัน + ยืนยันแล้ว − ต้นทุนสินค้า − ค่าใช้จ่าย
              = ตัวเลข hero ด้านบนพอดี จึงคั่นด้วยเครื่องหมาย + / − จริง ไม่ใช่คำอธิบาย
              ผู้ขายเอานิ้วไล่บวกลบตามได้เองทั้งแถว
              สีตรง token กราฟเป๊ะ: bg-warning=warning, bg-success=success, bg-danger=chart-beta
              "ต้นทุนสินค้า" ไม่มีจุดสีเพราะไม่มีซีรีส์ในกราฟ (ดู v5 หัวไฟล์) — ใส่จุดให้ของที่ไม่ได้
              อยู่ในกราฟจะทำให้จุดสีเลิกแปลว่า "แท่งไหนคือช่องไหน" ทั้งแถบ */}
          <div className="mb-4 flex items-stretch border-y border-dashed border-default-300">
            <LegendCell color="bg-warning" label="รอยืนยัน" value={unconfirmedTotal} />
            <span className="flex items-center px-1 text-sm text-default-700" aria-hidden="true">+</span>
            <LegendCell color="bg-success" label="ยืนยันแล้ว" value={confirmedTotal} />
            {hasFinance && (
              <>
                <span className="flex items-center px-1 text-sm text-default-700" aria-hidden="true">−</span>
                <LegendCell label="ต้นทุนสินค้า" value={cogsTotal} />
                <span className="flex items-center px-1 text-sm text-default-700" aria-hidden="true">−</span>
                <LegendCell color="bg-danger" label="ค่าใช้จ่าย" value={expenseTotal} />
              </>
            )}
          </div>

          {error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-sm text-default-700">โหลดข้อมูลไม่สำเร็จ</p>
              <button type="button" onClick={retry} className="btn btn-sm border-default-300">
                ลองใหม่
              </button>
            </div>
          ) : loading ? (
            // skeleton บน chart area เท่านั้น — ไม่กระพริบทั้ง sheet (total/subtitle ด้านบนยังโชว์ค่าเดิมค้างไว้)
            <div className="animate-pulse rounded-lg bg-default-100" style={{ height: 220 }} />
          ) : isEmpty ? (
            <SellerEmptyState compact icon="chart-bar-off" title="ยังไม่มียอดขายในช่วงนี้" />
          ) : (
            /* type="line" ไม่ใช่ "bar" — กราฟผสม (แท่ง + เส้นจำนวนคำสั่งซื้อ) ต้องประกาศเป็น line
               แล้วให้แต่ละ series บอก type ของตัวเอง (ชุดเดียวกับการ์ดหน้าแรก)
               prop ชนะค่าใน options เสมอใน ApexChart wrapper — ถ้าลืมแก้ตรงนี้ chart.type ใน
               options จะถูกทิ้งเงียบ ๆ โดยไม่มี error (บทเรียน 2026-08-05 เรื่อง height) */
            <ApexChart
              getOptions={() => buildSalesChartOptions(series, mode)}
              series={buildSalesChartOptions(series, mode).series}
              type="line"
              height={220}
            />
          )}

          {/* หัวคอลัมน์ครั้งเดียว แทนการพิมพ์ชื่อคอลัมน์ซ้ำในทุกแถว (เดือนละสูงสุด 155 คำ)
              คอลัมน์ v5 (user สั่ง 2026-08-08): วันที่ · คำสั่งซื้อ · ยอดขาย · ต้นทุน · ค่าใช้จ่าย · กำไร
              — "รอ COD" ถูกถอดออกทั้งคอลัมน์ตามคำสั่งเดียวกัน (ยังดูได้จากไทล์หน้าแรก/ชิปใน /orders)

              ความกว้างคอลัมน์เงินเป็น flex-1 basis-0 ไม่ใช่ `w-20` ตายตัว (user report 2026-08-07:
              6 คอลัมน์ล้นจอต้องเลื่อนแนวนอน — w-20 ×4 + w-10 + w-14 + ช่องไฟ = ~456px แต่จอ 390px
              หัก px-4 ของ sheet แล้วเหลือ ~358px). basis-0 ทำให้ทั้ง 4 คอลัมน์แบ่งที่ว่างเท่า ๆ กัน
              จึงพอดีจอเสมอไม่ว่าจะโชว์ 3/6 คอลัมน์ (ร้านที่ไม่ผ่าน gate สิทธิ์เห็นแค่ 3) แทนที่จะ
              พอดีเฉพาะจำนวนคอลัมน์ชุดเดียว.
              `min-w-14` = พื้นที่ขั้นต่ำที่ตัวเลข 6 หลักยังอ่านออก — จอที่แคบกว่านั้นจริง ๆ (SE 320px)
              ค่อยตกไปเลื่อนแนวนอนตาม overflow-x-auto ที่ยังคงไว้เป็นตาข่ายรับ
              หัวตารางใช้ชุด class เดียวกับแถวข้อมูลเป๊ะ ไม่งั้นคอลัมน์เลื่อนไม่ตรงกัน
              หัวคอลัมน์ย่อเป็น "ต้นทุน" (คำเต็ม "ต้นทุนสินค้า" อยู่บนแถบสมการเหนือตารางบรรทัดเดียวกัน)
              — 12 ตัวอักษรใน min-w-14 ตกบรรทัดแน่นอน แล้วหัวตารางจะสูงเป็นสองเท่าทั้งแถว */}
          {!loading && !error && !isEmpty && detailRows.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <div className="flex items-center gap-1.5 border-b border-default-200 py-2 text-xs text-default-700">
                {/* วันที่/คำสั่งซื้อ กึ่งกลาง (user สั่ง 2026-08-07) — ค่าสั้นความยาวคงที่
                    ต่างจากคอลัมน์เงินที่ยังชิดขวาเพื่อให้หลักหน่วยตรงกันทั้งคอลัมน์ */}
                <span className="w-8 shrink-0 text-center">{mode === 'daily' ? 'วันที่' : 'เดือน'}</span>
                <span className="w-11 shrink-0 text-center">คำสั่งซื้อ</span>
                <span className="min-w-14 flex-1 basis-0 text-end">ยอดขาย</span>
                {hasFinance && <span className="min-w-14 flex-1 basis-0 text-end">ต้นทุน</span>}
                {hasFinance && <span className="min-w-14 flex-1 basis-0 text-end">ค่าใช้จ่าย</span>}
                {hasFinance && <span className="min-w-14 flex-1 basis-0 text-end">กำไร</span>}
              </div>
              <div className="divide-y divide-default-100">
                {detailRows.map((r) => {
                  // สูตรเดียวกับ hero เป๊ะ — ทุกแถวบวกกันแล้วต้องได้ตัวเลขใหญ่ด้านบน
                  const rowProfit = r.value - r.cogs - r.expense
                  return (
                    <div key={r.label} className="flex items-center gap-1.5 py-2.5 text-xs">
                      <span className="w-8 shrink-0 text-center text-default-800">{r.label}</span>
                      <span className="w-11 shrink-0 text-center text-default-800 tabular-nums">
                        {r.orders > 0 ? formatNumberNoSymbol(r.orders) : '—'}
                      </span>
                      <span className="min-w-14 flex-1 basis-0 text-end font-semibold text-dark tabular-nums">
                        {formatNumberNoSymbol(r.value)}
                      </span>
                      {hasFinance && (
                        /* "—" = ยังไม่ได้ตั้งต้นทุนให้สินค้าในใบนั้น (ไม่ใช่ต้นทุน 0) — กำไรของแถว
                           จึงเป็นเพดานบน · สีเดียวกับค่าใช้จ่ายเพราะเป็นเงินออกเหมือนกัน */
                        <span
                          className={`min-w-14 flex-1 basis-0 text-end font-semibold tabular-nums ${r.cogs > 0 ? 'text-danger-ink' : 'text-default-700'}`}
                        >
                          {r.cogs > 0 ? formatNumberNoSymbol(r.cogs) : '—'}
                        </span>
                      )}
                      {hasFinance && (
                        <span
                          className={`min-w-14 flex-1 basis-0 text-end font-semibold tabular-nums ${r.expense > 0 ? 'text-danger-ink' : 'text-default-700'}`}
                        >
                          {r.expense > 0 ? formatNumberNoSymbol(r.expense) : '—'}
                        </span>
                      )}
                      {hasFinance && (
                        /* ระบายสีเฉพาะตอนขาดทุน — ถ้าทาเขียวทุกแถวที่เป็นบวก ทั้งตารางจะเขียวจน
                           แถวที่ติดลบไม่เด่นขึ้นมาเลย (และเขียวในระบบนี้สงวนไว้ให้ "ยืนยันแล้ว") */
                        <span
                          className={`min-w-14 flex-1 basis-0 text-end font-semibold tabular-nums ${rowProfit < 0 ? 'text-danger-ink' : 'text-dark'}`}
                        >
                          {formatNumberNoSymbol(rowProfit)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * ช่องหนึ่งของแถบ legend+ยอดรวม — จุดสีต้องตรงกับสีซีรีส์ในกราฟเสมอ
 * primitive ที่ใกล้ที่สุดในธีม: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/
 *   components/RevenueByLocation.tsx (จุดสี + ชื่อ + ค่าชิดขวา) — ที่นี่จัดเป็นคอลัมน์แทนแถว
 *
 * ป้ายเดิมเขียนยาวว่า "ลูกค้ายืนยันแล้ว"/"รอลูกค้ายืนยัน" เพื่อระบุตัวผู้กระทำ (กันร้านที่ใช้ระบบจอง
 * นึกว่าตัวเองต้องเป็นคนไปกดยืนยัน) — user เลือกคำสั้น "ยืนยันแล้ว"/"รอยืนยัน" เอง 2026-08-04
 * โดยรับทราบข้อกังวลนั้นแล้ว และการ์ดหน้าแรกใช้คำสั้นชุดเดียวกัน (คำเดียวกัน = ของเดียวกัน)
 */
function LegendCell({ color, label, value }: { color?: string; label: string; value: number }) {
  return (
    <div className="flex-1 border-e border-dashed border-default-300 px-1 py-2.5 text-center last:border-e-0">
      <p className="flex items-start justify-center gap-1 text-xs leading-tight text-default-700">
        {/* ไม่มี color = ช่องนี้ไม่มีซีรีส์ในกราฟ (ต้นทุนสินค้า) — เว้นจุดไปเลย ไม่ใช่ใส่สีมั่ว
            เพราะจุดสีในแถบนี้แปลว่า "แท่งสีนี้ในกราฟคือช่องนี้" ตรง ๆ (ดู v5 หัวไฟล์) */}
        {color && <span className={`mt-1 size-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />}
        <span className="text-balance">{label}</span>
      </p>
      <p className="mt-0.5 font-bold tabular-nums text-default-800">{formatNumberNoSymbol(value)}</p>
    </div>
  )
}
