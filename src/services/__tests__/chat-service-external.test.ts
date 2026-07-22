import { describe, it, expect, vi, beforeEach } from 'vitest'

const tx = {
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  shop: { findUnique: vi.fn() },
  chatMessage: { create: vi.fn(), findFirst: vi.fn() },
  notification: { create: vi.fn() },
  user: { findUnique: vi.fn() },
}

vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}))
vi.mock('@/services/product.service', () => ({ getProductById: vi.fn() }))

import { sendMessage } from '@/services/chat.service'

describe('sendMessage — เธรดช่องทางนอก (buyerUserId = null)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tx.conversation.findUnique.mockResolvedValue({
      id: 'c1', shopId: 's1', buyerUserId: null, channel: 'MESSENGER',
    })
    tx.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้านทดสอบ' })
    tx.chatMessage.create.mockResolvedValue({
      id: 'm1', conversationId: 'c1', senderUserId: 'owner1', senderRole: 'SHOP',
      type: 'TEXT', body: 'สวัสดีครับ', imageUrl: null, productRefId: null,
      flaggedScam: false, createdAt: new Date(),
    })
    tx.conversation.update.mockResolvedValue({})
  })

  it('ร้านตอบลูกค้า FB ได้โดยไม่สร้าง Notification (ไม่มี User ปลายทาง)', async () => {
    const msg = await sendMessage({
      conversationId: 'c1', senderUserId: 'owner1', senderRole: 'SHOP',
      type: 'TEXT', body: 'สวัสดีครับ',
    })

    expect(msg.id).toBe('m1')
    expect(tx.notification.create).not.toHaveBeenCalled()
  })

  it('ยังกันการปลอม senderRole=BUYER บนเธรดที่ไม่มี buyer', async () => {
    await expect(
      sendMessage({
        conversationId: 'c1', senderUserId: 'attacker', senderRole: 'BUYER',
        type: 'TEXT', body: 'x',
      }),
    ).rejects.toThrow('FORBIDDEN')
  })
})
