import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePushSound, sendExpoPushWithStatus } from '@/lib/expo-push'

/**
 * [blocker] เสียงแจ้งเตือนแชทใหม่ในแอปผู้ขาย (2026-10-09)
 *
 * user เลือก: ใช้เสียงแชทเดียวกับในเว็บ (public/sounds/sound-new-chat-msg.m4a) · แอปผู้ขาย · เฉพาะแชทใหม่
 * 🛑 ชื่อไฟล์ `new_chat_message.wav` และ channel `chat` ต้องตรงกับแอปผู้ขาย (deep-seller-app)
 *    ผิดตัวเดียว = iOS เงียบกลับไปเสียงมาตรฐาน · Android ส่งเข้า channel ที่ไม่มีอยู่
 */
const TOKEN = 'ExponentPushToken[abc]'

afterEach(() => vi.unstubAllGlobals())

function captureMessages() {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) }))
  vi.stubGlobal('fetch', fetchMock)
  return () => JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)
}

describe('[blocker] เสียงแจ้งเตือน', () => {
  it('ชุดเสียง: default = เสียงเครื่อง/channel default · chat = ไฟล์ของเรา/channel chat', () => {
    expect(resolvePushSound(undefined)).toEqual({ sound: 'default', channelId: 'default' })
    expect(resolvePushSound('default')).toEqual({ sound: 'default', channelId: 'default' })
    expect(resolvePushSound('chat')).toEqual({ sound: 'new_chat_message.wav', channelId: 'chat' })
  })

  it('payload: ไม่ระบุเสียง = แบบเดิมทุกตัวอักษร (แจ้งเตือนอื่นไม่เปลี่ยน)', async () => {
    const read = captureMessages()
    await sendExpoPushWithStatus([TOKEN], 't', 'b')
    expect(read()[0]).toMatchObject({ sound: 'default', channelId: 'default', priority: 'high' })
  })

  it('payload: sound chat = ไฟล์เสียงแชท + channel chat', async () => {
    const read = captureMessages()
    await sendExpoPushWithStatus([{ token: TOKEN, platform: 'ios' }], 't', 'b', undefined, { sound: 'chat' })
    expect(read()[0]).toMatchObject({ sound: 'new_chat_message.wav', channelId: 'chat' })
  })

  it('แจ้งเตือนแชทใหม่ใช้เสียงแชท · แจ้งเตือนอื่นของผู้ขายไม่ใช้', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/seller-push.service.ts'), 'utf8').replace(/^[ \t]*\/\/.*$/gm, '')
    const start = src.indexOf('export async function pushNewChatMessage')
    const next = src.indexOf('\nexport async function', start + 10)
    const chatFn = src.slice(start, next === -1 ? undefined : next)
    // เสียงมาจากที่ผู้รับแต่ละคนเลือก (User.chatPushSound) — ค่าตั้งต้น "chat" (2026-10-09)
    expect(chatFn).toMatch(/groupUsersByChatPushSound\(audience\)/)
    expect(chatFn).toMatch(/\{ subtitle: preview\.senderName, sound \}/)
    // นอกฟังก์ชันแชทใหม่ ห้ามมีการกำหนดเสียง (user เลือก "เฉพาะแชทใหม่") — แจ้งเตือนอื่นใช้เสียงมาตรฐาน
    const rest = src.slice(0, start) + (next === -1 ? '' : src.slice(next))
    expect(rest.match(/sound: 'chat'|, sound \}|groupUsersByChatPushSound\(/g)).toBeNull()
  })
})
