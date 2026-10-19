/**
 * นโยบาย Meta (ตรวจ 2026-10-19): สติกเกอร์ / reaction / typing ใช้ได้เฉพาะใน 24 ชม. หลังลูกค้าทักล่าสุด
 * และแนบ HUMAN_AGENT ไม่ได้ ⇒ เกิน 24 ชม. ต้องไม่ยิงไป Meta เลย
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const db = vi.hoisted(() => ({
  conversation: { updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  chatMessage: { findFirst: vi.fn(), update: vi.fn() },
  externalContact: { update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: vi.fn().mockReturnValue('token-plain') }))
vi.mock('@/lib/shop-capability', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shop-capability')>('@/lib/shop-capability')
  return { ...actual, canAccessShopWith: vi.fn(async () => true) }
})
vi.mock('@/services/shop-channel.service', () => ({
  getChannelByExternalId: vi.fn(),
  markChannelTokenInvalid: vi.fn(),
}))
vi.mock('@/lib/facebook/graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/facebook/graph')>('@/lib/facebook/graph')
  return {
    ...actual,
    sendTextMessage: vi.fn(async () => 'mid.text'),
    sendStickerMessage: vi.fn(async () => 'mid.sticker'),
    sendMessageReaction: vi.fn(async () => {}),
    sendSenderAction: vi.fn(async () => true),
    getContactProfile: vi.fn(),
  }
})

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'e'.repeat(64)
})

import { transmitOutbound, sendOutboundReaction, notifyTyping } from '@/services/channel-chat.service'
import { sendStickerMessage, sendMessageReaction, sendSenderAction } from '@/lib/facebook/graph'

const HOUR = 3_600_000
function conv(lastInboundAgoMs: number) {
  return {
    id: 'conv-1',
    shopId: 'shop-1',
    channel: 'MESSENGER',
    buyerUserId: null,
    lastInboundAt: new Date(Date.now() - lastInboundAgoMs),
    replyToken: null,
    replyTokenUsedAt: null,
    shopChannel: { id: 'ch-1', shopId: 'shop-1', externalId: 'EXT-1', accessTokenEnc: 'enc', status: 'ACTIVE', provider: 'MESSENGER' },
    externalContact: { id: 'ec-1', externalUserId: 'PSID-1', name: 'ลูกค้า', isBlocked: false },
  }
}
const sticker = { id: '369239263222822', imageUrl: 'https://example.com/s.png' }

describe('นโยบาย 24 ชม. ของ sticker / reaction / typing (Meta)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.chatMessage.findFirst.mockResolvedValue({ id: 'm1', externalMessageId: 'mid.1', isDeleted: false })
    db.chatMessage.update.mockResolvedValue({})
    db.conversation.updateMany.mockResolvedValue({ count: 0 })
    db.conversation.update.mockResolvedValue({})
  })

  it('สติกเกอร์เกิน 24 ชม. → STICKER_WINDOW_CLOSED ไม่ยิง Meta (แม้เป็นคนกดเอง)', async () => {
    const c = conv(25 * HOUR) as unknown as Parameters<typeof transmitOutbound>[0]
    await expect(transmitOutbound(c, { conversationId: 'conv-1', actorUserId: 'u1', sticker })).rejects.toThrow(
      'STICKER_WINDOW_CLOSED',
    )
    expect(sendStickerMessage).not.toHaveBeenCalled()
  })

  it('สติกเกอร์ใน 24 ชม. → ยิงแบบไม่มีแท็ก', async () => {
    const c = conv(1 * HOUR) as unknown as Parameters<typeof transmitOutbound>[0]
    await transmitOutbound(c, { conversationId: 'conv-1', actorUserId: 'u1', sticker })
    expect(sendStickerMessage).toHaveBeenCalledTimes(1)
    const tagArg = (sendStickerMessage as ReturnType<typeof vi.fn>).mock.calls[0][4]
    expect(tagArg).toBeUndefined()
  })

  it('reaction เกิน 24 ชม. → REACTION_WINDOW_CLOSED ไม่ยิง Meta', async () => {
    db.conversation.findUnique.mockResolvedValue(conv(25 * HOUR))
    await expect(
      sendOutboundReaction({ conversationId: 'conv-1', messageId: 'm1', emoji: '❤', actorUserId: 'u1', cap: 'H2' }),
    ).rejects.toThrow('REACTION_WINDOW_CLOSED')
    expect(sendMessageReaction).not.toHaveBeenCalled()
  })

  it('reaction ใน 24 ชม. → ยิงได้', async () => {
    db.conversation.findUnique.mockResolvedValue(conv(1 * HOUR))
    await sendOutboundReaction({ conversationId: 'conv-1', messageId: 'm1', emoji: '❤', actorUserId: 'u1', cap: 'H2' })
    expect(sendMessageReaction).toHaveBeenCalledTimes(1)
  })

  it('typing เกิน 24 ชม. → false ไม่ยิง · ใน 24 ชม. → ยิง', async () => {
    db.conversation.findUnique.mockResolvedValue(conv(25 * HOUR))
    expect(await notifyTyping({ conversationId: 'conv-old', actorUserId: 'u1', cap: 'H2' })).toBe(false)
    expect(sendSenderAction).not.toHaveBeenCalled()

    db.conversation.findUnique.mockResolvedValue(conv(1 * HOUR))
    expect(await notifyTyping({ conversationId: 'conv-new', actorUserId: 'u1', cap: 'H2' })).toBe(true)
    expect(sendSenderAction).toHaveBeenCalledTimes(1)
  })
})
