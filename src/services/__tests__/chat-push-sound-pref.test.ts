import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * [blocker] เลือกเสียงแจ้งเตือนแชทใหม่ที่ /account (2026-10-09)
 * ค่าตั้งต้น "chat" = พฤติกรรมของ #133 · "default" = เสียงมาตรฐานของเครื่อง · ผูกกับตัวคน ไม่ใช่ร้าน
 */
const { findMany, findUnique, update } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findMany, findUnique, update } } }))
vi.mock('@/lib/shop-context', () => ({ listAccessibleShopIds: vi.fn() }))

import {
  CHAT_PUSH_SOUNDS,
  toChatPushSound,
  getChatPushSound,
  setChatPushSound,
  groupUsersByChatPushSound,
} from '@/services/notification-pref.service'
import { resolvePushSound } from '@/lib/expo-push'

const read = (p: string) =>
  readFileSync(join(process.cwd(), p), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

beforeEach(() => vi.clearAllMocks())

describe('[blocker] ค่าเสียง', () => {
  it('ตัวเลือกมี 2 ค่า และทุกค่าเป็นเสียงที่ตัวส่ง push รู้จัก', () => {
    expect([...CHAT_PUSH_SOUNDS]).toEqual(['chat', 'default'])
    for (const s of CHAT_PUSH_SOUNDS) expect(resolvePushSound(s).sound, s).toBeTruthy()
  })

  it('ค่าที่ไม่รู้จัก/ว่าง = "chat" (ค่าตั้งต้นของคอลัมน์ — ไม่เปลี่ยนเสียงของใครเงียบ ๆ)', () => {
    expect(toChatPushSound('default')).toBe('default')
    expect(toChatPushSound('chat')).toBe('chat')
    for (const v of ['', null, undefined, 'loud', 'DEFAULT']) expect(toChatPushSound(v), String(v)).toBe('chat')
  })

  it('อ่าน/บันทึกผูกกับ userId', async () => {
    findUnique.mockResolvedValueOnce({ chatPushSound: 'default' })
    expect(await getChatPushSound('u1')).toBe('default')
    findUnique.mockResolvedValueOnce(null)
    expect(await getChatPushSound('u2')).toBe('chat')
    await setChatPushSound('u1', 'chat')
    expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { chatPushSound: 'chat' } })
  })
})

describe('[blocker] แบ่งผู้รับตามเสียง', () => {
  it('แต่ละคนอยู่กลุ่มเสียงของตัวเอง · หาแถวไม่เจอ = chat · ไม่มีใครหลุด', async () => {
    findMany.mockResolvedValueOnce([
      { id: 'a', chatPushSound: 'default' },
      { id: 'b', chatPushSound: 'chat' },
    ])
    const g = await groupUsersByChatPushSound(['a', 'b', 'c'])
    expect(Object.fromEntries(g)).toEqual({ default: ['a'], chat: ['b', 'c'] })
  })

  it('ไม่มีผู้รับ = ไม่ query และคืนว่าง', async () => {
    expect((await groupUsersByChatPushSound([])).size).toBe(0)
    expect(findMany).not.toHaveBeenCalled()
  })
})

describe('[blocker] ทางเข้า', () => {
  it('API: อยู่ใต้ /api/account (มีด่าน CSRF) · ผูก session · รับเฉพาะค่าในชุด', () => {
    const route = read('src/app/api/account/notification-sound/route.ts')
    expect(route).toMatch(/sessionUserId\(await getServerSession\(authOptions\)\)/)
    expect(route).toMatch(/v\.picklist\(CHAT_PUSH_SOUNDS\)/)
    expect(route).not.toMatch(/activeShopId/)
  })

  it('หน้าจอ: ตัวเลือกตรงกับชุดค่าที่ระบบรับ · หน้า /account ส่งค่าปัจจุบันลงการ์ด', () => {
    const card = read('src/app/(paces)/seller/(dashboard)/account/components/NotificationPrefsCard.tsx')
    const values = [...card.matchAll(/\{ value: '(\w+)', name:/g)].map((m) => m[1])
    expect(values).toEqual([...CHAT_PUSH_SOUNDS])
    expect(card).toMatch(/fetch\('\/api\/account\/notification-sound'/)
    expect(read('src/app/(paces)/seller/(dashboard)/account/page.tsx')).toMatch(
      /chatPushSound=\{toChatPushSound\(dbUser\.chatPushSound\)\}/,
    )
  })
})
