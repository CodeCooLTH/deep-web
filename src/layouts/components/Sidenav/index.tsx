/**
 * Base: theme/paces/Admin/TS/src/layouts/components/Sidenav/index.tsx
 *
 * การปรับจาก theme:
 * - เพิ่ม items prop เพื่อรับ nav data (MenuItemType[]) จาก VerticalLayout → AppMenu
 * - AppLogo แสดงโลโก้ Deep แทน Paces logo (component เดิมที่ SafePay กำหนดไว้)
 * - bug fix (feat 00018, แทน contentOverride เดิม): เนื้อหาเมนู (profile+menu+footer หรือ
 *   Chat Rail) ย้ายไป `SidenavContent` ('use client', usePathname()) แทนการรับ node สำเร็จรูป
 *   จาก server — เดิม server คำนวณโหมดแชทจาก header x-pathname แล้วส่ง node ผ่าน prop
 *   `contentOverride` แต่ Next ไม่ re-render layout ตอน soft navigation ทำให้เมนูไม่สลับตอน
 *   ผู้ใช้กดลิงก์ (สลับเฉพาะตอน hard reload) — ดู comment หัวไฟล์ SidenavContent.tsx
 * - 'use client' (ใหม่) — ต้องใช้ usePathname() ที่นี่เพื่อซ่อน OnHoverToggle ในโหมดแชท
 *   เหมือนพฤติกรรมเดิม (list ที่ย่อเหลือไอคอนไม่มีประโยชน์ในโหมดแชท)
 */
'use client'
import AppLogo from '@/components/AppLogo'
import { SimpleBar } from '@/components/wrappers/SimpleBar'
import type { MenuItemType } from '@/types'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import OnHoverToggle from './components/OnHoverToggle'
import SidenavContent from './components/SidenavContent'
import UserProfileSettings from './components/UserProfileSettings'

// footerSlot: render ใต้ menu ในพื้นที่ scroll ของ sidebar (เช่น onboarding checklist ของ seller)
// admin ไม่ส่ง → ไม่กระทบ (pattern เดียวกับ topbarSlot/bottomNavSlot ของ VerticalLayout)
const Sidenav = ({
  items,
  footerSlot,
}: {
  items?: MenuItemType[]
  footerSlot?: ReactNode
}) => {
  const pathname = usePathname()
  // ซ่อน OnHoverToggle ในโหมดแชท — เหมือนพฤติกรรมเดิม (list ย่อเหลือไอคอนไม่มีประโยชน์ตอนแสดง
  // Chat Rail) ตรวจซ้ำแบบเดียวกับ SidenavContent (เจตนา ไม่ extract shared util — ไฟล์นี้แตะแค่
  // จุดเดียว ไม่คุ้มเพิ่ม indirection)
  const isChatMode = pathname?.startsWith('/inbox') ?? false

  return (
    <aside id="app-menu" className="app-menu">
      <Link href="/" className="logo-box min-h-(--topbar-height) sticky top-0 flex items-center justify-start px-6 backdrop-blur-xs">
        <AppLogo />
      </Link>

      {!isChatMode && <OnHoverToggle />}

      <div className="relative min-h-0 grow" id="sidenav-menu">
        <SimpleBar className="size-full">
          <SidenavContent items={items} footerSlot={footerSlot} profileSlot={<UserProfileSettings />} />
        </SimpleBar>
      </div>
    </aside>
  )
}

export default Sidenav
