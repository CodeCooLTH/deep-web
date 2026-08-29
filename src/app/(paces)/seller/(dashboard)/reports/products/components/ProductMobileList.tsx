'use client'

/**
 * ProductMobileList — รายการสินค้าบนมือถือ (<768) ของรายงานยอดขายรายสินค้า (feature 00063)
 *
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductCard.tsx
 *   (การ์ดแยกใบ + รูป/fallback + ลำดับชั้นข้อความ) และ orders/components/OrderCard.tsx (แถวกดได้)
 *
 * 🛑 **ไม่มีกราฟรวมบนมือถือ** — 5 เส้น × 31 จุดบนความกว้าง 360px ได้ ~11px ต่อจุด อ่านไม่ออกจริง
 * ไม่ว่าจะปรับอย่างไร แถวละแถบ 31 ช่องอ่านออกกว่าและตอบคำถาม "ขายวันไหน" ตรงกว่า
 *
 * 🛑 ทั้งแถวเป็น `<button>` เปิดชีต **ไม่ใช่ลิงก์ไปหน้าสินค้า** (ต่างจาก ProductCard ที่ทั้งใบ
 * ลิงก์ไปหน้าสินค้า) เพราะงานหลักของหน้านี้บนมือถือคือ "ดูแนวโน้ม" ไม่ใช่ "จัดการสินค้า" —
 * ทางไปหน้าสินค้าอยู่ในชีตอีกที
 */
import Icon from '@/components/wrappers/Icon'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { CUSTOM_ITEM_NOTE } from '@/lib/product-sales-month'
import DayStrip from './DayStrip'
import PatternBadge from './PatternBadge'
import { rowSeries, rowTotal, type ProductSalesViewRow, type SalesUnit } from './data'

type Props = {
  rows: ProductSalesViewRow[]
  unit: SalesUnit
  futureFrom: number | null
  monthLabel: string
  onOpen: (key: string) => void
}

export default function ProductMobileList({ rows, unit, futureFrom, monthLabel, onOpen }: Props) {
  const fmtValue = (v: number) => (unit === 'baht' ? formatBaht(v) : `${formatNumberNoSymbol(v)} ชิ้น`)

  if (rows.length === 0) {
    return (
      <p className="text-default-400 py-10 text-center text-sm">
        ไม่มีสินค้าที่มียอดขายในเดือนนี้
      </p>
    )
  }

  return (
    <ul className="divide-default-200 divide-y">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={() => onOpen(r.key)}
            // min-h-11 ไม่จำเป็นเพราะเนื้อในสูงเกิน 44px อยู่แล้ว แต่ใส่ไว้กันเคสชื่อสั้นสุด
            className="hover:bg-default-100 flex w-full min-h-11 items-start gap-3 px-1 py-3 text-start">
            <Thumb src={r.image} alt={r.name} isCustom={r.isCustom} />

            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-default-900 max-w-full truncate text-sm font-medium">
                  {r.name}
                </span>
                <span className="text-default-900 shrink-0 text-sm font-semibold tabular-nums">
                  {unit === 'baht'
                    ? formatBaht(rowTotal(r, 'baht'))
                    : `${formatNumberNoSymbol(r.totalQty)} ชิ้น`}
                </span>
              </span>

              {/* คำอธิบายของแถวรวมต้องมาถึงมือถือด้วย — เดิมอยู่ใน title= ที่นิ้วแตะไม่ได้ */}
              {r.isCustom && (
                <span className="text-default-400 mt-0.5 block text-xs">{CUSTOM_ITEM_NOTE}</span>
              )}

              <DayStrip
                values={rowSeries(r, unit)}
                futureFrom={futureFrom}
                formatValue={fmtValue}
                monthLabel={monthLabel}
                className="mt-2"
              />

              <span className="mt-2 flex items-center gap-2">
                <PatternBadge pattern={r.pattern} />
                {!r.isActive && !r.isCustom && (
                  <span className="badge bg-default-100 text-default-500">ปิดการขาย</span>
                )}
              </span>
            </span>

            <Icon
              icon="chevron-right"
              /* text-default-300 = 1.22:1 บนขาว — ต่ำเกินกว่าจะเป็นตัวบอกว่าแถวนี้กดได้
                 (default-400 = 4.95:1) */
              className="text-default-400 mt-1 shrink-0 text-base rtl:rotate-180"
              aria-hidden="true"
            />
          </button>
        </li>
      ))}
    </ul>
  )
}

function Thumb({ src, alt, isCustom }: { src: string | null; alt: string; isCustom: boolean }) {
  if (isCustom || !src) {
    return (
      <span className="border-default-200 bg-default-100 text-default-400 flex size-11 shrink-0 items-center justify-center rounded-lg border">
        <Icon icon={isCustom ? 'pencil' : 'package'} className="text-base" aria-hidden="true" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="border-default-200 bg-default-100 size-11 shrink-0 rounded-lg border object-cover"
    />
  )
}
