/**
 * MonthSwitcher — ปุ่ม ‹ เดือน › ของรายงานยอดขายรายสินค้า (feature 00063)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (`.btn.btn-icon` + button group)
 *
 * 🛑 ปุ่ม `‹ ›` เป็น `<Link>` จริง ไม่ใช่ปุ่มที่แก้ state —
 * ผู้ใช้ต้องกด back ของเบราว์เซอร์แล้วกลับมาเดือนเดิมได้ และส่งลิงก์ให้กันดูได้
 * (แพตเทิร์นเดียวกับ `?from=&to=` ของ `/sales` และ `/reports/agents`)
 * ไฟล์นี้เคยเป็น server component ล้วน — ต้องเติม `'use client'` เพราะป้ายเดือนเปิดชีตได้แล้ว
 * (2026-08-30) **แต่ตัวลิงก์ยังเป็น `<Link>` ทั้งหมด ทั้งปุ่ม ‹ › และทุกเดือนในชีต**
 *
 * 🛑 ป้ายเดือนกดได้เพราะ user ทักว่า "วันที่กดยาก" — ปุ่ม ‹ › ผ่านเกณฑ์นิ้ว 44px อยู่แล้ว
 * ตัวที่กดไม่ได้คือป้ายกลาง ⇒ ย้อนไป ก.พ. 2569 ต้องกด ‹ **หกครั้ง** กระโดดไม่ได้เลย
 *
 * 🛑 `min-h-11 min-w-11` — `.btn.btn-icon` ของธีมสูง 37px ซึ่งต่ำกว่าเกณฑ์พื้นที่นิ้ว 44px
 * ที่ `PRODUCT.md` ประกาศไว้เอง (ท่าเดียวกับที่ `ReportFilters.tsx` ทำกับปุ่ม preset)
 */
'use client'

import Link from 'next/link'
import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { formatMonthYearTH } from '@/lib/format-date'
import MonthPickerSheet from './MonthPickerSheet'

type Props = {
  /** `YYYY-MM` ของเดือนที่กำลังดู */
  iso: string
  year: number
  month0: number
  /** null = ไปต่อไม่ได้แล้ว (ชนเพดานบน) — ต้องแสดงปุ่มที่กดไม่ได้ ไม่ใช่ซ่อนปุ่มทิ้ง */
  prevHref: string | null
  nextHref: string | null
}

export default function MonthSwitcher({ iso, year, month0, prevHref, nextHref }: Props) {
  // วันที่ 1 เวลา 07:00 ไทย — ปลอดภัยจากการตกเดือนไม่ว่าเซิร์ฟเวอร์จะอยู่โซนไหน
  const label = formatMonthYearTH(new Date(Date.UTC(year, month0, 1, 0, 0, 0)))
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="flex items-center gap-1" data-month={iso}>
      <NavButton
        href={prevHref}
        icon="chevron-left"
        label="เดือนก่อนหน้า"
        disabledLabel="ไม่มีข้อมูลก่อนหน้านี้"
      />
      {/* ความกว้างคงที่ — ไม่งั้นปุ่ม ‹ › ขยับทุกครั้งที่เปลี่ยนเดือน (ชื่อเดือนย่อยาวไม่เท่ากัน:
          "ก.ค. 2569" สั้นกว่า "พ.ย. 2569") 7rem พอดีกับรูปแบบย่อที่ formatMonthYearTH คืน
          🛑 **ไม่มีกรอบ** — ลองทำเป็นกล่องฟอร์มแล้ว user ปฏิเสธ ("input เลือกเดือนมันแปลกๆ")
          กล่องกลางหัวหน้าอ่านเป็น "ช่องกรอก" และทำให้กลุ่ม ‹ เดือน › แตกเป็นสามก้อนคนละทรง */}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${label} — แตะเพื่อเลือกเดือนอื่น`}
        className="text-default-900 hover:bg-default-100 inline-flex min-h-11 min-w-28 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold">
        {label}
        <Icon icon="chevron-down" className="text-default-400 size-3.5 shrink-0" aria-hidden="true" />
      </button>
      <NavButton
        href={nextHref}
        icon="chevron-right"
        label="เดือนถัดไป"
        disabledLabel="ยังไม่มีข้อมูลของเดือนถัดไป"
      />
      {pickerOpen && (
        <MonthPickerSheet year={year} month0={month0} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  )
}

function NavButton({
  href,
  icon,
  label,
  disabledLabel,
}: {
  href: string | null
  icon: string
  label: string
  /** บอกเหตุผลที่กดไม่ได้ — ปุ่มเทาที่ไม่บอกอะไรอ่านเป็น "พัง" ไม่ใช่ "หมดข้อมูล" */
  disabledLabel: string
}) {
  /**
   * 🛑 ห้ามใช้ `btn-light`/`btn-primary` — `_buttons.css` ของธีมมีแค่ `.btn/.btn-lg/.btn-sm/.btn-icon`
   * (`btn-light` ที่ grep เจอคือ `.btn-light.active` ใน `plugins/_apexcharts.css` = toolbar ของกราฟ
   * คนละเรื่องกัน) สีของปุ่มมาจาก utility เสมอ — คลาสชุดนี้คือชุดที่ใช้อยู่แล้ว 4 จุดในโปรเจกต์
   */
  const base =
    'btn btn-icon border-default-300 text-default-700 hover:bg-default-100 min-h-11 min-w-11 border'
  if (!href) {
    /**
     * 🛑 ต้องเป็น `<button disabled>` ไม่ใช่ `<span aria-disabled>` — `<span>` เปล่าเป็น
     * `role=generic` ซึ่ง **ไม่รองรับชื่อจากผู้เขียน** ⇒ `aria-label` ถูกทิ้ง และลูกเดียวที่มี
     * ก็ `aria-hidden` อยู่ ⇒ อิลิเมนต์นี้ไม่มีทั้งชื่อและเนื้อหา **หายไปจาก accessibility tree
     * ทั้งก้อน** (docs/conventions/aria-name-requires-supporting-role.md §"ทำแล้วแย่กว่าไม่ทำ")
     * และ `text-default-300` บนขาว = 1.22:1 ผู้ใช้สายตาปกติก็อ่านเป็นจอเพี้ยน
     * ปล่อยให้ `button:disabled { opacity-50 }` ของธีม (`_buttons.css:26`) จัดการหน้าตาแทน
     */
    return (
      <button type="button" disabled aria-label={disabledLabel} title={disabledLabel} className={base}>
        <Icon icon={icon} className="text-base rtl:rotate-180" aria-hidden="true" />
      </button>
    )
  }
  return (
    <Link href={href} aria-label={label} title={label} className={base}>
      <Icon icon={icon} className="text-base rtl:rotate-180" aria-hidden="true" />
    </Link>
  )
}
