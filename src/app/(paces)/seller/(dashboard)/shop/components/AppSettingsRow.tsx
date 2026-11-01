'use client'

/**
 * AppSettingsRow — แถวสุดท้ายของรายการ "จัดการร้าน" (ShopQuickLinks) · ทางเข้าหน้า "ตั้งค่าแอป" (native)
 * ของ deep-seller-app (feature 00088 · BRD FR-001/FR-003 · user ย้ายจากหน้าบัญชีมาที่นี่ 2026-11-01)
 *
 * จุดเดียวที่ feature แชท Native แตะหน้าเว็บ · แสดงเฉพาะเมื่อแอปประกาศ `app-settings` ใน
 * `__DEEP_NATIVE_FEATURES__` ⇒ เบราว์เซอร์ปกติและแอปรุ่นเก่า (≤1.0.5) ไม่เห็นอะไรเปลี่ยน
 * อ่านค่าใน effect เท่านั้น (SSR = ไม่แสดง กัน hydration ไม่ตรง)
 *
 * Base: ./ShopQuickLinks.tsx — แถว `<Link>` ชุดเดียวกัน (ไอคอนวงกลม bg-light + 2 บรรทัด + chevron)
 *   เปลี่ยนเป็น <button> เพราะปลายทางเป็นหน้าในแอป ไม่ใช่ url ของเว็บ
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import {
  hasNativeFeature,
  NATIVE_FEATURE_APP_SETTINGS,
  NATIVE_FEATURE_CHAT_MODE_BRIDGE,
  openNativeAppSettings,
} from '@/lib/native-bridge'

/** หน้าเว็บของตั้งค่าแอป (user เลือก 2026-11-02) — แอปรุ่นที่ประกาศ chat-mode-bridge */
export const APP_SETTINGS_PATH = '/settings/app'

export default function AppSettingsRow() {
  // null = ไม่แสดง · web = ไปหน้าเว็บ /settings/app · native = แอป TestFlight รุ่นก่อน (build 21–24) เปิดหน้า native ของตัวเอง
  const [target, setTarget] = useState<'web' | 'native' | null>(null)
  useEffect(() => {
    // window ของแอปถูกตั้งก่อนหน้าโหลด (injectedJavaScriptBeforeContentLoaded) — อ่านครั้งเดียวพอ
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ค่าจาก window มีเฉพาะฝั่ง client
    setTarget(
      hasNativeFeature(NATIVE_FEATURE_CHAT_MODE_BRIDGE) ? 'web' : hasNativeFeature(NATIVE_FEATURE_APP_SETTINGS) ? 'native' : null,
    )
  }, [])
  if (!target) return null

  const body = (
    <>
      <div className="bg-light flex size-8 shrink-0 items-center justify-center rounded-full">
        <Icon icon="settings" className="text-lg" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-default-900 truncate text-sm font-medium">ตั้งค่าแอป</p>
        <p className="text-default-400 truncate text-xs">เลือกโหมดแชท เว็บหรือ Native</p>
      </div>
      <Icon icon="chevron-right" className="text-default-400 shrink-0" aria-hidden="true" />
    </>
  )
  const cls = 'hover:bg-default-100 flex w-full items-center gap-3 px-4 py-3 text-start'
  return target === 'web' ? (
    <Link href={APP_SETTINGS_PATH} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={openNativeAppSettings} className={cls}>
      {body}
    </button>
  )
}
