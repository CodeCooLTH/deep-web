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
 * useLayoutEffect (sync ก่อน paint กันจอกระพริบ) แทน
 *
 * bug fix (Chat Rail ยังกว้าง 245px บน prod ทั้งที่ .seller-chat-shell ควรชนะ): เดิม toggle
 * class ที่ document.documentElement (<html>) ซึ่งเป็น element เดียวกับที่ Tailwind v4 compile
 * `@theme{ --sidenav-width: 245px }` (config/_root.css) ลงไปเป็น `:root`/`:host` — ทำให้ค่า
 * ของ --sidenav-width บน <html> ต้องแข่ง cascade (layer/specificity/source-order) ระหว่าง 2 rule
 * ที่ target element เดียวกัน ผลลัพธ์ไม่เสถียรข้าม build pipeline (Turbopack/postcss อาจ
 * เรียง @layer ต่างจากที่คาด) — วัดจริงบน prod แล้วแพ้ ได้ 245px ไม่ใช่ 320px
 *
 * แก้โดยย้าย target ไปที่ ".wrapper" (div ที่ VerticalLayout.tsx render ครอบ <TopBar/>+<Sidenav/>+
 * .page-content — เป็น ancestor ที่ใกล้กว่า <html> ของทั้ง <aside id="app-menu"> และ .page-content)
 * เพราะ custom property เป็นเรื่อง "inheritance ตาม DOM tree" ไม่ใช่ specificity — เมื่อประกาศ
 * --sidenav-width ไว้ที่ .wrapper ตรง ๆ ก็ไม่มี rule อื่นแข่ง cascade บน element นั้นเลย (ไม่มี rule
 * ไหนใน codebase target `.wrapper` ด้วย custom property นี้อีก) การันตีชนะเสมอไม่ว่า build
 * pipeline จะเรียง layer ยังไง — พิสูจน์ด้วย headless-browser (Playwright) ทั้งกรณีปกติและกรณี
 * adversarial (จำลอง unlayered :root rule มาทีหลัง .wrapper rule) ได้ 320px ทั้งคู่ (ดู
 * .superpowers/sdd/fix-rail-3.md บั๊ก 2)
 *
 * .wrapper มีแค่ตัวเดียวต่อหน้า (VerticalLayout/HorizontalLayout เท่านั้นที่ประกาศ class นี้ — grep
 * แล้ว) ใช้ document.querySelector ปลอดภัย ไม่ชนกับ element อื่น
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

  // sync ก่อน paint (useLayoutEffect) กันจอกระพริบ — toggle class ที่ ".wrapper" (ancestor ที่ใกล้
  // กว่า <html>) ไม่ใช่ document.documentElement อีกต่อไป (ดู comment หัวไฟล์: bug fix cascade race)
  useLayoutEffect(() => {
    const wrapperEl = document.querySelector<HTMLElement>('.wrapper')
    wrapperEl?.classList.toggle('seller-chat-shell', isChatMode)
    return () => {
      wrapperEl?.classList.remove('seller-chat-shell')
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
