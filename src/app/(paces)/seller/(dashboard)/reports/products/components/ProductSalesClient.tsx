'use client'

/**
 * ProductSalesClient — ตัวประสานของหน้ารายงานยอดขายรายสินค้า (feature 00063)
 *
 * ถือ state 4 อย่าง: หน่วยที่แสดง · สินค้าที่ติ๊กขึ้นกราฟ · สวิตช์แสดงสินค้าที่ไม่มียอด · ชีตที่เปิดอยู่
 *
 * 🛑 **หน่วยเป็น client state ไม่ใช่ URL** (ต่างจากเดือนที่อยู่ใน URL) — ข้อมูลทั้งสองหน่วยถูกส่ง
 * ลงมาพร้อมกันตั้งแต่ RSC แรกแล้ว การสลับหน่วยจึงไม่ต้องคุยกับเซิร์ฟเวอร์เลย ถ้าดันเข้า URL
 * จะได้ round trip ที่ไม่ได้อะไรกลับมา ส่วน "เดือน" ต้อง query ใหม่จริงจึงอยู่ใน URL
 *
 * ── การแบ่งจอ (ไม่เท่ากันโดยตั้งใจ) ────────────────────────────────────────────
 *   <768   : แถบเครื่องมือ **ติดบน** (เดือน + หน่วย) · กราฟ · รายการการ์ด (ต้น/กลาง/ปลายเดือน)
 *            + ดรอปดาวน์ มุมมอง/เรียงลำดับ + สวิตช์ท้ายรายการ
 *   768-1023: กราฟ + รายการการ์ด — ยังไม่มีช่องติ๊ก กราฟจึงล็อก Top N มีคำกำกับบอกไว้
 *   ≥1024  : กราฟ + ตารางเต็มพร้อมช่องติ๊ก (ตาราง 6 คอลัมน์ต้องการความกว้างระดับนี้ —
 *            แพตเทิร์นเดียวกับ `ProductsListing.tsx` ที่ตัดที่ lg ด้วยเหตุผลเดียวกัน)
 *
 * 🛑 **ตัวควบคุมรายการต่างกันตาม breakpoint โดยตั้งใจ** — มือถือใช้ดรอปดาวน์ (มุมมอง+เรียง)
 * เพราะ *ไม่มีตาราง* ให้กดหัวคอลัมน์เรียง · เดสก์ท็อปคงช่องติ๊กคู่เดิมเพราะตารางมีการเรียง
 * ของตัวเองอยู่แล้ว การใส่เมนู "เรียงตาม" ไปด้วยจะเป็นตัวควบคุมซ้ำของสิ่งเดียวกัน
 */
import { useMemo, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import {
  CHART_COLOR_TOKENS,
  CHART_SERIES_CAP,
  DEFAULT_CHART_SERIES,
  MONEY_MODE_CAVEAT,
  SALES_BASIS_DETAIL,
  SALES_BASIS_NOTE,
  sortProductRows,
  type ProductSortKey,
} from '@/lib/product-sales-month'
import { getColor } from '@/utils/helpers'
import type { ProductSalesRow } from '@/services/product-sales-series.service'
import ListControlDropdown, { type ListView } from './ListControlDropdown'
import MonthSwitcher from './MonthSwitcher'
import ProductDetailSheet from './ProductDetailSheet'
import ProductMobileList from './ProductMobileList'
import ProductSalesChart, { type ChartSeries } from './ProductSalesChart'
import ProductSalesTable from './ProductSalesTable'
import {
  UNIT_LABELS,
  buildViewRows,
  defaultSelectedKeys,
  rowSeries,
  rowTotal,
  type SalesUnit,
} from './data'

type Props = {
  rows: ProductSalesRow[]
  days: number
  year: number
  month0: number
  monthLabel: string
  futureFrom: number | null
  refDayIndex: number
  /** เดือนที่ดูคือเดือนปัจจุบันไหม — มีผลกับ *คำ* ของป้าย "เงียบ" */
  isCurrentMonth: boolean
  orderCount: number
  truncated: boolean
  /** `YYYY-MM` + ปลายทางของปุ่ม ‹ › — ส่งลงมาเพื่อประกอบแถบเครื่องมือติดบนของมือถือ */
  monthIso: string
  prevHref: string | null
  nextHref: string | null
  /**
   * 🛑 ย้ายลงมาจากหัวหน้า (2026-08-30) — มันเป็น *ข้อควรรู้ของตัวเลขที่ดูจบแล้ว* ไม่ใช่สิ่งที่
   * ต้องรู้ก่อนดู (ต่างจากนิยาม "ขายแล้ว" ที่ต้องมาก่อนเสมอตาม HR16) การวางไว้บนสุดกิน
   * 2 บรรทัดของจอมือถือก่อนจะเห็นข้อมูลอะไรเลย · **ย้ายที่ ไม่ใช่ตัดทิ้ง** — ยังอ่านเจอ
   * ทุกครั้งที่เลื่อนจบหน้า รวมกับบรรทัด "นับจากคำสั่งซื้อ N ใบ" ที่ทำหน้าที่เดียวกัน
   */
  freshnessNote: string
}

export default function ProductSalesClient({
  rows,
  days,
  year,
  month0,
  monthLabel,
  futureFrom,
  refDayIndex,
  isCurrentMonth,
  orderCount,
  truncated,
  monthIso,
  prevHref,
  nextHref,
  freshnessNote,
}: Props) {
  const [unit, setUnit] = useState<SalesUnit>('qty')
  const [showZero, setShowZero] = useState(false)
  /**
   * ตัวกรอง "ขายวันนี้" — client state เหมือน showZero ไม่ใช่ URL
   *
   * 🛑 เป็น **ตัวกรองแถว** ไม่ใช่ preset ช่วงเวลา (ux ให้ความเห็น 2026-08-30 และผมเห็นด้วย):
   * preset "วันนี้" จะทำลายความหมายของทั้งหน้า — แถบ 31 ช่องคือปฏิทินเดือน · ป้ายสรุปตัดสิน
   * จากสัดส่วนวันในเดือน (เงียบ ≥14 วัน · สม่ำเสมอ > ครึ่งเดือน) · แกน X คือวันที่ในเดือน
   * เลือก "วันนี้" แล้วทุกอย่างเหลือแท่งเดียวและป้ายไม่มีความหมาย — และเป็นการเอา
   * "ช่วงเวลาอิสระ" กลับเข้ามา ซึ่ง user เพิ่งล็อกไว้เมื่อ 2026-08-29 ว่าไม่เอา
   *
   * ยืนยันแล้วว่าไม่ทับซ้อนกับหน้าแรก: Command Center ตอบ "วันนี้" ระดับ**ยอดรวมร้าน**
   * และ**สถานะออเดอร์** แต่ไม่มีจุดไหนตอบว่า **สินค้าตัวไหน** ขายวันนี้
   */
  const [todayOnly, setTodayOnly] = useState(false)
  /**
   * การเรียงลำดับของ **รายการมือถือเท่านั้น** — ตารางเดสก์ท็อปมี TanStack sort ของตัวเอง
   * 🛑 ก่อนหน้านี้มือถือเรียงไม่ได้เลย ล็อกที่ "ยอดมากไปน้อย" มาตั้งแต่วันแรก ⇒ คำถาม
   * "ตัวไหนเงียบที่สุด" ตอบไม่ได้บนอุปกรณ์ที่หน้านี้ออกแบบมาเพื่อมันโดยเฉพาะ
   */
  const [sort, setSort] = useState<ProductSortKey>('TOP')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultSelectedKeys(rows, DEFAULT_CHART_SERIES)),
  )

  const viewRows = useMemo(
    () => buildViewRows(rows, days, refDayIndex, isCurrentMonth),
    [rows, days, refDayIndex, isCurrentMonth],
  )

  const soldRows = useMemo(() => viewRows.filter((r) => r.saleEvents > 0), [viewRows])

  /** ขายวันนี้ไหม = คำถาม yes/no ไม่ผันตามหน่วยที่เลือก จึงดูจากจำนวนชิ้นเสมอ */
  const todayCount = useMemo(
    () => (isCurrentMonth ? viewRows.filter((r) => (r.denseQty[refDayIndex] ?? 0) > 0).length : 0),
    [viewRows, refDayIndex, isCurrentMonth],
  )

  const visibleRows = useMemo(() => {
    if (todayOnly) return viewRows.filter((r) => (r.denseQty[refDayIndex] ?? 0) > 0)
    return showZero ? viewRows : soldRows
  }, [todayOnly, showZero, viewRows, soldRows, refDayIndex])

  /**
   * 🛑 เรียงตาม **หน่วยที่กำลังแสดง** — ไม่งั้นสลับไปโหมดบาทแล้วลำดับยังเป็นของจำนวนชิ้น
   * ซึ่งอ่านเป็น "เรียงมั่ว" (ต่างจาก `defaultSelectedKeys` ที่ยึดชิ้นเสมอโดยตั้งใจ เพราะ
   * นั่นคือ *ตัวเลือกตั้งต้นของกราฟ* ที่ไม่ควรสลับไปมาเวลาเปลี่ยนหน่วย)
   */
  const mobileRows = useMemo(
    () =>
      sortProductRows(
        visibleRows.map((r) => ({ ...r, total: rowTotal(r, unit) })),
        sort,
      ),
    [visibleRows, sort, unit],
  )

  const chartSeries: ChartSeries[] = useMemo(
    () =>
      viewRows
        .filter((r) => selected.has(r.key))
        .map((r) => ({ key: r.key, name: r.name, data: rowSeries(r, unit), image: r.image })),
    [viewRows, selected, unit],
  )

  /**
   * สีของสินค้าที่กำลังพล็อต — คำนวณ **ที่เดียว** แล้วส่งต่อ ไม่ให้ตาราง/รายการมือถือ/tooltip
   * คำนวณเองคนละที่ (HR16) · ลำดับต้องตรงกับที่ ApexCharts แจกสีเป๊ะ คือ index ใน `chartSeries`
   *
   * 🛑 นี่คือทางแก้ของปัญหา "ชื่อสินค้ามีคำว่าสีอยู่ในตัว แต่สีเส้นไม่ตรง" — ไม่ได้พยายาม
   * จับคู่สีเส้นให้ตรงกับคำในชื่อ (ทำไม่ได้ทั่วไป และชนกันเองเมื่อมีสินค้าสีเดียวกันสองตัว)
   * แต่ทำให้ผู้ใช้ **ไม่ต้องจำสีเลย** — วงแหวนรอบรูปในตารางเป็นสีเดียวกับเส้นบนกราฟ
   * มองจากตารางไปกราฟได้ทันที และใช้ได้บนมือถือด้วย (ไม่ต้อง hover)
   */
  const colorByKey = useMemo(() => {
    const m = new Map<string, string>()
    chartSeries.forEach((s, i) => {
      m.set(s.key, getColor(CHART_COLOR_TOKENS[i % CHART_COLOR_TOKENS.length]))
    })
    return m
  }, [chartSeries])

  const openRow = openKey ? (viewRows.find((r) => r.key === openKey) ?? null) : null

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else if (next.size < CHART_SERIES_CAP) next.add(key)
      return next
    })
  }

  const zeroCount = viewRows.length - soldRows.length

  /**
   * เดือนปัจจุบันที่ยังไม่จบ — ช่วง "ปลายเดือน" ในแถบ 3 ท่อนมีข้อมูลไม่ครบ
   * 🛑 `partial-data-must-be-labeled-or-filled.md`: ยอดของช่วงที่ยังมาไม่ครบ **ไม่ใช่ "ขายน้อย"
   * แต่คือ "ยังไม่ถึงเวลา"** — ห้ามปล่อยให้หน้าตาเหมือนกัน · บอกครั้งเดียวเหนือรายการเพราะ
   * เป็นคุณสมบัติของเดือน ไม่ใช่ของสินค้าแต่ละตัว
   */
  const incompleteNote =
    isCurrentMonth && refDayIndex + 1 < days
      ? `เดือนนี้ยังไม่จบ — ช่วงปลายเดือนนับถึงวันที่ ${refDayIndex + 1} เท่านั้น`
      : null

  /** ปุ่มสลับหน่วย — ใช้ 2 ที่ (แถบติดบนของมือถือ / แถวควบคุมของเดสก์ท็อป) จึงประกาศครั้งเดียว */
  const unitToggle = (
    <span className="inline-flex shrink-0" role="group" aria-label="หน่วยที่แสดง">
      {(['qty', 'baht'] as const).map((u, i) => (
        <button
          key={u}
          type="button"
          onClick={() => setUnit(u)}
          aria-pressed={unit === u}
          className={`btn border-default-300 min-h-11 border text-sm ${
            i === 0 ? 'rounded-e-none' : 'rounded-s-none border-s-0'
          } ${
            unit === u
              ? 'bg-primary hover:bg-primary-hover text-white'
              : 'text-default-700 hover:bg-default-100'
          }`}>
          {UNIT_LABELS[u]}
        </button>
      ))}
    </span>
  )

  return (
    <>
      {/**
        * แถบเครื่องมือ **ติดบน** ของมือถือ — เดือน + หน่วย ตามอยู่ตลอดเวลาที่เลื่อน
        * (user เลือกแบบนี้จากม็อกอัพ 2026-08-30)
        *
        * 🛑 `top` ต้องเท่ากับความสูงจริงของ `SellerMobileHeader` โหมด sub-page ซึ่งคือ
        * `pt-3.5 + h-11 + pb-2.5 = 4.25rem` **บวก `env(safe-area-inset-top)`** ที่หัวนั้นรับไว้
        * — ตัวเลขตายตัวใช้ไม่ได้เพราะ `env()` เป็นค่า runtime ที่ต่างกันตามเครื่อง
        * (iPhone มี Dynamic Island กับเครื่องไม่มีให้คนละค่า — docs/conventions/ios-safe-area.md)
        * `-mx-4 px-4` ให้แถบกินเต็มความกว้างจอ (shell มี `padding-inline: 1rem` บนมือถือ)
        *
        * 🛑 `z-20` ไม่ใช่ `z-10` — **`.btn` ของธีม Paces ตั้ง `z-index: 10` ให้ตัวเองทุกปุ่ม**
        * แถบ sticky ที่ใช้ z เท่ากันจะแพ้ปุ่มที่อยู่หลังกว่าใน DOM แล้วปุ่มจะลอยขึ้นมาทับแถบ
        * ตอนเลื่อน (เกิดจริงบน prod 2026-08-23 ที่ `/products/new`) — มีเทส [blocker]
        * `paces-sticky-z-index.test.ts` บังคับข้อนี้ และมันจับตัวนี้ได้จริงตอนเขียน
        */}
      <div
        className="bg-body-bg border-default-200 sticky z-20 -mx-4 mb-3 flex items-center gap-2 border-b px-4 py-2 md:hidden top-[calc(4.25rem+env(safe-area-inset-top))]" /* carve-out HR7: ความสูงหัวแอป + safe-area ไม่มี token ในธีม */
      >
        <span className="min-w-0 flex-1">
          <MonthSwitcher
            iso={monthIso}
            year={year}
            month0={month0}
            prevHref={prevHref}
            nextHref={nextHref}
          />
        </span>
        {unitToggle}
      </div>

      {/* เดสก์ท็อป: เดือนอยู่บนหัวหน้าอยู่แล้ว เหลือแค่ปุ่มหน่วย */}
      <div className="mb-4 hidden justify-end md:flex">{unitToggle}</div>

      {unit === 'baht' && (
        /* 🛑 แสดงเฉพาะโหมดบาท — โหมดจำนวนชิ้นไม่มีปัญหานี้ การขึ้นเตือนตลอดเวลาจะทำให้
           คำเตือนกลายเป็นของประดับที่ไม่มีใครอ่าน */
        <p className="text-default-700 bg-default-100 mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>{MONEY_MODE_CAVEAT}</span>
        </p>
      )}

      {truncated && (
        /* ตัวเลขบางส่วนที่หน้าตาเหมือนตัวเลขครบแล้ว อันตรายกว่าไม่มีตัวเลข */
        <p className="text-warning-ink bg-warning/15 mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>
            เดือนนี้มีรายการขายมากเกินกว่าที่รายงานจะรวมได้หมด ตัวเลขที่เห็นจึงไม่ใช่ยอดทั้งเดือน —
            ใช้ดูแนวโน้มได้ แต่อย่าใช้เทียบยอดรวม ติดต่อทีมงานเพื่อให้เราขยายให้
          </span>
        </p>
      )}

      {/**
        * 🛑 กราฟโผล่ **ทุกจอรวมมือถือ** แล้ว (user สั่ง 2026-08-30: "อยากให้มี chart ในหน้านี้เลย
        * เหมือน mobile command center")
        *
        * เหตุผลเดิมที่ไม่ใส่บนมือถือคือ "5 เส้น × 31 จุดบน 360px อ่านไม่ออก" — **ใช้ไม่ได้แล้ว**
        * เพราะเปลี่ยนจากกราฟเส้นเป็นแท่งซ้อนไปแล้ว แท่งไม่ตัดกันจึงอ่านออกที่ความกว้างนี้จริง
        * และ Command Center บนหน้าแรกก็แสดงแท่ง 31 อันบนมือถืออยู่แล้ว (height 168) เป็นหลักฐาน
        */}
      {/**
        * `-mx-4 md:mx-0` — **การ์ดกินเต็มความกว้างจอบนมือถือ** (user ทัก 2026-08-30:
        * "ใน Mobile เค้าน่าจะ full-width กันป่ะ" — ถูก และหน้านี้เป็นหน้าเดียวที่ไม่ได้ทำ)
        *
        * แบบแผนของโปรเจกต์อยู่แล้ว: `OrdersList.tsx:728` · `ProductsListing.tsx:263` ·
        * `CommandCenter.tsx:36` ใช้ `-mx-4` หักล้าง `padding-inline: 1rem` ของ shell เหมือนกันหมด
        *
        * 🛑 **ไม่ใช้คลาส marker `*-fullbleed` ของสองหน้านั้น** — marker นั้นพ่วง `margin-top: 0`
        * และ `footer { display: none }` มาด้วย ซึ่งเขาต้องการเพราะ `/orders` `/products`
        * **แทนที่หัวแอปด้วยหัวสติกกี้ของตัวเอง** (`SellerMobileHeader` คืน `null` ให้สองหน้านั้น)
        * หน้านี้ยังใช้หัวแอปปกติ ⇒ เอาผลข้างเคียงมาด้วยจะได้ระยะบนที่ผิด
        */}
      <div className="card mb-4 -mx-4 md:mx-0">
        <div className="card-header">
          <h4 className="card-title">แนวโน้มรายวัน</h4>
          {/* 🛑 "5 อันดับแรก" เฉย ๆ โกหกทันทีที่สลับเป็นบาท — อันดับยึดจำนวนชิ้นเสมอ
              (defaultSelectedKeys) ไม่ผันตามหน่วย จึงต้องบอกว่ายึดอะไร */}
          <span className="text-default-400 text-xs">
            {/* ต่ำกว่า lg ไม่มีช่องติ๊ก กราฟจึงล็อกที่ N อันดับแรก — ต้องบอกไว้ ไม่งั้นผู้ใช้
                จะหาวิธีเปลี่ยนเส้นแล้วไม่เจอ */}
            <span className="lg:hidden">แสดง {DEFAULT_CHART_SERIES} อันดับแรกตามจำนวนชิ้น</span>
            <span className="hidden lg:inline">
              {selected.size >= CHART_SERIES_CAP
                ? `เลือกแล้ว ${selected.size} จาก ${CHART_SERIES_CAP} รายการ — เอาออกก่อนจึงจะเลือกเพิ่มได้`
                : `เลือกแล้ว ${selected.size} จาก ${CHART_SERIES_CAP} รายการ — ติ๊กที่ตารางด้านล่าง`}
            </span>
          </span>
        </div>
        <div className="card-body">
          <ProductSalesChart
            series={chartSeries}
            unit={unit}
            futureFrom={futureFrom}
            days={days}
          />
          {/**
            * 🛑 `SALES_BASIS_NOTE` **ต้องมองเห็นได้เสมอ ห้ามซ่อนหลังปุ่ม** — คอมเมนต์ที่ตัว
            * ค่าคงที่เองเขียนไว้ว่า "ต้องโผล่ใต้กราฟเสมอ" เพราะระบบมีนิยาม "ยอดขาย" หลายชุด
            * ตัวเลขที่ไม่ตรงกับหน้าอื่นโดยไม่มีคำอธิบาย = ผู้ขายเลิกเชื่อทั้งหน้า (HR16)
            * ฉบับม็อกอัพเคยยุบไว้หลังปุ่ม `i` บนแถบติดบน — ถอดทิ้งแล้วด้วยเหตุผลนี้
            *
            * รายละเอียดยาวอยู่หลัง <details> (native ไม่ต้องมี state ไม่ต้องมี JS)
            */}
          <details className="group border-default-200 mt-3 border-t pt-3">
            <summary className="text-default-500 hover:text-default-700 flex min-h-11 cursor-pointer list-none items-center text-xs [&::-webkit-details-marker]:hidden">
              <span>
                {SALES_BASIS_NOTE}
                <span className="text-primary-ink ms-1 underline">ดูรายละเอียด</span>
              </span>
            </summary>
            <p className="text-default-400 mt-1 mb-0 text-xs">{SALES_BASIS_DETAIL}</p>
          </details>
        </div>
      </div>

      {/* ── ตาราง/รายการ ── */}
      <div className="card -mx-4 md:mx-0">
        <div className="card-header flex-nowrap">
          <h4 className="card-title min-w-0 truncate">
            รายสินค้า <span className="text-default-400 font-normal">({visibleRows.length})</span>
          </h4>

          {/**
            * มือถือ: ดรอปดาวน์เดียวคุมทั้ง "มุมมอง" และ "การเรียง"
            * 🛑 ของเดิมเป็นช่องติ๊กสองตัวที่ user ทักว่า "มันแปลกๆ" — ต้นเหตุคือ **ทำงาน
            * คนละทิศแต่แต่งตัวเหมือนกัน**: ตัวหนึ่งกรองให้แคบลง (35→3) อีกตัวเพิ่มของเข้ามา
            * (35→37) ⇒ ตัวที่ "เลือกมุมมอง" มาอยู่ในเมนูนี้ · ตัวที่ "เพิ่มของ" ไปเป็นสวิตช์
            * ท้ายรายการ ตรงจุดที่มันมีผลพอดี
            */}
          <span className="shrink-0 lg:hidden">
            <ListControlDropdown
              view={todayOnly ? 'TODAY' : 'ALL'}
              onViewChange={(v: ListView) => setTodayOnly(v === 'TODAY')}
              todayCount={isCurrentMonth ? todayCount : 0}
              sort={sort}
              onSortChange={setSort}
            />
          </span>

          {/* เดสก์ท็อป: ช่องติ๊กคู่เดิม ไม่แตะ — ตารางมีการเรียงในหัวคอลัมน์ของตัวเองอยู่แล้ว */}
          <span className="hidden shrink-0 items-center gap-x-4 lg:flex">
          {isCurrentMonth && todayCount > 0 && (
            <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="form-checkbox form-checkbox-light size-4.5"
                checked={todayOnly}
                onChange={(e) => setTodayOnly(e.target.checked)}
              />
              <span className="text-default-700">แสดงเฉพาะที่ขายวันนี้ ({todayCount})</span>
            </label>
          )}
          {zeroCount > 0 && (
            <label
              className={`flex min-h-11 shrink-0 items-center gap-2 text-sm ${
                todayOnly ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              }`}
              title={todayOnly ? 'ปิดใช้เพราะกำลังกรองเฉพาะที่ขายวันนี้อยู่' : undefined}>
              <input
                type="checkbox"
                className="form-checkbox form-checkbox-light size-4.5"
                checked={showZero && !todayOnly}
                disabled={todayOnly}
                onChange={(e) => setShowZero(e.target.checked)}
              />
              <span className="text-default-700">แสดงสินค้าที่ไม่มียอดขาย ({zeroCount})</span>
            </label>
          )}
          </span>
        </div>

        <div className="hidden lg:block">
          <ProductSalesTable
            rows={visibleRows}
            unit={unit}
            selected={selected}
            onToggle={toggle}
            atCap={selected.size >= CHART_SERIES_CAP}
            cap={CHART_SERIES_CAP}
            futureFrom={futureFrom}
            colorByKey={colorByKey}
            year={year}
            month0={month0}
            monthLabel={monthLabel}
          />
        </div>

        <div className="card-body lg:hidden">
          <ProductMobileList
            rows={mobileRows}
            unit={unit}
            futureFrom={futureFrom}
            colorByKey={colorByKey}
            monthLabel={monthLabel}
            onOpen={setOpenKey}
            incompleteNote={incompleteNote}
            zeroCount={zeroCount}
            showZero={showZero}
            onShowZeroChange={setShowZero}
            zeroDisabled={todayOnly}
          />
        </div>
      </div>

      <p className="text-default-400 mt-3 text-xs">
        นับจากคำสั่งซื้อ {orderCount.toLocaleString('th-TH')} ใบใน {monthLabel}
        <br />
        {freshnessNote}
      </p>

      {openRow && (
        <ProductDetailSheet
          row={openRow}
          unit={unit}
          onUnitChange={setUnit}
          futureFrom={futureFrom}
          days={days}
          year={year}
          month0={month0}
          monthLabel={monthLabel}
          onClose={() => setOpenKey(null)}
        />
      )}
    </>
  )
}
