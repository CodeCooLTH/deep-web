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
 *   <768   : รายการสินค้า + แถบรายวัน · ไม่มีกราฟ (5 เส้น × 31 จุดบน 360px อ่านไม่ออก)
 *   768-1023: **มีกราฟ** (อ่านออกสบายที่ความกว้างนี้) + รายการสินค้า — ยังไม่มีช่องติ๊ก
 *             กราฟจึงแสดง Top 5 ตายตัว มีคำกำกับบอกไว้
 *   ≥1024  : กราฟ + ตารางเต็มพร้อมช่องติ๊ก (ตาราง 6 คอลัมน์ต้องการความกว้างระดับนี้ —
 *            แพตเทิร์นเดียวกับ `ProductsListing.tsx` ที่ตัดที่ lg ด้วยเหตุผลเดียวกัน)
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
} from '@/lib/product-sales-month'
import { getColor } from '@/utils/helpers'
import type { ProductSalesRow } from '@/services/product-sales-series.service'
import ProductDetailSheet from './ProductDetailSheet'
import ProductMobileList from './ProductMobileList'
import ProductSalesChart, { type ChartSeries } from './ProductSalesChart'
import ProductSalesTable from './ProductSalesTable'
import {
  UNIT_LABELS,
  buildViewRows,
  defaultSelectedKeys,
  rowSeries,
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

  return (
    <>
      {/* แถบควบคุม — จงใจไม่ห่อ .card เพื่อไม่ให้เกิดการ์ดซ้อนการ์ด (anti-slop) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/**
          * 🛑 ฉบับแรกยัดนิยามทั้งก้อน (164 อักษร) ไว้เป็น text-xs สีเทาอ่อน = ของประดับที่สายตา
          * ข้าม ทั้งที่มันคือประโยคที่ห้ามพลาดตาม HR16 — ย่อเหลือบรรทัดที่อ่านจบ แล้วเก็บ
          * รายละเอียดไว้หลัง <details> (native ไม่ต้องมี state ไม่ต้องมี JS)
          */}
        <details className="group min-w-0 max-w-xl">
          <summary className="text-default-500 hover:text-default-700 cursor-pointer list-none text-xs">
            {SALES_BASIS_NOTE}
            <span className="text-primary-ink ms-1 underline">ดูรายละเอียด</span>
          </summary>
          <p className="text-default-400 mt-1 mb-0 text-xs">{SALES_BASIS_DETAIL}</p>
        </details>
        <div className="inline-flex shrink-0" role="group" aria-label="หน่วยที่แสดง">
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
        </div>
      </div>

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
      <div className="card mb-4">
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
        </div>
      </div>

      {/* ── ตาราง/รายการ ── */}
      <div className="card">
        {/* 🛑 ตอนนี้มีสวิตช์ 2 ตัว — บังคับ nowrap ต่อไปจะล้นขอบที่ 320px แน่นอน
            (ชื่อการ์ด + "แสดงเฉพาะที่ขายวันนี้ (5)" ~188px + "แสดงสินค้าที่ไม่มียอดขาย (12)" ~236px)
            ให้กลุ่มสวิตช์ตกลงมาเป็นบรรทัดของตัวเองบนจอแคบแทน แล้วค่อย nowrap ตั้งแต่ sm ขึ้นไป
            (docs/conventions/flex-header-truncation.md — ต้องกางเลขงบพื้นที่ก่อนเลือกทางแก้) */}
        <div className="card-header flex-wrap sm:flex-nowrap">
          <h4 className="card-title min-w-0 truncate">
            รายสินค้า{' '}
            <span className="text-default-400 font-normal">({visibleRows.length})</span>
          </h4>
          <span className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 sm:w-auto sm:shrink-0 sm:flex-nowrap">
          {/* ตัวกรองวันนี้ — โผล่เฉพาะเดือนปัจจุบัน เดือนอื่นไม่มี "วันนี้" ให้พูดถึง
              ⇒ ซ่อนทั้งตัว ไม่ใช่ disable+อธิบาย (คนละสถานะกับปุ่ม ‹ › ที่ชนขอบ) */}
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
          {/* min-h-11 — ตัวควบคุมอื่นบนหน้านี้มีครบทุกตัว ตัวนี้เดิมสูง ~20px ทั้งที่เรนเดอร์ทุก breakpoint */}
          {zeroCount > 0 && (
            <label
              className={`flex min-h-11 shrink-0 items-center gap-2 text-sm ${
                todayOnly ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              }`}
              title={todayOnly ? 'ปิดใช้เพราะกำลังกรองเฉพาะที่ขายวันนี้อยู่' : undefined}>
              {/* สินค้าที่ขายวันนี้ย่อมมียอดเดือนนี้มากกว่า 0 เสมอ ⇒ สวิตช์นี้ไม่มีผลอะไรเลย
                  ขณะกรองวันนี้ · ปิดไปดีกว่าปล่อยให้กดได้แล้วไม่เกิดอะไรขึ้น */}
              <input
                type="checkbox"
                className="form-checkbox form-checkbox-light size-4.5"
                checked={showZero && !todayOnly}
                disabled={todayOnly}
                onChange={(e) => setShowZero(e.target.checked)}
              />
              <span className="text-default-700">
                แสดงสินค้าที่ไม่มียอดขาย ({zeroCount})
              </span>
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
            rows={visibleRows}
            unit={unit}
            futureFrom={futureFrom}
            colorByKey={colorByKey}
            monthLabel={monthLabel}
            onOpen={setOpenKey}
          />
        </div>
      </div>

      <p className="text-default-400 mt-3 text-xs">
        นับจากคำสั่งซื้อ {orderCount.toLocaleString('th-TH')} ใบใน {monthLabel}
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
