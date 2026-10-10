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
 * 00071 P3 · S-16: แท็บ/FAB มาจาก `resolveMobileNav` (prop `nav`) ตามบทบาท — เจ้าของ/ผู้ดูแลได้ DOM เดิมทุกตัวอักษร
 *   (ล็อกด้วยเทส golden `bottom-nav-owner.golden.json`) · ช่าง/ตอบแชท/เปิดบิลได้จำนวนช่องต่างกันตามสิทธิ์จริง
 *
 * Speed-dial logic reuse จาก CreateFab.tsx (FAB_ACTIONS, useState, ESC, backdrop, focus trap)
 */

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import type { MobileNav, NavTab } from '@/lib/role-nav'

// FAB_ACTIONS / buildFabActions ย้ายไป `@/lib/role-nav` (00071 P3 · S-16) — มีที่เดียว ห้ามก็อปกลับมา
// ลำดับ array: pills render ผ่าน flex-col ที่ระยะ 5.5rem+safe-area (เหนือ FAB) → index 0 อยู่บนสุด,
// index สุดท้ายอยู่ล่างสุด = ใกล้ปุ่ม FAB ที่สุด (ห้ามสลับลำดับโดยไม่ดูทิศ flex-col)

// ─── Props ────────────────────────────────────────────────────────────────────
interface SellerBottomNavProps {
  /** แท็บ + FAB ตามบทบาท — layout คำนวณจาก `resolveMobileNav` (บทบาทที่มีผลจริงของผู้ดู) */
  nav: MobileNav
  pendingCount: number
  /** unread chat count — badge ช่อง "แชท" · layout ไม่คำนวณให้บทบาทที่ไม่มี H1 (ส่ง 0 และไม่มีช่องแชท) */
  unreadChatCount: number
  /**
   * feature 00070 — มีกลุ่มรายงาน LINE ที่ alert ยังไม่รับทราบ → จุดแดงที่ช่อง "ร้านค้า"
   * 🛑 บังคับส่ง ไม่มี default (ผู้เรียกที่ลืม = จุดไม่ขึ้นเงียบ ๆ) · ไม่ผูก hidePayments (ไม่มีทางจ่ายเงิน)
   */
  shopAlert: boolean
  /**
   * `/orders/<token>` ซ่อนแถบล่างเพราะหน้านั้นวาด OrderActionBar แทน — ซ่อนเฉพาะบทบาทที่ OrderActionBar render จริง
   * (ช่างไม่มี → เห็นแถบล่าง) · ตัดสินที่ `bottomNavHiddenPages(roles)` ใน role-nav
   */
  hideOnOrderDetail: boolean
  /** `/queues` ซ่อนเพราะบอร์ดวาดแถบสร้างงานเอง (can(O2s)) — ช่างไม่มีแถบนั้น จึงต้องเห็นแถบล่าง */
  hideOnQueues: boolean
}

const FAB_BUTTON_CLASS = [
  /* arbitrary: raised FAB ขนาด/ตำแหน่ง — Paces ไม่มี token สำหรับ center raised button
     -30px (เดิม -26): แถบสูงขึ้น 8px → จุดกึ่งกลาง cell เลื่อนลง 4px ต้องชดเชยเพื่อให้
     FAB โผล่พ้นขอบบนแถบเท่าเดิม */
  'absolute top-[-30px] left-1/2 -translate-x-1/2', // carve-out: raised FAB
  'w-[54px] h-[54px]', // carve-out: ขนาด FAB
  /* arbitrary: FAB border ring 3px ขาว — ไม่มี Paces border-width token > 2px */
  'rounded-full bg-primary text-white flex items-center justify-center border-[3px] border-white', // carve-out: border 3px (Paces มีถึง 2px)
  /* arbitrary: FAB drop shadow + inset highlight — Paces shadow-* ไม่รองรับ multi-layer + inset */
  'shadow-[0_8px_18px_-4px_rgba(47,43,61,0.35),inset_0_1px_0_rgba(255,255,255,0.25)]', // carve-out: เงา multi-layer + inset
  'transition-transform active:scale-95',
].join(' ')

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

// ─── ช่องแท็บธรรมดา (ทุกช่องยกเว้น FAB) ──────────────────────────────────────────
function NavTabLink({
  tab,
  active,
  count,
  shopAlert,
}: {
  tab: NavTab
  active: boolean
  /** ตัวเลข badge ของช่องนี้ (pending/unread) — ช่องอื่นไม่ใช้ */
  count: number
  shopAlert: boolean
}) {
  const t = useT()
  const countText = count >= 100 ? '99+' : String(count)
  const ariaSuffix =
    tab.badge === 'pending' && count > 0
      ? ` (${fmt(t.dashboard.navPendingAria, { n: count })})`
      : tab.badge === 'unread' && count > 0
        ? ` (${fmt(t.dashboard.navUnreadAria, { n: count })})`
        : tab.badge === 'shopAlert' && shopAlert
          ? ` (${t.dashboard.navShopAlertAria})`
          : ''
  return (
    <Link
      href={tab.href}
      className={`${tab.badge ? 'relative ' : ''}flex h-full flex-col items-center justify-center gap-1 ${
        active ? 'text-primary' : 'text-default-500'
      }`}
      aria-label={`${tab.ariaLabel}${ariaSuffix}`}
      aria-current={active ? 'page' : undefined}
    >
      {/* nav icon = text-2xl (24px token) — ทุกช่องใช้ขนาดนี้ */}
      <Icon icon={tab.icon} className="text-2xl" />
      <span className={`text-xs font-medium${tab.key === 'orders' ? ' leading-tight' : ''}`}>{tab.label}</span>
      {(tab.badge === 'pending' || tab.badge === 'unread') && count > 0 && (
        <span
          aria-hidden="true"
          className={[
            'absolute top-[-2px] left-[calc(50%+8px)]', // carve-out: ตำแหน่ง badge เทียบ icon กลางช่อง
            /* arbitrary: badge ตำแหน่ง offset จาก center icon — calc ไม่มี token แทน */
            'min-w-[16px] h-[16px]', // carve-out: badge 16px รองรับ 2 หลัก
            /* arbitrary: badge ขนาดเล็กสุด 16px — ใช้ min-w เพื่อรองรับ 2 หลัก */
            'px-1 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center',
            /* arbitrary: badge ring 2px ขาว — ไม่มี Paces/Tailwind token outline white สำหรับ ring บน badge */
            'shadow-[0_0_0_2px_white]', // carve-out: ring ขาวรอบ badge
          ].join(' ')}
        >
          {countText}
        </span>
      )}
      {tab.badge === 'shopAlert' && shopAlert && (
        <span
          aria-hidden="true"
          className={[
            'absolute top-[-2px] left-[calc(50%+8px)]', // carve-out: ตำแหน่ง badge เทียบ icon กลางช่อง
            /* arbitrary: badge ตำแหน่ง offset จาก center icon — เหตุผลเดียวกับ badge ตัวเลข */
            'size-2.5 rounded-full bg-danger', // จุดแดงไม่มีตัวเลข
            /* arbitrary: badge ring 2px ขาว — เหตุผลเดียวกับ badge ตัวเลข */
            'shadow-[0_0_0_2px_white]', // carve-out: ring ขาวรอบ badge
          ].join(' ')}
        />
      )}
    </Link>
  )
}

// ─── SellerBottomNav — main component ─────────────────────────────────────────
export default function SellerBottomNav({
  nav,
  pendingCount,
  unreadChatCount,
  shopAlert,
  hideOnOrderDetail,
  hideOnQueues,
}: SellerBottomNavProps) {
  const t = useT()
  // FAB speed-dial เท่านั้นที่มี action list · direct/null ไม่มี
  const fabActions = nav.fab?.kind === 'speedDial' ? nav.fab.actions : []
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // ref สำหรับ focus trap — action แรก + center button
  const firstActionRef = useRef<HTMLAnchorElement | null>(null)
  const centerButtonRef = useRef<HTMLButtonElement>(null)

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

  /**
   * ทำไมต้องมี hasOpenedRef: effect ที่ผูกกับ [open] **รันตอน mount ด้วย** ซึ่งตอนนั้น
   * open === false → เข้า else → `centerButtonRef.current?.focus()` แปลว่าปุ่ม [+] ถูก
   * โฟกัสด้วยโปรแกรมทุกครั้งที่โหลดหน้า ทั้งที่ผู้ใช้ไม่ได้แตะอะไรเลย
   *
   * โฟกัสที่มาจากโปรแกรม (ไม่ใช่จากนิ้ว/เมาส์) เข้าเงื่อนไข :focus-visible ของเบราว์เซอร์
   * → วาดกรอบโฟกัสมาตรฐานรอบปุ่มค้างไว้ = กรอบสี่เหลี่ยมรอบปุ่ม [+] ที่ user รายงาน
   * (ไม่มี CSS ของเราวาดกรอบนี้ — grep ทั้ง src/assets/css แล้วไม่มี rule focus บนปุ่มนี้
   *  มันคือ UA default ที่โผล่เพราะเราไปสั่ง .focus() เอง)
   *
   * เจตนาเดิมคือ "คืนโฟกัสกลับปุ่มเมื่อปิดเมนู" ซึ่งถูกต้องตาม a11y แต่ต้องเกิดเฉพาะตอน
   * **ปิดของจริง** ไม่ใช่ตอน mount — ธงนี้จึงแยกสองกรณีนั้นออกจากกัน
   */
  const hasOpenedRef = useRef(false)

  // focus trap — focus action แรกเมื่อ open; คืน focus center button เมื่อปิด (เฉพาะที่เคยเปิดมาก่อน)
  useEffect(() => {
    if (open) {
      hasOpenedRef.current = true
      const timer = setTimeout(() => {
        firstActionRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
    if (hasOpenedRef.current) centerButtonRef.current?.focus()
  }, [open])

  function closeSpeedDial() {
    setOpen(false)
  }

  // /orders (list) = หน้า full-screen focused (มี back มุมซ้ายบน) → ซ่อน bottom nav (user req)
  // /orders/<token> (order detail, S-7) = งานเดียวจบ พื้นที่แถบล่างเอาไปทำ action bar แทน
  //   (00071: ซ่อนเฉพาะบทบาทที่ OrderActionBar render จริง — hideOnOrderDetail · ช่างไม่มี action bar จึงเห็นแถบล่าง)
  // → ซ่อนเฉพาะ path ที่มี segment เดียวหลัง /orders/ และไม่ใช่ 'new' (สร้างออเดอร์ต้องเห็น nav ปกติ)
  // /orders/<token>/edit มี 2 segment ไม่ match regex นี้ → ยังเห็น nav ตามปกติ
  // /products (list): full-bleed เดียวกับ /orders (2026-08-06) — exact match เท่านั้น
  // ห้ามกระทบ /products/<id> (product detail ยังต้องเห็น nav ปกติ)
  // /queues (list): full-bleed เดียวกับสองหน้าบน (2026-08-11, user req "bottom navbar ต้องหายไปเลย")
  //   exact match เท่านั้น — /queues/new และ /queues/<id> ยังต้องเห็น nav ปกติ
  //   🛑 หน้านี้ไม่มี FAB แล้ว ทางสร้างงานใหม่จึงต้องอยู่ในหน้าเอง (sticky bottom bar ใน
  //   AppointmentMonthBoard) — ถ้าวันไหนถอดบาร์นั้นออก ต้องเอา /queues ออกจากลิสต์นี้ด้วย
  //   ไม่งั้นซ้ำรอย /orders ที่เคยสร้างออเดอร์บนมือถือไม่ได้เลยโดยไม่มีอะไรฟ้อง
  //   (docs/conventions/seller-action-placement.md §5.1)
  //   00071: ซ่อนเฉพาะบทบาทที่บอร์ดวาดแถบสร้างงานให้ (can(O2s)) — hideOnQueues · ช่างไม่มีแถบนั้นจึงเห็นแถบล่าง
  // วาง return null หลัง hooks ทั้งหมดเพื่อไม่ละเมิด rules of hooks
  const orderDetailMatch = pathname.match(/^\/orders\/([^/]+)$/)
  const isOrderDetail = orderDetailMatch !== null && orderDetailMatch[1] !== 'new'
  if (
    pathname === '/orders' ||
    (isOrderDetail && hideOnOrderDetail) ||
    pathname === '/products' ||
    (pathname === '/queues' && hideOnQueues)
  ) {
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
        <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-3 pb-2"> {/* carve-out: 5.5rem = nav 72px + 16px ต้องเลื่อนตาม safe-area ไม่งั้นทับแถบ */}
          {fabActions.map((action, index) => (
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
          /* h-18 (72px): เพิ่มจาก h-16 ตาม user 2026-08-06 "มันเล็กไป" — ขยับ 4 จุดพ่วงตามกัน:
             speed-dial 5.5rem, main padding-bottom 5.5rem (safepay-overrides.css),
             FAB top -30px + label mt 30px, KeywordEditorClient footer bottom 5.5rem

             HR7 carve-out (2026-08-06): ความสูง = 4.5rem + safe-area แทน h-18 เปล่า ๆ เพราะ
             Tailwind ตั้ง box-sizing: border-box ให้ทุก element → `h-18` + `pb-[env(safe-area-inset-bottom)]`
             แปลว่า padding safe-area **กินเข้าไปข้างใน** 72px (เหลือเนื้อหา 38px) ไม่ใช่ต่อเพิ่ม
             ด้านล่าง. ต้องเขียนความสูงรวม inset ตรง ๆ เนื้อหาถึงจะคงที่ 72px แล้วมีเบาะ 34px
             ใต้ label กันแถบ home indicator ของ iOS (เทียบ Shopee/TrueMoney เว้น ~36pt) */
          'fixed bottom-0 left-0 right-0 z-30 h-[calc(4.5rem+env(safe-area-inset-bottom))] bg-white', // carve-out: safe-area ต้องบวก *นอก* 4.5rem (ดูบล็อกบน)
          'border-t border-default-200',
          /* arbitrary: nav drop-shadow — Paces ไม่มี token shadow ด้านบน (shadow-md ลงล่าง) */
          'shadow-[0_-4px_16px_-6px_rgba(47,43,61,0.10)]', // carve-out: เงาทิศขึ้น Paces ไม่มี token
          /* nav.gridClass = 'grid grid-cols-N' (สตริงตรงตัวจาก role-nav) — เจ้าของ N=5 = 4 ช่อง + FAB */
          `${nav.gridClass} items-center`,
          /* arbitrary: safe-area iOS notch/home bar — ไม่มี token แทน */
          'pb-[env(safe-area-inset-bottom)]',
        ].join(' ')}
        aria-label={t.dashboard.navMenuAria}
      >

        {nav.tabs.slice(0, nav.fabAfter).map((tab) => (
          <NavTabLink key={tab.key} tab={tab} active={isActive(tab.href, tab.exactMatch)} count={tab.badge === 'pending' ? pendingCount : unreadChatCount} shopAlert={shopAlert} />
        ))}

        {/* [+] สร้าง — center raised button + speed-dial */}
        {/*
          relative cell เพื่อให้ absolute button ยกตัวออกมาได้
          touch target ≥44px: button 54px + grid cell สูง 72px = ผ่าน
        */}
        {nav.fab?.kind === 'speedDial' && (
        <div className="relative flex flex-col items-center">
          <button
            ref={centerButtonRef}
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-label={open ? t.dashboard.navCreateClose : t.dashboard.navCreateOpen}
            className={FAB_BUTTON_CLASS}
          >
            {/* icon toggle: plus (ปิด) → x (เปิด)
                size-6.5 = 26px: FAB hero icon ใหญ่กว่าไอคอนใน nav เล็กน้อย (text-2xl=24) */}
            <Icon icon={open ? 'x' : 'plus'} className="size-6.5" />
          </button>
          {/* label ใต้ปุ่ม — arbitrary marginTop 30px ชดเชย absolute FAB ที่ยกขึ้น (top-[-30px]+h-54) — ไม่มี token แทน */}
          <span
            className="text-xs font-medium text-default-500"
            style={{ marginTop: '30px' }}
          >
            {t.dashboard.navCreate}
          </span>
        </div>
        )}
        {nav.fab?.kind === 'direct' && (
          <div className="relative flex flex-col items-center">
            <Link href={nav.fab.href} aria-label={nav.fab.ariaLabel} className={FAB_BUTTON_CLASS}>
              <Icon icon={nav.fab.icon} className="size-6.5" />
            </Link>
            <span className="text-xs font-medium text-default-500" style={{ marginTop: '30px' }}>
              {nav.fab.label}
            </span>
          </div>
        )}

        {nav.tabs.slice(nav.fabAfter).map((tab) => (
          <NavTabLink key={tab.key} tab={tab} active={isActive(tab.href, tab.exactMatch)} count={tab.badge === 'pending' ? pendingCount : unreadChatCount} shopAlert={shopAlert} />
        ))}
      </nav>
    </>
  )
}
