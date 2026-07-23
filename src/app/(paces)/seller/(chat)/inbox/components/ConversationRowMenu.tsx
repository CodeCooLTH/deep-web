'use client'

/**
 * ConversationRowMenu — ⋮ kebab menu ต่อแถวรายการแชท (feat 00018 S-7): ปักหมุด/ปิดงาน/ซ่อน
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/components/OrderCardMenu.tsx (ทั้งไฟล์ —
 * custom React dropdown + click-outside + .dropdown-item/.dropdown-divider) เพราะ Preline
 * hs-dropdown พังกับ list ที่ re-render บ่อย (เหตุผลเดียวกับที่ OrderCardMenu/PageFilterDropdown เลือกไม่ใช้)
 *
 * ต่างจาก OrderCardMenu: เปิดลง (top-full end-0) เพราะเป็น list เรียงแนวตั้ง (ไม่ใช่ card grid);
 * แถวใกล้ขอบล่างของ scroll อาจ clip — follow-up flip-direction (ux Open Q #2)
 *
 * dumb component: แค่เรียก onAction — การ confirm "ซ่อน" (pacesConfirm) + PATCH + toast ทำที่ InboxList
 */
import Icon from '@/components/wrappers/Icon'
import { useEffect, useRef, useState } from 'react'

export type RowAction = 'pin' | 'unpin' | 'hide' | 'unhide' | 'resolve' | 'reopen'

type Props = {
  isPinned: boolean
  isResolved: boolean
  /** true = กำลังดูรายการ "ที่ซ่อนอยู่" → เมนูเสนอ "เลิกซ่อน" แทน "ซ่อน" */
  hiddenContext: boolean
  /** true = มี action ค้างอยู่ (กันดับเบิลแท็บ) */
  busy?: boolean
  onAction: (action: RowAction) => void
}

export default function ConversationRowMenu({ isPinned, isResolved, hiddenContext, busy, onAction }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', onKey)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(action: RowAction) {
    setOpen(false)
    onAction(action)
  }

  return (
    <div className="relative flex items-center" ref={ref}>
      <button
        type="button"
        className="btn btn-icon border-default-300 text-default-700 hover:bg-default-100 min-h-11 min-w-11"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="จัดการบทสนทนา"
        disabled={busy}
        onClick={() => setOpen((p) => !p)}
      >
        <Icon icon={busy ? 'loader-2' : 'dots-vertical'} className={`size-4 ${busy ? 'animate-spin' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute top-full end-0 z-30 mt-1 min-w-44 overflow-hidden rounded border border-default-300 bg-card shadow-lg"
          role="menu"
          aria-orientation="vertical"
        >
          <div className="space-y-0.5 p-1">
            <button type="button" className="dropdown-item text-sm" role="menuitem" onClick={() => pick(isPinned ? 'unpin' : 'pin')}>
              {/* ดาว ไม่ใช่หมุด — ให้ตรงกับปุ่มดาวหน้าแถว (user สั่ง 2026-07-23) */}
              <Icon icon={isPinned ? 'star-off' : 'star'} className="size-4" />
              {isPinned ? 'เลิกปักหมุด' : 'ปักหมุด'}
            </button>
            <button type="button" className="dropdown-item text-sm" role="menuitem" onClick={() => pick(isResolved ? 'reopen' : 'resolve')}>
              <Icon icon={isResolved ? 'arrow-back-up' : 'circle-check'} className="size-4" />
              {isResolved ? 'เปิดใหม่' : 'ปิดงาน'}
            </button>
            <hr className="dropdown-divider" />
            <button
              type="button"
              className="dropdown-item text-sm"
              role="menuitem"
              onClick={() => pick(hiddenContext ? 'unhide' : 'hide')}
            >
              <Icon icon={hiddenContext ? 'eye' : 'eye-off'} className="size-4" />
              {hiddenContext ? 'เลิกซ่อน' : 'ซ่อน'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
