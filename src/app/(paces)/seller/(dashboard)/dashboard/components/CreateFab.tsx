'use client'

/**
 * CreateFab — FAB speed-dial สำหรับสร้าง order/product/category
 *
 * ทำไม: mobile command center ต้องการ quick-action ที่เข้าถึงได้ตลอดเวลา
 * โดยไม่ต้องเปิด sidebar; FAB fixed ล่างขวา 60px touch-friendly
 *
 * Base: theme/paces/Admin/TS/src/layouts/components/Customizer/index.tsx
 * (copy concept: fixed positioning + backdrop + btn-icon rounded-full;
 *  FAB ใช้ React useState ไม่ใช้ hs-overlay เพราะ Customizer ใช้ Preline JS
 *  ที่ไม่ match speed-dial pattern — FLAG 4 ใน design spec S-13)
 */

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

// ─── FAB actions 3 รายการ (S-13) ─────────────────────────────────────────────
// short path ไม่มี /seller prefix ตาม Paces routing convention
const FAB_ACTIONS = [
  {
    label: 'สร้างหมวดหมู่',
    href: '/categories',
    icon: 'category-plus', // tabler:category-plus มีจริง — verified จาก @iconify/json
  },
  {
    label: 'สร้างสินค้า',
    href: '/products/new-v2',
    icon: 'package-plus',
  },
  {
    label: 'สร้างออเดอร์',
    href: '/orders/new',
    icon: 'shopping-cart-plus',
  },
] as const

// ─── FabAction pill — sub-component (ใช้เฉพาะใน CreateFab ไฟล์เดียวกัน) ────
type FabActionProps = {
  href: string
  label: string
  icon: string
  innerRef?: React.RefObject<HTMLAnchorElement | null>
}

function FabAction({ href, label, icon, innerRef }: FabActionProps) {
  return (
    <Link
      ref={innerRef}
      href={href}
      aria-label={label}
      className="inline-flex items-center gap-2 bg-white rounded-full shadow-md px-4 h-11 text-[13px] font-semibold text-default-900 hover:bg-gray-50 transition-colors"
    >
      <Icon icon={icon} className="text-primary text-lg" />
      {label}
    </Link>
  )
}

// ─── CreateFab — main component ───────────────────────────────────────────────
export default function CreateFab() {
  const [open, setOpen] = useState(false)

  // ref สำหรับ focus trap: action แรก (index 0) + main FAB button
  const firstActionRef = useRef<HTMLAnchorElement | null>(null)
  const mainFabRef = useRef<HTMLButtonElement>(null)

  // ESC handler — ปิด FAB เมื่อกด Escape
  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // focus trap — focus action แรกเมื่อ open; คืน focus main FAB เมื่อปิด
  useEffect(() => {
    if (open) {
      // ใช้ setTimeout เพื่อให้ DOM render actions ก่อน focus
      const timer = setTimeout(() => {
        firstActionRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    } else {
      // คืน focus กลับ main FAB หลังปิด (ไม่ return ใน else branch)
      mainFabRef.current?.focus()
    }
  }, [open])

  function close() {
    setOpen(false)
  }

  return (
    <>
      {/* Backdrop — แสดงเมื่อ open เพื่อ dim content และรับ click ปิด */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-20"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* FAB container — fixed ล่างขวา z-30 สูงกว่า backdrop (z-20) และ TOP MENU (z-10) */}
      <div className="fixed right-5 bottom-6 z-30 flex flex-col items-end gap-3">
        {/* Action pills — แสดงเมื่อ open เท่านั้น */}
        {open &&
          FAB_ACTIONS.map((action, index) => (
            <FabAction
              key={action.href}
              href={action.href}
              label={action.label}
              icon={action.icon}
              // focus trap: ส่ง ref ให้ action แรก (index 0)
              innerRef={index === 0 ? firstActionRef : undefined}
            />
          ))}

        {/* Main FAB button — 60px rounded-full bg-primary */}
        <button
          ref={mainFabRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label={open ? 'ปิดเมนูสร้าง' : 'เปิดเมนูสร้าง'}
          className="w-[60px] h-[60px] rounded-full bg-primary text-white inline-flex items-center justify-center shadow-[0_8px_24px_rgba(37,99,235,0.35)] transition-transform active:scale-95"
        >
          {/* icon toggle: plus (ปิด) → x (เปิด) */}
          <Icon icon={open ? 'x' : 'plus'} className="text-3xl" />
        </button>
      </div>
    </>
  )
}
