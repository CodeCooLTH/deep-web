'use client'

/**
 * ProductSalesClient — ตัวประสานของหน้ารายงานยอดขายรายสินค้า (feature 00062)
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
  CHART_SERIES_CAP,
  MONEY_MODE_CAVEAT,
  SALES_BASIS_DETAIL,
  SALES_BASIS_NOTE,
} from '@/lib/product-sales-month'
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
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultSelectedKeys(rows, 5)),
  )

  const viewRows = useMemo(
    () => buildViewRows(rows, days, refDayIndex, isCurrentMonth),
    [rows, days, refDayIndex, isCurrentMonth],
  )

  const soldRows = useMemo(() => viewRows.filter((r) => r.saleEvents > 0), [viewRows])
  const visibleRows = showZero ? viewRows : soldRows

  const chartSeries: ChartSeries[] = useMemo(
    () =>
      viewRows
        .filter((r) => selected.has(r.key))
        .map((r) => ({ key: r.key, name: r.name, data: rowSeries(r, unit) })),
    [viewRows, selected, unit],
  )

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

      {/* ── กราฟ: ตั้งแต่ 768px ขึ้นไป ── */}
      <div className="card mb-4 hidden md:block">
        <div className="card-header">
          <h4 className="card-title">แนวโน้มรายวัน</h4>
          {/* 🛑 "5 อันดับแรก" เฉย ๆ โกหกทันทีที่สลับเป็นบาท — อันดับยึดจำนวนชิ้นเสมอ
              (defaultSelectedKeys) ไม่ผันตามหน่วย จึงต้องบอกว่ายึดอะไร */}
          <span className="text-default-400 text-xs">
            <span className="lg:hidden">แสดง 5 อันดับแรกตามจำนวนชิ้น</span>
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
        <div className="card-header flex-nowrap">
          <h4 className="card-title min-w-0 truncate">
            รายสินค้า{' '}
            <span className="text-default-400 font-normal">({visibleRows.length})</span>
          </h4>
          {/* min-h-11 — ตัวควบคุมอื่นบนหน้านี้มีครบทุกตัว ตัวนี้เดิมสูง ~20px ทั้งที่เรนเดอร์ทุก breakpoint */}
          {zeroCount > 0 && (
            <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="form-checkbox form-checkbox-light size-4.5"
                checked={showZero}
                onChange={(e) => setShowZero(e.target.checked)}
              />
              <span className="text-default-700">
                แสดงสินค้าที่ไม่มียอดขาย ({zeroCount})
              </span>
            </label>
          )}
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
