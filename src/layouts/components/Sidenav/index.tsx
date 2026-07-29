/**
 * Base: theme/paces/Admin/TS/src/layouts/components/Sidenav/index.tsx
 *
 * การปรับจาก theme:
 * - เพิ่ม items prop เพื่อรับ nav data (MenuItemType[]) จาก VerticalLayout → AppMenu
 * - AppLogo แสดงโลโก้ Deep แทน Paces logo (component เดิมที่ SafePay กำหนดไว้)
 * - เพิ่ม headerSlot (เช่น การ์ดแพ็กเกจร้านค้าของ seller) render เหนือ AppMenu ใน SimpleBar เดียวกัน
 *   กับ footerSlot เดิม (ให้ scroll ไปด้วยกัน ไม่ sticky แยก) — admin ไม่ส่ง → ไม่กระทบ
 */
import AppLogo from '@/components/AppLogo'
import { SimpleBar } from '@/components/wrappers/SimpleBar'
import type { MenuItemType } from '@/types'
import Link from 'next/link'
import type { ReactNode } from 'react'
import AppMenu from './components/AppMenu'
import OnHoverToggle from './components/OnHoverToggle'

import UserProfileSettings from './components/UserProfileSettings'

// footerSlot: render ใต้ menu ในพื้นที่ scroll ของ sidebar (เช่น onboarding checklist ของ seller)
// headerSlot: render เหนือ menu (เช่น การ์ดแพ็กเกจร้านค้าของ seller — เหนือหัวข้อกลุ่มแรก ANALYTICS)
// admin ไม่ส่ง → ไม่กระทบ (pattern เดียวกับ topbarSlot/bottomNavSlot ของ VerticalLayout)
const Sidenav = ({
  items,
  footerSlot,
  headerSlot,
}: {
  items?: MenuItemType[]
  footerSlot?: ReactNode
  headerSlot?: ReactNode
}) => {
  return (
    <aside id="app-menu" className="app-menu">
      <Link href="/" className="logo-box min-h-(--topbar-height) sticky top-0 flex items-center justify-start px-6 backdrop-blur-xs">
        <AppLogo />
      </Link>

      <OnHoverToggle />

      <div className="relative min-h-0 grow" id="sidenav-menu">
        <SimpleBar className="size-full">
          <UserProfileSettings />

          {headerSlot && <div className="px-2.5 pt-2">{headerSlot}</div>}

          <div>
            <AppMenu items={items} />
          </div>

          {footerSlot && <div className="px-4 pb-6 pt-2">{footerSlot}</div>}
        </SimpleBar>
      </div>
    </aside>
  )
}

export default Sidenav
