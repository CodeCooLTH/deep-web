'use client'

/**
 * OptionPickerSheet — bottom sheet เลือกช่องทาง/ชำระเงิน (quick create < lg) + ดาว ตั้งค่าเริ่มต้นครั้งถัดไป
 * Base: QuickPriceSheet.tsx / ProductPickerSheet.tsx (sheet shell: dim z-70 + panel z-80 + handle + safe-area)
 * option row: [ปุ่มเลือก icon+label+check] + [ปุ่ม ดาว แยก] (ห้าม nest button ใน button)
 */

import { useEffect } from 'react'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import Icon from '@/components/wrappers/Icon'

export interface PickerOption {
  value: string
  label: string
  icon: string
}

interface Props {
  open: boolean
  title: string
  options: PickerOption[]
  value?: string
  defaultValue?: string | null
  onSelect: (value: string) => void
  onSetDefault: (value: string) => void
  onClose: () => void
}

export default function OptionPickerSheet({
  open,
  title,
  options,
  value,
  defaultValue,
  onSelect,
  onSetDefault,
  onClose,
}: Props) {
  /**
   * ตรึง scroll หน้าข้างหลังระหว่างเปิด — sheet ประกอบเองด้วย React state ไม่ได้ล็อกฟรีแบบ
   * hs-overlay (docs/conventions/overlay-scroll-lock.md) · ต้องเรียกก่อน `if (!open) return null`
   */
  useLockBodyScroll(open)

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* dim: z-70 (ต่ำกว่า sheet z-80, สูงกว่า (fullscreen) layout z-50 + footer z-40) */}
      <div className="fixed inset-0 z-70 bg-dark/40" onClick={onClose} aria-hidden="true" />
      <div
        className={'fixed inset-x-0 bottom-0 z-80 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-default-300 bg-card' /* HR7: inset-x-0 bottom-0 + max-h-[85vh] = viewport-lock, Paces ไม่มี token (reuse pattern QuickPriceSheet/ProductPickerSheet) */}
        role="dialog"
        aria-label={title}
      >
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <span className="h-1 w-10 rounded-full bg-default-300" aria-hidden="true" />
        </div>
        <div className="shrink-0 px-5 pt-1">
          <h3 className="text-base font-semibold text-dark">{title}</h3>
          <p className="mt-0.5 mb-2 text-xs text-default-400">แตะปุ่มดาวเพื่อตั้งเป็นค่าเริ่มต้นครั้งถัดไป</p>
        </div>
        <div className={'min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]' /* carve-out: safe-area ไม่มี token */}>
          {options.map((opt) => {
            const selected = value === opt.value
            const isDefault = defaultValue === opt.value
            return (
              <div key={opt.value} className="flex items-center gap-2 border-b border-default-100 last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelect(opt.value)}
                  className="flex flex-1 items-center gap-3 py-3 text-left"
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-primary/10 text-primary' : 'bg-default-100 text-default-500'}`}
                  >
                    <Icon icon={opt.icon} className="size-5" />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-default-800">{opt.label}</span>
                  {selected && <Icon icon="check" className="size-4 shrink-0 text-primary" />}
                </button>
                <button
                  type="button"
                  onClick={() => onSetDefault(opt.value)}
                  aria-label={isDefault ? 'ค่าเริ่มต้นครั้งถัดไป' : 'ตั้งเป็นค่าเริ่มต้นครั้งถัดไป'}
                  className="shrink-0 p-2"
                >
                  <Icon
                    icon={isDefault ? 'star-filled' : 'star'}
                    className={`size-5 ${isDefault ? 'text-warning' : 'text-default-300'}`}
                  />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
