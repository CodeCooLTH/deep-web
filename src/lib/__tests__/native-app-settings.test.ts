/**
 * [blocker] ทางเข้า "ตั้งค่าแอป" (feature 00088 · BRD FR-001/FR-003 · TC-003)
 *
 * คู่แฝดอยู่คนละรีโป (deep-seller-app `src/features/chat-mode/bridge.ts`) — ชื่อ feature/คำสั่งต่างกันตัวเดียว
 * = แถวไม่โผล่ หรือกดแล้วเงียบ ⇒ ปักหมุดค่าไว้
 * และที่สำคัญที่สุด: เบราว์เซอร์ปกติ/แอปรุ่นเก่า **ต้องไม่เห็นอะไรเปลี่ยน** (ไม่กระทบเว็บ)
 * mutation ที่ต้องแดง: AppSettingsRow ตั้ง visible เริ่มต้น true · ลบการเช็ก hasNativeFeature · เปลี่ยนชื่อคำสั่ง
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  hasNativeFeature,
  NATIVE_FEATURE_APP_SETTINGS,
  OPEN_APP_SETTINGS_TYPE,
  openNativeAppSettings,
} from '../native-bridge'
import AppSettingsRow from '@/app/(paces)/seller/(dashboard)/account/components/AppSettingsRow'

const g = globalThis as unknown as { window?: Record<string, unknown> }
afterEach(() => {
  delete g.window
})

describe('ค่าคงที่ที่ต้องตรงกับแอป', () => {
  it('[blocker] ชื่อ feature และคำสั่ง', () => {
    expect(NATIVE_FEATURE_APP_SETTINGS).toBe('app-settings')
    expect(OPEN_APP_SETTINGS_TYPE).toBe('deep:open-app-settings')
  })
})

describe('hasNativeFeature(app-settings)', () => {
  it('เบราว์เซอร์ (ไม่มี window) / แอปเก่า (ไม่มีรายการ) / รายการไม่มีชื่อนี้ = false', () => {
    expect(hasNativeFeature(NATIVE_FEATURE_APP_SETTINGS)).toBe(false)
    g.window = {}
    expect(hasNativeFeature(NATIVE_FEATURE_APP_SETTINGS)).toBe(false)
    g.window = { __DEEP_NATIVE_FEATURES__: ['sound-preview', 'silent-chat-channel'] }
    expect(hasNativeFeature(NATIVE_FEATURE_APP_SETTINGS)).toBe(false)
  })
  it('แอปที่ประกาศ = true', () => {
    g.window = { __DEEP_NATIVE_FEATURES__: ['sound-preview', 'app-settings'] }
    expect(hasNativeFeature(NATIVE_FEATURE_APP_SETTINGS)).toBe(true)
  })
})

describe('openNativeAppSettings', () => {
  it('ส่งคำสั่งเข้าแอป · ไม่อยู่ในแอป = ไม่ทำอะไรและไม่พัง', () => {
    expect(() => openNativeAppSettings()).not.toThrow()
    const postMessage = vi.fn()
    g.window = { ReactNativeWebView: { postMessage } }
    openNativeAppSettings()
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'deep:open-app-settings' }))
  })
  it('[blocker] ไม่แตะคำสั่งเดิม deep:open-settings (ปุ่มเปิดการแจ้งเตือนของเครื่อง)', () => {
    const postMessage = vi.fn()
    g.window = { ReactNativeWebView: { postMessage } }
    openNativeAppSettings()
    expect(postMessage).not.toHaveBeenCalledWith(JSON.stringify({ type: 'deep:open-settings' }))
  })
})

describe('AppSettingsRow', () => {
  it('[blocker] render ฝั่งเซิร์ฟเวอร์/ก่อน effect = ไม่มีอะไรเลย (เบราว์เซอร์ไม่เห็นการเปลี่ยนแปลง)', () => {
    g.window = { __DEEP_NATIVE_FEATURES__: ['app-settings'] }
    expect(renderToStaticMarkup(h(AppSettingsRow))).toBe('')
  })
  it('หน้าบัญชีวางแถวไว้ (ถัดจากภาษา ก่อนการแจ้งเตือน)', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/(paces)/seller/(dashboard)/account/page.tsx'), 'utf8')
    const lang = src.indexOf('<LanguagePrefsCard />'), row = src.indexOf('<AppSettingsRow />'), notif = src.indexOf('<NotificationPrefsCard')
    expect(row).toBeGreaterThan(lang)
    expect(row).toBeLessThan(notif)
  })
})
