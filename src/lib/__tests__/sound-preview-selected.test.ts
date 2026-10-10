import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  NATIVE_FEATURE_SOUND_PREVIEW,
  hasNativeFeature,
  previewNativePushSound,
  resolveSoundPreview,
} from '@/lib/native-bridge'
import { resolvePushSound } from '@/lib/expo-push'

/**
 * [blocker] ปุ่ม "ฟังเสียง" ในหน้าบัญชีเล่นเสียงที่เลือกอยู่ (user สั่ง 2026-10-10)
 *
 * ในแอปผู้ขาย build ที่ประกาศ `sound-preview` ⇒ ขอให้แอปยิงแจ้งเตือนตัวอย่าง (ได้ยินเหมือนแชทเข้าจริง)
 * เบราว์เซอร์ / build เก่า ⇒ เล่นไฟล์ในหน้าเว็บได้เฉพาะเสียงแชท
 */
const read = (p: string) =>
  readFileSync(join(process.cwd(), p), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const CARD = 'src/app/(paces)/seller/(dashboard)/account/components/NotificationPrefsCard.tsx'

afterEach(() => vi.unstubAllGlobals())

describe('resolveSoundPreview — ปุ่มทำอะไรกับเสียงที่เลือก', () => {
  it('แอปที่รองรับ ⇒ native ทั้งสองเสียง · ปิดสิทธิ์แจ้งเตือน ⇒ denied', () => {
    for (const sound of ['chat', 'default'] as const) {
      expect(resolveSoundPreview({ sound, nativePreview: true, permission: 'granted' }), sound).toBe('native')
      expect(resolveSoundPreview({ sound, nativePreview: true, permission: 'undetermined' }), sound).toBe('native')
      expect(resolveSoundPreview({ sound, nativePreview: true, permission: null }), sound).toBe('native')
      expect(resolveSoundPreview({ sound, nativePreview: true, permission: 'denied' }), sound).toBe('denied')
    }
  })

  it('เบราว์เซอร์ / แอป build เก่า ⇒ เสียงแชทเล่นในเว็บ · เสียงเครื่องเล่นไม่ได้', () => {
    for (const permission of [null, 'granted'] as const) {
      expect(resolveSoundPreview({ sound: 'chat', nativePreview: false, permission })).toBe('web')
      expect(resolveSoundPreview({ sound: 'default', nativePreview: false, permission })).toBe('none')
    }
  })
})

describe('[blocker] สัญญาข้ามรีโปกับแอป', () => {
  it('hasNativeFeature: อ่านรายชื่อที่แอปตั้งไว้ · ค่าแปลก/ไม่มี = false', () => {
    vi.stubGlobal('window', { __DEEP_NATIVE_FEATURES__: ['sound-preview'] })
    expect(NATIVE_FEATURE_SOUND_PREVIEW).toBe('sound-preview')
    expect(hasNativeFeature(NATIVE_FEATURE_SOUND_PREVIEW)).toBe(true)
    vi.stubGlobal('window', { __DEEP_NATIVE_FEATURES__: 'sound-preview' })
    expect(hasNativeFeature(NATIVE_FEATURE_SOUND_PREVIEW)).toBe(false)
    vi.stubGlobal('window', {})
    expect(hasNativeFeature(NATIVE_FEATURE_SOUND_PREVIEW)).toBe(false)
  })

  it('previewNativePushSound: ส่ง { type, sound } ที่แอปรู้จัก · ไม่อยู่ในแอป = เงียบ', () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', { ReactNativeWebView: { postMessage } })
    previewNativePushSound('default')
    expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({ type: 'deep:preview-push-sound', sound: 'default' })
    vi.stubGlobal('window', {})
    expect(() => previewNativePushSound('chat')).not.toThrow()
  })

  it('เสียงตัวอย่างฝั่งแอป (PREVIEW_SOUNDS) ต้องตรงกับ push จริง — ค่านี้ก็อปจากแอป เปลี่ยนต้องแก้ทั้งสองรีโป', () => {
    expect(resolvePushSound('chat')).toEqual({ sound: 'new_chat_message.wav', channelId: 'chat' })
    expect(resolvePushSound('default')).toEqual({ sound: 'default', channelId: 'default' })
  })
})

describe('[blocker] การ์ดหน้าบัญชี', () => {
  it('ปุ่มเล่นเสียงที่เลือก (ชื่อเปลี่ยนตามตัวเลือก) ผ่าน resolveSoundPreview · อยู่กลาง', () => {
    const card = read(CARD)
    expect(card).toMatch(/resolveSoundPreview\(\{ sound, nativePreview, permission \}\)/)
    expect(card).toMatch(/hasNativeFeature\(NATIVE_FEATURE_SOUND_PREVIEW\)/)
    expect(card).toMatch(/if \(previewMode === 'native'\) previewNativePushSound\(sound\)/)
    expect(card).toMatch(/else if \(previewMode === 'web'\) previewChatSound\(\)/)
    expect(card).toMatch(/ฟัง\{selectedSoundName\}/)
    expect(card).toMatch(/disabled=\{previewMode === 'none'\}/)
    expect(card).toMatch(/className="mt-3 flex flex-col items-center gap-1\.5"/)
    expect(card).not.toMatch(/onClick=\{previewChatSound\}/)
  })
})
