'use client'

/**
 * ActionMenu — เมนูจุดสามจุด (เลื่อนขึ้น/ลง/ลบ · ตัวเลือกบอท) — 00095 S-7
 * ปุ่มที่ใช้ไม่ได้ต้องบอกเหตุผล: แสดงเป็นบรรทัดเล็กใต้ชื่อรายการ (มือถือไม่มี hover) + aria-disabled (ไม่ใช้ disabled เพื่อให้ตัวอ่านหน้าจอยังอ่านเหตุผลได้)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (dropdown panel — เขียนแบบ controlled เพราะ Preline hs-dropdown พังเมื่อ React re-render · memory feedback_filterdropdown_reusable)
 *   + src/app/(paces)/seller/(dashboard)/settings/tags/components/TagsClient.tsx (btn btn-icon size-11)
 */
import { useEffect, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'

export interface ActionItem {
  key: string
  label: string
  icon: string
  onSelect: () => void
  /** ใช้ไม่ได้เพราะอะไร — มีค่า = รายการถูกล็อกและแสดงเหตุผลใต้ชื่อ */
  disabledReason?: string | null
  danger?: boolean
}

export default function ActionMenu({ ariaLabel, items }: { ariaLabel: string; items: ActionItem[] }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // เปิดเมนู = ย้ายโฟกัสเข้ารายการแรก (role=menu ต้องไปทางคีย์บอร์ดได้)
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])

  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') els[(i + 1) % els.length]?.focus()
    else if (e.key === 'ArrowUp') els[(i - 1 + els.length) % els.length]?.focus()
    else if (e.key === 'Home') els[0]?.focus()
    else if (e.key === 'End') els[els.length - 1]?.focus()
    else return
    e.preventDefault()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="btn btn-icon text-default-600 hover:bg-default-100 size-11 lg:size-9"
      >
        <Icon icon="dots-vertical" className="size-5" aria-hidden="true" />
      </button>
      {open && (
        <div ref={menuRef} role="menu" aria-label={ariaLabel} onKeyDown={onMenuKey} className="border-default-300 bg-card absolute end-0 top-full z-30 mt-1 min-w-44 rounded border p-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              aria-disabled={it.disabledReason ? true : undefined}
              onClick={() => {
                if (it.disabledReason) return
                setOpen(false)
                btnRef.current?.focus()
                it.onSelect()
              }}
              className={`hover:bg-default-100 flex min-h-11 w-full items-center gap-2 rounded px-3 text-start text-sm lg:min-h-9 ${it.danger ? 'text-danger-ink' : 'text-default-800'} ${it.disabledReason ? 'cursor-not-allowed' : ''}`}
            >
              <Icon icon={it.icon} className={`size-4 shrink-0 ${it.disabledReason ? 'opacity-50' : ''}`} aria-hidden="true" />
              <span className="min-w-0">
                <span className={`block ${it.disabledReason ? 'opacity-60' : ''}`}>{it.label}</span>
                {it.disabledReason && <span className="text-default-700 block text-xs">{it.disabledReason}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
