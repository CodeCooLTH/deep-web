'use client'

/**
 * ListControlDropdown — ตัวควบคุมรายการสินค้าบนมือถือ: มุมมอง + การเรียงลำดับ (feature 00063)
 *
 * Base: src/components/safepay/FilterDropdownShell.tsx (เปลือกเดียวกับ `/orders` `/customers`
 *   `/inventory` และอีก 5 หน้าใช้อยู่) + `.dropdown-item` / `.dropdown-divider` ของธีม
 *   (`src/assets/css/custom/_dropdown.css`, ท่าเดียวกับ `orders/components/OrderCardMenu.tsx`)
 *
 * ทำไมไม่ใช้ `FilterDropdown.tsx` ตรง ๆ: ตัวนั้นรับ options เป็นลิสต์แบนชุดเดียว แต่ที่นี่ต้อง
 * แบ่ง 2 หมวด (แสดง / เรียงตาม) คั่นด้วยเส้น — จึงใช้ **เปลือก** แล้วประกอบเนื้อในเอง
 *
 * ── ทำไมยุบสองสวิตช์เดิมมาเป็นอันนี้ ────────────────────────────────────────────
 * user ทักเอง 2026-08-30 ว่าช่องติ๊กคู่เดิม "มันแปลกๆ" — ต้นเหตุคือ **มันทำงานคนละทิศแต่
 * แต่งตัวเหมือนกัน**: "แสดงเฉพาะที่ขายวันนี้" *กรองให้แคบลง* (35→3) ส่วน "แสดงสินค้าที่ไม่มี
 * ยอดขาย" *เพิ่มของเข้ามา* (35→37) หน้าตาเหมือนกันเป๊ะแต่ผลตรงข้าม สมองจึงสะดุด
 * ⇒ ตัวที่ "เลือกมุมมอง" มารวมในเมนูนี้ · ตัวที่ "เพิ่มของ" ไปเป็นสวิตช์ท้ายรายการ
 *   ตรงจุดที่มันมีผลพอดี ⇒ อ่านสลับกันไม่ได้อีก
 *
 * 🛑 **เดสก์ท็อปไม่ใช้ตัวนี้** — ตารางมีการเรียงในหัวคอลัมน์อยู่แล้ว (`getSortedRowModel`)
 * การใส่เมนู "เรียงตาม" ไปด้วยจะเป็นตัวควบคุมซ้ำของสิ่งเดียวกัน (ผู้ใช้เจอสองทางที่อาจ
 * ไม่ตรงกัน) ⇒ ที่นั่นคงช่องติ๊กคู่เดิมไว้ไม่แตะ
 */
import FilterDropdownShell from '@/components/safepay/FilterDropdownShell'
import Icon from '@/components/wrappers/Icon'
import { PRODUCT_SORT_KEYS, PRODUCT_SORT_LABELS, type ProductSortKey } from '@/lib/product-sales-month'
import { useState } from 'react'

export type ListView = 'ALL' | 'TODAY'

type Props = {
  view: ListView
  onViewChange: (v: ListView) => void
  /** จำนวนสินค้าที่ขายวันนี้ — 0 หรือไม่ใช่เดือนปัจจุบัน ⇒ ไม่แสดงหมวด "แสดง" เลย */
  todayCount: number
  sort: ProductSortKey
  onSortChange: (s: ProductSortKey) => void
}

export default function ListControlDropdown({
  view,
  onViewChange,
  todayCount,
  sort,
  onSortChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const hasToday = todayCount > 0

  /**
   * ป้ายบนปุ่ม: ปกติบอกการเรียง · เมื่อกรองอยู่บอกมุมมองแทน
   * เพราะการกรองเปลี่ยน "ของที่เห็น" ซึ่งสำคัญกว่าลำดับ และเป็นสถานะที่ผู้ใช้ต้องรู้ว่ายังเปิดค้าง
   */
  const filtering = view === 'TODAY' && hasToday
  const label = filtering ? `ขายวันนี้ (${todayCount})` : PRODUCT_SORT_LABELS[sort]

  const item = (active: boolean, onClick: () => void, text: string, key: string) => (
    <button
      key={key}
      type="button"
      onClick={() => {
        onClick()
        setOpen(false)
      }}
      /* min-h-11 — `.dropdown-item` ของธีมเตี้ยกว่าเกณฑ์พื้นที่นิ้ว 44px ที่ PRODUCT.md ประกาศไว้เอง
         (ท่าเดียวกับที่ MonthSwitcher ทำกับ `.btn.btn-icon` ซึ่งสูง 37px) */
      className={`dropdown-item flex min-h-11 w-full items-center justify-between gap-3 text-start ${
        active ? 'active' : ''
      }`}
      aria-current={active ? 'true' : undefined}>
      <span>{text}</span>
      {active && <Icon icon="check" className="text-primary size-4 shrink-0" aria-hidden="true" />}
    </button>
  )

  return (
    <FilterDropdownShell
      triggerContent={<span>{label}</span>}
      isActive={filtering}
      open={open}
      onOpenChange={setOpen}
      align="right"
      /* min-h-11 ที่ trigger — `.btn` เปล่าของธีมสูง 37px */
      className="min-h-11 text-sm"
      panelClassName="min-w-52">
      <div role="menu" aria-label="มุมมองและการเรียงลำดับ">
        {hasToday && (
          <>
            <span className="text-default-400 block px-2.5 pt-1 pb-0.5 text-2xs font-semibold">
              แสดง
            </span>
            {item(view === 'ALL', () => onViewChange('ALL'), 'ทั้งหมด', 'v-all')}
            {item(view === 'TODAY', () => onViewChange('TODAY'), `ขายวันนี้ (${todayCount})`, 'v-today')}
            <hr className="dropdown-divider" />
          </>
        )}
        <span className="text-default-400 block px-2.5 pt-1 pb-0.5 text-2xs font-semibold">
          เรียงตาม
        </span>
        {PRODUCT_SORT_KEYS.map((k) =>
          item(sort === k, () => onSortChange(k), PRODUCT_SORT_LABELS[k], `s-${k}`),
        )}
      </div>
    </FilterDropdownShell>
  )
}
