'use client'

/**
 * SellerBottomNav — fixed bottom tab bar สำหรับ seller mobile shell
 *
 * ทำไม: seller ใช้งาน mobile เป็นหลัก — bottom nav เข้าถึง 6 section หลักได้
 * ด้วยหัวแม่มือ ไม่ต้องเปิด sidebar; ปุ่มกลาง ([+] สร้าง) raised พร้อม speed-dial
 * เหมือน FAB แต่ embed อยู่ใน nav bar (pattern จาก command-center-v6.html)
 *
 * (ChatWidget task, feat 00011 Deep Chat) เพิ่มช่อง "แชท" เป็นช่องที่ 5 (ก่อน "ร้านค้า")
 * → grid-cols-5 เดิม (4 item + FAB) กลายเป็น grid-cols-6 (5 item + FAB); badge unread
 * copy pattern เดียวกับ badge "คำสั่งซื้อ" (bg-danger absolute offset จาก center icon)
 *
 * S-2 (Seller Mobile: Account Switcher + Bottom Bar, mini-phase 2026-07-04): ตัดช่อง "สินค้า"
 * ออก → grid-cols-6 กลับมาเหลือ grid-cols-5 (2 tab ซ้าย + FAB + 2 tab ขวา:
 * หน้าหลัก·คำสั่งซื้อ·[+]·แชท·ร้านค้า) — /products ยังเข้าได้จากเมนูลัด dashboard
 * (CarouselGrid tile "สินค้า" ที่ _constants/command-center.ts)
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
    href: '/products/new',
    icon: 'package-plus',
  },
  {
    label: 'สร้างออเดอร์',
    href: '/orders/new',
    icon: 'shopping-cart-plus',
  },
] as const

// ─── Nav tabs (4 ช่อง ยกเว้น center) ────────────────────────────────────────
// S-2: ตัด "สินค้า" ออก — /products ยังเข้าได้จากเมนูลัด dashboard (CarouselGrid)
// WARNING: อาเรย์นี้ไม่ได้ถูก render — nav ด้านล่างเขียน JSX ทีละช่องด้วยมือ (badge/FAB ต่างกัน
// ทุกช่องจน map ไม่คุ้ม) เก็บไว้เป็นสารบัญของช่องทั้ง 5 เท่านั้น แก้ที่นี่แล้วหน้าจอไม่เปลี่ยน
const NAV_ITEMS = [
  { label: 'หน้าหลัก', href: '/dashboard', icon: 'home-2', exactMatch: true },
  { label: 'คำสั่งซื้อ', href: '/orders', icon: 'clipboard-list', exactMatch: false },
  // index 2 = center button (placeholder ไม่อยู่ใน array นี้)
  { label: 'แชท', href: '/inbox', icon: 'message-circle', exactMatch: false },
  { label: 'ร้านค้า', href: '/shop', icon: 'building-store', exactMatch: false },
] as const

// ─── Props ────────────────────────────────────────────────────────────────────
interface SellerBottomNavProps {
  pendingCount: number
  /** unread chat count — badge ช่อง "แชท" (ChatWidget task, feat 00011 Deep Chat) */
  unreadChatCount: number
  /**
   * ป้ายช่อง /orders — ผันตามประเภทกิจการ (คำสั่งซื้อ / ใบสั่งงาน / บิลเข้าพัก)
   * layout เป็นคนคำนวณ (resolveOrderMenuLabel) เพื่อให้ตรงกับ sidebar และชื่อหน้าเป๊ะ ๆ
   */
  orderLabel: string
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
      className="inline-flex items-center gap-2 bg-white rounded-full shadow-md px-4 h-11 text-sm font-semibold text-default-900 hover:bg-default-100 transition-colors"
    >
      <Icon icon={icon} className="text-primary text-lg" />
      {label}
    </Link>
  )
}

// ─── SellerBottomNav — main component ─────────────────────────────────────────
export default function SellerBottomNav({ pendingCount, unreadChatCount, orderLabel }: SellerBottomNavProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // ref สำหรับ focus trap — action แรก + center button
  const firstActionRef = useRef<HTMLAnchorElement | null>(null)
  const centerButtonRef = useRef<HTMLButtonElement>(null)

  // badge clamp: แสดง "99+" เมื่อ ≥100
  const badgeText = pendingCount >= 100 ? '99+' : String(pendingCount)
  const chatBadgeText = unreadChatCount >= 100 ? '99+' : String(unreadChatCount)

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

  // /orders (list) = หน้า full-screen focused (มี back มุมซ้ายบน) → ซ่อน bottom nav (user req)
  // /orders/<token> (order detail, S-7) = งานเดียวจบ พื้นที่แถบล่างเอาไปทำ action bar แทน
  // → ซ่อนเฉพาะ path ที่มี segment เดียวหลัง /orders/ และไม่ใช่ 'new' (สร้างออเดอร์ต้องเห็น nav ปกติ)
  // /orders/<token>/edit มี 2 segment ไม่ match regex นี้ → ยังเห็น nav ตามปกติ
  // วาง return null หลัง hooks ทั้งหมดเพื่อไม่ละเมิด rules of hooks
  const orderDetailMatch = pathname.match(/^\/orders\/([^/]+)$/)
  const isOrderDetail = orderDetailMatch !== null && orderDetailMatch[1] !== 'new'
  if (pathname === '/orders' || isOrderDetail) {
    return null
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
        className={[
          'fixed bottom-0 left-0 right-0 z-30 h-16 bg-white',
          'border-t border-default-200',
          /* arbitrary: nav drop-shadow — Paces ไม่มี token shadow ด้านบน (shadow-md ลงล่าง) */
          'shadow-[0_-4px_16px_-6px_rgba(47,43,61,0.10)]',
          /* grid-cols-5 = 4 nav item + 1 center FAB cell (S-2: ตัด "สินค้า" ออก) */
          'grid grid-cols-5 items-center',
          /* arbitrary: safe-area iOS notch/home bar — ไม่มี token แทน */
          'pb-[env(safe-area-inset-bottom)]',
        ].join(' ')}
        aria-label="เมนูหลัก"
      >
        {/* ช่อง 1: หน้าหลัก */}
        {/* gap-1 (4px token) ระหว่าง icon กับ label ทุกช่อง — เลิก arbitrary gap-[3px] */}
        <Link
          href="/dashboard"
          className={`flex h-full flex-col items-center justify-center gap-1 ${
            isActive('/dashboard', true)
              ? 'text-primary'
              : 'text-default-500'
          }`}
          aria-label="หน้าหลัก"
          aria-current={isActive('/dashboard', true) ? 'page' : undefined}
        >
          {/* nav icon = text-2xl (24px token) แทน inline fontSize 23px — ทุกช่องใช้ขนาดนี้ */}
          <Icon icon="home-2" className="text-2xl" />
          <span className="text-xs font-medium">หน้าหลัก</span>
        </Link>

        {/* ช่อง 2: คำสั่งซื้อ + badge */}
        <Link
          href="/orders"
          className={`relative flex h-full flex-col items-center justify-center gap-1 ${
            isActive('/orders', false)
              ? 'text-primary'
              : 'text-default-500'
          }`}
          aria-label={`${orderLabel}${pendingCount > 0 ? ` (${pendingCount} รายการรอดำเนินการ)` : ''}`}
          aria-current={isActive('/orders', false) ? 'page' : undefined}
        >
          <Icon icon="clipboard-list" className="text-2xl" />
          <span className="text-xs font-medium">{orderLabel}</span>
          {/* badge — แสดงเฉพาะเมื่อ pendingCount > 0 */}
          {pendingCount > 0 && (
            <span
              aria-hidden="true"
              className={[
                'absolute top-[-2px] left-[calc(50%+8px)]',
                /* arbitrary: badge ตำแหน่ง offset จาก center icon — calc ไม่มี token แทน */
                'min-w-[16px] h-[16px]',
                /* arbitrary: badge ขนาดเล็กสุด 16px — ต่ำกว่า Tailwind w-4 (=16px) ใช้ w-4 ได้แต่ใช้ min-w เพื่อรองรับ 2 หลัก */
                'px-1 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center',
                /* arbitrary: badge ring 2px ขาว — ไม่มี Paces/Tailwind token outline white สำหรับ ring บน badge */
                'shadow-[0_0_0_2px_white]',
              ].join(' ')}
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
            className={[
              /* arbitrary: raised FAB ขนาด/ตำแหน่ง — Paces ไม่มี token สำหรับ center raised button */
              'absolute top-[-26px] left-1/2 -translate-x-1/2',
              'w-[54px] h-[54px]',
              /* arbitrary: FAB border ring 3px ขาว — ไม่มี Paces border-width token > 2px */
              'rounded-full bg-primary text-white flex items-center justify-center border-[3px] border-white',
              /* arbitrary: FAB drop shadow + inset highlight — Paces shadow-* ไม่รองรับ multi-layer + inset */
              'shadow-[0_8px_18px_-4px_rgba(47,43,61,0.35),inset_0_1px_0_rgba(255,255,255,0.25)]',
              'transition-transform active:scale-95',
            ].join(' ')}
          >
            {/* icon toggle: plus (ปิด) → x (เปิด)
                size-6.5 = 26px: FAB hero icon ใหญ่กว่าไอคอนใน nav เล็กน้อย (text-2xl=24) */}
            <Icon icon={open ? 'x' : 'plus'} className="size-6.5" />
          </button>
          {/* label ใต้ปุ่ม — arbitrary marginTop 34px ชดเชย absolute FAB ที่ยกขึ้น (top-[-26px]+h-54) — ไม่มี token แทน */}
          <span
            className="text-xs font-medium text-default-500"
            style={{ marginTop: '34px' }}
          >
            สร้าง
          </span>
        </div>

        {/* ช่อง 4: แชท + badge (ChatWidget task, feat 00011 Deep Chat) — copy badge markup
            จากช่อง "คำสั่งซื้อ" ด้านบน (bg-danger absolute offset จาก center icon) */}
        <Link
          href="/inbox"
          className={`relative flex h-full flex-col items-center justify-center gap-1 ${
            isActive('/inbox', false)
              ? 'text-primary'
              : 'text-default-500'
          }`}
          aria-label={`แชท${unreadChatCount > 0 ? ` (${unreadChatCount} ข้อความยังไม่อ่าน)` : ''}`}
          aria-current={isActive('/inbox', false) ? 'page' : undefined}
        >
          <Icon icon="message-circle" className="text-2xl" />
          <span className="text-xs font-medium">แชท</span>
          {unreadChatCount > 0 && (
            <span
              aria-hidden="true"
              className={[
                'absolute top-[-2px] left-[calc(50%+8px)]',
                /* arbitrary: badge ตำแหน่ง offset จาก center icon — เหตุผลเดียวกับ badge "คำสั่งซื้อ" */
                'min-w-[16px] h-[16px]',
                /* arbitrary: badge ขนาดเล็กสุด 16px — เหตุผลเดียวกับ badge "คำสั่งซื้อ" */
                'px-1 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center',
                /* arbitrary: badge ring 2px ขาว — เหตุผลเดียวกับ badge "คำสั่งซื้อ" */
                'shadow-[0_0_0_2px_white]',
              ].join(' ')}
            >
              {chatBadgeText}
            </span>
          )}
        </Link>

        {/* ช่อง 5: ร้านค้า */}
        <Link
          href="/shop"
          className={`flex h-full flex-col items-center justify-center gap-1 ${
            isActive('/shop', false)
              ? 'text-primary'
              : 'text-default-500'
          }`}
          aria-label="ร้านค้า"
          aria-current={isActive('/shop', false) ? 'page' : undefined}
        >
          <Icon icon="building-store" className="text-2xl" />
          <span className="text-xs font-medium">ร้านค้า</span>
        </Link>
      </nav>
    </>
  )
}
