/**
 * [blocker] เลขบนไอคอนแอปผู้ขาย (2026-11-11 · แชทอย่างเดียว · ทุกร้านที่เปิดแจ้งเตือน)
 *  · นับรวมทุกร้านที่ถือ H1 − ร้านที่ปิดแจ้งเตือนแชท · เกณฑ์ = countUnreadConversations (เท่าแท็บ "ข้อความ")
 *  · เพดาน 99 · นับไม่ได้ = ไม่อยู่ใน map (ห้ามกลายเป็น 0)
 *  · แจ้งเตือนแชทใหม่: ผู้รับแต่ละคนได้เลขของตัวเอง · pushToUsers → Expo ส่ง badge ต่อเครื่อง
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  shopsOf: new Map<string, string[]>(),
  optedOut: new Map<string, string[]>(),
  unread: vi.fn(async (shopIds: string[]) => shopIds.length),
}))

vi.mock('@/lib/shop-capability', () => ({
  listAccessibleShopIds: vi.fn(async (userId: string, cap: string) => {
    expect(cap).toBe('H1')
    if (userId === 'boom') throw new Error('db')
    return h.shopsOf.get(userId) ?? []
  }),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    shopNotificationPref: {
      findMany: vi.fn(async (args: { where: { userId: string; chatEnabled: boolean } }) => {
        expect(args.where.chatEnabled).toBe(false)
        return (h.optedOut.get(args.where.userId) ?? []).map((shopId) => ({ shopId }))
      }),
    },
  },
}))
vi.mock('@/services/chat.service', () => ({ countUnreadConversations: h.unread }))

const { appBadgeCount, appBadgeCounts, appBadgeShopIds, APP_BADGE_MAX } = await import('@/services/app-badge.service')

beforeEach(() => {
  h.shopsOf.clear()
  h.optedOut.clear()
  h.unread.mockClear()
  h.unread.mockImplementation(async (shopIds: string[]) => shopIds.length)
})

describe('appBadgeShopIds / appBadgeCount', () => {
  it('[blocker] รวมทุกร้านที่ถือ H1 แต่หักร้านที่ปิดแจ้งเตือนแชท', async () => {
    h.shopsOf.set('u1', ['s1', 's2', 's3'])
    h.optedOut.set('u1', ['s2'])
    expect(await appBadgeShopIds('u1')).toEqual(['s1', 's3'])
    await appBadgeCount('u1')
    expect(h.unread).toHaveBeenCalledWith(['s1', 's3'])
  })

  it('ไม่มีร้าน / ปิดแจ้งเตือนทุกร้าน = 0 โดยไม่ยิงตัวนับ', async () => {
    expect(await appBadgeCount('nobody')).toBe(0)
    h.shopsOf.set('u2', ['s1'])
    h.optedOut.set('u2', ['s1'])
    expect(await appBadgeCount('u2')).toBe(0)
    expect(h.unread).not.toHaveBeenCalled()
  })

  it('เพดาน 99 (ตัวนับหยุดที่ 100)', async () => {
    h.shopsOf.set('u3', ['s1'])
    h.unread.mockResolvedValueOnce(100)
    expect(await appBadgeCount('u3')).toBe(APP_BADGE_MAX)
    expect(APP_BADGE_MAX).toBe(99)
  })
})

describe('appBadgeCounts — หลายคนพร้อมกัน', () => {
  it('[blocker] แต่ละคนได้เลขของตัวเอง · คนที่นับล้มไม่อยู่ใน map (ไม่ใช่ 0) · ไม่ throw', async () => {
    h.shopsOf.set('a', ['s1'])
    h.shopsOf.set('b', ['s1', 's2'])
    const m = await appBadgeCounts(['a', 'b', 'boom', 'a'])
    expect(m.get('a')).toBe(1)
    expect(m.get('b')).toBe(2)
    expect(m.has('boom')).toBe(false)
  })
})
