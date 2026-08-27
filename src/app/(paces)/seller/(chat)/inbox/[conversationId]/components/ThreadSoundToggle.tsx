'use client'

/**
 * ThreadSoundToggle — สวิตช์ "เสียงแจ้งเตือนของแชทนี้" (2026-08-27)
 *
 * ที่มา: user สั่งสองอย่างพร้อมกัน — (1) ตัดแถว "ทั้งแอป (ทุกแชท)" ออกจากเมนู `⋯` ของหัวเธรด
 * (2) "ไม่ต้องมี dropdown บน desktop ให้ desktop แสดง icon เต็ม ๆ ไปเลย"
 *
 * พอเหลือสวิตช์เดียว (เปิด/ปิดเสียงเฉพาะแชทนี้) มันคือ **boolean ตัวเดียว** ซึ่งไม่ต้องมีป๊อปโอเวอร์
 * มาห่อ — ปุ่มไอคอนกดสลับได้ตรง ๆ. ที่จอแคบยังต้องอยู่ในเมนูตามเดิม เพราะงบพื้นที่หัวเธรดที่ 320px
 * ไม่มีที่ให้ปุ่มเพิ่ม (เลขเต็มอยู่ในหัว `ThreadOverflowMenu.tsx`) จึงแบ่งกันตาม breakpoint:
 *
 * 🛑 มติสุดท้าย 2026-08-27 — user เคาะลำดับของจอแคบเป็น **[ตอบอัตโนมัติ] [ข้อมูล] [`⋯`]**
 * โดย `⋯` ถือสวิตช์เสียง ⇒ กระดิ่งใบนี้เป็นของ ≥768px เท่านั้น
 * (เสียง = ของที่ตั้งครั้งเดียวแล้วแทบไม่แตะอีก จึงเป็นตัวเดียวที่ยอมให้ลึกลงไป 1 ชั้นบนจอแคบ)
 *
 *   <768px   สวิตช์อยู่ในเมนู `⋯` — ตัวปุ่มมีจุด `bell-off` ซ้อนมุมบอกว่าห้องนี้เงียบอยู่
 *   ≥768px   ปุ่มกระดิ่งใบนี้ และ `⋯` หายทั้งก้อน (user: "ไม่ต้องมี dropdown บน desktop")
 *
 * 🛑 ตรรกะ "ห้องนี้จะมีเสียงไหม" มีเจ้าของเดียว = `useThreadSound()` ในไฟล์นี้ (HR16) — ทั้งปุ่ม
 * และเมนูอ่านจากตัวเดียวกัน ห้ามให้ไฟล์ไหน `isChatSoundMuted()/isConversationMuted()` เองอีก
 *
 * 🛑 สวิตช์ระดับแอปยังมีอยู่จริง (ไอคอนลำโพงใน `ChatHeader`) แค่ไม่อยู่ในเมนูนี้แล้ว ⇒ ยังต้องอ่าน
 * ค่ามันมาประกอบเสมอ: ปิดทั้งแอปอยู่แล้วมาโชว์กระดิ่ง "เปิดเสียง" คือการโกหกว่าห้องนี้จะมีเสียง
 *
 * Base: theme/paces/Admin/TS/src/assets/css/custom/_buttons.css (`.btn.btn-icon`) — ปุ่มไอคอน
 *       ชุดเดียวกับปุ่ม "คลังไฟล์"/"ข้อมูลลูกค้า" ที่อยู่ข้าง ๆ ในหัวเธรด
 */

import { useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import {
  CHAT_SOUND_EVENT,
  isChatSoundMuted,
  isConversationMuted,
  setConversationMuted,
} from '@/lib/chat-sound'

export function useThreadSound(conversationId: string) {
  // อ่านหลัง mount เท่านั้น — localStorage ไม่มีฝั่ง server ถ้าอ่านตอน render แรกจะ hydration mismatch
  const [appMuted, setAppMuted] = useState(false)
  const [threadMuted, setThreadMuted] = useState(false)

  useEffect(() => {
    const sync = () => {
      setAppMuted(isChatSoundMuted())
      setThreadMuted(isConversationMuted(conversationId))
    }
    sync()
    // อีกแท็บ/อีกจุดบนจอเดียวกันเปลี่ยนค่า → ตามให้ทัน (ค่าที่ค้างอยู่บนปุ่มจะโกหกทันที)
    window.addEventListener(CHAT_SOUND_EVENT, sync)
    return () => window.removeEventListener(CHAT_SOUND_EVENT, sync)
  }, [conversationId])

  return {
    appMuted,
    threadMuted,
    /** "ผลลัพธ์รวม" — ปิดจากระดับไหนก็คือห้องนี้เงียบ ไม่ใช่สถานะของสวิตช์ใดสวิตช์หนึ่ง */
    silenced: appMuted || threadMuted,
    toggleThread: () => setConversationMuted(conversationId, !threadMuted),
  }
}

/** ปุ่มกระดิ่งของหัวเธรด — **≥768px เท่านั้น** (จอแคบใช้สวิตช์ในเมนู `⋯` ตามลำดับที่ user เคาะ) */
export default function ThreadSoundButton({ conversationId }: { conversationId: string }) {
  const t = useT()
  const { appMuted, threadMuted, silenced, toggleThread } = useThreadSound(conversationId)

  /**
   * ปิดเสียงทั้งแอปอยู่ = กดปุ่มนี้ก็ไม่มีเสียงอยู่ดี — บอกตรง ๆ ผ่าน title แทนที่จะ `disabled`
   * เงียบ ๆ (ผู้ใช้จะไม่รู้ว่าทำไมกดไม่ได้) ปุ่มยังกดได้จริงเพราะมันเปลี่ยนค่าของ *แชทนี้* จริง
   */
  const label = appMuted
    ? t.inbox.threadSoundAppMutedHint
    : threadMuted
      ? t.inbox.threadSoundUnmute
      : t.inbox.threadSoundMute

  return (
    <button
      type="button"
      onClick={toggleThread}
      aria-pressed={threadMuted}
      title={label}
      aria-label={label}
      className={`btn btn-icon border-default-300 hover:bg-default-100 hidden shrink-0 md:inline-flex ${
        silenced ? 'text-default-500' : 'text-default-700'
      }`}
    >
      <Icon icon={silenced ? 'bell-off' : 'bell'} className="text-lg" />
    </button>
  )
}
