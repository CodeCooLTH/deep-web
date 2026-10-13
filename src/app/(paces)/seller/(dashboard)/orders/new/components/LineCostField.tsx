'use client'

/**
 * LineCostField — ช่อง "ราคาทุน" ของสินค้า 1 บรรทัดในบิล (FR-EXP-17)
 *
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductCostCardV2.tsx
 *   (label "ราคาทุน", input-group ฿, badge กำไร bg-{semantic}/15 text-{semantic}-ink —
 *   ย่อจาก text-sm ของการ์ดเต็มเหลือ text-2xs ให้พอดีแถวในตะกร้า สัดส่วน/ลำดับสีเหมือนเดิม)
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/CartLineItem.tsx
 *   (.input-group + .input-group-text ของช่องราคาต่อหน่วยที่อยู่ในแถวเดียวกัน)
 *
 * ทำไมเป็นบรรทัดที่ 3 ในคอลัมน์ชื่อ ไม่ใช่คอลัมน์ใหม่ (ux Design Spec — กางเลขจริง):
 * ที่ 1024px ซึ่งเป็นจุดที่ layout ตะกร้าเริ่มทำงาน คอลัมน์คงที่ของแถวกินไปแล้ว ~364px
 * แต่พื้นที่จริงของแถวมีแค่ ~337.5px (1024 − sidenav 245 − gutter 40 → ครึ่งซ้าย/ขวา − padding)
 * — **ตะกร้าล้นอยู่ก่อนงานนี้แล้ว** คอลัมน์ที่ 5 จึงเป็นไปไม่ได้ ต้องอยู่ในพื้นที่ยืดหด
 * (คอลัมน์ชื่อ) ซึ่งเป็นที่เดียวกับที่ช่อง "รายละเอียด" อยู่และไม่เคยชนงบ
 *
 * ทำไมยุบเป็นลิงก์เป็นค่าตั้งต้น: ช่องนี้ optional และคนส่วนใหญ่ข้าม (หลักฐาน: 95/95 รายการ
 * บน prod ไม่มีต้นทุนเลย) — กางช่องเต็มทุกแถวจะเพิ่มความสูง × จำนวนรายการ ให้กับของที่
 * ไม่มีใครใช้ · แพตเทิร์น "ลิงก์ → เปิดช่อง" มีอยู่แล้วในไฟล์นี้ (ลิงก์ "แก้ราคา" บนมือถือ)
 */

import { useState } from 'react'
import { useController } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import { productMargin } from '@/lib/order-profit'
import QuickPriceSheet from './QuickPriceSheet'

type Props = {
  /** ต้นทุนของบรรทัดนี้ — null = ยังไม่กรอก (ต่างจาก 0 ที่แปลว่าไม่มีต้นทุนจริง)
   *  string = ทศนิยมที่ยังพิมพ์ไม่จบ ("12.") ค้างระหว่างพิมพ์ แปลงกลับเป็น number ตอน blur */
  cost: number | string | null
  /** ราคาขายของบรรทัดนี้ — ใช้คำนวณ % กำไร */
  price: number
  onChange: (v: number | string | null) => void
  /** true = สินค้าจากแคตตาล็อกที่รู้แน่ว่ายังไม่เคยตั้งต้นทุน (คำต่างจากรายการพิมพ์เอง) */
  knownMissing?: boolean
  /** ชื่อสินค้า — แสดงใต้หัวชีตแก้ต้นทุน */
  name?: string
}

export default function LineCostField({ cost, price, onChange, knownMissing, name }: Props) {
  // ต้นทุนไม่ใช่ช่องกรอกในบรรทัดแล้ว — แสดงเป็นข้อความ แตะเองถึงเปิดชีตแก้ (user 2026-10-13)
  // เดิมสินค้าที่มีต้นทุนติดมาทำให้ช่อง input กางเองทุกครั้งที่เลือกสินค้า: แย่งโฟกัส + ดันแถวสูงขึ้น
  const [sheetOpen, setSheetOpen] = useState(false)
  const costNum = cost == null ? null : Number(cost)

  return (
    <>
      {/* py-1.5 -my-1 = ขยายพื้นที่กดให้ผ่านเกณฑ์สัมผัสโดยไม่ดันความสูงของแถว
          (ตัวอักษร 11px เล็กเกินกว่าจะใช้ขนาดตัวเองเป็น hit-area) */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="text-default-400 hover:text-primary -my-1 inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 py-1.5 text-left text-2xs"
      >
        <Icon icon="calculator" className="size-3.5 shrink-0" aria-hidden="true" />
        {costNum == null ? (
          knownMissing ? 'ยังไม่ตั้งต้นทุน' : 'ตั้งต้นทุน'
        ) : (
          <>
            <span className="text-default-600 tabular-nums">ต้นทุน ฿{costNum.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</span>
            <MarginBadge price={price} cost={costNum} />
            <Icon icon="pencil" className="size-3.5 shrink-0" aria-hidden="true" />
          </>
        )}
      </button>

      <QuickPriceSheet
        open={sheetOpen}
        price={costNum}
        name={name}
        title="ต้นทุน"
        inputLabel="ราคาทุนต่อชิ้น"
        preview={(v) => <MarginBadge price={price} cost={v} />}
        onApply={(v) => {
          onChange(v)
          setSheetOpen(false)
        }}
        onClear={() => {
          onChange(null)
          setSheetOpen(false)
        }}
        onClose={() => setSheetOpen(false)}
      />
    </>
  )
}

/** ป้าย % กำไร — ราคาขาย ≤ 0 คำนวณไม่ได้ = ไม่โชว์ */
function MarginBadge({ price, cost }: { price: number; cost: number }) {
  const margin = productMargin({ price, cost })
  if (margin === null) return null
  return (
    <span className={`badge text-2xs font-semibold ${margin < 0 ? 'bg-danger/15 text-danger-ink' : 'bg-success/15 text-success-ink'}`}>
      กำไร {margin.toLocaleString('th-TH', { maximumFractionDigits: 1 })}%
    </span>
  )
}

/**
 * countCostCoverage — "ตั้งต้นทุนแล้ว x/y รายการ" ของบิลใบนี้
 *
 * อยู่โมดูลเดียวกับช่องต้นทุนโดยตั้งใจ — ตัวนับกับช่องที่ผลิตตัวเลขต้องนิยาม "แถวที่นับ"
 * ตรงกันเสมอ (แถวที่มีชื่อเท่านั้น ไม่นับแถวเปล่าท้ายลิสต์ตาม spreadsheet pattern)
 *
 * จงใจไม่แสดงกำไรเป็นจำนวนเงินระหว่างกรอกบิล: ระหว่างนั้นข้อมูลยังไม่ครบ ตัวเลขที่ได้จะเป็น
 * "เพดานบน" ที่หลอกได้ (ดู computeOrderProfit) — ตัวนับบอกความคืบหน้าโดยไม่เสี่ยงสื่อผิด
 */
export function countCostCoverage(items: { name?: string; cost?: number | null }[]) {
  const named = items.filter((i) => Boolean(i?.name?.trim()))
  return { withCost: named.filter((i) => i.cost != null).length, total: named.length }
}

/**
 * LineCostSlot — ห่อ useController ของ items.N.cost ไว้ใน component ที่ render เฉพาะตอน showCost
 * (00071 S-3): ผู้ไม่ใช่เจ้าของไม่ลงทะเบียนฟิลด์ cost ในฟอร์มเลย → state ไม่เก็บต้นทุน
 * และไม่ขัด rules of hooks เพราะเงื่อนไขอยู่ที่ตัวเรียก <LineCostSlot/> ไม่ใช่ hook
 */
export function LineCostSlot({
  control,
  index,
  price,
  catalogProduct,
  name,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  index: number
  price: number
  /** สินค้าจากแคตตาล็อก (ถ้ามี) — cost == null = รู้แน่ว่ายังไม่เคยตั้งต้นทุน */
  catalogProduct?: { cost?: number | null }
  name?: string
}) {
  const { field } = useController({ control, name: `items.${index}.cost`, defaultValue: null })
  return (
    <LineCostField
      cost={(field.value as number | string | null) ?? null}
      price={price}
      onChange={field.onChange}
      knownMissing={Boolean(catalogProduct && catalogProduct.cost == null)}
      name={name}
    />
  )
}
