/**
 * Base: theme/paces/Admin/TS/src/layouts/components/Sidenav/index.tsx
 *
 * การปรับจาก theme:
 * - เพิ่ม items prop เพื่อรับ nav data (MenuItemType[]) จาก VerticalLayout → AppMenu
 * - AppLogo แสดงโลโก้ Deep แทน Paces logo (component เดิมที่ SafePay กำหนดไว้)
 */
import AppLogo from '@/components/AppLogo'
import { SimpleBar } from '@/components/wrappers/SimpleBar'
import type { MenuItemType } from '@/types'
import Link from 'next/link'
import AppMenu from './components/AppMenu'
import OnHoverToggle from './components/OnHoverToggle'

import UserProfileSettings from './components/UserProfileSettings'

const Sidenav = ({ items }: { items?: MenuItemType[] }) => {
  return (
    <aside id="app-menu" className="app-menu">
      <Link href="/" className="logo-box min-h-(--topbar-height) sticky top-0 flex items-center justify-start px-6 backdrop-blur-xs">
        <AppLogo />
      </Link>

      <OnHoverToggle />

      <div className="relative min-h-0 grow" id="sidenav-menu">
        <SimpleBar className="size-full">
          <UserProfileSettings />

          <div>
            <AppMenu items={items} />
          </div>
        </SimpleBar>
      </div>
    </aside>
  )
}

export default Sidenav
