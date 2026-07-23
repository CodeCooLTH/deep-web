import { describe, it, expect, vi, beforeEach } from 'vitest'

// S-7 (ตัวกรองแชท + ปักหมุด/ซ่อน/ปิดงาน, feature 00018): updateConversationState + auto-unhide/reopen
// เมื่อ BUYER ทักมาใหม่ในเธรด DEEP (BR-FBC-15/16)

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ —
// ถ้าประกาศ db ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError)
const db = vi.hoisted(() => ({
  conversation: { updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  shop: { findUnique: vi.fn() },
  chatMessage: { create: vi.fn(), findFirst: vi.fn() },
  notification: { create: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/product.service', () => ({ getProductById: vi.fn() }))

import { updateConversationState, sendMessage } from '@/services/chat.service'

describe('updateConversationState (S-7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['pin', { isPinned: true }],
    ['unpin', { isPinned: false }],
    ['hide', { isHidden: true }],
    ['unhide', { isHidden: false }],
  ] as const)('action=%s → updateMany data ตรงกับที่คาด', async (action, expectedData) => {
    db.conversation.updateMany.mockResolvedValue({ count: 1 })
    await updateConversationState('conv1', 'shop1', action)
    expect(db.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'conv1', shopId: 'shop1' },
      data: expectedData,
    })
  })

  it("action='resolve' → resolvedAt เป็น Date ปัจจุบัน", async () => {
    db.conversation.updateMany.mockResolvedValue({ count: 1 })
    const before = Date.now()
    await updateConversationState('conv1', 'shop1', 'resolve')
    const data = db.conversation.updateMany.mock.calls[0]![0].data
    expect(data.resolvedAt).toBeInstanceOf(Date)
    expect((data.resolvedAt as Date).getTime()).toBeGreaterThanOrEqual(before)
  })

  it("action='reopen' → resolvedAt: null", async () => {
    db.conversation.updateMany.mockResolvedValue({ count: 1 })
    await updateConversationState('conv1', 'shop1', 'reopen')
    expect(db.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'conv1', shopId: 'shop1' },
      data: { resolvedAt: null },
    })
  })

  // ownership: WHERE ต้องมี shopId เสมอ (atomic updateMany guard เดียวกับ disconnectChannel) —
  // ร้านอื่นส่ง conversationId ของร้านอื่นมา (IDOR) ต้อง count=0 → throw ไม่ทำอะไรเงียบ ๆ
  it('ร้านอื่น (shopId ไม่ตรง) → count=0 → throw CONVERSATION_NOT_FOUND_OR_FORBIDDEN', async () => {
    db.conversation.updateMany.mockResolvedValue({ count: 0 })
    await expect(updateConversationState('conv1', 'not-my-shop', 'pin')).rejects.toThrow(
      'CONVERSATION_NOT_FOUND_OR_FORBIDDEN',
    )
    expect(db.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'conv1', shopId: 'not-my-shop' },
      data: { isPinned: true },
    })
  })

  it('conversationId ไม่มีอยู่จริง → count=0 → throw เหมือนกรณี ownership ผิด (ไม่แยกแยะให้เดา)', async () => {
    db.conversation.updateMany.mockResolvedValue({ count: 0 })
    await expect(updateConversationState('ghost', 'shop1', 'hide')).rejects.toThrow(
      'CONVERSATION_NOT_FOUND_OR_FORBIDDEN',
    )
  })
})

describe('sendMessage — auto-unhide/reopen เมื่อ BUYER ทักมาใหม่ (BR-FBC-15/16, เธรด DEEP)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
    db.conversation.findUnique.mockResolvedValue({
      id: 'conv1', shopId: 'shop1', buyerUserId: 'buyer1', channel: 'DEEP',
    })
    db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้านทดสอบ' })
    db.user.findUnique.mockResolvedValue({ displayName: 'ลูกค้า' })
    db.chatMessage.create.mockResolvedValue({
      id: 'm1', conversationId: 'conv1', senderUserId: 'buyer1', senderRole: 'BUYER',
      type: 'TEXT', body: 'สนใจครับ', imageUrl: null, productRefId: null,
      flaggedScam: false, createdAt: new Date(),
    })
    db.conversation.update.mockResolvedValue({})
  })

  it('BUYER ส่งข้อความ → snapshot update มี isHidden:false, resolvedAt:null', async () => {
    await sendMessage({ conversationId: 'conv1', senderUserId: 'buyer1', senderRole: 'BUYER', type: 'TEXT', body: 'สนใจครับ' })

    const data = db.conversation.update.mock.calls[0]![0].data
    expect(data.isHidden).toBe(false)
    expect(data.resolvedAt).toBeNull()
  })

  it('SHOP (ร้าน) ตอบเอง → ไม่แตะ isHidden/resolvedAt เลย (ไม่ trigger auto-unhide)', async () => {
    db.chatMessage.create.mockResolvedValue({
      id: 'm2', conversationId: 'conv1', senderUserId: 'owner1', senderRole: 'SHOP',
      type: 'TEXT', body: 'สวัสดีครับ', imageUrl: null, productRefId: null,
      flaggedScam: false, createdAt: new Date(),
    })

    await sendMessage({ conversationId: 'conv1', senderUserId: 'owner1', senderRole: 'SHOP', type: 'TEXT', body: 'สวัสดีครับ' })

    const data = db.conversation.update.mock.calls[0]![0].data
    expect(data).not.toHaveProperty('isHidden')
    expect(data).not.toHaveProperty('resolvedAt')
  })
})
