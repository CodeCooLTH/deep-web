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
import ProductThumb from './ProductThumb'
import { rowSeries, rowTotal, runoutLabel, type ProductSalesViewRow, type SalesUnit } from './data'

type Props = {
  rows: ProductSalesViewRow[]
  unit: SalesUnit
  futureFrom: number | null
  /**
   * สีวงแหวนรอบรูป — คีย์คือ `row.key` ค่าคือสีเดียวกับเส้นบนกราฟ (คำนวณที่ ProductSalesClient
   * ที่เดียว) · แถวที่ไม่ได้อยู่บนกราฟจะไม่มีในแมพ = ขอบเทาเดิม
   */
  colorByKey: Map<string, string>
  monthLabel: string
  onOpen: (key: string) => void
}

export default function ProductMobileList({
  rows,
  unit,
  futureFrom,
  colorByKey,
  monthLabel,
  onOpen,
}: Props) {
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
      {rows.map((r) => {
        // โชว์ป้ายสต็อกเฉพาะตอนใกล้หมดจริง — ถ้าโชว์ทุกกรณี ร้านที่ไม่ได้เปิดนับสต็อก
        // (ซึ่งเป็นส่วนใหญ่) จะได้ป้ายเหมือนกันทุกแถว = ค่าคงที่ซ้ำ แบบเดียวกับที่เพิ่งตัดออก
        const lowStock = r.runout.kind === 'OK' && r.runout.low
        return (
        <li key={r.key}>
          <button
            type="button"
            onClick={() => onOpen(r.key)}
            // min-h-11 ไม่จำเป็นเพราะเนื้อในสูงเกิน 44px อยู่แล้ว แต่ใส่ไว้กันเคสชื่อสั้นสุด
            className="hover:bg-default-100 flex w-full min-h-11 items-start gap-3 px-1 py-3 text-start">
            <ProductThumb
              src={r.image}
              alt={r.name}
              isCustom={r.isCustom}
              sizeClass="size-11"
              ringColor={colorByKey.get(r.key)}
            />

            <span className="min-w-0 flex-1">
              <span className="flex items-start justify-between gap-2">
                {/* 🛑 2 บรรทัด ไม่ใช่ truncate — ชื่อสินค้าของร้านนี้คล้ายกันมากและต่างกันที่
                    "หาง" ของชื่อ ("...สีแดง" / "...สีดำ" / "...สีเหลือง") การตัดบรรทัดเดียว
                    จึงตัดคำที่ใช้แยกแยะทิ้งพอดี ⇒ ทุกแถวดูเหมือนกันหมด (user: "ดูยาก")
                    ท่าเดียวกับ ProductCard.tsx ที่หน้าสินค้าใช้อยู่แล้ว */}
                <span className="text-default-900 line-clamp-2 text-sm font-medium">{r.name}</span>
                <span className="text-default-900 shrink-0 text-sm font-semibold tabular-nums">
                  {unit === 'baht'
                    ? formatBaht(rowTotal(r, 'baht'))
                    : `${formatNumberNoSymbol(r.totalQty)} ชิ้น`}
                </span>
              </span>

              {/* บรรทัดรอง — ราคาซ้าย สัดส่วนขวา · คำต้องตรงกับตารางเดสก์ท็อปเป๊ะ (HR16) */}
              {(r.price !== null || r.sharePct !== null) && (
                <span className="text-default-400 mt-0.5 flex items-baseline justify-between gap-2 text-xs">
                  <span>{r.price !== null ? `${formatBaht(r.price)}/ชิ้น` : ''}</span>
                  <span className="shrink-0 tabular-nums">
                    {r.sharePct !== null ? `${r.sharePct}% ของร้าน` : ''}
                  </span>
                </span>
              )}

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

              {/**
                * 🛑 มือถือโชว์ป้าย **เฉพาะตัวที่ต้องไปดูต่อ** — ต่างจากเดสก์ท็อปที่โชว์ครบ 3 แบบ
                * "ขายสม่ำเสมอ"/"ขายกระจุก" เป็นคำ *บรรยายรูปร่าง* ซึ่งซ้ำแทบทุกแถวในร้านจริง
                * (ภาพหน้าจอ prod: 5 แถวติดกันเป็น "ขายสม่ำเสมอ" หมด) ⇒ กินความสูงทุกแถวโดย
                * ไม่ช่วยแยกแยะอะไรเลย = ของตกแต่ง ไม่ใช่สัญญาณ
                * เดสก์ท็อปคงครบเพราะมีคอลัมน์ของตัวเอง ไม่ได้แย่งความสูงกับใคร
                * (viewport-adaptive โดยตั้งใจ ไม่ใช่ความไม่สอดคล้อง)
                */}
              {(r.pattern.kind === 'DORMANT' || lowStock || (!r.isActive && !r.isCustom)) && (
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  {r.pattern.kind === 'DORMANT' && <PatternBadge pattern={r.pattern} />}
                  {lowStock && (
                    <span className="badge bg-warning/15 text-warning-ink inline-flex items-center gap-1">
                      <Icon icon="alert-triangle" className="size-3.5 shrink-0" aria-hidden="true" />
                      {runoutLabel(r.runout)}
                    </span>
                  )}
                  {!r.isActive && !r.isCustom && (
                    <span className="badge bg-default-100 text-default-500">ปิดการขาย</span>
                  )}
                </span>
              )}
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
        )
      })}
    </ul>
  )
}

