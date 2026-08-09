import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { Prisma } from '@prisma/client'

// (S-8, feature 00025) mock prisma แบบเดียวกับ channel-chat-outbound.test.ts (ของ Messenger/IG) —
// vi.hoisted กัน TDZ (เจอปัญหานี้แล้วใน Task 7/8 ของฟีเจอร์นี้)
const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  chatMessage: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  shop: { findUnique: vi.fn() },
  shopMember: { findUnique: vi.fn() },
  shopChannel: { findUnique: vi.fn(), update: vi.fn() },
  externalContact: { update: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

// mock เฉพาะ LineAdapter.sendMessages — ตรรกะ reply/push ของ S-8 อยู่ใน channel-chat.service.ts
// ไม่ใช่ใน adapter (adapter แค่ทำตามที่ ctx บอก — เทสของ LineAdapter เองอยู่ที่ S-4)
const lineAdapter = vi.hoisted(() => ({
  sendMessages: vi.fn(),
}))
vi.mock('@/lib/channels/line-adapter', () => ({
  LineAdapter: {
    capabilities: { echo: false, readReceipt: false, freeWindowMs: 60_000, maxPartsPerRequest: 5 },
    sendMessages: lineAdapter.sendMessages,
    fetchContactProfile: vi.fn(),
    downloadContent: vi.fn(),
  },
  buildLineExternalMessageId: (id: string) => `LINE:${id}`,
}))

vi.mock('@/services/shop-channel.service', () => ({
  getChannelByExternalId: vi.fn(),
  markChannelTokenInvalid: vi.fn(),
}))
// accessTokenEnc mock ('enc') ไม่ใช่ payload รูปแบบ iv.tag.data จริง — mock decryptToken
// กันชน CHANNEL_TOKEN_MALFORMED (สนใจแค่ flow ของ sendOutboundMessage ไม่ใช่ crypto จริง)
vi.mock('@/lib/token-crypto', () => ({ decryptToken: vi.fn().mockReturnValue('line-token-plain') }))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'd'.repeat(64)
})

import { sendOutboundMessage } from '@/services/channel-chat.service'
import { LineApiError } from '@/lib/line/client'
import { REPLY_SAFETY_MARGIN_MS } from '@/lib/line/constants'
import { markChannelTokenInvalid } from '@/services/shop-channel.service'

const now = Date.now()

function baseConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv1',
    shopId: 'shop1',
    channel: 'LINE',
    buyerUserId: null,
    lastInboundAt: new Date(now - 1000),
    shopChannel: { id: 'ch1', externalId: 'U_LINE_OA', accessTokenEnc: 'enc', status: 'ACTIVE' },
    externalContact: { id: 'ec1', externalUserId: 'Uxxxxxxxxxx', name: 'ลูกค้า LINE', isBlocked: false },
    replyToken: 'reply-token-1',
    replyTokenExpiresAt: new Date(now + 50_000), // ยังเหลือเวลาเยอะกว่า SAFETY_MARGIN
    replyTokenUsedAt: null,
    ...overrides,
  }
}

describe('sendOutboundMessage — LINE (S-8, TFR-LINE-05/06)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
    db.conversation.findUnique.mockResolvedValue(baseConversation())
    db.conversation.updateMany.mockResolvedValue({ count: 1 })
    db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้าน' })
    db.chatMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() })
    db.chatMessage.findUnique.mockResolvedValue(null)
    db.conversation.update.mockResolvedValue({})
    db.externalContact.update.mockResolvedValue({})
    lineAdapter.sendMessages.mockResolvedValue({ externalMessageId: 'line-mid-1' })
  })

  it('อยู่ในหน้าต่าง reply (replyToken ยังไม่ถูกใช้ + ไม่หมดอายุ) → ใช้ reply ไม่กินโควตา, sendMethod=REPLY', async () => {
    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สวัสดีค่ะ' })

    // TC-12 [ห้ามข้าม] ครึ่งแรก: ต้อง mark replyTokenUsedAt ด้วย conditional updateMany (CAS)
    // ก่อนยิง LINE เสมอ — ห้ามอ่านแล้วค่อยเขียน
    expect(db.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'conv1', replyToken: 'reply-token-1', replyTokenUsedAt: null },
      data: { replyTokenUsedAt: expect.any(Date) },
    })
    const ctx = lineAdapter.sendMessages.mock.calls[0]![0]
    expect(ctx.replyToken).toBe('reply-token-1')

    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.sendMethod).toBe('REPLY')
    expect(data.externalMessageId).toBe('LINE:line-mid-1')
    expect(data.deliveryStatus).toBe('SENT')
  })

  it('พ้นหน้าต่าง reply (replyTokenExpiresAt ผ่านไปแล้วรวม safety margin) → push, sendMethod=PUSH', async () => {
    db.conversation.findUnique.mockResolvedValue(
      baseConversation({ replyTokenExpiresAt: new Date(now - REPLY_SAFETY_MARGIN_MS) }),
    )

    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สวัสดีค่ะ' })

    expect(db.conversation.updateMany).not.toHaveBeenCalled() // ไม่พยายาม claim token ที่หมดอายุแล้ว
    const ctx = lineAdapter.sendMessages.mock.calls[0]![0]
    expect(ctx.replyToken).toBeUndefined()
    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.sendMethod).toBe('PUSH')
  })

  it('replyTokenUsedAt ไม่ว่าง (ถูกใช้ไปแล้ว) → push, sendMethod=PUSH', async () => {
    db.conversation.findUnique.mockResolvedValue(baseConversation({ replyTokenUsedAt: new Date(now - 500) }))

    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สวัสดีค่ะ' })

    expect(db.conversation.updateMany).not.toHaveBeenCalled()
    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.sendMethod).toBe('PUSH')
  })

  it('[ห้ามข้าม] TC-12 concurrency: conditional updateMany คืน count:0 (มีคนอื่นชิงใช้ token ไปแล้ว) → fallback push ทันที ไม่ throw ไม่ยิง reply', async () => {
    db.conversation.updateMany.mockResolvedValue({ count: 0 })

    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สวัสดีค่ะ' })

    const ctx = lineAdapter.sendMessages.mock.calls[0]![0]
    expect(ctx.replyToken).toBeUndefined()
    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.sendMethod).toBe('PUSH')
  })

  it('ผู้รับบล็อกอยู่แล้วใน DB (isBlocked=true) → CONTACT_BLOCKED โดยไม่ยิง LINE เลย', async () => {
    db.conversation.findUnique.mockResolvedValue(
      baseConversation({ externalContact: { id: 'ec1', externalUserId: 'Ux', name: 'ลูกค้า', isBlocked: true } }),
    )

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('CONTACT_BLOCKED')
    expect(lineAdapter.sendMessages).not.toHaveBeenCalled()
    expect(db.chatMessage.create).not.toHaveBeenCalled()
  })

  it('LINE ปฏิเสธเพราะผู้รับ unfollow/บล็อก (400 "hasn\'t added the bot…") → CONTACT_BLOCKED + ตั้ง isBlocked=true (เตรียมทางให้ S-11)', async () => {
    lineAdapter.sendMessages.mockRejectedValue(
      new LineApiError(
        "The user hasn't added the bot as a friend (or has blocked the bot).",
        400,
        { message: "The user hasn't added the bot as a friend (or has blocked the bot)." },
      ),
    )

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('CONTACT_BLOCKED')
    expect(db.externalContact.update).toHaveBeenCalledWith({ where: { id: 'ec1' }, data: { isBlocked: true } })
  })

  it('LINE ตอบ 401 (token ใช้ไม่ได้) → TOKEN_INVALID + เรียก markChannelTokenInvalid', async () => {
    lineAdapter.sendMessages.mockRejectedValue(new LineApiError('token invalid', 401, {}))

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('TOKEN_INVALID')
    expect(markChannelTokenInvalid).toHaveBeenCalledWith('ch1')
  })

  it('LINE ตอบ 429 (โควตาหมด) → QUOTA_EXCEEDED', async () => {
    lineAdapter.sendMessages.mockRejectedValue(new LineApiError('quota exceeded', 429, {}))

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('QUOTA_EXCEEDED')
  })

  it('LINE ตอบ 5xx → LINE_UNAVAILABLE', async () => {
    lineAdapter.sendMessages.mockRejectedValue(new LineApiError('internal error', 500, {}))

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('LINE_UNAVAILABLE')
  })

  it('network/timeout (status 0) → LINE_UNAVAILABLE', async () => {
    lineAdapter.sendMessages.mockRejectedValue(new LineApiError('LINE API หมดเวลาเชื่อมต่อ', 0, undefined))

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('LINE_UNAVAILABLE')
  })

  it('reply token หมดอายุจริงที่ฝั่ง LINE (400 "Invalid reply token") + คนพิมพ์เอง → fallback push อัตโนมัติ ส่งสำเร็จ (TFR-LINE-05)', async () => {
    lineAdapter.sendMessages
      .mockRejectedValueOnce(new LineApiError('Invalid reply token', 400, {}))
      .mockResolvedValueOnce({ externalMessageId: 'line-mid-fallback' })

    const msg = await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' })

    expect(lineAdapter.sendMessages).toHaveBeenCalledTimes(2)
    const secondCtx = lineAdapter.sendMessages.mock.calls[1]![0]
    expect(secondCtx.replyToken).toBeUndefined() // รอบสองต้องเป็น push จริง ไม่ใช่ reply token เดิม
    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.sendMethod).toBe('PUSH')
    expect(data.deliveryStatus).toBe('SENT')
    expect(msg.id).toBe('m1')
  })

  it('reply token หมดอายุที่ฝั่ง LINE + เส้นทางระบบ (auto-reply) → ห้าม fallback เป็น push (BR-LINE-18)', async () => {
    lineAdapter.sendMessages.mockRejectedValueOnce(new LineApiError('Invalid reply token', 400, {}))

    await sendOutboundMessage({
      conversationId: 'conv1',
      actorUserId: null,
      systemShopId: 'shop1',
      autoReplyKind: 'AUTO',
      text: 'ตอบอัตโนมัติ',
    }).catch(() => {}) // SEND_FAILED เดิม — ไม่ใช่รหัส route-level เฉพาะ (ยังไม่มี caller ทาง S-12)

    expect(lineAdapter.sendMessages).toHaveBeenCalledTimes(1) // ไม่ retry เป็น push
    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.deliveryStatus).toBe('FAILED')
    expect(data.sendMethod).toBe('REPLY')
  })

  it('channel ไม่ ACTIVE → CHANNEL_NOT_ACTIVE ไม่ยิง LINE เลย', async () => {
    db.conversation.findUnique.mockResolvedValue(
      baseConversation({ shopChannel: { id: 'ch1', externalId: 'U', accessTokenEnc: 'enc', status: 'TOKEN_INVALID' } }),
    )

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('CHANNEL_NOT_ACTIVE')
    expect(lineAdapter.sendMessages).not.toHaveBeenCalled()
    expect(db.chatMessage.create).not.toHaveBeenCalled()
  })

  it('คนที่ไม่ใช่เจ้าของร้านและไม่ใช่สมาชิก → FORBIDDEN (authz ใช้ร่วมกับ Meta)', async () => {
    db.shopMember.findUnique.mockResolvedValue(null)
    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'stranger', text: 'hi' }),
    ).rejects.toThrow('FORBIDDEN')
    expect(lineAdapter.sendMessages).not.toHaveBeenCalled()
  })

  it('LINE ตอบ error 400 ที่ไม่รู้จัก (ไม่ใช่ reply token/blocked) → บันทึกเป็น FAILED พร้อมเหตุผลดิบ (SEND_FAILED) ไม่เดา', async () => {
    lineAdapter.sendMessages.mockRejectedValue(new LineApiError('The property, text, in the request body is invalid', 400, {}))

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('SEND_FAILED')

    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.deliveryStatus).toBe('FAILED')
    expect(data.failureReason).toContain('invalid')
    expect(data.externalMessageId).toBeNull()
  })

  it('ส่งสำเร็จ → create ข้อความ + update snapshot อยู่ในทรานแซกชันเดียวกัน (M-2)', async () => {
    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สวัสดีค่ะ' })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })
})
