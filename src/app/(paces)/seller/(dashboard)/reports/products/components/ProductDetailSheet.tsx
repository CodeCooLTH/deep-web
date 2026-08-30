'use client'

/**
 * ProductDetailSheet — ชีตเต็มจอแสดงกราฟของสินค้าตัวเดียว (feature 00063, มือถือ <768)
 *
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductsListing.tsx (filter modal:
 *   `fixed inset-0 z-50 flex flex-col bg-card` + header ย้อนกลับ/ชื่อ + `overflow-auto overscroll-contain`)
 *
 * 🛑 ต้องเรียก `useLockBodyScroll` — overlay ที่ประกอบเองด้วย React state ไม่ได้การล็อก scroll
 * ฟรีแบบที่ Preline ให้ (docs/conventions/overlay-scroll-lock.md) และ **ห้ามเรียกคู่กับ overlay
 * ที่ล็อกเองอยู่แล้ว** — ชีตนี้ประกอบเอง 100% ไม่มี MUI/Preline อยู่ข้างใน จึงมีเจ้าของเดียว
 */
import Link from 'next/link'
import { useEffect, useRef } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import { formatDayMonthTH } from '@/lib/format-date'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { CUSTOM_ITEM_NOTE, salesPatternDescription, salesPatternLabel } from '@/lib/product-sales-month'
import ProductSalesChart from './ProductSalesChart'
import PatternBadge from './PatternBadge'
import {
  UNIT_LABELS,
  rowSeries,
  rowTotal,
  runoutLabel,
  type ProductSalesViewRow,
  type SalesUnit,
} from './data'

type Props = {
  row: ProductSalesViewRow
  unit: SalesUnit
  onUnitChange: (u: SalesUnit) => void
  futureFrom: number | null
  days: number
  year: number
  month0: number
  monthLabel: string
  onClose: () => void
}

export default function ProductDetailSheet({
  row,
  unit,
  onUnitChange,
  futureFrom,
  days,
  year,
  month0,
  monthLabel,
  onClose,
}: Props) {
  useLockBodyScroll(true)


  /**
   * ปุ่มย้อนกลับของเครื่องต้อง "ปิดชีต" ไม่ใช่ "ออกจากหน้ารายงาน" — ดันสถานะหลอกเข้า history
   * ตอนเปิด แล้วปิดเมื่อ popstate
   *
   * 🛑 `pushedRef` กันการดัน state ซ้ำเมื่อ component re-render — ถ้าดันซ้ำ ผู้ใช้ต้องกดย้อนกลับ
   * สองครั้งกว่าชีตจะปิด ซึ่งอ่านเป็นปุ่มย้อนกลับเสีย
   */
  const panelRef = useRef<HTMLDivElement>(null)
  const pushedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!pushedRef.current) {
      window.history.pushState({ deepProductSheet: true }, '')
      pushedRef.current = true
    }
    const onPop = () => {
      pushedRef.current = false
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /** ปิดด้วยปุ่มบนจอ = ถอย history ที่เราดันไว้ เพื่อไม่ให้เหลือ entry ค้าง */
  const close = () => {
    if (pushedRef.current) {
      // popstate handler จะเรียก onClose ให้เอง
      window.history.back()
      return
    }
    onClose()
  }

  /**
   * 🛑 `aria-modal="true"` บังคับเฉพาะเคอร์เซอร์เสมือนของ screen reader **ไม่ใช่โฟกัสของ DOM**
   * ⇒ ถ้าไม่มีกับดัก โฟกัสยังค้างที่ปุ่มแถวซึ่งตอนนี้อยู่ใต้ `fixed inset-0` และกด Tab จะเดิน
   * เข้าเมนูข้างที่ `aria-modal` เพิ่งบอก screen reader ว่าไม่มีอยู่ — คือประกาศแล้วไม่ทำตาม
   * `useDialogFocus` ถูกเขียนไว้เพื่อการนี้โดยตรง (2026-08-26) และหัวไฟล์ของมันสั่งเองว่า
   * ผู้เรียกรายถัดไปให้ใช้ตัวนี้ ไม่ใช่เขียน effect ใหม่ — ได้ Escape + คืนโฟกัสตอนปิดมาด้วย
   *
   * ต้องอยู่ **หลัง** การประกาศ `close` เพราะ `const` ไม่ถูก hoist
   */
  useDialogFocus(true, panelRef, close)

  const series = rowSeries(row, unit)
  const patternLabel = salesPatternLabel(row.pattern)

  return (
    <div
      ref={panelRef}
      className="bg-card fixed inset-0 z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`แนวโน้มการขายของ ${row.name}`}>
      <header className="border-default-200 flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <button
          type="button"
          onClick={close}
          aria-label="ปิด"
          className="btn btn-icon text-default-700 hover:bg-default-100 min-h-11 min-w-11 shrink-0">
          <Icon icon="arrow-left" className="text-base rtl:rotate-180" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-default-900 mb-0 max-w-full truncate text-sm font-semibold">
            {row.name}
          </p>
          <p className="text-default-400 mb-0 text-xs">{monthLabel}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        {row.isCustom && (
          <p className="text-default-700 bg-default-100 mb-4 rounded-lg px-3 py-2 text-xs">
            {CUSTOM_ITEM_NOTE}
          </p>
        )}

        {/* สลับหน่วยได้จากในชีตด้วย — ผู้ใช้ที่เข้ามาถึงตรงนี้แล้วไม่ควรต้องถอยออกไปกดข้างนอก */}
        <div className="mb-4 inline-flex" role="group" aria-label="หน่วยที่แสดง">
          {(['qty', 'baht'] as const).map((u, i) => (
            <button
              key={u}
              type="button"
              onClick={() => onUnitChange(u)}
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

        <ProductSalesChart
          series={[{ key: row.key, name: row.name, data: series, image: row.image }]}
          unit={unit}
          futureFrom={futureFrom}
          days={days}
          height={260}
          compact
        />

        <dl className="border-default-200 mt-4 grid grid-cols-2 gap-3 border-t pt-4">
          <Stat
            label={unit === 'baht' ? 'ยอดขายทั้งเดือน' : 'จำนวนที่ขายทั้งเดือน'}
            value={
              unit === 'baht'
                ? formatBaht(rowTotal(row, 'baht'))
                : `${formatNumberNoSymbol(row.totalQty)} ชิ้น`
            }
          />
          <Stat
            label="ขายล่าสุด"
            value={
              row.lastSoldDayIndex === null
                ? '—'
                : formatDayMonthTH(new Date(Date.UTC(year, month0, row.lastSoldDayIndex + 1)))
            }
          />
          <Stat label="จำนวนครั้งที่ขายได้" value={`${formatNumberNoSymbol(row.saleEvents)} ครั้ง`} />
          {/* รวม "กี่วัน" กับ "ดีสุดวันไหน" เป็นช่องเดียว ใช้คำเดียวกับคอลัมน์ของตาราง (HR16) */}
          <Stat
            label="ขายวันไหน"
            value={
              row.best
                ? `${formatNumberNoSymbol(row.activeDays)} วัน · ดีสุด ${formatDayMonthTH(
                    new Date(Date.UTC(year, month0, row.best.index + 1)),
                  )} (${formatNumberNoSymbol(row.best.value)})`
                : 'ไม่มียอดขาย'
            }
          />
          {row.sharePct !== null && (
            <Stat label="สัดส่วนของยอดร้าน" value={`${row.sharePct}%`} />
          )}
          {row.price !== null && <Stat label="ราคาต่อชิ้น" value={formatBaht(row.price)} />}
        </dl>

        {/* บล็อกสต็อก — ประโยคเดียวจาก SSOT อธิบายตัวเองอยู่แล้ว ไม่ต้องมี label แยก */}
        {runoutLabel(row.runout) && (
          <p
            className={`mt-4 rounded-lg px-3 py-2 text-sm ${
              row.runout.kind === 'OK' && row.runout.low
                ? 'bg-warning/15 text-warning-ink'
                : 'bg-default-100 text-default-700'
            }`}>
            {runoutLabel(row.runout)}
          </p>
        )}

        {patternLabel && (
          <div className="border-default-200 mt-4 border-t pt-4">
            <PatternBadge pattern={row.pattern} />
            <p className="text-default-500 mt-2 mb-0 text-xs">
              {salesPatternDescription(row.pattern)}
            </p>
          </div>
        )}

        {!row.isCustom && (
          <Link
            href={`/products/${row.key}`}
            className="btn bg-primary hover:bg-primary-hover mt-5 flex w-full min-h-11 items-center justify-center gap-2 text-white">
            <Icon icon="external-link" className="text-base" aria-hidden="true" />
            ดูหน้าสินค้า
          </Link>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-default-400 text-xs">{label}</dt>
      <dd className="text-default-900 mb-0 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
