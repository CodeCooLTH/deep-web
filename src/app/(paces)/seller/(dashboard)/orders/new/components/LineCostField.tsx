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
import Icon from '@/components/wrappers/Icon'
import { productMargin } from '@/lib/order-profit'

type Props = {
  /** ต้นทุนของบรรทัดนี้ — null = ยังไม่กรอก (ต่างจาก 0 ที่แปลว่าไม่มีต้นทุนจริง) */
  cost: number | null
  /** ราคาขายของบรรทัดนี้ — ใช้คำนวณ % กำไร */
  price: number
  onChange: (v: number | null) => void
  /** true = สินค้าจากแคตตาล็อกที่รู้แน่ว่ายังไม่เคยตั้งต้นทุน (คำต่างจากรายการพิมพ์เอง) */
  knownMissing?: boolean
}

export default function LineCostField({ cost, price, onChange, knownMissing }: Props) {
  // เริ่มกางถ้ามีค่าอยู่แล้ว (prefill จากสินค้า/จากออเดอร์เดิม) — ไม่งั้นเริ่มยุบ
  const [open, setOpen] = useState(cost != null)

  const margin = productMargin({ price, cost })
  const isLoss = margin !== null && margin < 0

  if (!open) {
    return (
      // py-1.5 -my-1 = ขยายพื้นที่กดให้ผ่านเกณฑ์สัมผัสโดยไม่ดันความสูงของแถว
      // (ตัวอักษร 11px เล็กเกินกว่าจะใช้ขนาดตัวเองเป็น hit-area)
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-default-400 hover:text-primary -my-1 inline-flex items-center gap-1 py-1.5 text-2xs"
      >
        <Icon icon="calculator" className="size-3.5 shrink-0" aria-hidden="true" />
        {knownMissing ? 'ยังไม่ตั้งต้นทุน' : 'ตั้งต้นทุน'}
      </button>
    )
  }

  return (
    // flex-wrap: ที่ 1024px คอลัมน์นี้ถูกบีบแคบมาก ปล่อยให้ badge ตกบรรทัดได้ดีกว่าตัดคำ
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      <div className="input-group w-28">
        <span className="input-group-text text-2xs">฿</span>
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          className="form-input text-2xs py-1"
          placeholder="0.00"
          aria-label="ราคาทุนต่อชิ้น"
          value={cost ?? ''}
          onChange={(e) => {
            // sanitize ที่ input แทน validation error — ค่าติดลบพิมพ์ไม่ได้ตั้งแต่แรก
            // จึงไม่ต้องมี error state ที่จะไปบล็อกการบันทึก (D-EXT-4)
            const raw = e.target.value.replace(/[^\d.]/g, '')
            onChange(raw === '' ? null : Number(raw))
          }}
          onBlur={() => {
            // ล้างจนว่างแล้วออก → ยุบกลับ ไม่ทิ้งช่องเปล่าค้างจอ
            if (cost == null) setOpen(false)
          }}
        />
      </div>
      {margin !== null && (
        <span
          className={`badge text-2xs font-semibold ${isLoss ? 'bg-danger/15 text-danger-ink' : 'bg-success/15 text-success-ink'}`}
        >
          กำไร {margin.toLocaleString('th-TH', { maximumFractionDigits: 1 })}%
        </span>
      )}
    </div>
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
