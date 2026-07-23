'use client'

/**
 * ChatHeader — แถวบนสุดของหน้าแชทเต็มจอ (/inbox*) แทนที่ TopBar ของ seller เดิม (rewrite ตาม
 * .superpowers/sdd/chat-standalone.md) โครงที่ user ยืนยัน:
 *   [ โลโก้ ] [ ปุ่มกลับหน้าหลัก ] [ ช่องค้นหา เต็มความกว้าง ] [ สลับธีม ] [ ขนาดตัวอักษร ]
 *
 * Base โลโก้: src/layouts/components/Sidenav/index.tsx (ของเดิม — AppLogo วางในกล่อง sticky
 * ด้านบน) — ย้าย AppLogo มาไว้ที่ header นี้แทน เพราะ Sidenav ถูกตัดออกจากหน้าแชทแล้วทั้งชุด
 * Base ปุ่มกลับ: src/app/(paces)/seller/(fullscreen)/_shared/FullscreenBackButton.tsx (ปุ่ม
 * arrow-left ขนาด 44px, bg-light) — ต่างจากไฟล์นั้นตรงที่ปลายทางตายตัว /dashboard เสมอ (ไม่
 * history-aware) ตามที่ user สั่งตรง ๆ ("ปุ่มกลับหน้าหลัก (ไป /dashboard) ที่หาเจอง่าย")
 * Base ช่องค้นหา + ปุ่มธีม/ขนาดตัวอักษร: ของเดิมจาก feat 00018 (เคย mount ใน TopBar/index.tsx
 * เฉพาะ /inbox* — ตอนนี้ TopBar เดิมถูก revert ให้กลับไปเป็นของ seller ปกติแล้ว ย้าย 3
 * component นี้มาใช้ตรงที่นี่แทน ไม่มีการเขียนใหม่):
 *   - src/layouts/components/TopBar/components/ChatSearchBox.tsx
 *   - src/layouts/components/TopBar/components/TextScaleToggler.tsx
 *   - src/layouts/components/TopBar/components/ThemeDropdown.tsx
 *
 * ThemeDropdown/TextScaleToggler พึ่ง class `.topbar-item`/`.topbar-link` (สี/hover/ความสูง)
 * ที่ Paces ประกาศ scoped ไว้ใต้ `.app-header` เท่านั้น (theme/paces/.../structure/_topbar.css)
 * — เราไม่มี `.app-header` ในหน้านี้แล้ว (ไม่ใช้ VerticalLayout/TopBar เดิม) จึงคัดลอกเฉพาะ
 * selector ที่จำเป็นมาไว้ใต้ class ใหม่ `.chat-header` แทน (safepay-overrides.css) — ไม่ใช่
 * arbitrary value ใหม่ เป็นการย้าย scope ของ selector ที่มีอยู่แล้วในเอกสาร CSS ของ Paces เอง
 *
 * โลโก้ (AppLogo.tsx) มี .logo-light/.logo-dark สลับกันตาม data-theme — เดิมผูก scope
 * `.app-menu .logo-box` (สมมติพื้นเข้มเสมอเพราะ sidenav เป็นเมนูมืดตลอด ไม่ผูกกับธีมหน้าเว็บ)
 * ไม่ตรงกับ header นี้ที่พื้นขาว/เข้มสลับตาม data-theme จริง จึงเขียน toggle ของตัวเองด้วย class
 * `.chat-header-logo` (safepay-overrides.css) — ดูรายละเอียดที่ comment ของ CSS นั้น
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import AppLogo from '@/components/AppLogo'
import ChatSearchBox from '@/layouts/components/TopBar/components/ChatSearchBox'
import TextScaleToggler from '@/layouts/components/TopBar/components/TextScaleToggler'
import ThemeDropdown from '@/layouts/components/TopBar/components/ThemeDropdown'

export default function ChatHeader() {
  // มือถือ/แท็บเล็ต (<1024px) ตอนเปิดอ่านแชท: ซ่อน header นี้ให้เธรดกินเต็มจอแบบแอปแชทจริง
  // (user request 2026-07-23 "เหมือน Facebook ที่จะไม่มี logo แล้ว") — จอเล็กเป็น drill-down
  // list→thread เต็มจอ พื้นที่มีค่ามาก โลโก้/ช่องค้นหา/ปุ่มกลับหน้าหลักไม่มีประโยชน์ในหน้าเธรด
  // และ ChatThread มีหัวเธรดของตัวเอง (avatar + ชื่อ + ปุ่มย้อนกลับไป /inbox) อยู่แล้ว ทางออก
  // "กลับหน้าหลัก" ยังอยู่ที่หน้า /inbox ซึ่งเป็นที่ที่ย้อนกลับไปเจอ — ไม่มีทางตัน
  // ≥1024px ไม่ซ่อน: เป็นเลย์เอาต์ 3 คอลัมน์ที่ rail/เธรดอยู่บนจอเดียวกัน header เป็นแถบร่วมของทั้งหน้า
  const pathname = usePathname()
  const isThreadPage = /^\/inbox\/[^/]+$/.test(pathname ?? '')

  return (
    <header
      className={`chat-header min-h-(--topbar-height) shrink-0 items-center gap-3 border-b border-default-200 px-4 shadow sm:px-5 ${
        isThreadPage ? 'hidden lg:flex' : 'flex'
      }`}
    >
      {/* โลโก้ — คลิกกลับหน้าหลักได้เหมือนทุกแอป แต่ยังต้องมีปุ่มข้อความ "กลับหน้าหลัก" แยกต่างหาก
          (ด้านล่าง) ตามที่ user สั่งชัดว่าต้อง "หาเจอง่าย" ไม่ใช่พึ่งแค่คลิกโลโก้เฉย ๆ */}
      <Link href="/dashboard" className="chat-header-logo shrink-0" aria-label="กลับหน้าหลัก">
        <AppLogo />
      </Link>

      {/* ปุ่มกลับหน้าหลัก — explicit ตามคำสั่ง user ปลายทางตายตัว /dashboard เสมอ (ไม่ history-aware
          ต่างจาก FullscreenBackButton ที่ back() ก่อน) เพราะจุดประสงค์คือ "ทางออกจากโหมดแชท" ไม่ใช่
          "ย้อนกลับหน้าก่อนหน้า" — 2 ปุ่มแยกกันตาม breakpoint (label เต็ม ≥sm / ไอคอนล้วน <sm กันแถวล้น) */}
      <Link
        href="/dashboard"
        title="กลับหน้าหลัก"
        aria-label="กลับหน้าหลัก"
        className="btn bg-light text-dark btn-sm hidden shrink-0 items-center gap-1.5 sm:inline-flex"
      >
        <Icon icon="arrow-left" className="text-base" />
        <span>กลับหน้าหลัก</span>
      </Link>
      <Link
        href="/dashboard"
        title="กลับหน้าหลัก"
        aria-label="กลับหน้าหลัก"
        className="btn btn-icon bg-light text-dark inline-flex size-11 shrink-0 items-center justify-center sm:hidden"
      >
        <Icon icon="arrow-left" className="text-lg" />
      </Link>

      <div className="min-w-0 flex-1">
        <ChatSearchBox />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ThemeDropdown />
        <TextScaleToggler />
      </div>
    </header>
  )
}
