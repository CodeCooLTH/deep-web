'use client'

/**
 * ThreadOverflowMenu — เมนู `⋯` ของหัวห้องแชท (เหลือแค่สวิตช์เสียง)
 *
 * ═══ ประวัติของกล่องนี้ กลับมติ 2 รอบในวันเดียว อ่านก่อนแก้ ═══
 *
 * 2026-08-14  เกิดขึ้นเพื่อยุบ "ข้อมูลลูกค้า + เสียงแจ้งเตือน" ออกจากหัวเธรด เอาที่ว่างไปให้ปุ่ม
 *             คลังไฟล์ (user: "จะเข้าไปดูไฟล์ที่ใช้ร่วมกันยากมาก")
 * 2026-08-27  user: "ไม่ต้องมี dropdown บน desktop ให้ desktop แสดง icon เต็ม ๆ ไปเลย"
 *             → เมนูเป็น `md:hidden`
 * 2026-08-27  user: "ใน mobile ผมอยากให้มี [bell] [customer info] หน่อย ตอนนี้มันต้องกด dropdown ก่อน"
 *             → ยกทุกอย่างขึ้นแถบ เมนูถูกถอดทิ้งชั่วคราว
 * 2026-08-27  user: "ปุ่มมันเยอะไปป่ะ" → ถอดปุ่มคลังไฟล์
 * 2026-08-27  **มติปัจจุบัน** — user: "[ตอบอัตโนมัติ] [ข้อมูล] [dropdown] ← dropdown ให้แสดง
 *             เปิดปิดเสียง" ⇒ เมนูกลับมา **เฉพาะจอแคบ** และถือของชิ้นเดียวคือสวิตช์เสียง
 *
 * ⇒ ลำดับความสำคัญที่ user เคาะสำหรับจอแคบ: **ตอบอัตโนมัติ > ข้อมูลลูกค้า > เสียง**
 *   (เสียงเป็นของที่ตั้งครั้งเดียวแล้วแทบไม่แตะอีก จึงเป็นตัวที่ยอมให้ลึกลงไป 1 ชั้นได้)
 *
 * 🛑 เดสก์ท็อป (≥768px) **ห้ามมีเมนูนี้** — คำสั่งเดิมของ user ยังอยู่ ที่นั่นเสียงเป็นปุ่มกระดิ่ง
 * ของตัวเอง (`ThreadSoundButton`) ที่ `hidden md:inline-flex`
 *
 * 🛑 ตรรกะเสียงอยู่ที่ `useThreadSound()` เจ้าของเดียวทั้งปุ่มกระดิ่งและเมนูนี้ (HR16) —
 * ห้ามให้ไฟล์ไหนเรียก `isChatSoundMuted()/isConversationMuted()` เองอีก
 *
 * 🛑 `[--auto-close:false]` — จำเป็น เพราะมี `form-switch` อยู่ข้างใน ถ้าเมนูปิดตัวเองทุกครั้งที่
 * แตะสวิตช์ ผู้ใช้จะอ่านผลของสิ่งที่เพิ่งกดไม่ทัน
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (AutoCloseBehavior "Manual close"
 *       — `[--auto-close:false]`, `<h6>` หัวเมนู)
 *       theme/paces/Admin/TS/src/app/(admin)/apps/promo/discounts/components/DiscountTable.tsx (form-switch)
 */

import { useId } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { useThreadSound } from './ThreadSoundToggle'

export default function ThreadOverflowMenu({ conversationId }: { conversationId: string }) {
  const t = useT()
  const uid = useId()
  // ไอคอนสะท้อน "ผลลัพธ์รวม" ไม่ใช่สถานะของสวิตช์ใดสวิตช์หนึ่ง — ปิดจากระดับไหนก็คือห้องนี้เงียบ
  const { appMuted, threadMuted, silenced, toggleThread } = useThreadSound(conversationId)

  return (
    <div className="hs-dropdown relative inline-flex [--auto-close:false] [--placement:bottom-end] md:hidden">
      <button
        type="button"
        id={`${uid}-more-trigger`}
        aria-haspopup="menu"
        aria-expanded="false"
        aria-label={t.inbox.threadMoreMenu}
        title={t.inbox.threadMoreMenu}
        className="btn btn-icon hs-dropdown-toggle border-default-300 text-default-700 hover:bg-default-100 relative shrink-0"
      >
        <Icon icon="dots-vertical" className="text-lg" />
        {/* จุดบอกว่าห้องนี้ถูกปิดเสียงอยู่ — สวิตช์อยู่ในเมนู ถ้าไม่มีตัวบอกตรงนี้ ผู้ขายจะไม่มีทาง
            รู้ว่าตัวเองปิดเสียงไว้จนกว่าจะเปิดเมนูดู (คลาสเดียวกับ "default ปิดที่ไม่มีใครรู้ว่ามีสวิตช์")
            ใช้ `bell-off` ซ้อนมุม ไม่ใช่จุดสีเปล่า — จุดสีเปล่าไม่บอกว่าปิดอะไรอยู่ */}
        {silenced && (
          <span className="bg-card text-default-500 absolute -end-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full">
            <Icon icon="bell-off" className="text-2xs" />
          </span>
        )}
      </button>

      <div
        className="hs-dropdown-menu min-w-60"
        role="menu"
        aria-orientation="vertical"
        aria-labelledby={`${uid}-more-trigger`}
      >
        <h6 className="text-default-800 px-2.75 py-2 font-semibold">{t.inbox.threadSoundTitle}</h6>

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
              onChange={toggleThread}
            />
          </div>
          {appMuted && (
            <p className="text-default-500 mt-1 mb-0 text-2xs">{t.inbox.threadSoundAppMutedHint}</p>
          )}
        </div>
      </div>
    </div>
  )
}
