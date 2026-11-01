'use client'

/**
 * AppSettingsRow — ทางเข้าหน้า "ตั้งค่าแอป" (native) ของ deep-seller-app (feature 00088)
 *
 * จุดเดียวที่ feature แชท Native แตะหน้าเว็บ (user เลือก 2026-10-31 · BRD FR-001/FR-003)
 * แสดงเฉพาะเมื่อแอปประกาศ `app-settings` ใน `__DEEP_NATIVE_FEATURES__` ⇒ เบราว์เซอร์ปกติ
 * และแอปรุ่นเก่า (≤1.0.5) ไม่เห็นอะไรเปลี่ยน · อ่านค่าใน effect เท่านั้น (SSR = ไม่แสดง กัน hydration ไม่ตรง)
 *
 * Base: ./NotificationPrefsCard.tsx — เปลือก `.card mt-4` + `.card-header` + `.card-body` ชุดเดียวกันในหน้านี้
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
    <div className="card mt-4">
      <div className="card-header">
        <h4 className="card-title">แอป Deep ผู้ขาย</h4>
      </div>
      <div className="card-body p-0">
        <button
          type="button"
          onClick={openNativeAppSettings}
          className="hover:bg-default-50 flex min-h-14 w-full items-center gap-3 px-5 py-3 text-start"
        >
          <Icon icon="settings" className="text-default-500 size-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="text-dark block text-sm font-medium">ตั้งค่าแอป</span>
            <span className="text-default-500 block text-xs">โหมดแชท · เสียง · การแจ้งเตือนของเครื่อง</span>
          </span>
          <Icon icon="chevron-right" className="text-default-400 size-4 shrink-0" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
