import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sendExpoPushWithStatus, SILENT_CHAT_CHANNEL_ID } from '@/lib/expo-push'
import {
  NATIVE_FEATURE_SILENT_CHAT_CHANNEL,
  resolveDeviceChatMute,
  syncDeviceChatMute,
} from '@/lib/native-bridge'
import { setChatSoundMuted } from '@/lib/chat-sound'

/**
 * [blocker] ปุ่มลำโพงหน้าแชท "ปิดเสียงแจ้งเตือนข้อความใหม่" ปิดเสียงแจ้งเตือนเด้งของเครื่องนั้นด้วย
 * (00018 ส่วนขยาย 2026-10-14 · EXTENSIONS-2026-10-14-mute-chat-push-per-device.md)
 *
 * ร้านแจ้ง: กดปิดเสียงแล้วแจ้งเตือนบนจอล็อกยังดัง — ปุ่มคุมแค่เสียงในหน้าเว็บ เซิร์ฟเวอร์ไม่รู้
 */
const TOKEN = 'ExponentPushToken[abc]'
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) DeepSellerApp/1.0.4'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14) DeepSellerApp/1.0.4'

/** window ปลอม (โปรเจกต์ไม่มี jsdom — แพตเทิร์นเดียวกับ chat-sound-web-audio.test) */
type FakeWin = {
  __DEEP_PUSH_TOKEN__?: string
  __DEEP_NATIVE_FEATURES__?: unknown
  navigator: { userAgent: string }
  localStorage: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
  dispatchEvent: () => boolean
}
let win: FakeWin
function setWindow(opts: { token?: string; features?: string[]; ua?: string } = {}) {
  const store = new Map<string, string>()
  win = {
    __DEEP_PUSH_TOKEN__: opts.token,
    __DEEP_NATIVE_FEATURES__: opts.features,
    navigator: { userAgent: opts.ua ?? IOS_UA },
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    },
    dispatchEvent: () => true,
  }
  vi.stubGlobal('window', win)
  vi.stubGlobal('CustomEvent', class {})
}

function stubFetch() {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }) }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const bodyOf = (m: ReturnType<typeof stubFetch>, i = 0) =>
  JSON.parse((m.mock.calls[i] as unknown as [string, { body: string }])[1].body)

afterEach(() => vi.unstubAllGlobals())

describe('[blocker] payload แจ้งเตือนแชทใหม่ของเครื่องที่ปิดเสียง', () => {
  it('ปิดเสียง + respectChatMute ⇒ ไม่มี sound (iOS เงียบ) + ช่อง chat_silent (Android) · ยังเด้ง', async () => {
    const f = stubFetch()
    await sendExpoPushWithStatus(
      [
        { token: TOKEN, platform: 'ios', chatSoundMuted: true },
        { token: 'ExponentPushToken[other]', platform: 'ios', chatSoundMuted: false },
      ],
      'เพจ',
      'ข้อความ',
      undefined,
      { sound: 'chat', subtitle: 'ลูกค้า', respectChatMute: true },
    )
    const [muted, normal] = bodyOf(f)
    expect(muted).not.toHaveProperty('sound')
    expect(muted).toMatchObject({ channelId: 'chat_silent', title: 'เพจ', body: 'ข้อความ', priority: 'high' })
    // เครื่องที่ไม่ปิด ได้เสียงตามที่บัญชีเลือกเหมือนเดิม
    expect(normal).toMatchObject({ sound: 'new_chat_message.wav', channelId: 'chat' })
  })

  it('ไม่ส่ง respectChatMute ⇒ เครื่องที่ปิดเสียงก็ยังได้เสียง (แจ้งเตือนอื่นไม่ได้รับผล)', async () => {
    const f = stubFetch()
    await sendExpoPushWithStatus([{ token: TOKEN, platform: 'ios', chatSoundMuted: true }], 't', 'b')
    expect(bodyOf(f)[0]).toMatchObject({ sound: 'default', channelId: 'default' })
  })

  it('ชื่อช่องเงียบ/ชื่อความสามารถตรงกับแอปผู้ขาย (deep-seller-app silent-chat.ts — สัญญาข้ามรีโป)', () => {
    expect(SILENT_CHAT_CHANNEL_ID).toBe('chat_silent')
    expect(NATIVE_FEATURE_SILENT_CHAT_CHANNEL).toBe('silent-chat-channel')
  })

  it('pushNewChatMessage เท่านั้นที่ส่ง respectChatMute · แจ้งเตือนอื่นในไฟล์ไม่ส่ง', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/seller-push.service.ts'), 'utf8').replace(/^[ \t]*\/\/.*$/gm, '')
    const start = src.indexOf('export async function pushNewChatMessage')
    const next = src.indexOf('\nexport async function', start + 10)
    expect(src.slice(start, next)).toMatch(/respectChatMute: true/)
    const rest = src.slice(0, start) + src.slice(next)
    expect(rest).not.toMatch(/respectChatMute/)
  })

  it('pushToUsersWithStatus ดึง chatSoundMuted มาพร้อม token', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/app-push.service.ts'), 'utf8')
    const fn = src.slice(src.indexOf('export async function pushToUsersWithStatus'))
    expect(fn.slice(0, fn.indexOf('\n}\n'))).toMatch(/select: \{ token: true, platform: true, chatSoundMuted: true \}/)
  })
})

describe('[blocker] resolveDeviceChatMute — ค่าที่บอกเซิร์ฟเวอร์ต่อเครื่อง', () => {
  it.each([
    // muted, isAndroid, hasSilentChannel => ส่ง
    [false, false, false, false],
    [true, false, false, true], // iOS ทุกรุ่นเงียบได้
    [true, true, true, true], // Android ที่มีช่องเงียบ
    [true, true, false, false], // Android รุ่นเก่า: ยอมมีเสียงดีกว่าแจ้งเตือนหาย
    [false, true, true, false],
  ])('muted=%s android=%s silentChannel=%s ⇒ %s', (muted, isAndroid, hasSilentChannel, want) => {
    expect(resolveDeviceChatMute({ muted, isAndroid, hasSilentChannel })).toBe(want)
  })
})

describe('[blocker] syncDeviceChatMute / setChatSoundMuted', () => {
  it('ไม่อยู่ในแอป (ไม่มี token) ⇒ ไม่ยิงอะไร', () => {
    setWindow()
    const f = stubFetch()
    syncDeviceChatMute(true)
    expect(f).not.toHaveBeenCalled()
  })

  it('iOS ในแอป ⇒ PATCH token ของเครื่องนี้ + ค่าปุ่ม', () => {
    setWindow({ token: TOKEN })
    const f = stubFetch()
    syncDeviceChatMute(true)
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, { method: string; credentials: string }]
    expect(url).toBe('/api/seller/push-token')
    expect(init).toMatchObject({ method: 'PATCH', credentials: 'include' })
    expect(bodyOf(f)).toEqual({ token: TOKEN, chatSoundMuted: true })
  })

  it('Android ไม่มีช่องเงียบ ⇒ ส่ง false · มีช่องเงียบ ⇒ ส่ง true', () => {
    setWindow({ token: TOKEN, ua: ANDROID_UA })
    const f = stubFetch()
    syncDeviceChatMute(true)
    expect(bodyOf(f, 0).chatSoundMuted).toBe(false)
    win.__DEEP_NATIVE_FEATURES__ = [NATIVE_FEATURE_SILENT_CHAT_CHANNEL]
    syncDeviceChatMute(true)
    expect(bodyOf(f, 1).chatSoundMuted).toBe(true)
  })

  it('กดปุ่มลำโพง (setChatSoundMuted) ⇒ เก็บในเครื่อง + บอกเซิร์ฟเวอร์', () => {
    setWindow({ token: TOKEN })
    const f = stubFetch()
    setChatSoundMuted(true)
    expect(win.localStorage.getItem('deep.chat.sound.muted')).toBe('1')
    expect(bodyOf(f)).toEqual({ token: TOKEN, chatSoundMuted: true })
    setChatSoundMuted(false)
    expect(win.localStorage.getItem('deep.chat.sound.muted')).toBeNull()
    expect(bodyOf(f, 1)).toEqual({ token: TOKEN, chatSoundMuted: false })
  })

  it('fetch ล้มต้องไม่ throw (ปุ่มเปลี่ยนสถานะได้เสมอ)', async () => {
    setWindow({ token: TOKEN })
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    expect(() => setChatSoundMuted(true)).not.toThrow()
    await new Promise((r) => setTimeout(r, 0)) // promise ที่ reject ต้องถูก catch ไม่หลุดเป็น unhandled
    expect(win.localStorage.getItem('deep.chat.sound.muted')).toBe('1')
  })

  it('ChatHeader ส่งค่าซ้ำตอนเปิดหน้าแชท และเมื่อแอปฝาก token ทีหลัง', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/(paces)/seller/(chat)/_components/ChatHeader.tsx'), 'utf8')
    expect(src).toMatch(/const pushMute = \(\) => syncDeviceChatMute\(isChatSoundMuted\(\)\)\n\s*pushMute\(\)/)
    expect(src).toMatch(/subscribePushPermission\(pushMute\)/)
  })
})
