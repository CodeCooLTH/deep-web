import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'

// mock prisma แบบเดียวกับ channel-chat-ingest-meta-notice.test.ts — ตรวจ "คำสั่งที่เขียน"
// (เงื่อนไขเวลาอยู่ใน where ของ updateMany จึงพิสูจน์ที่ where ไม่ใช่ที่ผลบน DB จริง)
const db = vi.hoisted(() => ({
  externalContact: { upsert: vi.fn(), findUnique: vi.fn() },
  conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  chatMessage: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  chatHandoverEvent: { create: vi.fn() },
  notification: { create: vi.fn() },
  shop: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/shop-channel.service', () => ({ getChannelByExternalId: vi.fn() }))
vi.mock('@/lib/facebook/graph', () => ({
  getContactProfile: vi.fn().mockResolvedValue({ name: 'ลูกค้า', avatarUrl: null }),
  fetchAttachmentUrl: vi.fn().mockResolvedValue(null),
}))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'c'.repeat(64)
})

import { ingestInboundMessage, ingestHandoverEvent } from '@/services/channel-chat.service'
import { getChannelByExternalId } from '@/services/shop-channel.service'

const OUR = '1570859340799126'
const PAGE_INBOX = '263902037430900'
const TS = 1750000000000

// รูปตาม payload จริงที่ spike Q-23 เจอ: message.{is_echo, app_id, ai_generated}
const echo = (mid: string, message: Record<string, unknown>, timestamp = TS) => ({
  sender: { id: 'PAGE1' },
  recipient: { id: 'PSID_1' },
  timestamp,
  message: { mid, text: 'สวัสดีค่ะ', is_echo: true, ...message },
})
const ingest = (event: ReturnType<typeof echo>) =>
  ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.FB_CHAT_APP_ID = OUR
  db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
  ;(getChannelByExternalId as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'ch1', shopId: 'shop1', provider: 'MESSENGER', accessToken: 'tok',
  })
  db.externalContact.findUnique.mockResolvedValue({ id: 'ec1' })
  db.externalContact.upsert.mockResolvedValue({ id: 'ec1', name: 'ลูกค้า' })
  db.conversation.findUnique.mockResolvedValue({ id: 'conv1', shopId: 'shop1', isSpam: false })
  db.conversation.update.mockResolvedValue({})
  db.conversation.updateMany.mockResolvedValue({ count: 1 })
  db.chatMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() })
  db.chatMessage.findUnique.mockResolvedValue(null)
  db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้าน' })
})
afterEach(() => {
  delete process.env.FB_CHAT_APP_ID
})

const msgData = () => db.chatMessage.create.mock.calls[0]![0].data
const foreignWrite = () => db.conversation.updateMany.mock.calls[0]?.[0]

describe('ingest echo — TFR-001 (payload.message.{app_id,ai_generated})', () => {
  it('AI echo ของ Page Inbox → เขียน echo* ที่ข้อความ + metaForeignEcho* ที่ห้อง', async () => {
    await ingest(echo('m.ai', { app_id: Number(PAGE_INBOX), ai_generated: true }))
    expect(msgData()).toMatchObject({ echoAppId: PAGE_INBOX, echoAiGenerated: true, echoHasAdminText: false })
    expect(foreignWrite().data).toEqual({
      metaForeignEchoAt: new Date(TS),
      metaForeignEchoAppId: PAGE_INBOX,
      metaForeignEchoAi: true,
      metaForeignEchoAdminText: false,
    })
  })

  it('Page Inbox ไม่มีธง AI (คนพิมพ์ใน Business Suite) → Ai เป็น null ไม่ใช่ false', async () => {
    await ingest(echo('m.human', { app_id: PAGE_INBOX }))
    expect(msgData().echoAiGenerated).toBeNull()
    expect(foreignWrite().data.metaForeignEchoAi).toBeNull()
  })

  it('มี admin_text ชนิดอะไรก็ได้ → เก็บแค่ "มี" (ไม่ตกทั้งก้อน)', async () => {
    await ingest(echo('m.admin', { app_id: PAGE_INBOX, admin_text: { anything: 1 } }))
    expect(msgData().echoHasAdminText).toBe(true)
    expect(foreignWrite().data.metaForeignEchoAdminText).toBe(true)
  })

  it('echo ของเรา (app_id = FB_CHAT_APP_ID) → เก็บที่ข้อความ แต่ไม่แตะ metaForeignEcho*', async () => {
    await ingest(echo('m.ours', { app_id: OUR }))
    expect(msgData().echoAppId).toBe(OUR)
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
    // "ข้อความฝั่งร้านล่าสุดเป็นของเรา" ถูกบันทึกผ่านสรุปเธรดเดิม
    expect(db.conversation.update.mock.calls[0]![0].data).toMatchObject({ lastSenderRole: 'SHOP', lastMessageAt: new Date(TS) })
  })

  it('echo ไม่มี app_id → echoAppId null และไม่แตะ metaForeignEcho*', async () => {
    await ingest(echo('m.noapp', {}))
    expect(msgData()).toMatchObject({ echoAppId: null, echoAiGenerated: null, echoHasAdminText: false })
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
  })

  it('ไม่ตั้ง FB_CHAT_APP_ID → ไม่เดาว่า echo ใดเป็นของเรา (เขียนเป็น foreign ได้ ตัวตัดสินกรองแอปกลางเอง)', async () => {
    delete process.env.FB_CHAT_APP_ID
    await ingest(echo('m.noenv', { app_id: PAGE_INBOX, ai_generated: true }))
    expect(foreignWrite()).toBeDefined()
  })

  it('ข้อความลูกค้า (ไม่ใช่ echo) → ไม่เขียน echo* และไม่แตะ metaForeignEcho*', async () => {
    await ingestInboundMessage({
      provider: 'MESSENGER',
      pageExternalId: 'PAGE1',
      event: { sender: { id: 'PSID_1' }, recipient: { id: 'PAGE1' }, timestamp: TS, message: { mid: 'm.buyer', text: 'ราคาเท่าไหร่' } },
    })
    expect(msgData()).not.toHaveProperty('echoAppId')
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
  })

  it('event สลับลำดับ: where มีเงื่อนไข "ว่าง หรือ เก่ากว่า t" เท่านั้น (ไม่ทับของใหม่)', async () => {
    await ingest(echo('m.old', { app_id: PAGE_INBOX, ai_generated: true }, TS - 60_000))
    expect(foreignWrite().where).toEqual({
      id: 'conv1',
      OR: [{ metaForeignEchoAt: null }, { metaForeignEchoAt: { lt: new Date(TS - 60_000) } }],
    })
  })
})

describe('clamp เวลาอนาคตจาก Meta', () => {
  it('echo timestamp อนาคต → metaForeignEchoAt และ lastMessageAt ไม่เกิน now', async () => {
    const before = Date.now()
    await ingest(echo('m.future', { app_id: PAGE_INBOX, ai_generated: true }, before + 7 * 86_400_000))
    const at = (foreignWrite().data.metaForeignEchoAt as Date).getTime()
    expect(at).toBeLessThanOrEqual(Date.now())
    expect(at).toBeGreaterThanOrEqual(before)
    expect(db.conversation.update.mock.calls[0]![0].data.lastMessageAt.getTime()).toBe(at)
  })
  it('FB_CHAT_APP_ID ไม่ตั้ง + app_id ไม่ใช่แอปกลาง Meta → ไม่เขียน metaForeignEcho*', async () => {
    delete process.env.FB_CHAT_APP_ID
    await ingest(echo('m.unk', { app_id: OUR }))
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
  })
})

describe('ingestHandoverEvent — ผู้ถือห้อง (TFR-001)', () => {
  beforeEach(() => {
    db.chatHandoverEvent.create.mockResolvedValue({})
  })
  const handover = (o: Partial<Parameters<typeof ingestHandoverEvent>[0]>) =>
    ingestHandoverEvent({
      provider: 'MESSENGER', pageExternalId: 'PAGE1', contactExternalId: 'PSID_1', kind: 'pass', timestamp: TS, ...o,
    })
  const ownerWrite = () => db.conversation.updateMany.mock.calls[0]?.[0]

  // [blocker] ใช้ previous_owner แทน new_owner = ติดป้ายผิดห้อง (previous คือคนที่เพิ่งเสียห้อง)
  it('[blocker] pass → metaOwnerAppId = new_owner_app_id ไม่ใช่ previous', async () => {
    await handover({ kind: 'pass', previousOwnerAppId: PAGE_INBOX, newOwnerAppId: OUR })
    expect(ownerWrite().data).toEqual({ metaOwnerAppId: OUR, metaOwnerObservedAt: new Date(TS) })
  })

  it('normalize app id ที่เป็น number เป็น string', async () => {
    await handover({ newOwnerAppId: Number(OUR) })
    expect(ownerWrite().data.metaOwnerAppId).toBe(OUR)
  })

  it('take ที่ไม่มี new owner → owner NULL + observedAt (ไม่ตกไปใช้ previous)', async () => {
    await handover({ kind: 'take', previousOwnerAppId: PAGE_INBOX, newOwnerAppId: null })
    expect(ownerWrite().data).toEqual({ metaOwnerAppId: null, metaOwnerObservedAt: new Date(TS) })
  })

  it('handover timestamp อนาคต → observedAt ไม่เกิน now', async () => {
    await handover({ newOwnerAppId: OUR, timestamp: Date.now() + 7 * 86_400_000 })
    expect((ownerWrite().data.metaOwnerObservedAt as Date).getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('event สลับลำดับ: where ใช้เวลาของ Meta เทียบ metaOwnerObservedAt', async () => {
    await handover({ newOwnerAppId: OUR })
    expect(ownerWrite().where).toEqual({
      id: 'conv1',
      OR: [{ metaOwnerObservedAt: null }, { metaOwnerObservedAt: { lt: new Date(TS) } }],
    })
  })

  it('request ไม่เปลี่ยนผู้ถือ', async () => {
    await handover({ kind: 'request' })
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
  })

  it('ห้องยังไม่มี → ข้าม + log (ไม่ throw)', async () => {
    db.conversation.findUnique.mockResolvedValue(null)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(handover({ newOwnerAppId: OUR })).resolves.toBeUndefined()
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
