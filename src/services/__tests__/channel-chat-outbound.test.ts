import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ —
// ถ้าประกาศ db ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError) (เจอปัญหานี้แล้วใน Task 7/8)
const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  chatMessage: { create: vi.fn() },
  shop: { findUnique: vi.fn() },
  shopChannel: { findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/facebook/graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/facebook/graph')>('@/lib/facebook/graph')
  return { ...actual, sendTextMessage: vi.fn(), getContactProfile: vi.fn() }
})
vi.mock('@/services/shop-channel.service', () => ({
  getChannelByExternalId: vi.fn(),
  markChannelTokenInvalid: vi.fn(),
}))
// accessTokenEnc mock ('enc') ไม่ใช่ payload รูปแบบ iv.tag.data จริง — mock decryptToken
// กันชน CHANNEL_TOKEN_MALFORMED (สนใจแค่ flow ของ sendOutboundMessage ไม่ใช่ crypto จริง)
vi.mock('@/lib/token-crypto', () => ({ decryptToken: vi.fn().mockReturnValue('page-token-plain') }))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'd'.repeat(64)
})

import { sendOutboundMessage, MESSAGING_WINDOW_MS } from '@/services/channel-chat.service'
import { sendTextMessage, GraphApiError } from '@/lib/facebook/graph'
import { markChannelTokenInvalid } from '@/services/shop-channel.service'

const now = Date.now()

describe('sendOutboundMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.conversation.findUnique.mockResolvedValue({
      id: 'conv1', shopId: 'shop1', channel: 'MESSENGER', buyerUserId: null,
      lastInboundAt: new Date(now - 1000),
      shopChannel: { id: 'ch1', externalId: 'PAGE1', accessTokenEnc: 'enc', status: 'ACTIVE' },
      externalContact: { id: 'ec1', externalUserId: 'PSID_1', name: 'ลูกค้า' },
    })
    db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้าน' })
    db.chatMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() })
    db.conversation.update.mockResolvedValue({})
    ;(sendTextMessage as ReturnType<typeof vi.fn>).mockResolvedValue('mid.out.1')
  })

  it('window เปิด → ส่งออกก่อน แล้วเก็บ mid เป็น externalMessageId', async () => {
    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สวัสดีครับ' })

    expect(sendTextMessage).toHaveBeenCalledTimes(1)
    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.externalMessageId).toBe('mid.out.1')
    expect(data.senderRole).toBe('SHOP')
    expect(data.deliveryStatus).toBe('SENT')
  })

  it('window ปิด → โยน WINDOW_CLOSED และไม่ยิง Graph API เลย', async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: 'conv1', shopId: 'shop1', channel: 'MESSENGER', buyerUserId: null,
      lastInboundAt: new Date(now - MESSAGING_WINDOW_MS - 5000),
      shopChannel: { id: 'ch1', externalId: 'PAGE1', accessTokenEnc: 'enc', status: 'ACTIVE' },
      externalContact: { id: 'ec1', externalUserId: 'PSID_1', name: 'ลูกค้า' },
    })

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สาย' }),
    ).rejects.toThrow('WINDOW_CLOSED')
    expect(sendTextMessage).not.toHaveBeenCalled()
  })

  it('คนที่ไม่ใช่เจ้าของร้าน → FORBIDDEN', async () => {
    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'stranger', text: 'hi' }),
    ).rejects.toThrow('FORBIDDEN')
  })

  it('เธรด DEEP → NOT_EXTERNAL_CHANNEL (ต้องไปทาง sendMessage เดิม)', async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: 'conv1', shopId: 'shop1', channel: 'DEEP', buyerUserId: 'buyer1',
      lastInboundAt: null, shopChannel: null, externalContact: null,
    })
    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('NOT_EXTERNAL_CHANNEL')
  })

  it('Graph ตอบ error → บันทึกข้อความเป็น FAILED พร้อมเหตุผล แล้วโยนต่อ', async () => {
    ;(sendTextMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new GraphApiError('outside allowed window', 10, 2018278, 400),
    )

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow()

    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.deliveryStatus).toBe('FAILED')
    expect(data.failureReason).toContain('outside allowed window')
    expect(data.externalMessageId).toBeNull()
  })

  it('Graph error code 190 (token ตาย) → เรียก markChannelTokenInvalid', async () => {
    ;(sendTextMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new GraphApiError('Error validating access token', 190, null, 401),
    )

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow()

    expect(markChannelTokenInvalid).toHaveBeenCalledWith('ch1')
  })
})
