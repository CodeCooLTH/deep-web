import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// "ยกเลิกการส่งข้อความ" (user สั่ง 2026-08-02) — ลบแถวได้เฉพาะ FAILED ของฝั่งร้านเท่านั้น
// ขอบเขตนี้คือสิ่งเดียวที่กัน endpoint ลบข้อความจริงในเธรด จึงต้องมีเทสตรึงไว้
const db = vi.hoisted(() => ({
  chatMessage: { findFirst: vi.fn(), delete: vi.fn() },
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/shop-context', () => ({ canAccessShop: vi.fn() }))
vi.mock('@/services/shop-channel.service', () => ({
  getChannelByExternalId: vi.fn(),
  markChannelTokenInvalid: vi.fn(),
}))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'c'.repeat(64)
})

import { cancelFailedOutboundMessage } from '@/services/channel-chat.service'
import { canAccessShop } from '@/lib/shop-context'

const params = { conversationId: 'conv1', messageId: 'msg1', actorUserId: 'user1' }

describe('cancelFailedOutboundMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
    db.chatMessage.findFirst.mockResolvedValue({
      id: 'msg1',
      deliveryStatus: 'FAILED',
      senderRole: 'SHOP',
    })
    db.conversation.findUnique.mockResolvedValue({ id: 'conv1', shopId: 'shop1' })
    ;(canAccessShop as ReturnType<typeof vi.fn>).mockResolvedValue(true)
  })

  it('ลบแถว FAILED แล้วคำนวณ snapshot ของเธรดใหม่จากข้อความที่เหลือ', async () => {
    const prev = new Date('2026-08-02T03:00:00Z')
    db.chatMessage.findFirst.mockResolvedValueOnce({ id: 'msg1', deliveryStatus: 'FAILED', senderRole: 'SHOP' })
    // เรียกครั้งที่ 2 ในทรานแซกชัน = หาแถวล่าสุดที่เหลือ
    db.chatMessage.findFirst.mockResolvedValueOnce({
      createdAt: prev,
      body: 'ข้อความก่อนหน้า',
      type: 'TEXT',
      senderRole: 'BUYER',
    })

    await cancelFailedOutboundMessage(params)

    expect(db.chatMessage.delete).toHaveBeenCalledWith({ where: { id: 'msg1' } })
    expect(db.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv1' },
      data: { lastMessageAt: prev, lastMessagePreview: 'ข้อความก่อนหน้า', lastSenderRole: 'BUYER' },
    })
  })

  it('ไม่เหลือข้อความเลย → ล้าง preview ไม่ปล่อยค้างชี้ข้อความที่ถูกลบ', async () => {
    db.chatMessage.findFirst.mockResolvedValueOnce({ id: 'msg1', deliveryStatus: 'FAILED', senderRole: 'SHOP' })
    db.chatMessage.findFirst.mockResolvedValueOnce(null)

    await cancelFailedOutboundMessage(params)

    expect(db.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv1' },
      data: { lastMessagePreview: null, lastSenderRole: null },
    })
  })

  it('ข้อความที่ส่งสำเร็จแล้ว → ลบไม่ได้', async () => {
    db.chatMessage.findFirst.mockResolvedValue({ id: 'msg1', deliveryStatus: 'SENT', senderRole: 'SHOP' })

    await expect(cancelFailedOutboundMessage(params)).rejects.toThrow('MESSAGE_NOT_CANCELLABLE')
    expect(db.chatMessage.delete).not.toHaveBeenCalled()
  })

  it('ข้อความของลูกค้า → ลบไม่ได้ แม้สถานะจะเป็น FAILED', async () => {
    db.chatMessage.findFirst.mockResolvedValue({ id: 'msg1', deliveryStatus: 'FAILED', senderRole: 'BUYER' })

    await expect(cancelFailedOutboundMessage(params)).rejects.toThrow('MESSAGE_NOT_CANCELLABLE')
    expect(db.chatMessage.delete).not.toHaveBeenCalled()
  })

  it('ไม่มีสิทธิ์ในร้าน → FORBIDDEN และต้องไม่ลบอะไรเลย', async () => {
    ;(canAccessShop as ReturnType<typeof vi.fn>).mockResolvedValue(false)

    await expect(cancelFailedOutboundMessage(params)).rejects.toThrow('FORBIDDEN')
    expect(db.chatMessage.delete).not.toHaveBeenCalled()
  })

  it('ข้อความอยู่คนละเธรดกับที่อ้าง → หาไม่เจอ (findFirst ผูก conversationId เสมอ)', async () => {
    db.chatMessage.findFirst.mockResolvedValue(null)

    await expect(cancelFailedOutboundMessage(params)).rejects.toThrow('MESSAGE_NOT_FOUND')
    expect(db.chatMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'msg1', conversationId: 'conv1' } }),
    )
  })
})
