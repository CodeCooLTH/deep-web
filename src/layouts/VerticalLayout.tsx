/**
 * Base: theme/paces/Admin/TS/src/layouts/VerticalLayout.tsx
 *
 * การปรับจาก theme:
 * - ลบ Customizer import และ <Customizer /> (theme switcher — ไม่ใช้ใน prod)
 * - เพิ่ม menuItems prop เพื่อรับ nav data จาก (dashboard)/layout.tsx ส่งผ่าน Sidenav
 * - 'use client' คงไว้เพราะ Sidenav/TopBar เป็น client components ที่ใช้ hooks
 */
'use client'
import Footer from '@/layouts/components/Footer'
import Sidenav from '@/layouts/components/Sidenav'
import TopBar from '@/layouts/components/TopBar'
import type { MenuItemType } from '@/types'
import { type ReactNode } from 'react'

const VerticalLayout = ({ children, menuItems }: { children: ReactNode; menuItems?: MenuItemType[] }) => {
  return (
    <div className="wrapper">
      <TopBar />
      <Sidenav items={menuItems} />
      <div className="page-content">
        <main>
          <div className="container-fluid">{children}</div>
        </main>
        <Footer />
      </div>
    </div>
  )
}

export default VerticalLayout
