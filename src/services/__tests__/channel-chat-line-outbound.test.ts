import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import { Prisma } from '@prisma/client'

// (S-8, feature 00025) mock prisma แบบเดียวกับ channel-chat-outbound.test.ts (ของ Messenger/IG) —
// vi.hoisted กัน TDZ (เจอปัญหานี้แล้วใน Task 7/8 ของฟีเจอร์นี้)
const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  chatMessage: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
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

// (S-9) โควตา — mock ทั้ง service (ตรรกะ cache/TTL มีเทสของตัวเองที่ line-quota.service.test.ts)
// ค่าเริ่มต้นของทุกเทสในไฟล์นี้คือ "ยังไม่รู้โควตา" (UNKNOWN) ซึ่งต้อง **ไม่บล็อกอะไรเลย** — ถ้าวันไหน
// มีคนทำให้ UNKNOWN บล็อก เทสเดิมทั้งไฟล์นี้จะแดงทันที ไม่ใช่แค่เทสของ S-9
const quota = vi.hoisted(() => ({
  getLineQuota: vi.fn(),
  noteLinePushConsumed: vi.fn(),
  invalidateLineQuota: vi.fn(),
}))
vi.mock('@/services/line-quota.service', () => quota)

/** ค่าตั้งต้นของทุกเทสในไฟล์นี้ = "ยังไม่รู้โควตา" (LINE ยังไม่เคยตอบ) — ต้องส่งได้ตามปกติ (TD-006) */
function resetQuotaMocks() {
  quota.getLineQuota.mockResolvedValue({
    type: 'unknown',
    total: null,
    used: null,
    remaining: null,
    level: 'UNKNOWN',
    fetchedAt: null,
    stale: true,
  })
  quota.noteLinePushConsumed.mockResolvedValue(undefined)
  quota.invalidateLineQuota.mockResolvedValue(undefined)
}
// accessTokenEnc mock ('enc') ไม่ใช่ payload รูปแบบ iv.tag.data จริง — mock decryptToken
// กันชน CHANNEL_TOKEN_MALFORMED (สนใจแค่ flow ของ sendOutboundMessage ไม่ใช่ crypto จริง)
vi.mock('@/lib/token-crypto', () => ({ decryptToken: vi.fn().mockReturnValue('line-token-plain') }))

// (S-18a) สติกเกอร์ขาออก mirror ผ่าน mirrorRemoteImage (ยิง fetch จริงไปที่ stickershop.line-scdn.net)
// แล้วเขียนลง storage ผ่าน saveFile — mock ทั้งคู่กันเทสยิง network/เขียนไฟล์จริง (pattern เดียวกับ
// channel-chat-line-media-ingest.test.ts)
const { saveFile } = vi.hoisted(() => ({ saveFile: vi.fn() }))
vi.mock('@/lib/storage', () => ({ saveFile, getFileUrl: vi.fn().mockResolvedValue('https://signed.example/x') }))

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
    db.chatMessage.findFirst.mockResolvedValue(null) // (S-18a) ไม่มีข้อความที่ตอบทับ เว้นแต่เทสตั้งเอง
    db.conversation.update.mockResolvedValue({})
    db.externalContact.update.mockResolvedValue({})
    lineAdapter.sendMessages.mockResolvedValue({ externalMessageId: 'line-mid-1' })
    resetQuotaMocks()
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

  it('LINE ตอบ 429 (โควตาหมด) → QUOTA_EXCEEDED + ล้าง cache โควตา (S-9)', async () => {
    lineAdapter.sendMessages.mockRejectedValue(new LineApiError('quota exceeded', 429, {}))

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('QUOTA_EXCEEDED')
    // ค่าที่ cache ไว้ขัดกับความจริงที่ LINE เพิ่งบอก — ต้องบังคับให้อ่านใหม่รอบหน้า (TFR-LINE-07)
    expect(quota.invalidateLineQuota).toHaveBeenCalledWith('ch1')
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

// ══════════════════════════════════════════════════════════════════════════
// (S-9) โควตากับการตัดสินใจส่ง — TFR-LINE-06 ข้อ 5
// ══════════════════════════════════════════════════════════════════════════

describe('sendOutboundMessage — LINE โควตา (S-9, TFR-LINE-06/07)', () => {
  /** โควตาหมดจริง (รู้ตัวเลขแน่นอน) */
  const exhausted = {
    type: 'limited' as const,
    total: 300,
    used: 300,
    remaining: 0,
    level: 'EXHAUSTED' as const,
    fetchedAt: new Date(now - 1000),
    stale: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
    db.conversation.findUnique.mockResolvedValue(baseConversation())
    db.conversation.updateMany.mockResolvedValue({ count: 1 })
    db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้าน' })
    db.chatMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() })
    db.chatMessage.findUnique.mockResolvedValue(null)
    db.chatMessage.findFirst.mockResolvedValue(null)
    db.conversation.update.mockResolvedValue({})
    db.externalContact.update.mockResolvedValue({})
    lineAdapter.sendMessages.mockResolvedValue({ externalMessageId: 'line-mid-1' })
    resetQuotaMocks()
  })

  it('[ห้ามข้าม] TC-15: โควตาหมด + พ้นหน้าต่างฟรี → QUOTA_EXCEEDED โดยไม่มี request ไป LINE เลย', async () => {
    db.conversation.findUnique.mockResolvedValue(
      baseConversation({ replyTokenExpiresAt: new Date(now - REPLY_SAFETY_MARGIN_MS) }),
    )
    quota.getLineQuota.mockResolvedValue(exhausted)

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('QUOTA_EXCEEDED')
    expect(lineAdapter.sendMessages).not.toHaveBeenCalled()
    expect(db.chatMessage.create).not.toHaveBeenCalled()
  })

  it('[ห้ามข้าม] TC-28: โควตาหมดแต่ยังอยู่ในหน้าต่างฟรี → ส่งได้ตามปกติด้วย reply (reply ไม่กินโควตา)', async () => {
    // 🛑 เคสที่ implement ผิดง่ายที่สุดตามที่ TestCase.md เตือนเอง — mutation: ย้ายด่านโควตาออกมา
    // นอก `if (sendMethod === 'PUSH')` แล้วข้อนี้แดงทันที
    quota.getLineQuota.mockResolvedValue(exhausted)

    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' })

    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.sendMethod).toBe('REPLY')
    expect(data.deliveryStatus).toBe('SENT')
    // ส่งด้วย reply → ต้องไม่ไปแตะตัวนับโควตาเลย (ไม่งั้นเลขจะเดินทั้งที่ไม่ได้ใช้)
    expect(quota.noteLinePushConsumed).not.toHaveBeenCalled()
  })

  it('โควตาเหลือน้อย (LOW) ยังส่งได้ตามปกติ — เป็นแค่คำเตือน ไม่ใช่ตัวบล็อก', async () => {
    db.conversation.findUnique.mockResolvedValue(
      baseConversation({ replyTokenExpiresAt: new Date(now - REPLY_SAFETY_MARGIN_MS) }),
    )
    quota.getLineQuota.mockResolvedValue({ ...exhausted, used: 280, remaining: 20, level: 'LOW' })

    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' })

    expect(lineAdapter.sendMessages).toHaveBeenCalledTimes(1)
    expect(db.chatMessage.create.mock.calls[0]![0].data.sendMethod).toBe('PUSH')
  })

  it('[ห้ามข้าม] อ่านโควตาไม่ได้ (UNKNOWN/stale) → ต้องไม่บล็อก ปล่อยให้ LINE ตัดสิน (TD-006)', async () => {
    db.conversation.findUnique.mockResolvedValue(
      baseConversation({ replyTokenExpiresAt: new Date(now - REPLY_SAFETY_MARGIN_MS) }),
    )
    // getLineQuota คืน UNKNOWN อยู่แล้วตาม resetQuotaMocks()
    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' })

    expect(lineAdapter.sendMessages).toHaveBeenCalledTimes(1)
  })

  it('push สำเร็จ → นับโควตาที่ใช้ไป 1 ครั้งต่อ 1 คำขอ (ไม่ต้องรอ TTL หมดอายุ)', async () => {
    db.conversation.findUnique.mockResolvedValue(
      baseConversation({ replyTokenExpiresAt: new Date(now - REPLY_SAFETY_MARGIN_MS) }),
    )

    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' })

    expect(quota.noteLinePushConsumed).toHaveBeenCalledTimes(1)
    expect(quota.noteLinePushConsumed).toHaveBeenCalledWith('ch1')
  })

  it('push ล้มเหลว → ห้ามนับโควตา (ยังไม่มีอะไรถูกหักจริง)', async () => {
    db.conversation.findUnique.mockResolvedValue(
      baseConversation({ replyTokenExpiresAt: new Date(now - REPLY_SAFETY_MARGIN_MS) }),
    )
    lineAdapter.sendMessages.mockRejectedValue(new LineApiError('bad request', 400, { message: 'invalid' }))

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('SEND_FAILED')
    expect(quota.noteLinePushConsumed).not.toHaveBeenCalled()
  })

  it('fallback reply→push แล้วโดนปฏิเสธเพราะโควตา → ล้าง cache ด้วย (เส้นทางนี้ไม่ผ่านด่านโควตาข้างบน)', async () => {
    lineAdapter.sendMessages
      .mockRejectedValueOnce(new LineApiError('Invalid reply token', 400, { message: 'Invalid reply token' }))
      .mockRejectedValueOnce(new LineApiError('quota exceeded', 429, {}))

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('SEND_FAILED')

    expect(quota.invalidateLineQuota).toHaveBeenCalledWith('ch1')
    expect(quota.noteLinePushConsumed).not.toHaveBeenCalled()
  })

  it('ไม่เช็คโควตาเลยเมื่อส่งด้วย reply (ไม่เสีย round-trip ไป LINE โดยไม่จำเป็น)', async () => {
    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' })
    expect(quota.getLineQuota).not.toHaveBeenCalled()
  })
})

describe('sendOutboundMessage — LINE quote reply (S-18a)', () => {
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
    resetQuotaMocks()
  })

  it('เจอ quoteToken ของข้อความที่ตอบทับ (rawMessage.payload.quoteToken) → ส่งไปกับ ctx.quoteToken', async () => {
    db.chatMessage.findFirst.mockResolvedValue({ rawMessage: { payload: { quoteToken: 'quote-token-abc' } } })

    await sendOutboundMessage({
      conversationId: 'conv1',
      actorUserId: 'owner1',
      text: 'ใช่ค่ะ อันนี้ยังมีอยู่',
      replyToMid: 'LINE:1234567890',
    })

    expect(db.chatMessage.findFirst).toHaveBeenCalledWith({
      where: { externalMessageId: 'LINE:1234567890', conversationId: 'conv1' },
      select: { rawMessage: true },
    })
    const ctx = lineAdapter.sendMessages.mock.calls[0]![0]
    expect(ctx.quoteToken).toBe('quote-token-abc')
  })

  it('หา quoteToken ไม่เจอ (แถวไม่มี/ไม่มี field นี้) → ยังส่งสำเร็จโดยไม่มี quoteToken ไม่ throw (ต้อง console.warn)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.chatMessage.findFirst.mockResolvedValue({ rawMessage: { payload: {} } })

    const msg = await sendOutboundMessage({
      conversationId: 'conv1',
      actorUserId: 'owner1',
      text: 'ตอบกลับนะคะ',
      replyToMid: 'LINE:not-found',
    })

    const ctx = lineAdapter.sendMessages.mock.calls[0]![0]
    expect(ctx.quoteToken).toBeUndefined()
    expect(msg.id).toBe('m1')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('query หา quoteToken ล้ม (DB error) → ยังส่งข้อความปกติต่อไปได้ ไม่ throw ทั้งการส่ง', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.chatMessage.findFirst.mockRejectedValue(new Error('DB ล่มชั่วคราว'))

    const msg = await sendOutboundMessage({
      conversationId: 'conv1',
      actorUserId: 'owner1',
      text: 'ตอบกลับนะคะ',
      replyToMid: 'LINE:whatever',
    })

    expect(msg.id).toBe('m1')
    const ctx = lineAdapter.sendMessages.mock.calls[0]![0]
    expect(ctx.quoteToken).toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('ไม่ได้ตอบกลับข้อความไหนเลย (ไม่มี replyToMid) → ไม่ query หา quoteToken เลย', async () => {
    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สวัสดีค่ะ' })
    expect(db.chatMessage.findFirst).not.toHaveBeenCalled()
  })

  it('ส่งสำเร็จ → เก็บ quoteToken ของข้อความที่เพิ่งส่งเอง (จาก response ของ LINE) ลง rawMessage เพื่อให้ quote ต่อได้', async () => {
    lineAdapter.sendMessages.mockResolvedValue({ externalMessageId: 'line-mid-2', quoteToken: 'sent-quote-token' })

    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สวัสดีค่ะ' })

    const data = db.chatMessage.create.mock.calls[0]![0].data
    const raw = data.rawMessage as { payload: { quoteToken: string | null } }
    expect(raw.payload.quoteToken).toBe('sent-quote-token')
  })
})

describe('sendOutboundMessage — LINE ส่งสติกเกอร์ (S-18a)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
    db.conversation.findUnique.mockResolvedValue(baseConversation())
    db.conversation.updateMany.mockResolvedValue({ count: 1 })
    db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้าน' })
    db.chatMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() })
    db.chatMessage.findUnique.mockResolvedValue(null)
    db.chatMessage.findFirst.mockResolvedValue(null)
    db.conversation.update.mockResolvedValue({})
    db.externalContact.update.mockResolvedValue({})
    lineAdapter.sendMessages.mockResolvedValue({ externalMessageId: 'line-mid-sticker-1' })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('stickerId อยู่ในชุดที่ยืนยันว่าส่งได้ (446/1988) → ยิง part { kind: sticker, stickerId, packageId }', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(new Uint8Array(8) as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } }),
    )
    saveFile.mockResolvedValue('line-sticker/1988.png')

    await sendOutboundMessage({
      conversationId: 'conv1',
      actorUserId: 'owner1',
      sticker: { id: '1988', imageUrl: 'https://should-not-be-used.example/x.png' },
    })

    const parts = lineAdapter.sendMessages.mock.calls[0]![1]
    expect(parts).toEqual([{ kind: 'sticker', stickerId: '1988', packageId: '446' }])
  })

  it('สติกเกอร์ที่ยิงสำเร็จ → mirror รูปจาก stickershop CDN (ไม่ใช่ params.sticker.imageUrl) แล้วบันทึกเป็น ChatMessage type=IMAGE', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(new Uint8Array(8) as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } }),
    )
    saveFile.mockResolvedValue('line-sticker/1988.png')

    await sendOutboundMessage({
      conversationId: 'conv1',
      actorUserId: 'owner1',
      sticker: { id: '1988', imageUrl: 'https://should-not-be-used.example/x.png' },
    })

    expect(fetch).toHaveBeenCalledWith(
      'https://stickershop.line-scdn.net/stickershop/v1/sticker/1988/android/sticker.png',
      expect.anything(),
    )
    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.type).toBe('IMAGE')
    expect(data.body).toBeNull()
    expect(data.imageUrl).toBe('line-sticker/1988.png')
    expect(data.deliveryStatus).toBe('SENT')
  })

  it('stickerId ไม่อยู่ในชุดที่ยืนยันว่าส่งได้ → ส่ง packageId เป็น undefined ไป (ไม่เดาค่าเอง — LineAdapter จริงเป็นคนปฏิเสธ)', async () => {
    await sendOutboundMessage({
      conversationId: 'conv1',
      actorUserId: 'owner1',
      sticker: { id: 'unknown-sticker-id', imageUrl: 'https://x/img.png' },
    })

    const parts = lineAdapter.sendMessages.mock.calls[0]![1]
    expect(parts).toEqual([{ kind: 'sticker', stickerId: 'unknown-sticker-id', packageId: undefined }])
  })
})
