'use client'

/**
 * NotificationSoundMenu — สวิตช์เสียงแจ้งเตือน 2 ระดับ ในหัวห้องแชท
 *
 * ที่มา (user report 2026-08-10): "เปิดผ่าน Mobile แล้วปิดเสียงไว้ แต่เรียกผ่าน webview มันก็ยังจะ
 * ตอบว่า 'ตอบแชทจ้า'" — ระหว่างสืบพบว่า **บนมือถือ ตอนอยู่ในห้องแชท ไม่มีสวิตช์เสียงให้แตะเลย**
 * เพราะสวิตช์ระดับแอปอยู่ใน `ChatHeader` ซึ่งเป็น `hidden lg:flex` ในหน้าเธรด และปุ่มกระดิ่งรายเธรด
 * ที่นี่ก็ถูกซ่อนทิ้งเมื่อระดับแอปปิดอยู่ ⇒ คนที่กำลังคุยกับลูกค้าต้องถอยออกไปหน้ารายการก่อนถึงจะปิดเสียงได้
 * (คลาสเดียวกับ `docs/conventions/seller-action-placement.md` §5.1 — full-screen ซ่อน nav แล้ว
 * action หายตามไปทั้งชุด ต้องหาที่ใหม่ให้ในคอมมิตเดียวกัน)
 *
 * 🛑 **แทนที่ปุ่มกระดิ่งเดิม 1:1 ไม่ใช่เพิ่มปุ่มใหม่** — หัวเธรดถูกวัดงบพื้นที่ไว้แล้วว่าที่ 320px
 * เหลือให้ชื่อลูกค้าราว 90px (`docs/conventions/flex-header-truncation.md`) การเติมปุ่มที่ 5 เข้าไป
 * จะไปกินส่วนนั้นทันที
 *
 * ทำไมยุบเป็นปุ่มเดียวแทนที่จะวางลำโพง+กระดิ่งติดกัน: ไอคอน 2 ตัวที่แปลว่า "เสียง" เหมือนกันแต่คนละ
 * ขอบเขต อยู่ห่างกัน 4px ไม่มีทางแยกออกโดยไม่ต้องลองกด — ปุ่มเดียวสะท้อน **ผลลัพธ์รวม** ที่ผู้ใช้
 * แคร์จริง ("ห้องนี้จะมีเสียงไหม") แล้วรายละเอียดไปอยู่ในเมนูที่มีคำเต็ม
 *
 * ทำไมแถวรายเธรดเป็น disabled ไม่ใช่ซ่อน (ต่างจากของเดิม): การซ่อนทำให้ผู้ใช้ไม่มีทางรู้ว่ามีสวิตช์
 * รายเธรดอยู่ และไม่รู้ว่าทำไมมันหาย — Operate mode กำหนดว่า control ต้องมีสถานะ disabled ที่อธิบาย
 * ตัวเองได้ ไม่ใช่หายไปเฉย ๆ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (AutoCloseBehavior "Manual close"
 *       — `[--auto-close:false]`, `<h6>` หัวเมนู, `dropdown-divider`)
 *       theme/paces/Admin/TS/src/app/(admin)/apps/promo/discounts/components/DiscountTable.tsx (form-switch)
 */

import { useEffect, useId, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import {
  CHAT_SOUND_EVENT,
  isChatSoundMuted,
  isConversationMuted,
  setChatSoundMuted,
  setConversationMuted,
} from '@/lib/chat-sound'

export default function NotificationSoundMenu({ conversationId }: { conversationId: string }) {
  // อ่านหลัง mount เท่านั้น — localStorage ไม่มีฝั่ง server ถ้าอ่านตอน render แรกจะ hydration mismatch
  const [appMuted, setAppMuted] = useState(false)
  const [threadMuted, setThreadMuted] = useState(false)
  const uid = useId()

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

  return (
    <div className="hs-dropdown relative inline-flex [--auto-close:false] [--placement:bottom-end]">
      <button
        type="button"
        id={`${uid}-sound-trigger`}
        aria-haspopup="menu"
        aria-expanded="false"
        aria-label="จัดการเสียงแจ้งเตือน"
        title="จัดการเสียงแจ้งเตือน"
        className="btn btn-icon hs-dropdown-toggle hover:bg-default-100 text-default-700 shrink-0"
      >
        <Icon icon={silenced ? 'bell-off' : 'bell'} className="text-lg" />
      </button>

      <div
        // คลาสชุดเดียวกับ ChatShopSwitcher/theme (hs-dropdown-menu + min-w-*) — Preline จัดการ
        // การซ่อน/แสดงและ transition เอง ไม่ต้องเติม hidden/opacity เองให้ชนกับของมัน
        className="hs-dropdown-menu min-w-60"
        role="menu"
        aria-orientation="vertical"
        aria-labelledby={`${uid}-sound-trigger`}
      >
        <h6 className="text-default-800 px-2.75 py-2 font-semibold">เสียงแจ้งเตือนข้อความใหม่</h6>

        <div className="flex items-center justify-between gap-3 px-2.75 py-2">
          <label htmlFor={`${uid}-app`} className="text-default-700 mb-0 text-sm">
            ทั้งแอป (ทุกแชท)
          </label>
          <input
            id={`${uid}-app`}
            type="checkbox"
            className="form-switch shrink-0"
            checked={!appMuted}
            onChange={() => setChatSoundMuted(!appMuted)}
          />
        </div>

        <hr className="dropdown-divider" />

        <div className="px-2.75 py-2">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor={`${uid}-thread`}
              className={`mb-0 text-sm ${appMuted ? 'text-default-500' : 'text-default-700'}`}
            >
              เฉพาะแชทนี้
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
              ปิดอยู่เพราะปิดเสียงทั้งแอป — เปิดสวิตช์ด้านบนก่อน
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
