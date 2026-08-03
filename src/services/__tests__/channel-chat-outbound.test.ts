import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { Prisma } from '@prisma/client'

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ —
// ถ้าประกาศ db ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError) (เจอปัญหานี้แล้วใน Task 7/8)
const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  chatMessage: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  shop: { findUnique: vi.fn() },
  shopMember: { findUnique: vi.fn() }, // canAccessShop เช็ค membership เมื่อไม่ใช่เจ้าของ
  shopChannel: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

// helper สร้าง P2002 จริงจาก Prisma — ตรงกับที่ service เช็คด้วย instanceof + meta.target
function p2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('unique constraint violation', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  })
}
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
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
    db.conversation.findUnique.mockResolvedValue({
      id: 'conv1', shopId: 'shop1', channel: 'MESSENGER', buyerUserId: null,
      lastInboundAt: new Date(now - 1000),
      shopChannel: { id: 'ch1', externalId: 'PAGE1', accessTokenEnc: 'enc', status: 'ACTIVE' },
      externalContact: { id: 'ec1', externalUserId: 'PSID_1', name: 'ลูกค้า' },
    })
    db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้าน' })
    db.chatMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() })
    db.chatMessage.findUnique.mockResolvedValue(null)
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

  // 2026-08-03: เดิมเทสนี้ยืนยันว่า "window ปิด → โยน WINDOW_CLOSED ไม่ยิง Graph" ทั้งคนและระบบ
  // ตอนนี้แยกทาง — คนพิมพ์เองต้องได้ยิงจริงเสมอ (ให้ Meta ตัดสิน แล้วโชว์เหตุผลที่ล้มเหลว
  // บนบับเบิลแทนการล็อกช่องพิมพ์) ส่วนเส้นทางระบบยังถูกกันไว้เหมือนเดิมเพราะเป็น gate นโยบาย
  const closedWindowConversation = () => {
    db.conversation.findUnique.mockResolvedValue({
      id: 'conv1', shopId: 'shop1', channel: 'MESSENGER', buyerUserId: null,
      lastInboundAt: new Date(now - MESSAGING_WINDOW_MS - 5000),
      shopChannel: { id: 'ch1', externalId: 'PAGE1', accessTokenEnc: 'enc', status: 'ACTIVE' },
      externalContact: { id: 'ec1', externalUserId: 'PSID_1', name: 'ลูกค้า' },
    })
  }

  it('window ปิด + คนพิมพ์เอง → ยิง Graph จริง ไม่บล็อกล่วงหน้า (ให้ Meta ตัดสิน)', async () => {
    closedWindowConversation()

    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สาย' })

    expect(sendTextMessage).toHaveBeenCalledTimes(1)
  })

  it('window ปิด + เส้นทางระบบ (auto-reply) → ยังโยน WINDOW_CLOSED และไม่ยิง Graph เลย', async () => {
    closedWindowConversation()

    await expect(
      sendOutboundMessage({
        conversationId: 'conv1',
        actorUserId: null,
        systemShopId: 'shop1',
        autoReplyKind: 'AUTO',
        text: 'ตอบอัตโนมัติ',
      }),
    ).rejects.toThrow('WINDOW_CLOSED')
    expect(sendTextMessage).not.toHaveBeenCalled()
  })

  it('คนที่ไม่ใช่เจ้าของร้านและไม่ใช่สมาชิก → FORBIDDEN', async () => {
    db.shopMember.findUnique.mockResolvedValue(null) // ไม่ใช่สมาชิกร้านนี้
    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'stranger', text: 'hi' }),
    ).rejects.toThrow('FORBIDDEN')
  })

  it('BUSINESS admin (สมาชิก ไม่ใช่ owner) → ตอบแชทได้ ไม่ FORBIDDEN', async () => {
    db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้าน' })
    db.shopMember.findUnique.mockResolvedValue({ role: 'ADMIN', shopId: 'shop1' })
    ;(sendTextMessage as ReturnType<typeof vi.fn>).mockResolvedValue('mid.out.admin')
    const msg = await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'admin-user', text: 'สวัสดี' })
    expect(msg.id).toBe('m1')
    expect(sendTextMessage).toHaveBeenCalledTimes(1)
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

  it('channel ไม่ ACTIVE (token ตายไปแล้ว/ถอดการเชื่อมต่อ) → CHANNEL_NOT_ACTIVE ไม่ยิง Graph เลย (M-6)', async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: 'conv1', shopId: 'shop1', channel: 'MESSENGER', buyerUserId: null,
      lastInboundAt: new Date(now - 1000),
      shopChannel: { id: 'ch1', externalId: 'PAGE1', accessTokenEnc: 'enc', status: 'TOKEN_INVALID' },
      externalContact: { id: 'ec1', externalUserId: 'PSID_1', name: 'ลูกค้า' },
    })

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('CHANNEL_NOT_ACTIVE')

    expect(sendTextMessage).not.toHaveBeenCalled()
    expect(db.chatMessage.create).not.toHaveBeenCalled()
  })

  it('echo webhook เขียน mid เดียวกันแทรกก่อน create (race) → คืนแถวที่มีอยู่ ไม่ throw 500 ทั้งที่ส่งสำเร็จแล้ว (I-6)', async () => {
    db.chatMessage.create.mockRejectedValue(p2002(['externalMessageId']))
    const existing = { id: 'm-from-echo', createdAt: new Date(), externalMessageId: 'mid.out.1' }
    db.chatMessage.findUnique.mockResolvedValue(existing)

    const result = await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สวัสดีครับ' })

    expect(result).toEqual(existing)
    expect(db.chatMessage.findUnique).toHaveBeenCalledWith({ where: { externalMessageId: 'mid.out.1' } })
  })

  // ── feature 00023 auto-reply (S-06) ────────────────────────────────────────
  describe('เส้นทางระบบ (auto-reply) — systemShopId + autoReplyKind', () => {
    it('ส่งด้วย systemShopId ที่ตรงกับเธรด → ผ่าน และติดป้าย autoReplyKind ลงแถว', async () => {
      await sendOutboundMessage({
        conversationId: 'conv1', actorUserId: null, systemShopId: 'shop1',
        text: 'ราคา 590 บาทค่ะ', autoReplyKind: 'AUTO',
      })
      expect(db.chatMessage.create.mock.calls[0]![0].data.autoReplyKind).toBe('AUTO')
      // ห้ามเผลอเขียน senderUserId เป็นค่าอะไรก็ตาม — เส้นทางระบบไม่มี user
      expect(db.chatMessage.create.mock.calls[0]![0].data.senderUserId).toBeNull()
    })

    it('systemShopId ไม่ตรงกับเจ้าของเธรด → FORBIDDEN และไม่ยิง Send API (กันยิงข้ามร้าน)', async () => {
      await expect(
        sendOutboundMessage({
          conversationId: 'conv1', actorUserId: null, systemShopId: 'shop-อื่น',
          text: 'hi', autoReplyKind: 'AUTO',
        }),
      ).rejects.toThrow('FORBIDDEN')
      expect(sendTextMessage).not.toHaveBeenCalled()
    })

    it('ส่ง systemShopId มาพร้อม actorUserId → INVALID_ACTOR (เจตนาไม่ชัด ปฏิเสธไว้ก่อน)', async () => {
      await expect(
        sendOutboundMessage({
          conversationId: 'conv1', actorUserId: 'owner1', systemShopId: 'shop1', text: 'hi',
        }),
      ).rejects.toThrow('INVALID_ACTOR')
    })

    it('caller เดิม (ไม่ส่ง autoReplyKind) → แถวได้ autoReplyKind = null เหมือนเดิมทุกประการ', async () => {
      await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สวัสดีครับ' })
      expect(db.chatMessage.create.mock.calls[0]![0].data.autoReplyKind).toBeNull()
    })

    it('[กับดัก echo] echo แทรกก่อน → ต้อง UPDATE ติดป้ายย้อนหลัง ไม่ปล่อยแถวค้าง null', async () => {
      db.chatMessage.create.mockRejectedValue(p2002(['externalMessageId']))
      // แถวที่ ingest เขียนจาก echo — ไม่รู้ว่าใครส่ง จึงเป็น null
      const fromEcho = { id: 'm-from-echo', createdAt: new Date(), externalMessageId: 'mid.out.1', autoReplyKind: null }
      db.chatMessage.findUnique.mockResolvedValue(fromEcho)
      db.chatMessage.updateMany.mockResolvedValue({ count: 1 })

      const result = await sendOutboundMessage({
        conversationId: 'conv1', actorUserId: null, systemShopId: 'shop1',
        text: 'ราคา 590 บาทค่ะ', autoReplyKind: 'AUTO',
      })

      // ถ้าไม่ UPDATE แถวนี้ เกณฑ์ "พนักงานตอบ" (SHOP + autoReplyKind IS NULL) จะนับคำตอบ
      // ของบอทเองเป็นพนักงาน แล้วระบบจะหยุดตัวเองถาวร = ตอบครั้งแรกแล้วเงียบตลอดกาล
      expect(db.chatMessage.updateMany).toHaveBeenCalledWith({
        where: { id: 'm-from-echo', autoReplyKind: null },
        data: { autoReplyKind: 'AUTO' },
      })
      expect(result.autoReplyKind).toBe('AUTO')
    })

    it('echo แทรกก่อนบนเส้นทาง "คนส่ง" → ไม่ UPDATE อะไร (พฤติกรรมเดิมของ 00018 ต้องไม่เปลี่ยน)', async () => {
      db.chatMessage.create.mockRejectedValue(p2002(['externalMessageId']))
      db.chatMessage.findUnique.mockResolvedValue({ id: 'm-echo', createdAt: new Date(), externalMessageId: 'mid.out.1' })

      await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สวัสดีครับ' })

      expect(db.chatMessage.updateMany).not.toHaveBeenCalled()
    })
  })

  it('P2002 ที่ไม่ใช่ externalMessageId (หรือไม่มี mid) → ยังคง throw ปกติ ไม่กลืน error ทิ้ง', async () => {
    db.chatMessage.create.mockRejectedValue(p2002(['someOtherField']))

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow()
  })

  it('create ชน P2002(externalMessageId) แต่หาแถวเดิมไม่เจอ (เอดจ์เคสผิดปกติ) → throw error เดิมต่อ ไม่เงียบหาย', async () => {
    db.chatMessage.create.mockRejectedValue(p2002(['externalMessageId']))
    db.chatMessage.findUnique.mockResolvedValue(null)

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow()
  })

  it('ส่งสำเร็จ → create ข้อความ + update snapshot อยู่ในทรานแซกชันเดียวกัน (M-2)', async () => {
    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สวัสดีครับ' })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })
})
