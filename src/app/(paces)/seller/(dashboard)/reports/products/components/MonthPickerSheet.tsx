'use client'

/**
 * MonthPickerSheet — ชีตเลือกเดือนของรายงานยอดขายรายสินค้า (feature 00063)
 *
 * Base: ./ProductDetailSheet.tsx (กลไก overlay ทั้งชุด — `useLockBodyScroll` +
 *   `useDialogFocus` + pushState/popstate พร้อม `pushedRef` กันดันซ้ำ) **ห้ามเขียนใหม่จากศูนย์**
 *
 * ทำไมต้องมี: ปุ่ม `‹ ›` เดินได้ทีละเดือน ⇒ จะย้อนไป ก.พ. 2569 จาก ส.ค. 2569 ต้องกด **หกครั้ง**
 * (user ทัก 2026-08-30 ว่า "วันที่กดยาก" — ปุ่มผ่านเกณฑ์นิ้ว 44px อยู่แล้ว ตัวที่กดไม่ได้คือ
 * ป้ายเดือนตรงกลางซึ่งเป็นข้อความเฉย ๆ)
 *
 * 🛑 **ไม่ใช้ `<select>`** — ลองแล้ว user ปฏิเสธ ("input เลือกเดือนมันแปลกๆ"): กล่องฟอร์ม
 * กลางหัวหน้าอ่านเป็น "ช่องกรอก" และทำให้กลุ่ม `‹ เดือน ›` แตกเป็นสามก้อนคนละทรง
 *
 * 🛑 ทุกเดือนเป็น `<Link href="?month=...">` **ไม่ใช่ `router.push`** — รักษาหลักการเดียวกับ
 * ปุ่ม `‹ ›` เดิมที่คอมเมนต์ใน MonthSwitcher เขียนไว้ว่าต้องกด back ของเบราว์เซอร์กลับได้
 * และส่งลิงก์ให้กันดูได้
 */
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import useDialogFocus from '@/hooks/useDialogFocus'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import { MIN_MONTH_ISO, maxSelectableMonth } from '@/lib/product-sales-month'

const MONTHS_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

type Props = {
  /** ปี ค.ศ. + เดือน 0-based ของเดือนที่กำลังดูอยู่ */
  year: number
  month0: number
  onClose: () => void
}

export default function MonthPickerSheet({ year, month0, onClose }: Props) {
  useLockBodyScroll(true)

  const panelRef = useRef<HTMLDivElement>(null)
  const pushedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!pushedRef.current) {
      window.history.pushState({ deepMonthPicker: true }, '')
      pushedRef.current = true
    }
    const onPop = () => {
      pushedRef.current = false
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const close = () => {
    if (pushedRef.current) {
      window.history.back()
      return
    }
    onClose()
  }

  useDialogFocus(true, panelRef, close)

  /** ปีที่กำลังเปิดดูในชีต — แยกจากปีของเดือนที่เลือกอยู่ (เดินดูปีอื่นได้โดยยังไม่เลือก) */
  const [viewYear, setViewYear] = useState(year)

  const [minY, minM] = MIN_MONTH_ISO.split('-').map(Number)
  const max = maxSelectableMonth(new Date())

  /**
   * 🛑 ขอบมี **สองด้าน ไม่ใช่ด้านเดียว** — นอกจากเดือนอนาคตแล้ว `MIN_MONTH_ISO` ก็เป็นขอบล่าง
   * ถ้าปล่อยให้กดได้ จะได้หน้าที่ขึ้นแถบ "เดือนที่ระบุมาในลิงก์ใช้ไม่ได้" ซึ่งอ่านเป็นบั๊ก
   * มากกว่าการออกแบบ (ux ทัก 2026-08-30 — เดิมผมคิดถึงแค่ขอบบน)
   */
  const selectable = (m0: number) => {
    const v = viewYear * 12 + m0
    return v >= (minY - 1) * 12 + (minM - 1) && v <= max.year * 12 + max.month0
  }

  const yearHasAny = MONTHS_TH.some((_, m0) => selectable(m0))

  return (
    <div
      ref={panelRef}
      className="bg-card fixed inset-0 z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="เลือกเดือน">
      <header className="border-default-200 flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <button
          type="button"
          onClick={close}
          aria-label="ปิด"
          className="btn btn-icon text-default-700 hover:bg-default-100 min-h-11 min-w-11 shrink-0">
          <Icon icon="x" className="text-lg" aria-hidden="true" />
        </button>
        <h2 className="text-default-900 min-w-0 flex-1 truncate text-base font-semibold">
          เลือกเดือน
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 1)}
            aria-label="ปีก่อนหน้า"
            className="btn btn-icon border-default-300 text-default-700 hover:bg-default-100 min-h-11 min-w-11 border">
            <Icon icon="chevron-left" className="text-base rtl:rotate-180" aria-hidden="true" />
          </button>
          <span className="text-default-900 text-base font-semibold tabular-nums">
            {/* ปี พ.ศ. — ทั้งระบบใช้ พ.ศ. ตาม docs/conventions/date-format.md */}
            {viewYear + 543}
          </span>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 1)}
            aria-label="ปีถัดไป"
            className="btn btn-icon border-default-300 text-default-700 hover:bg-default-100 min-h-11 min-w-11 border">
            <Icon icon="chevron-right" className="text-base rtl:rotate-180" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {MONTHS_TH.map((label, m0) => {
            const current = viewYear === year && m0 === month0
            const iso = `${viewYear}-${String(m0 + 1).padStart(2, '0')}`
            if (!selectable(m0)) {
              /* <button disabled> ไม่ใช่ <span aria-disabled> — <span> เปล่าไม่รองรับชื่อจาก
                 ผู้เขียน ⇒ หายจาก accessibility tree ทั้งก้อน (ท่าเดียวกับ MonthSwitcher) */
              return (
                <button
                  key={iso}
                  type="button"
                  disabled
                  title="ยังไม่มีข้อมูลของเดือนนี้"
                  className="btn border-default-300 text-default-700 min-h-11 border text-sm">
                  {label}
                </button>
              )
            }
            return (
              <Link
                key={iso}
                href={`?month=${iso}`}
                aria-current={current ? 'page' : undefined}
                className={`btn min-h-11 border text-sm ${
                  current
                    ? 'bg-primary hover:bg-primary-hover border-transparent text-white'
                    : 'border-default-300 text-default-700 hover:bg-default-100'
                }`}>
                {label}
              </Link>
            )
          })}
        </div>

        {!yearHasAny && (
          <p className="text-default-400 mt-4 text-center text-sm">
            ยังไม่มีข้อมูลของปีนี้
          </p>
        )}
      </div>
    </div>
  )
}
