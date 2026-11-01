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
  CHAT_MODE_EVENT,
  hasNativeFeature,
  NATIVE_FEATURE_APP_SETTINGS,
  NATIVE_FEATURE_CHAT_MODE_BRIDGE,
  parseChatModeState,
  readChatModeState,
  SET_CHAT_MODE_TYPE,
  setNativeChatMode,
  OPEN_APP_SETTINGS_TYPE,
  openNativeAppSettings,
} from '../native-bridge'
import { getSellerPageTitle } from '@/app/(paces)/seller/(dashboard)/_shared/getSellerPageTitle'
import AppSettingsRow from '@/app/(paces)/seller/(dashboard)/shop/components/AppSettingsRow'

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
  it('แถวสุดท้ายของรายการ "จัดการร้าน" (user สั่ง 2026-11-01) · หน้าบัญชีไม่มีแล้ว', () => {
    const read = (f: string) => readFileSync(join(process.cwd(), 'src/app/(paces)/seller/(dashboard)', f), 'utf8')
    const links = read('shop/components/ShopQuickLinks.tsx')
    const row = links.indexOf('<AppSettingsRow />')
    expect(row).toBeGreaterThan(links.lastIndexOf('</Link>'))
    expect(row).toBeLessThan(links.lastIndexOf('</div>'))
    expect(read('account/page.tsx')).not.toContain('AppSettingsRow')
  })

})

describe('หน้าเว็บ "ตั้งค่าแอป" /settings/app (user เลือก 2026-11-02)', () => {
  it('[blocker] ชื่อ feature/คำสั่งตรงกับแอป (deep-seller-app chat-mode/bridge.ts)', () => {
    expect(NATIVE_FEATURE_CHAT_MODE_BRIDGE).toBe('chat-mode-bridge')
    expect(SET_CHAT_MODE_TYPE).toBe('deep:set-chat-mode')
    expect(CHAT_MODE_EVENT).toBe('deep:chat-mode')
  })
  it('อ่านค่าที่แอปฉีด · รูปแบบผิด/นอกแอป = null', () => {
    expect(readChatModeState()).toBeNull()
    g.window = { __DEEP_CHAT_MODE__: { mode: 'native', nativeAvailable: true } }
    expect(readChatModeState()).toEqual({ mode: 'native', nativeAvailable: true })
    expect(parseChatModeState({ mode: 'x' })).toBeNull()
    expect(parseChatModeState({ mode: 'web' })).toEqual({ mode: 'web', nativeAvailable: false })
  })
  it('ส่งคำสั่งเลือกโหมดเข้าแอป · นอกแอป = ไม่พัง', () => {
    expect(() => setNativeChatMode('native')).not.toThrow()
    const postMessage = vi.fn()
    g.window = { ReactNativeWebView: { postMessage } }
    setNativeChatMode('web')
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'deep:set-chat-mode', mode: 'web' }))
  })
  it('ชื่อหน้าบนมือถือ: /settings/app = ตั้งค่าแอป (ไม่ใช่ "การจัดส่ง" ของ /settings) · /account = ข้อมูลส่วนตัว', () => {
    expect(getSellerPageTitle('/settings/app')).toBe('ตั้งค่าแอป')
    expect(getSellerPageTitle('/account')).toBe('ข้อมูลส่วนตัว')
    expect(getSellerPageTitle('/settings')).not.toBe('ตั้งค่าแอป')
  })
  it('แถวพาไป /settings/app เมื่อแอปรองรับ · แอปรุ่นก่อนยังเปิดหน้า native', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/(paces)/seller/(dashboard)/shop/components/AppSettingsRow.tsx'), 'utf8')
    expect(src).toContain("APP_SETTINGS_PATH = '/settings/app'")
    expect(src).toContain('NATIVE_FEATURE_CHAT_MODE_BRIDGE')
    expect(src).toContain('openNativeAppSettings')
  })
})
