'use client'

/**
 * ChatModeCard — เลือกโหมดแชท เว็บ/Native ของเครื่องนี้ (feature 00088)
 *
 * Base: ../../../shop/components/ShopQuickLinks.tsx — เปลือก `.card` + หัวกรอบเส้นประกึ่งกลาง +
 *   แถว `divide-y` (ไอคอนวงกลม bg-light + ชื่อ) · Widgets adapted: ขวาสุดเป็นวงเลือก (radio) แทน chevron
 *
 * ค่ามาจากแอป (`window.__DEEP_CHAT_MODE__` + event `deep:chat-mode`) — แสดงสิ่งที่แอปบันทึกจริงเสมอ
 * กดแล้วไม่เปลี่ยนเองฝั่งเว็บ: รอแอปฉีดค่าใหม่กลับมา (แอปปฏิเสธ Native ได้ถ้าเครื่องใช้ไม่ได้)
 * SSR/ก่อน effect = ยังไม่รู้ค่า ⇒ แสดงโครงการ์ดโดยไม่มีวงเลือกถูก (กัน hydration ไม่ตรง)
 */

import { useEffect, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import {
  CHAT_MODE_EVENT,
  hasNativeFeature,
  NATIVE_FEATURE_CHAT_MODE_BRIDGE,
  parseChatModeState,
  readChatModeState,
  setNativeChatMode,
  type ChatModeState,
} from '@/lib/native-bridge'

// ไม่มีป้าย "ทดลอง" — ขึ้นสโตร์จริง (App Store 2.2 ห้ามของ beta/ทดลอง · user สั่งเอาออก 2026-11-02)
const OPTIONS: { mode: ChatModeState['mode']; label: string; icon: string }[] = [
  { mode: 'web', label: 'เว็บ (ค่าเริ่มต้น)', icon: 'world' },
  { mode: 'native', label: 'Native', icon: 'bolt' },
]

export default function ChatModeCard() {
  const [inApp, setInApp] = useState<boolean | null>(null)
  const [state, setState] = useState<ChatModeState | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ค่าจาก window มีเฉพาะฝั่ง client
    setInApp(hasNativeFeature(NATIVE_FEATURE_CHAT_MODE_BRIDGE))
    setState(readChatModeState())
    const onChange = (e: Event) => setState(parseChatModeState((e as CustomEvent).detail) ?? readChatModeState())
    window.addEventListener(CHAT_MODE_EVENT, onChange)
    return () => window.removeEventListener(CHAT_MODE_EVENT, onChange)
  }, [])

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="bg-light/15 border-default-300 flex w-full items-center justify-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium">
          โหมดแชท
        </h5>
      </div>

      {inApp === false ? (
        <div className="card-body text-default-500 text-sm">ตั้งค่านี้ใช้ได้ในแอป Deep ผู้ขาย</div>
      ) : (
        <div className="divide-default-200 divide-y" role="radiogroup" aria-label="โหมดแชท">
          {OPTIONS.map((o) => {
            const on = state?.mode === o.mode
            const disabled = o.mode === 'native' && state !== null && !state.nativeAvailable
            return (
              <button
                key={o.mode}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled || state === null}
                onClick={() => !on && setNativeChatMode(o.mode)}
                /* py-3 + ไอคอน size-8 → สูงราว 56px ≥ tap target 44px (เท่าแถว ShopQuickLinks) */
                className="hover:bg-default-100 flex w-full items-center gap-3 px-4 py-3 text-start disabled:opacity-50"
              >
                <div className="bg-light flex size-8 shrink-0 items-center justify-center rounded-full">
                  <Icon icon={o.icon} className="text-lg" />
                </div>
                <span className="text-default-900 min-w-0 flex-1 truncate text-sm font-medium">{o.label}</span>
                <Icon
                  icon={on ? 'circle-check-filled' : 'circle'}
                  className={`shrink-0 text-xl ${on ? 'text-primary' : 'text-default-400'}`}
                  aria-hidden="true"
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
