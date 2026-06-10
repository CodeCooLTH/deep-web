'use client'

/**
 * SellerBottomNav — fixed bottom tab bar สำหรับ seller mobile shell
 *
 * ทำไม: seller ใช้งาน mobile เป็นหลัก — bottom nav เข้าถึง 5 section หลักได้
 * ด้วยหัวแม่มือ ไม่ต้องเปิด sidebar; ปุ่มกลาง ([+] สร้าง) raised พร้อม speed-dial
 * เหมือน FAB แต่ embed อยู่ใน nav bar (pattern จาก command-center-v6.html)
 *
 * Multi-source (exception อนุมัติแล้ว — Paces ไม่มี bottom nav template ตรง):
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx
 *       + theme/paces/Admin/TS/src/layouts/components/Customizer/index.tsx
 *
 * Speed-dial logic reuse จาก CreateFab.tsx (FAB_ACTIONS, useState, ESC, backdrop, focus trap)
 */

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

// ─── FAB_ACTIONS — reuse ตรงจาก CreateFab (href verified จากไฟล์นั้น) ────────
// short path ไม่มี /seller prefix ตาม Paces routing convention
// ลำดับ array: pills render ผ่าน flex-col ที่ bottom-20 (เหนือ FAB) → index 0 อยู่บนสุด,
// index สุดท้ายอยู่ล่างสุด = ใกล้ปุ่ม FAB ที่สุด. ดังนั้น 'สร้างออเดอร์' (index 2, action หลัก
// ตาม PRD S-3) เป็น pill ล่างสุด/ใกล้นิ้วสุด — อ่านจาก FAB ขึ้นบน = ออเดอร์→สินค้า→หมวดหมู่
// ตรงกับ scope acceptance S-7 (ห้ามสลับลำดับ array โดยไม่ดูทิศ flex-col)
const FAB_ACTIONS = [
  {
    label: 'สร้างหมวดหมู่',
    href: '/categories',
    icon: 'category-plus',
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

// ─── Nav tabs (4 ช่อง ยกเว้น center) ────────────────────────────────────────
const NAV_ITEMS = [
  { label: 'หน้าหลัก', href: '/dashboard', icon: 'home-2', exactMatch: true },
  { label: 'คำสั่งซื้อ', href: '/orders', icon: 'clipboard-list', exactMatch: false },
  // index 2 = center button (placeholder ไม่อยู่ใน array นี้)
  { label: 'สินค้า', href: '/products', icon: 'box', exactMatch: false },
  { label: 'ร้านค้า', href: '/shop', icon: 'building-store', exactMatch: false },
] as const

// ─── Props ────────────────────────────────────────────────────────────────────
interface SellerBottomNavProps {
  pendingCount: number
}

// ─── SpeedDialAction pill — sub-component (ใช้เฉพาะใน SellerBottomNav) ────────
type SpeedDialActionProps = {
  href: string
  label: string
  icon: string
  innerRef?: React.RefObject<HTMLAnchorElement | null>
}

function SpeedDialAction({ href, label, icon, innerRef }: SpeedDialActionProps) {
  return (
    <Link
      ref={innerRef}
      href={href}
      aria-label={label}
      className="inline-flex items-center gap-2 bg-white rounded-full shadow-md px-4 h-11 text-[13px] font-semibold text-[rgba(47,43,61,0.87)] hover:bg-gray-50 transition-colors"
    >
      <Icon icon={icon} className="text-[#7367F0] text-lg" />
      {label}
    </Link>
  )
}

// ─── SellerBottomNav — main component ─────────────────────────────────────────
export default function SellerBottomNav({ pendingCount }: SellerBottomNavProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // ref สำหรับ focus trap — action แรก + center button
  const firstActionRef = useRef<HTMLAnchorElement | null>(null)
  const centerButtonRef = useRef<HTMLButtonElement>(null)

  // badge clamp: แสดง "99+" เมื่อ ≥100
  const badgeText = pendingCount >= 100 ? '99+' : String(pendingCount)

  // active logic — /dashboard ใช้ exact match; tab อื่น ใช้ startsWith
  function isActive(href: string, exactMatch: boolean): boolean {
    if (exactMatch) return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  // ESC handler — ปิด speed-dial เมื่อกด Escape
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

  // focus trap — focus action แรกเมื่อ open; คืน focus center button เมื่อปิด
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        firstActionRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    } else {
      centerButtonRef.current?.focus()
    }
  }, [open])

  function closeSpeedDial() {
    setOpen(false)
  }

  return (
    <>
      {/* Backdrop — dim content เมื่อ speed-dial เปิด, click ปิด */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-20"
          onClick={closeSpeedDial}
          aria-hidden="true"
        />
      )}

      {/* Speed-dial action pills — แสดงเหนือ center button เมื่อ open */}
      {open && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-3 pb-2">
          {FAB_ACTIONS.map((action, index) => (
            <SpeedDialAction
              key={action.href}
              href={action.href}
              label={action.label}
              icon={action.icon}
              innerRef={index === 0 ? firstActionRef : undefined}
            />
          ))}
        </div>
      )}

      {/*
        Bottom nav bar — fixed เต็มความกว้างล่างจอ
        ใช้ fixed (ไม่ใช่ absolute) เพราะอยู่ใน real app ไม่ใช่ phone frame
        pb-[env(safe-area-inset-bottom)] รองรับ iPhone notch/home bar
        z-30 สูงกว่า backdrop (z-20)
      */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 h-16 bg-white border-t border-[rgba(47,43,61,0.10)] shadow-[0_-4px_16px_-6px_rgba(47,43,61,0.10)] grid grid-cols-5 items-center pb-[env(safe-area-inset-bottom)]"
        aria-label="เมนูหลัก"
      >
        {/* ช่อง 1: หน้าหลัก */}
        <Link
          href="/dashboard"
          className={`flex h-full flex-col items-center justify-center gap-[3px] ${
            isActive('/dashboard', true)
              ? 'text-[#7367F0]'
              : 'text-[rgba(47,43,61,0.40)]'
          }`}
          aria-label="หน้าหลัก"
          aria-current={isActive('/dashboard', true) ? 'page' : undefined}
        >
          <Icon icon="home-2" style={{ fontSize: '23px' }} />
          <span className="text-[10.5px] font-medium">หน้าหลัก</span>
        </Link>

        {/* ช่อง 2: คำสั่งซื้อ + badge */}
        <Link
          href="/orders"
          className={`relative flex h-full flex-col items-center justify-center gap-[3px] ${
            isActive('/orders', false)
              ? 'text-[#7367F0]'
              : 'text-[rgba(47,43,61,0.40)]'
          }`}
          aria-label={`คำสั่งซื้อ${pendingCount > 0 ? ` (${pendingCount} รายการรอดำเนินการ)` : ''}`}
          aria-current={isActive('/orders', false) ? 'page' : undefined}
        >
          <Icon icon="clipboard-list" style={{ fontSize: '23px' }} />
          <span className="text-[10.5px] font-medium">คำสั่งซื้อ</span>
          {/* badge — แสดงเฉพาะเมื่อ pendingCount > 0 */}
          {pendingCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-[-2px] left-[calc(50%+8px)] min-w-[16px] h-[16px] px-1 rounded-[8px] bg-[#FF4C51] text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_0_2px_white]"
            >
              {badgeText}
            </span>
          )}
        </Link>

        {/* ช่อง 3: [+] สร้าง — center raised button + speed-dial */}
        {/*
          relative cell เพื่อให้ absolute button ยกตัวออกมาได้
          touch target ≥44px: button 54px + grid cell สูง 64px = ผ่าน
        */}
        <div className="relative flex flex-col items-center">
          <button
            ref={centerButtonRef}
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-label={open ? 'ปิดเมนูสร้าง' : 'เปิดเมนูสร้าง'}
            className="absolute top-[-26px] left-1/2 -translate-x-1/2 w-[54px] h-[54px] rounded-full bg-[#7367F0] text-white flex items-center justify-center border-[3px] border-white shadow-[0_8px_18px_-4px_rgba(115,103,240,0.55),inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform active:scale-95"
          >
            {/* icon toggle: plus (ปิด) → x (เปิด) */}
            <Icon icon={open ? 'x' : 'plus'} style={{ fontSize: '26px' }} />
          </button>
          {/* label ใต้ปุ่ม — margin-top ชดเชย absolute button ที่ยกขึ้น */}
          <span
            className="text-[10.5px] font-medium text-[rgba(47,43,61,0.40)]"
            style={{ marginTop: '34px' }}
          >
            สร้าง
          </span>
        </div>

        {/* ช่อง 4: สินค้า */}
        <Link
          href="/products"
          className={`flex h-full flex-col items-center justify-center gap-[3px] ${
            isActive('/products', false)
              ? 'text-[#7367F0]'
              : 'text-[rgba(47,43,61,0.40)]'
          }`}
          aria-label="สินค้า"
          aria-current={isActive('/products', false) ? 'page' : undefined}
        >
          <Icon icon="box" style={{ fontSize: '23px' }} />
          <span className="text-[10.5px] font-medium">สินค้า</span>
        </Link>

        {/* ช่อง 5: ร้านค้า */}
        <Link
          href="/shop"
          className={`flex h-full flex-col items-center justify-center gap-[3px] ${
            isActive('/shop', false)
              ? 'text-[#7367F0]'
              : 'text-[rgba(47,43,61,0.40)]'
          }`}
          aria-label="ร้านค้า"
          aria-current={isActive('/shop', false) ? 'page' : undefined}
        >
          <Icon icon="building-store" style={{ fontSize: '23px' }} />
          <span className="text-[10.5px] font-medium">ร้านค้า</span>
        </Link>
      </nav>
    </>
  )
}
