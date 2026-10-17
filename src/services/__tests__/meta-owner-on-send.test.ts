/**
 * 00078 S-10 — ส่งสำเร็จบน Meta = เราถือห้อง → ป้าย Meta AI หาย · ส่งล้ม (#10) → ป้ายยังอยู่
 * mock prisma (ไม่แตะ DB) — mutation: ถอดการเรียก recordOurSendAsMetaOwner ออกจาก channel-chat → เคสแรกแดง
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  chatMessage: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  shop: { findUnique: vi.fn() },
  shopMember: { findUnique: vi.fn() },
  shopChannel: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/facebook/graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/facebook/graph')>('@/lib/facebook/graph')
  return { ...actual, sendTextMessage: vi.fn(), getContactProfile: vi.fn() }
})
vi.mock('@/services/shop-channel.service', () => ({ getChannelByExternalId: vi.fn(), markChannelTokenInvalid: vi.fn() }))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: vi.fn().mockReturnValue('page-token-plain') }))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'd'.repeat(64)
})

import { sendOutboundMessage } from '@/services/channel-chat.service'
import { sendTextMessage, GraphApiError } from '@/lib/facebook/graph'
import { metaAiHoldingUntilMs, META_PAGE_INBOX_APP_ID } from '@/lib/meta-ai-holder'

const OUR = 'OUR_APP_123'
const now = Date.now()
const notice = { conversationId: 'conv1', actorUserId: null, systemShopId: 'shop1', autoReplyKind: 'AUTO_NOTICE' as const, text: 'สรุปคำสั่งซื้อ' }

describe('ส่งสำเร็จบน Meta → บันทึกผู้ถือห้อง = เรา', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.FB_CHAT_APP_ID = OUR
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
    db.conversation.findUnique.mockResolvedValue({
      id: 'conv1', shopId: 'shop1', channel: 'MESSENGER', buyerUserId: null,
      lastInboundAt: new Date(now - 1000),
      shopChannel: { id: 'ch1', externalId: 'PAGE1', accessTokenEnc: 'enc', status: 'ACTIVE' },
      externalContact: { id: 'ec1', externalUserId: 'PSID_1', name: 'ลูกค้า' },
    })
    db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้าน', kind: 'PERSONAL', vertical: 'ONLINE_SALES', deletedAt: null, members: [] })
    db.chatMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() })
    db.chatMessage.findUnique.mockResolvedValue(null)
    db.conversation.update.mockResolvedValue({})
    db.conversation.updateMany.mockResolvedValue({ count: 1 })
    ;(sendTextMessage as ReturnType<typeof vi.fn>).mockResolvedValue('mid.out.1')
  })
  afterEach(() => {
    delete process.env.FB_CHAT_APP_ID
  })

  it('AI echo ถือห้อง → ระบบส่ง AUTO_NOTICE สำเร็จ → เขียน owner=เรา → สูตรไม่ถือห้อง (ป้ายหาย)', async () => {
    const echoAt = now - 60_000
    const facts = {
      metaForeignEchoAt: echoAt, metaForeignEchoAppId: META_PAGE_INBOX_APP_ID, metaForeignEchoAi: true,
      metaForeignEchoAdminText: false, lastMessageAt: now - 1000, lastSenderRole: 'BUYER' as const,
    }
    expect(metaAiHoldingUntilMs(facts, OUR)).not.toBeNull() // ก่อนส่ง: ยังถือ

    await sendOutboundMessage(notice)

    expect(db.conversation.updateMany).toHaveBeenCalledTimes(1)
    const arg = db.conversation.updateMany.mock.calls[0]![0]
    expect(arg.where.id).toBe('conv1')
    expect(arg.where.OR).toEqual([{ metaOwnerObservedAt: null }, { metaOwnerObservedAt: { lt: expect.any(Date) } }])
    expect(arg.data.metaOwnerAppId).toBe(OUR)
    // สูตรจริงกับค่าที่เขียน: ไม่ถือห้องแล้ว
    expect(metaAiHoldingUntilMs({ ...facts, metaOwnerAppId: arg.data.metaOwnerAppId, metaOwnerObservedAt: arg.data.metaOwnerObservedAt }, OUR)).toBeNull()
  })

  it('ส่งล้ม (#10 AI ของ Meta ถือห้อง) → ไม่เขียน owner → ป้ายยังอยู่', async () => {
    ;(sendTextMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new GraphApiError('thread controlled by another app', 10, 2018278, 400))
    await expect(sendOutboundMessage(notice)).rejects.toThrow()
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
  })

  it('FB_CHAT_APP_ID ไม่ตั้ง → ข้าม ไม่เดา', async () => {
    delete process.env.FB_CHAT_APP_ID
    await sendOutboundMessage(notice)
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
  })

  it('เขียน owner ล้มเหลว → การส่งยังสำเร็จ (ไม่ throw)', async () => {
    db.conversation.updateMany.mockRejectedValue(new Error('db down'))
    await expect(sendOutboundMessage(notice)).resolves.toBeDefined()
  })
})
