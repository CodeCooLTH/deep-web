import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { Prisma } from '@prisma/client'

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ —
// ถ้าประกาศ db ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError) (เจอปัญหานี้แล้วใน Task 7)
const db = vi.hoisted(() => ({
  externalContact: { upsert: vi.fn(), findUnique: vi.fn() },
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
import { getContactProfile } from '@/lib/facebook/graph'

// helper สร้าง P2002 จริงจาก Prisma (ไม่ใช่ Object.assign(new Error(...)) ที่ปลอมแค่ .code) —
// โค้ด service ตรวจด้วย `instanceof Prisma.PrismaClientKnownRequestError` + meta.target จริง
function p2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('unique constraint violation', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  })
}

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
    // ค่าเริ่มต้น: ไม่มี contact เดิม → ทุกเทสยังเรียก getContactProfile ได้เหมือนพฤติกรรมเดิม
    // เทสที่สนใจ I-2 โดยเฉพาะจะ override เอง
    db.externalContact.findUnique.mockResolvedValue(null)
    db.externalContact.upsert.mockResolvedValue({ id: 'ec1', name: 'ลูกค้า ทดสอบ' })
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

  it('is_echo → sender=PAGE/recipient=PSID (ฝั่งเพจตอบ) บันทึกเป็น senderRole=SHOP, contact ใช้ PSID ไม่ใช่ PAGE, ไม่ขยับ lastInboundAt (M-1)', async () => {
    // fixture เดิมสลับข้างผิด (sender=PSID/recipient=PAGE เหมือน textEvent ปกติ) ทำให้เทสผ่านได้
    // แม้โค้ดอ่านข้างผิด — echo จริงจาก Meta: sender = เพจที่ตอบ, recipient = ลูกค้า (PSID)
    const echo = {
      sender: { id: 'PAGE1' },
      recipient: { id: 'PSID_1' },
      timestamp: 1750000000000,
      message: { mid: 'mid.echo.1', text: 'ตอบจากมือถือ', is_echo: true },
    }
    const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: echo })
    expect(r.status).toBe('STORED')
    expect(db.chatMessage.create.mock.calls[0]![0].data.senderRole).toBe('SHOP')
    expect(db.conversation.update.mock.calls[0]![0].data.lastInboundAt).toBeUndefined()
    // ต้อง upsert/lookup contact ด้วย externalUserId ของ "ลูกค้า" (recipient=PSID_1) ไม่ใช่ของเพจ
    expect(db.externalContact.findUnique.mock.calls[0]![0].where.shopChannelId_externalUserId.externalUserId).toBe(
      'PSID_1',
    )
    expect(db.externalContact.upsert.mock.calls[0]![0].where.shopChannelId_externalUserId.externalUserId).toBe(
      'PSID_1',
    )
  })

  it('mid ซ้ำ (P2002 บน externalMessageId) → DUPLICATE ไม่ throw', async () => {
    db.chatMessage.create.mockRejectedValue(p2002(['externalMessageId']))
    const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: textEvent })
    expect(r.status).toBe('DUPLICATE')
  })

  it('ลูกค้าใหม่ทัก 2 ข้อความรัว ๆ → race สร้างเธรด (P2002 บน externalContactId) ต้อง STORED ไม่ใช่ DUPLICATE/หาย (I-1)', async () => {
    // ทั้งคู่ findUnique เจอ null (ยังไม่มีเธรด) แล้วแย่งกัน create — ตัวแพ้ชน unique constraint
    db.conversation.findUnique
      .mockResolvedValueOnce(null) // เช็คครั้งแรกในทรานแซกชันแรก: ยังไม่เจอ
      .mockResolvedValueOnce({ id: 'conv-winner', shopId: 'shop1' }) // re-query หลังแพ้ race: เจอแถวที่ชนะ
    db.conversation.create.mockRejectedValue(p2002(['shopChannelId', 'externalContactId']))

    const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: textEvent })

    expect(r.status).toBe('STORED')
    expect(r.conversationId).toBe('conv-winner')
    // ข้อความต้องถูกเขียนจริง ไม่ใช่หายไปกับ transaction ที่ rollback
    expect(db.chatMessage.create).toHaveBeenCalledTimes(1)
    expect(db.chatMessage.create.mock.calls[0]![0].data.conversationId).toBe('conv-winner')
  })

  it('race สร้างเธรด แต่ retry แล้วชน externalMessageId ซ้ำ (edge case) → DUPLICATE', async () => {
    db.conversation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'conv-winner', shopId: 'shop1' })
    db.conversation.create.mockRejectedValue(p2002(['shopChannelId', 'externalContactId']))
    db.chatMessage.create.mockRejectedValue(p2002(['externalMessageId']))

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

  describe('โปรไฟล์ลูกค้า (I-2 + Minor-5)', () => {
    it('contact ใหม่ (ยังไม่มีในระบบ) → ดึงโปรไฟล์จาก Graph และบันทึกชื่อ/รูป', async () => {
      db.externalContact.findUnique.mockResolvedValue(null)
      await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: textEvent })
      expect(getContactProfile).toHaveBeenCalledTimes(1)
      // ไม่ส่ง pageExternalId แล้ว — graph.ts ใช้ /me/* ซึ่ง pageToken resolve เป็นเพจให้เอง
      // (ช่องทาง IG เก็บ IG account id ไม่ใช่ Page id ส่งเข้า path แล้ว Meta ตอบ error)
      expect(getContactProfile).toHaveBeenCalledWith('PSID_1', 'tok', 'MESSENGER')
      const args = db.externalContact.upsert.mock.calls[0]![0]
      expect(args.create.name).toBe('ลูกค้า ทดสอบ')
    })

    it('เธรด Instagram → ส่ง provider=INSTAGRAM ให้ Graph (คนละวิธีดึงโปรไฟล์กับ Messenger)', async () => {
      db.externalContact.findUnique.mockResolvedValue(null)
      await ingestInboundMessage({ provider: 'INSTAGRAM', pageExternalId: 'IG1', event: textEvent })
      expect(getContactProfile).toHaveBeenCalledWith('PSID_1', 'tok', 'INSTAGRAM')
    })

    it('contact เดิมมีชื่ออยู่แล้ว → ไม่เรียก Graph ซ้ำ และไม่ส่ง name/avatarUrl ไปทับของเดิม', async () => {
      db.externalContact.findUnique.mockResolvedValue({
        id: 'ec1', name: 'สมชาย ใจดี', avatarUrl: 'https://x/old.jpg',
      })
      const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: textEvent })
      expect(r.status).toBe('STORED')
      expect(getContactProfile).not.toHaveBeenCalled()
      const args = db.externalContact.upsert.mock.calls[0]![0]
      expect(args.update).not.toHaveProperty('name')
      expect(args.update).not.toHaveProperty('avatarUrl')
    })

    it('contact เดิมยังไม่มีชื่อ + Graph ดึงไม่ได้ชั่วคราว (คืน null) → ไม่เขียนทับเป็น null', async () => {
      db.externalContact.findUnique.mockResolvedValue({ id: 'ec1', name: null, avatarUrl: null })
      ;(getContactProfile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ name: null, avatarUrl: null })
      const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: textEvent })
      expect(r.status).toBe('STORED')
      // ยังต้องพยายามดึงโปรไฟล์เพราะยังไม่มีชื่อ แค่ Graph ตอบ null กลับมา
      expect(getContactProfile).toHaveBeenCalledTimes(1)
      const args = db.externalContact.upsert.mock.calls[0]![0]
      expect(args.update).not.toHaveProperty('name')
      expect(args.update).not.toHaveProperty('avatarUrl')
    })
  })

  describe('attachment ที่ mirror ไม่ผ่าน/ไม่รองรับ ต้องไม่เป็น bubble ว่างเปล่า (I-5)', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('รูปที่ mirror ไม่ผ่าน (โหลดพัง) → ยังมี body/preview ที่สื่อความหมาย ไม่ว่างเปล่า', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
      const imageEvent = {
        sender: { id: 'PSID_1' },
        recipient: { id: 'PAGE1' },
        timestamp: 1750000000000,
        message: { mid: 'mid.img.1', attachments: [{ type: 'image', payload: { url: 'https://cdn.fb/x.jpg' } }] },
      }
      const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: imageEvent })
      expect(r.status).toBe('STORED')
      const data = db.chatMessage.create.mock.calls[0]![0].data
      expect(data.type).toBe('IMAGE')
      expect(data.imageUrl).toBeNull()
      expect(data.body).toBeTruthy()
      expect(db.conversation.update.mock.calls[0]![0].data.lastMessagePreview).toBeTruthy()
    })

    it('attachment ที่ไม่ใช่รูป (วิดีโอ/เสียง/ไฟล์) → เก็บ placeholder ให้ seller รู้ว่ามีไฟล์แนบ', async () => {
      const fileEvent = {
        sender: { id: 'PSID_1' },
        recipient: { id: 'PAGE1' },
        timestamp: 1750000000000,
        message: { mid: 'mid.vid.1', attachments: [{ type: 'video', payload: { url: 'https://cdn.fb/v.mp4' } }] },
      }
      const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: fileEvent })
      expect(r.status).toBe('STORED')
      const data = db.chatMessage.create.mock.calls[0]![0].data
      expect(data.type).toBe('TEXT')
      expect(data.imageUrl).toBeNull()
      expect(data.body).toContain('Messenger')
      expect(db.conversation.update.mock.calls[0]![0].data.lastMessagePreview).toContain('Messenger')
    })
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
