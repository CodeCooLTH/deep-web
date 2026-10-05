'use client'

/**
 * TemplateMenu — เมนู ⋯ ของหน้าจัดข้อความ (คืนเป็นแบบมาตรฐาน · <lg เพิ่ม ส่งทดสอบ/ยกเลิกการแก้) · React-controlled ไม่ใช้ hs-dropdown
 *
 * Base: src/app/(paces)/seller/(dashboard)/business/line-reports/_components/detail/GroupMenu.tsx
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (.dropdown-item / .dropdown-divider)
 * เมนูอยู่ใน header sticky (ไม่ใช่ scroll container ที่ตัด) เปิดลง `top-full` · ปิดด้วย Esc/คลิกนอก — HR6(b): เป็น action menu ไม่ใช่ field
 */
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'

export type MenuItem = { key: string; label: string; sub?: string; icon: string; disabled?: boolean; danger?: boolean; onClick: () => void }

export default function TemplateMenu({ items, disabled }: { items: readonly MenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const normal = items.filter((i) => !i.danger)
  const danger = items.filter((i) => i.danger)
  const row = (i: MenuItem) => (
    <button
      key={i.key}
      type="button"
      role="menuitem"
      disabled={i.disabled}
      className={cn('dropdown-item min-h-11 w-full text-sm', i.danger && 'text-danger-ink hover:bg-danger/10', i.disabled && 'opacity-60')}
      onClick={() => {
        setOpen(false)
        i.onClick()
      }}
    >
      <Icon icon={i.icon} className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 text-start">
        <span className="block">{i.label}</span>
        {i.sub && <span className="text-default-700 block text-xs">{i.sub}</span>}
      </span>
    </button>
  )

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-icon border-default-300 text-default-700 hover:bg-default-100 min-h-11 min-w-11 border"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="เมนูเพิ่มเติม"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
      >
        <Icon icon="dots-vertical" className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <div className="border-default-300 bg-card absolute top-full right-0 z-30 mt-1 min-w-56 overflow-hidden rounded border shadow-lg" role="menu" aria-orientation="vertical">
          <div className="space-y-0.5 p-1">
            {normal.map(row)}
            {danger.length > 0 && normal.length > 0 && <div className="dropdown-divider" role="separator" />}
            {danger.map(row)}
          </div>
        </div>
      )}
    </div>
  )
}
