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
 * โลโก้ใช้ `logo-deep-wordmark.png` ตรง ๆ (ตัวเดียวกับหน้า login) ไม่ผ่าน `AppLogo` แล้ว —
 * `AppLogo` แสดง **มาร์กอย่างเดียว** เพราะแถบเมนูซ้ายพื้นเข้มเสมอ ส่วนหัวแชทพื้นสว่าง/เข้ม
 * สลับตาม `data-theme` จึงใช้เวิร์ดมาร์กเต็มได้ · `.chat-header-logo` ที่เคยสลับ light/dark
 * ถูกลบไปแล้ว ไม่ต้องใช้ (รูปเดียวจบ)
 */
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import logoWordmark from '@/assets/images/logo-deep-wordmark.png'
import Icon from '@/components/wrappers/Icon'
import ChatShopSwitcher from './ChatShopSwitcher'
import { isChatThreadPath } from './chat-chrome'
import ChatSearchBox from '@/layouts/components/TopBar/components/ChatSearchBox'
import TextScaleToggler from '@/layouts/components/TopBar/components/TextScaleToggler'
import ThemeDropdown from '@/layouts/components/TopBar/components/ThemeDropdown'
import { CHAT_SOUND_EVENT, isChatSoundMuted, primeChatSound, setChatSoundMuted } from '@/lib/chat-sound'
import { useT } from '@/i18n/LocaleProvider'

export default function ChatHeader({
  /** โหมดมุมมองกล่องข้อความของผู้ใช้ (feature 00037) — resolve ที่ layout (server) ส่งลงมา
   *  ไม่ให้ client ยิงถามเอง: ค่านี้ต้องตรงกับขอบเขตที่ server ใช้ query รายการอยู่แล้วเป๊ะ ๆ */
  chatScopeMode = 'SINGLE',
}: {
  chatScopeMode?: 'SINGLE' | 'UNIFIED'
}) {
  const t = useT()
  // มือถือ/แท็บเล็ต (<1024px) ตอนเปิดอ่านแชท: ซ่อน header นี้ให้เธรดกินเต็มจอแบบแอปแชทจริง
  // (user request 2026-07-23 "เหมือน Facebook ที่จะไม่มี logo แล้ว") — จอเล็กเป็น drill-down
  // list→thread เต็มจอ พื้นที่มีค่ามาก โลโก้/ช่องค้นหา/ปุ่มกลับหน้าหลักไม่มีประโยชน์ในหน้าเธรด
  // และ ChatThread มีหัวเธรดของตัวเอง (avatar + ชื่อ + ปุ่มย้อนกลับไป /inbox) อยู่แล้ว ทางออก
  // "กลับหน้าหลัก" ยังอยู่ที่หน้า /inbox ซึ่งเป็นที่ที่ย้อนกลับไปเจอ — ไม่มีทางตัน
  // ≥1024px ไม่ซ่อน: เป็นเลย์เอาต์ 3 คอลัมน์ที่ rail/เธรดอยู่บนจอเดียวกัน header เป็นแถบร่วมของทั้งหน้า
  const pathname = usePathname()
  const chromeSearch = useSearchParams()
  // สำคัญ: `/inbox/comments` ไม่ใช่หน้าเธรด (user report prod 2026-08-04: "พอสลับไป tab คอมเม้น
  // TopBar หาย") — regex เดิมจับ `/inbox/<อะไรก็ได้>` จึงเหมาเอาแท็บความคิดเห็นไปด้วย แล้วมือถือ
  // เลยไม่มีทั้งโลโก้/ช่องค้นหา/ปุ่มร้าน ทั้งที่มันคือ "รายการ" ไม่ใช่ห้องแชทที่ต้องกินพื้นที่เต็มจอ
  // (เห็นชัดขึ้นหลังย้ายแท็บมาไว้ที่ layout — ก่อนหน้านี้แท็บอยู่ในหน้าเลยพอมีอะไรค้างให้เห็น)
  // เกณฑ์อยู่ที่ chat-chrome.ts เพราะแถบแท็บ (InboxTabs) ต้องซ่อน/โชว์พร้อมกันเป๊ะ ๆ กับแถบนี้
  // ส่วนขยาย 2026-08-20 — เธรดคอมเมนต์อยู่ในหน้าเดียวกับรายการ ตัวบอกจึงเป็น `?post=` ไม่ใช่ path
  // (ดูเหตุผลเต็มที่ chat-chrome.ts) ต้องอ่านผ่านฟังก์ชันตัวเดียวกับ InboxTabs ห้ามเช็คเองที่นี่
  const isThreadPage = isChatThreadPath(pathname, chromeSearch)

  // โลโก้ร้าน active + สลับร้านย้ายเข้า ChatShopSwitcher (feat 2026-07-30) — ChatHeader ไม่ต้อง
  // อ่าน session เองอีกต่อไปสำหรับส่วนนั้น

  // เสียงเตือนข้อความใหม่ (user สั่ง 2026-07-23) — ปุ่มนี้คือสวิตช์ "ระดับแอป" ปิดแล้วเงียบทุกเธรด
  // (ปิดรายเธรดอยู่ที่หัวเธรดใน ChatThread) ค่าอ่านหลัง mount เท่านั้น: localStorage ไม่มีบน server
  // ถ้าอ่านตอน render แรกจะ hydration mismatch
  const [muted, setMuted] = useState(false)
  useEffect(() => {
    setMuted(isChatSoundMuted())
    const sync = () => setMuted(isChatSoundMuted())
    window.addEventListener(CHAT_SOUND_EVENT, sync)
    // ปลดล็อก AudioContext ตอน gesture แรก — เบราว์เซอร์ห้ามเล่นเสียงก่อนผู้ใช้ interact
    const stopPriming = primeChatSound()
    return () => {
      window.removeEventListener(CHAT_SOUND_EVENT, sync)
      stopPriming()
    }
  }, [])

  return (
    <header
      // ไม่มี shadow (user สั่ง 2026-08-04 "Top Bar ในหน้า chat ไม่อยากให้มี shadow") — เส้น
      // border-b ทำหน้าที่แยกชั้นอยู่แล้ว และหน้าแชทเป็น shell เต็มจอที่ไม่มีอะไรเลื่อนผ่านใต้หัว
      // (เงามีเหตุผลเมื่อเนื้อหาลอดใต้หัวได้ ซึ่งที่นี่ไม่ใช่ — เงาจึงเหลือแค่คราบเทาที่ขอบ)
      className={`chat-header min-h-(--topbar-height) shrink-0 items-center gap-3 border-b border-default-200 px-4 sm:px-5 ${
        isThreadPage ? 'hidden lg:flex' : 'flex'
      }`}
    >
      {/* โลโก้ Deep — คลิกกลับหน้าหลัก (ตัวเดียวกับที่หน้า login ใช้)

          🛑 ประวัติของช่องนี้ กลับมติ 2 รอบ อ่านก่อนแก้:
            2026-07-23  user สั่งตัดปุ่ม Back ออก ให้ใช้การคลิกโลโก้แทน
            2026-08-19  เปลี่ยนเป็นปุ่มย้อนกลับ (ตอนนั้นโลโก้ยังเป็นแบรนด์ "Paces" ของธีม
                        และคอมเมนต์เก่าอ้างว่ามีปุ่ม storefront เป็นทางกลับอีกทาง ซึ่งไม่มีจริงแล้ว)
            2026-08-19  **กลับมาเป็นโลโก้** หลังเปลี่ยนเป็นโลโก้ Deep จริง — user สั่งเอง
                        ("เปลี่ยนไปใช้แบบเดิมได้มั้ย แต่ logo เป็นแบบหน้า login")

          เหตุผลที่ตอนนี้ใช้ได้แล้วทั้งที่รอบก่อนไม่ผ่าน: ปัญหาเดิมไม่ใช่ "โลโก้ไม่ควรเป็นทางกลับ"
          แต่คือ **โลโก้เป็นแบรนด์ของคนอื่น** ⇒ พอเป็นแบรนด์เราแล้ว การคลิกโลโก้กลับหน้าหลัก
          คือแพตเทิร์นมาตรฐานที่ผู้ใช้รู้จักอยู่แล้ว

          `h-8` (32px) ไม่ใช่ค่าจากหน้า login (56px) — หัวแชทสูง `--topbar-height` และมีปุ่ม
          size-11 (44px) เรียงข้าง ๆ โลโก้ 56px จะดันแถวสูงกว่าปุ่มทั้งแถว
          ตรวจแล้วว่าไม่มีกฎ CSS ตัวไหนจับ `.chat-header img` ⇒ utility ตัวนี้มีผลจริง
          (ต่างจากหน้า login ที่ `.auth-logo img` เป็น CSS นอก layer และชนะ utility เสมอ) */}
      <Link
        href="/dashboard"
        className="shrink-0"
        aria-label={t.inbox.backToDashboard}
      >
        <img src={logoWordmark.src} alt="Deep" className="h-8 w-auto" />
      </Link>

      <div className="min-w-0 flex-1">
        <ChatSearchBox />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setChatSoundMuted(!muted)}
          aria-pressed={muted}
          title={muted ? t.inbox.soundOn : t.inbox.soundOff}
          aria-label={muted ? t.inbox.soundOn : t.inbox.soundOff}
          className={`btn btn-icon inline-flex size-11 items-center justify-center ${
            muted ? 'text-default-700' : 'text-dark'
          }`}
        >
          <Icon icon={muted ? 'volume-off' : 'volume'} className="text-lg" />
        </button>
        <ThemeDropdown />
        <TextScaleToggler />
        {/* ปุ่มร้าน (dropdown สลับร้าน) — ย้ายมาไว้ **ขวาสุด** ตามที่ user สั่ง 2026-08-04
            ("ฝากย้าย icon ร้าน ไปไว้ขวาสุดให้หน่อย") เดิมอยู่ก่อนกลุ่มไอคอนระบบ (เสียง/ธีม/ขนาด
            ตัวอักษร) ซึ่งทำให้รูปร้านที่เป็นสีจัดที่สุดในแถบไปแทรกกลางกลุ่มไอคอนสีเทา
            ขวาสุด = ตำแหน่งที่ทุกแอปวางเมนูบัญชี/พื้นที่ทำงาน (earned familiarity) */}
        <ChatShopSwitcher chatScopeMode={chatScopeMode} />
      </div>
    </header>
  )
}
