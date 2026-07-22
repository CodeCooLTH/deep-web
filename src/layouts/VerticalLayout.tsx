/**
 * Base: theme/paces/Admin/TS/src/layouts/VerticalLayout.tsx
 *
 * การปรับจาก theme:
 * - ลบ Customizer import และ <Customizer /> (theme switcher — ไม่ใช้ใน prod)
 * - เพิ่ม menuItems prop เพื่อรับ nav data จาก (dashboard)/layout.tsx ส่งผ่าน Sidenav
 * - 'use client' คงไว้เพราะ Sidenav/TopBar เป็น client components ที่ใช้ hooks
 * - T3: เพิ่ม shellClassName + topbarSlot (optional) — admin ไม่ส่ง → ไม่กระทบ
 *   shellClassName: เติม class ที่ .wrapper เพื่อให้ CSS selector scoped ผ่าน marker
 *   topbarSlot: render หลัง <TopBar /> ใน .wrapper (นอก .page-content main) + ครอบ lg:hidden
 *              SellerMobileHeader ไม่มี lg:hidden ในตัว → ครอบที่นี่แทนเพื่อไม่กระทบ desktop ≥lg
 * - CC-v6 T1: เพิ่ม bottomNavSlot (optional) — render ท้าย .wrapper + ครอบ lg:hidden
 *   (SellerBottomNav position:fixed; ครอบ lg:hidden เพื่อให้โผล่เฉพาะ <lg; admin ไม่ส่ง → ไม่กระทบ)
 * - feat 00008 P4-6: ลบ hasBusinessMembership prop (dead) — AccountSwitcher ย้ายไป
 *   topbar UserDropdownDetailed แล้ว (อ่าน session ตรงเอง ไม่ต้อง thread ผ่าน Sidenav)
 * - bug fix (feat 00018): ลบ sidenavOverride prop (dead — Sidenav ตัดสิน Chat Rail เองแล้วผ่าน
 *   usePathname() ใน SidenavContent ไม่ต้องรับ node จาก server อีกต่อไป — ดู Sidenav/index.tsx)
 * - feat 00018 (Chat Rail topbar): ครอบทั้งก้อน (TopBar + Sidenav + page-content) ด้วย
 *   ChatSearchProvider — ให้ ChatSearchBox (topbar, เขียน) กับ InboxList (rail, อ่าน) ใช้ state
 *   ช่องค้นหาเดียวกัน mount ที่นี่ (จุดเดียวที่เป็น ancestor ร่วมของทั้งสองฝั่ง) provider เป็น
 *   context เปล่า ไม่มีผลกับหน้าที่ไม่ใช่ /inbox (ไม่มีใคร consume ก็ไม่มีอะไรเกิดขึ้น)
 */
'use client'
import { ChatSearchProvider } from '@/context/useChatSearchContext'
import Footer from '@/layouts/components/Footer'
import Sidenav from '@/layouts/components/Sidenav'
import TopBar from '@/layouts/components/TopBar'
import type { MenuItemType } from '@/types'
import { type ReactNode } from 'react'

type VerticalLayoutProps = {
  children: ReactNode
  menuItems?: MenuItemType[]
  /** marker class สำหรับ CSS selector scoped (เช่น "seller-mobile-shell") — admin ไม่ส่ง */
  shellClassName?: string
  /** sticky topbar เพิ่มเติม render หลัง <TopBar /> นอก .page-content — ครอบ lg:hidden อัตโนมัติ */
  topbarSlot?: ReactNode
  /** bottom nav (fixed) render ท้าย .wrapper — ครอบ lg:hidden อัตโนมัติ; admin ไม่ส่ง → ไม่กระทบ */
  bottomNavSlot?: ReactNode
  /** เนื้อหาใต้เมนูใน sidebar (เช่น onboarding checklist ของ seller) — admin ไม่ส่ง → ไม่กระทบ */
  sidenavFooterSlot?: ReactNode
}

const VerticalLayout = ({
  children,
  menuItems,
  shellClassName,
  topbarSlot,
  bottomNavSlot,
  sidenavFooterSlot,
}: VerticalLayoutProps) => {
  // รวม class: "wrapper" เสมอ + shellClassName ถ้าส่งมา (admin ไม่ส่ง → ไม่เพิ่ม)
  const wrapperClass = shellClassName ? `wrapper ${shellClassName}` : 'wrapper'

  return (
    <ChatSearchProvider>
      <div className={wrapperClass}>
        <TopBar />
        {/* topbarSlot: ครอบ lg:hidden เพื่อให้โผล่เฉพาะ <lg; ≥lg ซ่อน → ไม่ regress desktop */}
        {topbarSlot && <div className="lg:hidden">{topbarSlot}</div>}
        <Sidenav items={menuItems} footerSlot={sidenavFooterSlot} />
        <div className="page-content">
          <main>
            <div className="container-fluid">{children}</div>
          </main>
          <Footer />
        </div>
        {/* bottomNavSlot: ครอบ lg:hidden เพื่อให้โผล่เฉพาะ <lg; ≥lg ซ่อน → ไม่ regress desktop */}
        {bottomNavSlot && <div className="lg:hidden">{bottomNavSlot}</div>}
      </div>
    </ChatSearchProvider>
  )
}

export default VerticalLayout
