'use client'

/**
 * SidenavContent — เนื้อหาเมนูซ้าย (bug fix: Chat Rail ไม่สลับเมนูตอน soft nav, feat 00018)
 *
 * Base: theme/paces/Admin/TS/src/layouts/components/Sidenav/index.tsx (โครง UserProfileSettings
 * + AppMenu + footerSlot เดิม — ยกมาทั้งก้อนจาก Sidenav/index.tsx โดยไม่เปลี่ยนหน้าตา)
 *
 * root cause เดิม: (dashboard)/layout.tsx (server) คำนวณ isChatMode จาก header x-pathname แล้วส่ง
 * sidenavOverride ลงมา — App Router **ไม่ re-render layout ตอน client-side navigation** (layout
 * ใช้ร่วมทุกหน้า seller) → isChatMode ค้างค่าตอนโหลดหน้าแรก ไม่มีทางอัปเดตตอนกดเมนู "ข้อความ"
 *
 * แก้โดยย้ายการตัดสินใจมาที่ client ด้วย usePathname() — client component re-render ทุกครั้งที่
 * pathname เปลี่ยน (ไม่ว่า hard reload หรือ soft nav) จึงสลับ rail ได้ถูกต้องเสมอ
 *
 * data ของ Chat Rail: ย้ายจาก server query (ChatRail.tsx เดิม, ลบไปแล้ว) มาเป็น client fetch เอง
 * ใน ChatRailClient — กันไม่ให้ (dashboard)/layout.tsx ต้อง query ข้อมูลแชทให้ทุกหน้า seller ฟรี ๆ
 *
 * seller-chat-shell class (คุมความกว้าง rail 320px ที่ safepay-overrides.css) เดิมมาจาก
 * shellClassName ที่ server คำนวณ (มีปัญหาเดียวกับข้อบน) — ย้ายมา toggle ที่นี่ด้วย
 * useLayoutEffect บน document.documentElement (sync ก่อน paint กันจอกระพริบ) แทน
 */
import type { MenuItemType } from '@/types'
import type { ReactNode } from 'react'
import { useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'
import ChatRailClient from '@/app/(paces)/seller/(dashboard)/inbox/components/ChatRailClient'
import AppMenu from './AppMenu'

const SidenavContent = ({
  items,
  footerSlot,
  profileSlot,
}: {
  items?: MenuItemType[]
  footerSlot?: ReactNode
  /** UserProfileSettings — server (Sidenav) ส่งเข้ามาเป็น node เดียวกับที่เคย render ตรง */
  profileSlot?: ReactNode
}) => {
  const pathname = usePathname()
  const isChatMode = pathname?.startsWith('/inbox') ?? false

  // sync ก่อน paint (useLayoutEffect) กันจอกระพริบ — toggle class บน <html> ไม่ใช่ node ในนี้
  // เพราะ .seller-chat-shell (safepay-overrides.css) ต้อง scope ที่ .wrapper ขึ้นไป (custom
  // property --sidenav-width ต้อง inherit ลงมาถึง .app-menu/.page-content ที่เป็น sibling
  // ของ SidenavContent เอง) — class selector ไม่สนตำแหน่ง DOM จึงติดที่ <html> ได้เหมือนกัน
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('seller-chat-shell', isChatMode)
    return () => {
      document.documentElement.classList.remove('seller-chat-shell')
    }
  }, [isChatMode])

  if (isChatMode) return <ChatRailClient />

  return (
    <>
      {profileSlot}

      <div>
        <AppMenu items={items} />
      </div>

      {footerSlot && <div className="px-4 pb-6 pt-2">{footerSlot}</div>}
    </>
  )
}

export default SidenavContent
