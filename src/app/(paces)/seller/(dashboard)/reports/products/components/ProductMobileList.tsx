'use client'

/**
 * ProductMobileList — รายการสินค้าบนมือถือ (<768) ของรายงานยอดขายรายสินค้า (feature 00063)
 *
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductCard.tsx
 *   (การ์ดแยกใบ + รูป/fallback + ลำดับชั้นข้อความ) และ orders/components/OrderCard.tsx (แถวกดได้)
 *
 * 🛑 **แต่ละแถวไม่มีแถบ 31 ช่องแล้ว** (user สั่ง 2026-08-30: "ตัด chart ยาวๆ ในแต่ละ card ออก
 * หาข้อมูลอื่นที่น่าสนใจมาแทน") — แทนด้วย `MonthThirdsBar` (ต้น/กลาง/ปลายเดือน) ซึ่งตอบ
 * คำถามเดียวกันด้วยหมึก 1/10 · แถบ 31 ช่องยังอยู่ที่ตารางเดสก์ท็อปและในชีตรายละเอียด
 * เหตุผลเชิงตัวเลข: บนมือถือแถบเดิมได้ช่องละ ~5.4px ที่ 360px (~4.3px ที่ 320px) ซึ่ง
 * อ่านไม่ออกอยู่แล้ว — ไม่ได้เสียความสามารถไป แค่ย้ายไปตอบในที่ที่มีพื้นที่พอ
 *
 * 🛑 ทั้งแถวเป็น `<button>` เปิดชีต **ไม่ใช่ลิงก์ไปหน้าสินค้า** (ต่างจาก ProductCard ที่ทั้งใบ
 * ลิงก์ไปหน้าสินค้า) เพราะงานหลักของหน้านี้บนมือถือคือ "ดูแนวโน้ม" ไม่ใช่ "จัดการสินค้า" —
 * ทางไปหน้าสินค้าอยู่ในชีตอีกที
 */
import Icon from '@/components/wrappers/Icon'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { CUSTOM_ITEM_NOTE } from '@/lib/product-sales-month'
import MonthThirdsBar from './MonthThirdsBar'
import PatternBadge from './PatternBadge'
import ProductThumb from './ProductThumb'
import { rowTotal, runoutLabel, type ProductSalesViewRow, type SalesUnit } from './data'

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
  /**
   * ประโยคเตือนว่าเดือนยังไม่จบ — โผล่ **ครั้งเดียวเหนือรายการ ไม่ใช่ทุกแถว**
   * เพราะมันเป็นคุณสมบัติของ *เดือน* ไม่ใช่ของสินค้า (ถ้าใส่ทุกแถวจะซ้ำ 35 รอบ ซึ่งเป็น
   * ปัญหาเดียวกับป้ายวันที่ใต้แถบเดิมที่เพิ่งตัดออกไป)
   */
  incompleteNote: string | null
  /** สวิตช์ท้ายรายการ — ย้ายลงมาจากหัวการ์ด (ดู ListControlDropdown ว่าทำไม) */
  zeroCount: number
  showZero: boolean
  onShowZeroChange: (v: boolean) => void
  /** true = กำลังกรอง "ขายวันนี้" ⇒ สวิตช์ไม่มีผล เพราะของที่ขายวันนี้ย่อมมียอดเดือนนี้ > 0 */
  zeroDisabled: boolean
}

export default function ProductMobileList({
  rows,
  unit,
  futureFrom,
  colorByKey,
  monthLabel,
  onOpen,
  incompleteNote,
  zeroCount,
  showZero,
  onShowZeroChange,
  zeroDisabled,
}: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-default-400 py-10 text-center text-sm">
        ไม่มีสินค้าที่มียอดขายในเดือนนี้
      </p>
    )
  }

  return (
    <>
      {incompleteNote && (
        <p className="text-default-400 mb-2 text-xs">{incompleteNote}</p>
      )}
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

              {/* 🛑 นับตามจำนวนชิ้นเสมอ ไม่ผันตามหน่วย — "ขายช่วงไหน" เป็นเรื่องจังหวะการขาย
                  ไม่ใช่มูลค่า สลับไปโหมดบาทแล้วรูปทรงของเดือนไม่ควรเปลี่ยน (เหตุผลเดียวกับ `best`) */}
              <MonthThirdsBar thirds={r.thirds} unitWord="ชิ้น" className="mt-2" />

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
      {zeroCount > 0 && (
        /**
         * สวิตช์อยู่ **ท้ายรายการ** ไม่ใช่หัวการ์ด — มันคือ "เพิ่มของเข้ามา" ผลของมันจึงอยู่
         * ตรงนี้พอดี (ของที่เพิ่มเข้ามาต่อท้าย) และแยกร่างจากตัวที่ "กรองให้แคบลง" ซึ่งอยู่ใน
         * ดรอปดาวน์บนหัว ⇒ อ่านสลับกันไม่ได้อีก (user: ของเดิม "มันแปลกๆ")
         */
        <label
          className={`border-default-200 mt-2 flex min-h-11 items-center justify-between gap-3 border-t pt-3 text-sm ${
            zeroDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          }`}
          title={zeroDisabled ? 'ปิดใช้เพราะกำลังกรองเฉพาะที่ขายวันนี้อยู่' : undefined}>
          <span className="text-default-700">รวมสินค้าที่ยังไม่ขายเดือนนี้ ({zeroCount})</span>
          <input
            type="checkbox"
            className="form-checkbox form-checkbox-light size-4.5 shrink-0"
            checked={showZero && !zeroDisabled}
            disabled={zeroDisabled}
            onChange={(e) => onShowZeroChange(e.target.checked)}
          />
        </label>
      )}
    </>
  )
}

