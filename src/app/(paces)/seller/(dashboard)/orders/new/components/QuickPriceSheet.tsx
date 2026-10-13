'use client'

/**
 * QuickPriceSheet — bottom sheet แก้ราคาต่อหน่วยของ 1 line (quick create < lg)
 * ใช้ซ้ำเป็นชีตแก้ "ต้นทุน" (LineCostField) ผ่าน title/inputLabel/preview/onClear — ทุกจอ:
 * จอ lg ขึ้นไปเป็นโมดัลกลางจอแทน bottom sheet (ตะกร้า desktop ก็เปิดชีตนี้)
 * Base: mockup 2026-07-06-quick-create-order.html (frame "แก้ราคา") + ManualAdjustModal (stepper) + CartLineItem (฿ input-group)
 * custom React state (ไม่ใช้ Preline hs-overlay — QuickForm re-render หนักตาม useFieldArray/useWatch; ux spec HR-lesson 2026-06-15)
 */

import { useState, useEffect, type ReactNode } from 'react'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import Icon from '@/components/wrappers/Icon'

interface Props {
  open: boolean
  /** null = ยังไม่ตั้ง (ใช้กับ onClear) */
  price: number | null
  name?: string
  /** จำนวนของบรรทัดนี้ — ใช้คำนวณยอดรวมสด ๆ ระหว่างแก้ราคา (ไม่งั้นต้องคูณในหัว) */
  qty?: number
  /** หน่วยนับ (ชิ้น/ครั้ง/คืน) */
  unitLabel?: string
  onApply: (price: number) => void
  onClose: () => void
  /** หัวชีต (default "แก้ราคา") */
  title?: string
  /** ชื่อช่องสำหรับ screen reader + คำต่อท้ายชื่อสินค้าใต้หัวชีต (default "ราคาต่อหน่วย") */
  inputLabel?: string
  /** แสดงใต้ช่องกรอก คำนวณสดจากค่าที่กำลังพิมพ์ (เช่น % กำไรของต้นทุน) */
  preview?: (value: number) => ReactNode
  /**
   * ส่ง = ฟิลด์นี้ "ว่าง" ได้ (ต่างจาก 0): ช่องว่างแล้วกดนำไปใช้ → onClear · ค่าเริ่ม null = ว่าง
   * และ 0 แสดงเป็น "0" ไม่ใช่ช่องว่าง (ต้นทุน 0 = ไม่มีต้นทุนจริง ≠ ยังไม่ตั้ง)
   */
  onClear?: () => void
}

const clamp2 = (n: number) => Math.max(0, Math.round((Number(n) || 0) * 100) / 100)
// focus-visible:ring — ชิปวันที่ในฟอร์มเดียวกันมีอยู่แล้ว ปุ่มชุดนี้เคยตกหล่น (critique minor)
const stepBtn =
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-default-300 px-2.5 text-sm font-semibold text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none'

export default function QuickPriceSheet({
  open,
  price,
  name,
  qty = 1,
  unitLabel = 'ชิ้น',
  onApply,
  onClose,
  title = 'แก้ราคา',
  inputLabel = 'ราคาต่อหน่วย',
  preview,
  onClear,
}: Props) {
  /**
   * ตรึง scroll หน้าข้างหลังระหว่างเปิด — sheet ประกอบเองด้วย React state ไม่ได้ล็อกฟรีแบบ
   * hs-overlay (docs/conventions/overlay-scroll-lock.md) · ต้องเรียกก่อน `if (!open) return null`
   */
  useLockBodyScroll(open)

  // เก็บเป็น string เพื่อคุมการพิมพ์เอง — bind number ทำให้ leading zero ค้าง (React number-input quirk: 0360)
  // sanitize: เก็บเฉพาะเลข/จุด + ตัด 0 นำหน้าถ้ามีเลขตาม (0360→360) แต่คง 0.5
  const [raw, setRaw] = useState('')
  const sanitize = (s: string) => s.replace(/[^\d.]/g, '').replace(/^0+(?=\d)/, '')

  // reset ค่าเริ่ม = ราคาปัจจุบัน ทุกครั้งที่เปิด (0 → ว่าง โชว์ placeholder — ยกเว้นฟิลด์ที่ว่างได้ ซึ่ง 0 คือค่าจริง)
  useEffect(() => {
    if (open) setRaw(price == null || (price === 0 && !onClear) ? '' : String(price))
  }, [open, price, onClear])

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  if (!open) return null

  const step = (d: number) =>
    setRaw((prev) => {
      const n = clamp2((Number(prev) || 0) + d)
      return n ? String(n) : ''
    })

  return (
    <>
      {/* dim: z-70 (ต่ำกว่า sheet z-80, สูงกว่า (fullscreen) layout z-50 + footer z-40) */}
      <div className="fixed inset-0 z-70 bg-dark/40" onClick={onClose} aria-hidden="true" />
      <div
        className={
          'fixed inset-x-0 bottom-0 z-80 rounded-t-2xl border-t border-default-300 bg-card lg:top-1/2 lg:bottom-auto lg:left-1/2 lg:w-105 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:border' /* HR7: inset-x-0 bottom-0 = viewport-lock, Paces ไม่มี token (precedent AccountSwitcherSheet) · lg = โมดัลกลางจอ กว้าง 420 */
        }
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex justify-center pt-3 pb-1 lg:invisible">
          <span className="h-1 w-10 rounded-full bg-default-300" aria-hidden="true" />
        </div>
        <div className={'px-5 pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))]' /* carve-out: safe-area ไม่มี token */}>
          <h3 className="text-base font-semibold text-dark">{title}</h3>
          {name && (
            <p className="mt-0.5 mb-4 truncate text-xs text-default-400">
              {name} · {inputLabel}
            </p>
          )}

          <div className="mb-4 flex items-center gap-2">
            <button type="button" onClick={() => step(-10)} className={stepBtn}>−10</button>
            <button type="button" onClick={() => step(-1)} aria-label="ลด 1" className={stepBtn}>
              <Icon icon="minus" className="size-4" />
            </button>
            <div className="input-group flex-1">
              <span className="input-group-text px-2">฿</span>
              <input
                type="text"
                inputMode="decimal"
                aria-label={inputLabel}
                placeholder="0"
                className="form-input text-center text-lg font-bold"
                value={raw}
                onChange={(e) => setRaw(sanitize(e.target.value))}
              />
            </div>
            <button type="button" onClick={() => step(1)} aria-label="เพิ่ม 1" className={stepBtn}>
              <Icon icon="plus" className="size-4" />
            </button>
            <button type="button" onClick={() => step(10)} className={stepBtn}>+10</button>
          </div>

          {/* ยอดรวมบรรทัดสด ๆ — คนที่กำลังต่อรองให้ลงตัวที่ "ยอดรวม" ไม่ควรต้องคูณในหัว
              (ชีตนี้เคยโชว์แต่ราคาต่อหน่วย — critique: working memory) */}
          {qty > 1 && (
            <p className="mb-3 flex items-center justify-between text-sm">
              <span className="text-default-500">
                {qty} {unitLabel} × {clamp2(Number(raw) || 0).toLocaleString('th-TH')}
              </span>
              <span className="font-bold text-default-900 tabular-nums">
                ฿{(clamp2(Number(raw) || 0) * qty).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </span>
            </p>
          )}

          {preview && <div className="mb-3">{preview(clamp2(Number(raw) || 0))}</div>}

          <button
            type="button"
            onClick={() => (raw === '' && onClear ? onClear() : onApply(clamp2(Number(raw) || 0)))}
            className="btn min-h-11 w-full bg-primary font-semibold text-white hover:bg-primary-hover"
          >
            นำไปใช้
          </button>
          {/* ล้างค่าที่ตั้งไว้แล้ว (กลับเป็น "ยังไม่ตั้ง") — โชว์เฉพาะฟิลด์ที่ว่างได้และมีค่าอยู่ */}
          {onClear && price != null && (
            <button type="button" onClick={onClear} className="btn mt-2 min-h-11 w-full text-danger hover:bg-danger/10">
              ล้าง{title}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
