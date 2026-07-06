'use client'

/**
 * QuickPriceSheet — bottom sheet แก้ราคาต่อหน่วยของ 1 line (quick create < lg)
 * Base: mockup 2026-07-06-quick-create-order.html (frame "แก้ราคา") + ManualAdjustModal (stepper) + CartLineItem (฿ input-group)
 * custom React state (ไม่ใช้ Preline hs-overlay — QuickForm re-render หนักตาม useFieldArray/useWatch; ux spec HR-lesson 2026-06-15)
 */

import { useState, useEffect } from 'react'
import Icon from '@/components/wrappers/Icon'

interface Props {
  open: boolean
  price: number
  name?: string
  onApply: (price: number) => void
  onClose: () => void
}

const clamp2 = (n: number) => Math.max(0, Math.round((Number(n) || 0) * 100) / 100)
const stepBtn =
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-default-300 px-2.5 text-sm font-semibold text-primary'

export default function QuickPriceSheet({ open, price, name, onApply, onClose }: Props) {
  const [local, setLocal] = useState(price)

  // reset ค่าเริ่ม = ราคาปัจจุบัน ทุกครั้งที่เปิด
  useEffect(() => {
    if (open) setLocal(price)
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

  const step = (d: number) => setLocal((v) => clamp2((Number(v) || 0) + d))

  return (
    <>
      {/* dim: z-70 (ต่ำกว่า sheet z-80, สูงกว่า (fullscreen) layout z-50 + footer z-40) */}
      <div className="fixed inset-0 z-70 bg-dark/40" onClick={onClose} aria-hidden="true" />
      {/* HR7: fixed inset-x-0 bottom-0 = viewport-lock (Paces ไม่มี token; precedent AccountSwitcherSheet) */}
      <div
        className="fixed inset-x-0 bottom-0 z-80 rounded-t-2xl border-t border-default-300 bg-card"
        role="dialog"
        aria-label="แก้ราคา"
      >
        <div className="flex justify-center pt-3 pb-1">
          <span className="h-1 w-10 rounded-full bg-default-300" aria-hidden="true" />
        </div>
        <div className="px-5 pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))]">
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
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                aria-label="ราคาต่อหน่วย"
                className="form-input text-center text-lg font-bold"
                value={local}
                onChange={(e) => setLocal(e.target.value === '' ? 0 : Number(e.target.value))}
              />
            </div>
            <button type="button" onClick={() => step(1)} aria-label="เพิ่ม 1" className={stepBtn}>
              <Icon icon="plus" className="size-4" />
            </button>
            <button type="button" onClick={() => step(10)} className={stepBtn}>+10</button>
          </div>

          <button
            type="button"
            onClick={() => onApply(clamp2(local))}
            className="btn min-h-11 w-full bg-primary font-semibold text-white hover:bg-primary-hover"
          >
            นำไปใช้
          </button>
        </div>
      </div>
    </>
  )
}
