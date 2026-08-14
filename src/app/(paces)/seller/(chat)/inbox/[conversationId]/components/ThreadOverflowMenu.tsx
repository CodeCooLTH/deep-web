'use client'

/**
 * ThreadOverflowMenu — เมนู `⋯` ของหัวห้องแชท (2026-08-14)
 *
 * ที่มา: user สั่ง re-design หัวเธรดบนมือถือ เพราะ "จะเข้าไปดูไฟล์ที่ใช้ร่วมกันยากมาก"
 * ทางแก้ที่เลือก (แบบ A ในม็อกอัพ `docs/superpowers/specs/2026-08-14-chat-mobile-topbar-prototype.html`)
 * คือยกปุ่ม **คลังไฟล์** ขึ้นเป็นปุ่มระดับหนึ่งในหัวเธรด — แต่หัวเธรดไม่มีที่ว่างให้ปุ่มที่เพิ่มขึ้น
 *
 * 🛑 งบพื้นที่จริงที่ 320px (ค่าจากธีม ไม่ใช่การประมาณ — `flex-header-truncation.md` สั่งให้กางเลข
 * ก่อนเสนอทางแก้แถบเครื่องมือเสมอ): `.card-header` `px-5` = 40 · `gap-3` = 12 · `.btn.btn-icon`
 * (`size-9.25`) = 37 · avatar `size-9` = 36 · ปุ่ม "ข้อมูลลูกค้า" เดิม (`btn-sm` + ไอคอน) ≈ 40
 *
 *   เดิม        40 + 37 + 12 + 36 + 12 + [ชื่อ] + 12 + 40 + 12 + 37 = 238  → ชื่อเหลือ 82px
 *   เติมปุ่มไฟล์ตรง ๆ                              +37 +12 = 287  → ชื่อเหลือ 33px ⇒ ใส่ไม่ลง
 *   ยุบ 2 ปุ่มเป็น ⋯  40 + 37 + 12 + 36 + 12 + [ชื่อ] + 12 + 37 + 12 + 37 = 235 → ชื่อ 85px ✓
 *
 * จึงยุบ **ข้อมูลลูกค้า + เสียงแจ้งเตือน** มาไว้ที่นี่ (user เคาะ 2026-08-14)
 *
 * 🛑 ทำไมสวิตช์เสียงถูก "ย้ายเข้ามา" ไม่ใช่ "เรียก NotificationSoundMenu ต่อ": สวิตช์ชุดเดียวกัน
 * ห้ามมี 2 เจ้าของ (HR16) — ถ้าปล่อยให้ทั้งสองไฟล์ถือ state เดียวกัน วันที่มีคนแก้กติกาข้างหนึ่ง
 * อีกข้างจะเงียบ ๆ พูดคนละเรื่องโดยไม่มี tsc/เทสตัวไหนฟ้อง. `NotificationSoundMenu.tsx` ถูกลบไป
 * พร้อมกับรอบนี้ เหตุผลทั้งหมดของมันย้ายมาอยู่ในคอมเมนต์นี้แทน:
 *   - มันเกิดขึ้นเพราะ user report 2026-08-10 ว่า **บนมือถือ ตอนอยู่ในห้องแชทไม่มีสวิตช์เสียงเลย**
 *     (สวิตช์ระดับแอปอยู่ใน ChatHeader ซึ่ง `hidden lg:flex` ในหน้าเธรด) ⇒ ต้องยังกดถึงได้จากในห้อง
 *     เสมอ ห้ามย้ายกลับออกไปหน้าอื่น. อยู่ใน ⋯ = ยังกดถึงจากในห้อง แค่ลึกลงไป 1 ชั้น
 *   - แถวรายเธรดเป็น `disabled` ไม่ใช่ซ่อน: ซ่อนแล้วผู้ใช้ไม่มีทางรู้ว่ามีสวิตช์นี้อยู่และไม่รู้ว่าทำไมมันหาย
 *   - ไอคอนบนปุ่มสะท้อน **ผลลัพธ์รวม** ("ห้องนี้จะมีเสียงไหม") ไม่ใช่สถานะของสวิตช์ใดสวิตช์หนึ่ง
 *
 * 🛑 `[--auto-close:false]` — จำเป็น เพราะเมนูนี้มี `form-switch` อยู่ข้างใน ถ้าเมนูปิดตัวเองทุกครั้ง
 * ที่แตะสวิตช์ ผู้ใช้จะสลับสวิตช์ที่สองไม่ได้เลยโดยไม่เปิดเมนูใหม่. ผลข้างเคียงคือ **รายการที่เป็น
 * การนำทางต้องสั่งปิดเมนูเอง** (`closeMenu()`) ไม่งั้นเมนูจะค้างเปิดอยู่หลังชีตถูกปิด
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (AutoCloseBehavior "Manual close"
 *       — `[--auto-close:false]`, `<h6>` หัวเมนู, `dropdown-divider`)
 *       theme/paces/Admin/TS/src/app/(admin)/apps/promo/discounts/components/DiscountTable.tsx (form-switch)
 */

import { useEffect, useId, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import {
  CHAT_SOUND_EVENT,
  isChatSoundMuted,
  isConversationMuted,
  setChatSoundMuted,
  setConversationMuted,
} from '@/lib/chat-sound'

export default function ThreadOverflowMenu({
  conversationId,
  ordersLabel,
  onOpenPanel,
}: {
  conversationId: string
  /** คำเรียกรายการตามประเภทกิจการ (คำสั่งซื้อ / การจอง / งาน) — ห้ามพิมพ์เองที่นี่ */
  ordersLabel: string
  onOpenPanel: (tab: 'customer' | 'orders') => void
}) {
  const t = useT()
  // อ่านหลัง mount เท่านั้น — localStorage ไม่มีฝั่ง server ถ้าอ่านตอน render แรกจะ hydration mismatch
  const [appMuted, setAppMuted] = useState(false)
  const [threadMuted, setThreadMuted] = useState(false)
  const uid = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const sync = () => {
      setAppMuted(isChatSoundMuted())
      setThreadMuted(isConversationMuted(conversationId))
    }
    sync()
    // อีกแท็บ/อีกจุดบนจอเดียวกันเปลี่ยนค่า → ตามให้ทัน (ค่าที่ค้างอยู่ในเมนูที่เปิดอยู่จะโกหกทันที)
    window.addEventListener(CHAT_SOUND_EVENT, sync)
    return () => window.removeEventListener(CHAT_SOUND_EVENT, sync)
  }, [conversationId])

  // ไอคอนสะท้อน "ผลลัพธ์รวม" ไม่ใช่สถานะของสวิตช์ใดสวิตช์หนึ่ง — ปิดจากระดับไหนก็คือห้องนี้เงียบ
  const silenced = appMuted || threadMuted

  /**
   * ปิดเมนูด้วยการกดปุ่มเปิดซ้ำ — Preline toggle ที่ตัว trigger เอง ไม่ต้องพึ่ง JS API ของมัน
   * (รีโปนี้เรียก `window.HSOverlay` อยู่บ้าง แต่ไม่เคยเรียก HSDropdown เลยสักที่ จึงไม่มี
   *  precedent ให้ยืนยันว่ามีจริงในเวอร์ชันที่ใช้อยู่ — การกด trigger ซ้ำเป็นทางที่พิสูจน์ได้จาก
   *  พฤติกรรมที่ผู้ใช้ทำได้เองอยู่แล้ว)
   */
  const closeMenu = () => triggerRef.current?.click()

  return (
    <div className="hs-dropdown relative inline-flex [--auto-close:false] [--placement:bottom-end]">
      <button
        ref={triggerRef}
        type="button"
        id={`${uid}-more-trigger`}
        aria-haspopup="menu"
        aria-expanded="false"
        aria-label={t.inbox.threadMoreMenu}
        title={t.inbox.threadMoreMenu}
        className="btn btn-icon hs-dropdown-toggle hover:bg-default-100 text-default-700 relative shrink-0"
      >
        <Icon icon="dots-vertical" className="text-lg" />
        {/* จุดบอกว่าห้องนี้ถูกปิดเสียงอยู่ — เดิมสถานะนี้อ่านได้จากไอคอนกระดิ่งบนหัวเธรดโดยตรง
            พอกระดิ่งถูกยุบเข้าเมนู ถ้าไม่มีตัวบอกตรงนี้ ผู้ขายจะไม่มีทางรู้ว่าตัวเองปิดเสียงไว้
            จนกว่าจะเปิดเมนูดู (คลาสเดียวกับ "default ปิดที่ไม่มีใครรู้ว่ามีสวิตช์")
            ใช้ `bell-off` ซ้อนมุม ไม่ใช่จุดสีเปล่า — จุดสีเปล่าไม่บอกว่าปิดอะไรอยู่ */}
        {silenced && (
          <span className="bg-card text-default-500 absolute -end-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full">
            <Icon icon="bell-off" className="text-2xs" />
          </span>
        )}
      </button>

      <div
        // คลาสชุดเดียวกับ ChatShopSwitcher/theme (hs-dropdown-menu + min-w-*) — Preline จัดการ
        // การซ่อน/แสดงและ transition เอง ไม่ต้องเติม hidden/opacity เองให้ชนกับของมัน
        className="hs-dropdown-menu min-w-60"
        role="menu"
        aria-orientation="vertical"
        aria-labelledby={`${uid}-more-trigger`}
      >
        {/**
         * 🛑 รายการนำทางโผล่เฉพาะ `<md` (2026-08-14, user: "ตรงนี้ใน desktop ไม่น่าจะต้องมีนะ")
         *
         *   <768px   ไม่มีที่อื่นให้กด → ต้องมีในเมนู
         *   768–1279 มีปุ่ม "ข้อมูลลูกค้า" ของตัวเองในหัวเธรดแล้ว → มีในเมนูด้วย = ของซ้ำบนจอเดียว
         *   ≥1280px  CustomerPanel เป็นคอลัมน์ถาวรอยู่ข้าง ๆ → เมนูเหลือแต่สวิตช์เสียง
         *
         * ใช้ `md:hidden` ไม่ใช่ `xl:hidden` เพราะตัวที่ทำให้ซ้ำคือปุ่มในหัวเธรดที่โผล่ตั้งแต่ md
         * ไม่ใช่คอลัมน์ที่โผล่ตอน xl
         */}
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            closeMenu()
            onOpenPanel('customer')
          }}
          className="dropdown-item flex w-full items-center gap-2.5 md:hidden"
        >
          <Icon icon="user-circle" className="text-default-500 text-base" />
          {t.inbox.customerInfo}
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            closeMenu()
            onOpenPanel('orders')
          }}
          className="dropdown-item flex w-full items-center gap-2.5 md:hidden"
        >
          <Icon icon="shopping-cart" className="text-default-500 text-base" />
          {ordersLabel}
        </button>

        <hr className="dropdown-divider md:hidden" />

        <h6 className="text-default-800 px-2.75 py-2 font-semibold">{t.inbox.threadSoundTitle}</h6>

        <div className="flex items-center justify-between gap-3 px-2.75 py-2">
          <label htmlFor={`${uid}-app`} className="text-default-700 mb-0 text-sm">
            {t.inbox.threadSoundAllApp}
          </label>
          <input
            id={`${uid}-app`}
            type="checkbox"
            className="form-switch shrink-0"
            checked={!appMuted}
            onChange={() => setChatSoundMuted(!appMuted)}
          />
        </div>

        <div className="px-2.75 pt-1 pb-2">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor={`${uid}-thread`}
              className={`mb-0 text-sm ${appMuted ? 'text-default-500' : 'text-default-700'}`}
            >
              {t.inbox.threadSoundThisChat}
            </label>
            <input
              id={`${uid}-thread`}
              type="checkbox"
              className="form-switch shrink-0"
              // ปิดทั้งแอปอยู่ = สวิตช์นี้ไม่มีผลอะไร แต่ต้องยังเห็นว่ามีอยู่ (ไม่ใช่หายไปเฉย ๆ)
              disabled={appMuted}
              checked={!appMuted && !threadMuted}
              onChange={() => setConversationMuted(conversationId, !threadMuted)}
            />
          </div>
          {appMuted && (
            <p className="text-default-500 mt-1 mb-0 text-2xs">
              {t.inbox.threadSoundMutedHint}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
