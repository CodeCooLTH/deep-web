/**
 * GET /api/chat/scope — ขอบเขตกล่องแชทสำหรับแชท Native (00088 · L5 สวิตช์ร้าน · L10 เพจทุกร้าน · L46 ข้อความตั้งต้น)
 * ร้าน/เพจมาจาก scope.shopIds (ร้านที่ถือ H1) เท่านั้น · ข้อความตั้งต้นเฉพาะ MESSENGER
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
const sc = vi.hoisted(() => ({ resolveChatScope: vi.fn() }))
vi.mock('@/lib/chat-scope', () => sc)
const db = vi.hoisted(() => ({ shop: { findMany: vi.fn() }, shopChannel: { findMany: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
const ch = vi.hoisted(() => ({ listChannelsForShops: vi.fn() }))
vi.mock('@/services/shop-channel.service', () => ch)

import { getServerSession } from 'next-auth'
import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', activeShopId: 'a' } } as never)
  db.shop.findMany.mockResolvedValue([{ id: 'a', shopName: 'ร้าน A', logo: null, vertical: 'SERVICE_QUEUE' }, { id: 'b', shopName: 'ร้าน B', logo: 'l', vertical: 'ONLINE_SALES' }])
  ch.listChannelsForShops.mockResolvedValue([
    { id: 'c1', provider: 'MESSENGER', name: 'เพจ A', avatarUrl: null, shopId: 'a', shopName: 'ร้าน A', externalId: 'SECRET-EXT' },
    { id: 'c2', provider: 'LINE', name: 'OA B', avatarUrl: null, shopId: 'b', shopName: 'ร้าน B', externalId: 'SECRET-EXT' },
  ])
  db.shopChannel.findMany.mockResolvedValue([{ id: 'c1', commentPrivateReplyText: 'สวัสดี {name}' }])
})

describe('chat scope', () => {
  it('ไม่ล็อกอิน 401 · ไม่มีร้าน 404 · ร้าน active ไม่ถือ H1 = 403', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null as never)
    expect((await GET()).status).toBe(401)
    sc.resolveChatScope.mockResolvedValueOnce(null)
    expect((await GET()).status).toBe(404)
    sc.resolveChatScope.mockResolvedValueOnce({ activeHasCap: false, shopIds: [] })
    expect((await GET()).status).toBe(403)
  })
  it('คืนโหมด + ร้าน/เพจทุกร้านในขอบเขต · ข้อความตั้งต้นเฉพาะ MESSENGER · ไม่คืน externalId', async () => {
    sc.resolveChatScope.mockResolvedValue({ activeHasCap: true, shopIds: ['a', 'b'], storedMode: 'UNIFIED', mode: 'UNIFIED', activeShopId: 'a' })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(sc.resolveChatScope.mock.calls[0][1]).toBe('H1')
    expect(ch.listChannelsForShops).toHaveBeenCalledWith(['a', 'b'])
    expect(db.shopChannel.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['c1'] } })
    const body = await res.json()
    expect(body.storedMode).toBe('UNIFIED')
    expect(body.shops).toHaveLength(2)
    expect(body.channels.map((c: { commentPrivateReplyText: string | null }) => c.commentPrivateReplyText)).toEqual(['สวัสดี {name}', null])
    expect(JSON.stringify(body)).not.toContain('SECRET-EXT')
  })
})
