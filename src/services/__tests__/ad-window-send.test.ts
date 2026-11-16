/**
 * 00095: ด่าน WINDOW_CLOSED ของเส้นทางระบบ (auto-notify/บอท) ต้องนับกรอบโฆษณา 7 วัน
 * + แถวที่นับ anchor: referral ADS ต้องมีข้อความลูกค้าตามมา (ปิดช่อง echo ของเพจ)
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const db = vi.hoisted(() => ({
  conversation: { updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  chatMessage: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  conversationAdReferral: { findMany: vi.fn() },
  externalContact: { update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: vi.fn().mockReturnValue('token-plain') }))
vi.mock('@/lib/shop-capability', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shop-capability')>('@/lib/shop-capability')
  return { ...actual, canAccessShopWith: vi.fn(async () => true) }
})
vi.mock('@/services/shop-channel.service', () => ({ getChannelByExternalId: vi.fn(), markChannelTokenInvalid: vi.fn() }))
vi.mock('@/lib/facebook/graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/facebook/graph')>('@/lib/facebook/graph')
  return { ...actual, sendTextMessage: vi.fn(async () => 'mid.text'), sendSenderAction: vi.fn(async () => true) }
})

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'f'.repeat(64)
})

import { transmitOutbound } from '@/services/channel-chat.service'
import { getAdWindowStartAt } from '@/services/ad-window.service'
import { sendTextMessage } from '@/lib/facebook/graph'

const H = 3_600_000
const conv = (agoMs: number, channel = 'MESSENGER') => ({
  id: 'conv-1', shopId: 'shop-1', channel, buyerUserId: null,
  lastInboundAt: new Date(Date.now() - agoMs), replyToken: null, replyTokenUsedAt: null,
  shopChannel: { id: 'ch-1', shopId: 'shop-1', externalId: 'EXT-1', accessTokenEnc: 'enc', status: 'ACTIVE', provider: channel },
  externalContact: { id: 'ec-1', externalUserId: 'PSID-1', name: 'ลูกค้า', isBlocked: false },
}) as unknown as Parameters<typeof transmitOutbound>[0]
const auto = { conversationId: 'conv-1', actorUserId: null, autoReplyKind: 'AUTO_NOTICE' as const, text: 'แจ้ง' }

describe('เส้นทางระบบ × กรอบโฆษณา', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.chatMessage.update.mockResolvedValue({})
    db.conversation.update.mockResolvedValue({})
  })

  it('เกิน 24 ชม. แต่มี anchor โฆษณา 26 ชม.ก่อน → ไม่ throw WINDOW_CLOSED และยิงแบบไม่มีแท็ก', async () => {
    db.conversationAdReferral.findMany.mockResolvedValue([{ conversationId: 'conv-1', receivedAt: new Date(Date.now() - 26 * H) }])
    db.chatMessage.findMany.mockResolvedValue([{ conversationId: 'conv-1', createdAt: new Date(Date.now() - 26 * H + 5_000) }])
    await transmitOutbound(conv(26 * H), auto)
    expect(sendTextMessage).toHaveBeenCalledTimes(1)
  })

  it('เกิน 24 ชม. ไม่มี referral → WINDOW_CLOSED เหมือนเดิม', async () => {
    db.conversationAdReferral.findMany.mockResolvedValue([])
    await expect(transmitOutbound(conv(26 * H), auto)).rejects.toThrow('WINDOW_CLOSED')
    expect(sendTextMessage).not.toHaveBeenCalled()
  })

  it('referral มี แต่ไม่มีข้อความลูกค้าตามมา (echo ของเพจ) → ไม่นับ', async () => {
    db.conversationAdReferral.findMany.mockResolvedValue([{ conversationId: 'conv-1', receivedAt: new Date(Date.now() - 26 * H) }])
    db.chatMessage.findMany.mockResolvedValue([])
    await expect(transmitOutbound(conv(26 * H), auto)).rejects.toThrow('WINDOW_CLOSED')
  })
})

describe('getAdWindowStartAt', () => {
  beforeEach(() => vi.clearAllMocks())
  it('ช่องทางที่ไม่ใช่ Meta → null โดยไม่ query', async () => {
    expect(await getAdWindowStartAt('c', 'LINE')).toBeNull()
    expect(db.conversationAdReferral.findMany).not.toHaveBeenCalled()
  })
  it('ข้อความลูกค้าที่มาก่อน referral เกิน 2 นาทีไม่นับ · เลือกข้อความแรกที่เข้าช่วง', async () => {
    const t = Date.now() - 30 * H
    db.conversationAdReferral.findMany.mockResolvedValue([{ conversationId: 'c', receivedAt: new Date(t) }])
    db.chatMessage.findMany.mockResolvedValue([
      { conversationId: 'c', createdAt: new Date(t - 10 * 60_000) },
      { conversationId: 'c', createdAt: new Date(t + 3_000) },
      { conversationId: 'c', createdAt: new Date(t + 9_000) },
    ])
    expect((await getAdWindowStartAt('c', 'INSTAGRAM'))?.getTime()).toBe(t + 3_000)
    const q = db.conversationAdReferral.findMany.mock.calls[0]![0].where
    expect(q.conversationId).toBeDefined()
    expect(q.source).toBe('ADS')
    // anchor ต้องเป็นข้อความจริงของลูกค้า: ไม่ใช่ฝั่งร้าน และไม่ใช่ข้อความที่ถูกลบ
    const m = db.chatMessage.findMany.mock.calls[0]![0].where
    expect(m.senderRole).toBe('BUYER')
    expect(m.isDeleted).toBe(false)
    expect(m.conversationId).toBeDefined()
  })
})

describe('guard: จุดตัดสินส่งได้ไหมต้องใช้ getWindowStateWithAd', () => {
  it('channel-chat.service ไม่เรียก getWindowState(conversation.lastInboundAt) ตรง ๆ แล้ว', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/channel-chat.service.ts'), 'utf8')
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
    expect(code).not.toMatch(/getWindowState\(\s*(conv|conversation)\.lastInboundAt/)
    expect(code).toMatch(/getWindowStateWithAd\(conversation\)/)
  })
})
