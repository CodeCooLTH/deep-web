/**
 * Base: theme/paces/Admin/TS/src/layouts/components/TopBar/index.tsx
 *
 * การปรับจาก theme:
 * - ตัด widgets ที่ไม่ใช้ใน prod: AppsDropdownGrid, LanguageSelectorRounded,
 *   MegamenuApps, MegamenuColumns, SearchBoxRounded, CustomizerToggler,
 *   MonochromeToggler (theme switcher ต่างๆ ไม่เกี่ยวกับ SafePay)
 * - คงไว้: MenuToggler, NotificationDropdownPeople, ThemeDropdown,
 *   FullscreenToggler, UserDropdownDetailed
 * - UserDropdownDetailed ใช้ useSession() จาก next-auth/react ไม่ใช่ useAuth ของ Paces
 *
 * feat 00018 (Chat Rail topbar, เฉพาะ /inbox*): เพิ่ม ChatSearchBox (ช่องค้นหาเต็มความกว้าง,
 * Base SearchBoxRounded.tsx) + TextScaleToggler (ปุ่มขยายฟอนต์, วางข้าง ThemeDropdown) — โผล่
 * เฉพาะเมื่อ pathname เริ่มด้วย /inbox เท่านั้น คำนวณ isChatMode ที่ client ด้วย usePathname()
 * ไม่ใช่จาก header ฝั่ง server — บทเรียนเดียวกับ SidenavContent.tsx (server layout ไม่ re-render
 * ตอน soft navigation ทำให้ค่าค้าง) เพิ่ม 'use client' explicit ที่นี่ (เดิม implicit client อยู่
 * แล้วเพราะถูก import โดย VerticalLayout 'use client' แต่ไฟล์นี้เรียก usePathname() เอง ใส่ตรง ๆ
 * ให้ชัดเจน) หน้าอื่น (ไม่ใช่ /inbox*) — isChatMode=false → ไม่ render 2 ตัวใหม่เลย โครง topbar
 * เดิมเหมือนเดิม 100% (className ของ container/cluster เดิมไม่แตะ กันพิกเซลขยับ)
 */
'use client'
import useScrollEvent from '@/hooks/useScrollEvent'
import clsx from 'clsx'
import { usePathname } from 'next/navigation'
import ChatSearchBox from './components/ChatSearchBox'
import FullscreenToggler from './components/FullscreenToggler'
import MenuToggler from './components/MenuToggler'
import TextScaleToggler from './components/TextScaleToggler'

import NotificationDropdownPeople from './components/NotificationDropdownPeople'

import ThemeDropdown from './components/ThemeDropdown'

import UserDropdownDetailed from './components/UserDropdownDetailed'

const TopBar = () => {
  const { scrollY } = useScrollEvent()
  const pathname = usePathname()
  const isChatMode = pathname?.startsWith('/inbox') ?? false

  return (
    <header className={clsx('app-header', { 'topbar-active': scrollY > 50 })}>
      <div className="container-fluid flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <MenuToggler />
        </div>

        {/* ช่องค้นหาแชท — โผล่เฉพาะ /inbox* (งาน 1) กินพื้นที่เหลือของ topbar; scoped อยู่ใน
            div ของตัวเองไม่แตะ className ของ container-fluid เดิม กันหน้าอื่นขยับพิกเซล */}
        {isChatMode && (
          <div className="mx-3 flex min-w-0 flex-1 items-center">
            <ChatSearchBox />
          </div>
        )}

        <div className="flex items-center gap-3">
          <NotificationDropdownPeople />

          <ThemeDropdown />

          {/* ปุ่มขยายขนาดตัวอักษร — โผล่เฉพาะ /inbox* (งาน 2) วางข้างปุ่มสลับธีมตามที่กำหนด */}
          {isChatMode && <TextScaleToggler />}

          <FullscreenToggler />

          <UserDropdownDetailed />
        </div>
      </div>
    </header>
  )
}

export default TopBar
