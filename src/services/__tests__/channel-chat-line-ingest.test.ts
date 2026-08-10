import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// (S-6) mock prisma แบบเดียวกับ channel-chat-ingest.test.ts (ของ Messenger/IG) — vi.hoisted กัน TDZ
const db = vi.hoisted(() => ({
  externalContact: { upsert: vi.fn(), findUnique: vi.fn() },
  conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  chatMessage: { create: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

// mock เฉพาะ LineAdapter.fetchContactProfile — buildLineExternalMessageId ใช้ตัวจริง (pure function)
const lineAdapter = vi.hoisted(() => ({
  fetchContactProfile: vi.fn().mockResolvedValue({ name: 'คุณลูกค้า', avatarUrl: 'https://profile.line-scdn.net/x' }),
}))
vi.mock('@/lib/channels/line-adapter', () => ({
  LineAdapter: {
    capabilities: { echo: false, readReceipt: false, freeWindowMs: 60_000, maxPartsPerRequest: 5 },
    fetchContactProfile: lineAdapter.fetchContactProfile,
    sendMessages: vi.fn(),
    downloadContent: vi.fn(),
  },
  buildLineExternalMessageId: (id: string) => `LINE:${id}`,
}))

import {
  ingestLineTextMessage,
  shouldFetchLineProfile,
  LINE_PROFILE_REFRESH_MS,
} from '@/services/channel-chat.service'

// helper สร้าง P2002 จริงจาก Prisma (ล้อกับ channel-chat-ingest.test.ts ของ Messenger/IG) — โค้ด
// service ตรวจด้วย `instanceof Prisma.PrismaClientKnownRequestError` + meta.target จริง
function p2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('unique constraint violation', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  })
}

const baseParams = {
  shopId: 'shop1',
  shopChannelId: 'ch1',
  accessToken: 'tok',
  externalUserId: 'U1',
  lineMessageId: 'msg-1',
  text: 'สนใจรุ่นนี้ค่ะ',
  replyToken: 'reply-token-1',
  eventTimestamp: 1785000000000,
}

describe('ingestLineTextMessage (S-6, TFR-LINE-02..05/10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
    db.externalContact.findUnique.mockResolvedValue(null)
    db.externalContact.upsert.mockResolvedValue({ id: 'ec1', name: 'คุณลูกค้า' })
    db.conversation.findUnique.mockResolvedValue(null)
    db.conversation.create.mockResolvedValue({ id: 'conv1' })
    db.conversation.update.mockResolvedValue({})
    db.chatMessage.create.mockResolvedValue({ id: 'm1' })
    lineAdapter.fetchContactProfile.mockResolvedValue({
      name: 'คุณลูกค้า',
      avatarUrl: 'https://profile.line-scdn.net/x',
    })
  })

  it('ข้อความใหม่ → STORED, senderRole=BUYER เสมอ (LINE ไม่ echo), externalMessageId มี prefix LINE:', async () => {
    const r = await ingestLineTextMessage(baseParams)
    expect(r.status).toBe('STORED')
    expect(r.conversationId).toBe('conv1')
    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.senderRole).toBe('BUYER')
    expect(data.type).toBe('TEXT')
    expect(data.body).toBe('สนใจรุ่นนี้ค่ะ')
    expect(data.externalMessageId).toBe('LINE:msg-1')
    expect(data.deliveryStatus).toBe('SENT')
  })

  it('ไม่มี conversation เดิม → สร้างใหม่ด้วย channel=LINE', async () => {
    await ingestLineTextMessage(baseParams)
    expect(db.conversation.create).toHaveBeenCalledWith({
      data: { shopId: 'shop1', channel: 'LINE', shopChannelId: 'ch1', externalContactId: 'ec1' },
    })
  })

  it('มี replyToken → เก็บ replyToken/replyTokenExpiresAt (=timestamp+60s)/replyTokenUsedAt=null บน Conversation (TD-009)', async () => {
    await ingestLineTextMessage(baseParams)
    const updateData = db.conversation.update.mock.calls[0]![0].data
    expect(updateData.replyToken).toBe('reply-token-1')
    expect(updateData.replyTokenUsedAt).toBeNull()
    expect(updateData.replyTokenExpiresAt).toBeInstanceOf(Date)
    expect((updateData.replyTokenExpiresAt as Date).getTime()).toBe(1785000000000 + 60_000)
  })

  it('ไม่มี replyToken → ไม่แตะคอลัมน์ replyToken* เลย', async () => {
    await ingestLineTextMessage({ ...baseParams, replyToken: undefined })
    const updateData = db.conversation.update.mock.calls[0]![0].data
    expect(updateData.replyToken).toBeUndefined()
    expect(updateData.replyTokenExpiresAt).toBeUndefined()
    expect(updateData.replyTokenUsedAt).toBeUndefined()
  })

  it('redelivery (P2002 บน externalMessageId) → DUPLICATE ไม่ throw (TFR-LINE-04)', async () => {
    db.chatMessage.create.mockRejectedValue(p2002(['externalMessageId']))
    const r = await ingestLineTextMessage(baseParams)
    expect(r.status).toBe('DUPLICATE')
  })

  it('ลูกค้าใหม่ทัก 2 ข้อความรัว ๆ → race สร้างเธรด (P2002 บน externalContactId) ยัง STORED ไม่ใช่หาย', async () => {
    db.conversation.findUnique
      .mockResolvedValueOnce(null) // เช็คครั้งแรก: ยังไม่เจอ
      .mockResolvedValueOnce({ id: 'conv-winner' }) // re-query หลังแพ้ race: เจอแถวที่ชนะ
    db.conversation.create.mockRejectedValue(p2002(['shopChannelId', 'externalContactId']))

    const r = await ingestLineTextMessage(baseParams)
    expect(r.status).toBe('STORED')
    expect(r.conversationId).toBe('conv-winner')
  })

  it('contact มีชื่ออยู่แล้วและ profileFetchedAt ใหม่ (< 7 วัน) → ไม่ยิง fetchContactProfile ซ้ำ', async () => {
    db.externalContact.findUnique.mockResolvedValue({
      id: 'ec1',
      name: 'คุณลูกค้าเดิม',
      profileFetchedAt: new Date(),
    })
    await ingestLineTextMessage(baseParams)
    expect(lineAdapter.fetchContactProfile).not.toHaveBeenCalled()
  })

  it('fetchContactProfile คืนค่าว่าง (404/ยังไม่แอดเพื่อน — adapter ไม่ throw) → ข้อความยังถูกบันทึกด้วยชื่อสำรอง null', async () => {
    lineAdapter.fetchContactProfile.mockResolvedValue({ name: null, avatarUrl: null })
    const r = await ingestLineTextMessage(baseParams)
    expect(r.status).toBe('STORED')
    expect(db.externalContact.upsert.mock.calls[0]![0].create.name).toBeNull()
  })

  it('(S-18a) มี quoteToken มากับ event → เก็บลง rawMessage.payload.quoteToken', async () => {
    await ingestLineTextMessage({ ...baseParams, quoteToken: 'quote-token-abc' })
    const data = db.chatMessage.create.mock.calls[0]![0].data
    const raw = data.rawMessage as { payload: { quoteToken?: string } }
    expect(raw.payload.quoteToken).toBe('quote-token-abc')
  })

  it('(S-18a) ไม่มี quoteToken มากับ event → ยัง ingest ได้ตามปกติ ไม่มี key นี้ใน rawMessage', async () => {
    const r = await ingestLineTextMessage(baseParams)
    expect(r.status).toBe('STORED')
    const data = db.chatMessage.create.mock.calls[0]![0].data
    const raw = data.rawMessage as { payload: Record<string, unknown> }
    expect('quoteToken' in raw.payload).toBe(false)
  })
})

describe('shouldFetchLineProfile (TFR-LINE-10)', () => {
  it('ยังไม่มี contact → true', () => {
    expect(shouldFetchLineProfile(null)).toBe(true)
  })

  it('มี contact แต่ไม่มีชื่อ → true', () => {
    expect(shouldFetchLineProfile({ name: null, profileFetchedAt: new Date() })).toBe(true)
  })

  it('มีชื่อแล้วแต่ยังไม่เคย fetch (profileFetchedAt null) → true', () => {
    expect(shouldFetchLineProfile({ name: 'x', profileFetchedAt: null })).toBe(true)
  })

  it('มีชื่อ + fetch เมื่อไม่นานมานี้ → false (ไม่ยิงซ้ำทุกข้อความ)', () => {
    expect(shouldFetchLineProfile({ name: 'x', profileFetchedAt: new Date() })).toBe(false)
  })

  it('มีชื่อ + fetch เกิน 7 วันแล้ว → true (refresh)', () => {
    const old = new Date(Date.now() - LINE_PROFILE_REFRESH_MS - 1000)
    expect(shouldFetchLineProfile({ name: 'x', profileFetchedAt: old })).toBe(true)
  })
})
