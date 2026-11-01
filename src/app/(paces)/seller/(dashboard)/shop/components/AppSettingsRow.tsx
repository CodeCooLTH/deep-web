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

import { useEffect, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { hasNativeFeature, NATIVE_FEATURE_APP_SETTINGS, openNativeAppSettings } from '@/lib/native-bridge'

export default function AppSettingsRow() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    // window ของแอปถูกตั้งก่อนหน้าโหลด (injectedJavaScriptBeforeContentLoaded) — อ่านครั้งเดียวพอ
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ค่าจาก window มีเฉพาะฝั่ง client
    setVisible(hasNativeFeature(NATIVE_FEATURE_APP_SETTINGS))
  }, [])
  if (!visible) return null

  return (
    <button
      type="button"
      onClick={openNativeAppSettings}
      className="hover:bg-default-100 flex w-full items-center gap-3 px-4 py-3 text-start"
    >
      <div className="bg-light flex size-8 shrink-0 items-center justify-center rounded-full">
        <Icon icon="settings" className="text-lg" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-default-900 truncate text-sm font-medium">ตั้งค่าแอป</p>
        <p className="text-default-400 truncate text-xs">เลือกโหมดแชท เว็บหรือ Native</p>
      </div>
      <Icon icon="chevron-right" className="text-default-400 shrink-0" aria-hidden="true" />
    </button>
  )
}
