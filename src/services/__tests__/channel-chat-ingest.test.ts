import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ —
// ถ้าประกาศ db ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError) (เจอปัญหานี้แล้วใน Task 7)
const db = vi.hoisted(() => ({
  externalContact: { upsert: vi.fn() },
  conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  chatMessage: { create: vi.fn() },
  notification: { create: vi.fn() },
  shop: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/shop-channel.service', () => ({ getChannelByExternalId: vi.fn() }))
vi.mock('@/lib/facebook/graph', () => ({
  getContactProfile: vi.fn().mockResolvedValue({ name: 'ลูกค้า ทดสอบ', avatarUrl: 'https://x/p.jpg' }),
}))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'c'.repeat(64)
})

import { ingestInboundMessage, getWindowState, MESSAGING_WINDOW_MS } from '@/services/channel-chat.service'
import { getChannelByExternalId } from '@/services/shop-channel.service'

const textEvent = {
  sender: { id: 'PSID_1' },
  recipient: { id: 'PAGE1' },
  timestamp: 1750000000000,
  message: { mid: 'mid.in.1', text: 'สนใจครับ' },
}

describe('ingestInboundMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
    ;(getChannelByExternalId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ch1', shopId: 'shop1', provider: 'MESSENGER', accessToken: 'tok',
    })
    db.externalContact.upsert.mockResolvedValue({ id: 'ec1' })
    db.conversation.findUnique.mockResolvedValue(null)
    db.conversation.create.mockResolvedValue({ id: 'conv1', shopId: 'shop1' })
    db.conversation.update.mockResolvedValue({})
    db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้าน' })
    db.chatMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() })
  })

  it('ข้อความใหม่ → STORED และบันทึก senderRole=BUYER', async () => {
    const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: textEvent })
    expect(r.status).toBe('STORED')
    expect(db.chatMessage.create.mock.calls[0]![0].data.senderRole).toBe('BUYER')
    expect(db.chatMessage.create.mock.calls[0]![0].data.senderUserId).toBeNull()
    expect(db.chatMessage.create.mock.calls[0]![0].data.externalMessageId).toBe('mid.in.1')
  })

  it('ข้อความขาเข้าอัปเดต lastInboundAt (ฐานของ 24h window)', async () => {
    await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: textEvent })
    expect(db.conversation.update.mock.calls[0]![0].data.lastInboundAt).toBeInstanceOf(Date)
  })

  it('is_echo → บันทึกเป็น senderRole=SHOP และไม่ขยับ lastInboundAt', async () => {
    const echo = { ...textEvent, message: { mid: 'mid.echo.1', text: 'ตอบจากมือถือ', is_echo: true } }
    const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: echo })
    expect(r.status).toBe('STORED')
    expect(db.chatMessage.create.mock.calls[0]![0].data.senderRole).toBe('SHOP')
    expect(db.conversation.update.mock.calls[0]![0].data.lastInboundAt).toBeUndefined()
  })

  it('mid ซ้ำ (P2002) → DUPLICATE ไม่ throw', async () => {
    db.chatMessage.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: textEvent })
    expect(r.status).toBe('DUPLICATE')
  })

  it('Page ที่ไม่มีร้านไหนเชื่อม → NO_CHANNEL ไม่ throw', async () => {
    ;(getChannelByExternalId as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'GHOST', event: textEvent })
    expect(r.status).toBe('NO_CHANNEL')
  })

  it('event ที่ไม่มี message (เช่น delivery receipt) → IGNORED', async () => {
    const r = await ingestInboundMessage({
      provider: 'MESSENGER', pageExternalId: 'PAGE1',
      event: { sender: { id: 'PSID_1' }, recipient: { id: 'PAGE1' } },
    })
    expect(r.status).toBe('IGNORED')
  })
})

describe('getWindowState', () => {
  const base = new Date('2026-07-22T10:00:00Z')

  it('ไม่เคยมีข้อความขาเข้า → ปิด', () => {
    expect(getWindowState(null, base).open).toBe(false)
  })

  it('ลูกค้าเพิ่งทักมา → เปิด และเหลือเวลาราว 24 ชม.', () => {
    const s = getWindowState(base, base)
    expect(s.open).toBe(true)
    expect(s.msRemaining).toBe(MESSAGING_WINDOW_MS)
  })

  it('เกิน 24 ชม. → ปิด', () => {
    const past = new Date(base.getTime() - MESSAGING_WINDOW_MS - 1000)
    expect(getWindowState(past, base).open).toBe(false)
  })
})
