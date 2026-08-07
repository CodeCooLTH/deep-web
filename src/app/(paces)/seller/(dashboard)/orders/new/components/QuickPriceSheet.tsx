'use client'

/**
 * QuickPriceSheet — bottom sheet แก้ราคาต่อหน่วยของ 1 line (quick create < lg)
 * Base: mockup 2026-07-06-quick-create-order.html (frame "แก้ราคา") + ManualAdjustModal (stepper) + CartLineItem (฿ input-group)
 * custom React state (ไม่ใช้ Preline hs-overlay — QuickForm re-render หนักตาม useFieldArray/useWatch; ux spec HR-lesson 2026-06-15)
 */

import { useState, useEffect } from 'react'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import Icon from '@/components/wrappers/Icon'

interface Props {
  open: boolean
  price: number
  name?: string
  /** จำนวนของบรรทัดนี้ — ใช้คำนวณยอดรวมสด ๆ ระหว่างแก้ราคา (ไม่งั้นต้องคูณในหัว) */
  qty?: number
  /** หน่วยนับ (ชิ้น/ครั้ง/คืน) */
  unitLabel?: string
  onApply: (price: number) => void
  onClose: () => void
}

const clamp2 = (n: number) => Math.max(0, Math.round((Number(n) || 0) * 100) / 100)
// focus-visible:ring — ชิปวันที่ในฟอร์มเดียวกันมีอยู่แล้ว ปุ่มชุดนี้เคยตกหล่น (critique minor)
const stepBtn =
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-default-300 px-2.5 text-sm font-semibold text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none'

export default function QuickPriceSheet({ open, price, name, qty = 1, unitLabel = 'ชิ้น', onApply, onClose }: Props) {
  /**
   * ตรึง scroll หน้าข้างหลังระหว่างเปิด — sheet ประกอบเองด้วย React state ไม่ได้ล็อกฟรีแบบ
   * hs-overlay (docs/conventions/overlay-scroll-lock.md) · ต้องเรียกก่อน `if (!open) return null`
   */
  useLockBodyScroll(open)

  // เก็บเป็น string เพื่อคุมการพิมพ์เอง — bind number ทำให้ leading zero ค้าง (React number-input quirk: 0360)
  // sanitize: เก็บเฉพาะเลข/จุด + ตัด 0 นำหน้าถ้ามีเลขตาม (0360→360) แต่คง 0.5
  const [raw, setRaw] = useState('')
  const sanitize = (s: string) => s.replace(/[^\d.]/g, '').replace(/^0+(?=\d)/, '')

  // reset ค่าเริ่ม = ราคาปัจจุบัน ทุกครั้งที่เปิด (0 → ว่าง โชว์ placeholder)
  useEffect(() => {
    if (open) setRaw(price ? String(price) : '')
  }, [open, price])

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
        className={'fixed inset-x-0 bottom-0 z-80 rounded-t-2xl border-t border-default-300 bg-card' /* HR7: inset-x-0 bottom-0 = viewport-lock, Paces ไม่มี token (precedent AccountSwitcherSheet) */}
        role="dialog"
        aria-label="แก้ราคา"
      >
        <div className="flex justify-center pt-3 pb-1">
          <span className="h-1 w-10 rounded-full bg-default-300" aria-hidden="true" />
        </div>
        <div className={'px-5 pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))]' /* carve-out: safe-area ไม่มี token */}>
          <h3 className="text-base font-semibold text-dark">แก้ราคา</h3>
          {name && <p className="mt-0.5 mb-4 truncate text-xs text-default-400">{name} · ราคาต่อหน่วย</p>}

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
                aria-label="ราคาต่อหน่วย"
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

          <button
            type="button"
            onClick={() => onApply(clamp2(Number(raw) || 0))}
            className="btn min-h-11 w-full bg-primary font-semibold text-white hover:bg-primary-hover"
          >
            นำไปใช้
          </button>
        </div>
      </div>
    </>
  )
}
