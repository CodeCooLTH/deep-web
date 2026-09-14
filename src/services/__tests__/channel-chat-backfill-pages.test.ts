/**
 * channel-chat-backfill-pages.test.ts — ส่วนขยาย 00018 (2026-09-14) backfill ที่มีขอบเขต
 *
 * syncMissingMessagesFromMeta ไล่ย้อนทีละหน้าจนถึง Conversation.createdAt แล้วปักธง metaBackfilledAt
 * mock ที่ขอบ module (prisma/graph/token) แบบเดียวกับ channel-chat-backfill-shopid.test.ts
 * ข้อความในเทสเป็นข้อความตัวอักษรล้วน ⇒ ไม่แตะ mirror/storage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  chatMessage: { findMany: vi.fn(), createMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: vi.fn((s: string) => s) }))
vi.mock('@/lib/facebook/graph', () => ({
  fetchThreadMessagesPage: vi.fn(),
  getLastInboundTime: vi.fn(),
  fetchMessageText: vi.fn(),
  fetchAdPostContent: vi.fn(),
  sendMessageReaction: vi.fn(),
  GraphApiError: class extends Error {},
}))

import { syncMissingMessagesFromMeta } from '@/services/channel-chat.service'
import { fetchThreadMessagesPage, type GraphThreadMessage } from '@/lib/facebook/graph'
import { MAX_BACKFILL_PAGES } from '@/lib/meta-backfill-bound'

const PAGE_ID = 'PAGE1'
const PSID = 'PSID_1'
let seq = 0

function msg(id: string, iso: string, fromId = PSID, text = id): GraphThreadMessage {
  return { id, createdTime: new Date(iso), fromId, text, attachments: [] }
}

function conv(over: Record<string, unknown> = {}) {
  return {
    id: 'x',
    channel: 'MESSENGER',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    metaBackfilledAt: null,
    lastMessageAt: new Date('2026-09-10T00:00:00Z'),
    lastInboundAt: new Date('2026-09-10T00:00:00Z'),
    shopChannel: { id: 'ch', shopId: 'shop-1', status: 'ACTIVE', externalId: PAGE_ID, accessTokenEnc: 'tok' },
    externalContact: { externalUserId: PSID },
    ...over,
  }
}

/** call ของ conversation.update ที่ตั้ง metaBackfilledAt */
const flagCalls = () => db.conversation.update.mock.calls.filter((c) => 'metaBackfilledAt' in c[0].data)
/** call ของ conversation.update ที่ขยับสรุปเธรด */
const bumpCalls = () =>
  db.conversation.update.mock.calls.filter((c) => 'lastMessageAt' in c[0].data || 'lastInboundAt' in c[0].data)

describe('[blocker] syncMissingMessagesFromMeta — ไล่ย้อนทีละหน้า', () => {
  let conversationId: string
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchThreadMessagesPage).mockReset()
    // throttle เก็บใน globalThis ข้ามเทส — id ไม่ซ้ำกันทุกเทส
    conversationId = `conv-pages-${Date.now()}-${seq++}`
    db.chatMessage.findMany.mockResolvedValue([])
    db.chatMessage.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }))
    db.conversation.update.mockResolvedValue({})
  })

  // 🛑 กับดักหลักของงานนี้: ถ้า bump อยู่ในลูป หน้า 2 (เก่ากว่า) ยังชนะค่าที่อ่านไว้ตอนต้น
  // แล้วเขียนทับด้วยเวลาที่เก่ากว่า — เทสนี้ยืนยัน "ครั้งเดียว" + "ด้วยใบใหม่สุดข้ามทุกหน้า"
  it('อัปเดตสรุปเธรดครั้งเดียวหลังลูป ด้วยใบใหม่สุดข้ามทุกหน้า (หน้าเก่ากว่าห้ามเขียนทับ)', async () => {
    db.conversation.findUnique.mockResolvedValue(conv())
    vi.mocked(fetchThreadMessagesPage)
      .mockResolvedValueOnce({
        threadId: 't_1',
        nextAfter: 'c1',
        items: [msg('m-new', '2026-09-12T10:00:00Z', PAGE_ID, 'ร้านตอบล่าสุด'), msg('m-in', '2026-09-12T09:00:00Z')],
      })
      .mockResolvedValueOnce({
        threadId: 't_1',
        nextAfter: null,
        // ทั้งคู่ใหม่กว่า lastMessageAt/lastInboundAt ที่เก็บไว้ (09-10) แต่เก่ากว่าหน้าแรก
        items: [msg('m-old-shop', '2026-09-11T10:00:00Z', PAGE_ID, 'ร้านเก่า'), msg('m-old-in', '2026-09-11T09:00:00Z')],
      })

    const result = await syncMissingMessagesFromMeta(conversationId)

    expect(result).toEqual({ added: 4, outcome: 'added' })
    expect(fetchThreadMessagesPage).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fetchThreadMessagesPage).mock.calls[1]![2]).toEqual({
      limit: 100,
      cursor: { threadId: 't_1', after: 'c1' },
    })
    expect(bumpCalls()).toHaveLength(1)
    expect(bumpCalls()[0]![0]).toEqual({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date('2026-09-12T10:00:00Z'),
        lastMessagePreview: 'ร้านตอบล่าสุด',
        lastSenderRole: 'SHOP',
        lastInboundAt: new Date('2026-09-12T09:00:00Z'),
      },
    })
  })

  it('(a) เธรดที่ปักธงแล้ว: ดึงหน้าเดียว และไม่แตะ metaBackfilledAt', async () => {
    db.conversation.findUnique.mockResolvedValue(conv({ metaBackfilledAt: new Date('2026-09-13T00:00:00Z') }))
    vi.mocked(fetchThreadMessagesPage).mockResolvedValue({
      threadId: 't_1',
      nextAfter: 'c1',
      items: [msg('m-1', '2026-09-12T10:00:00Z')],
    })

    await syncMissingMessagesFromMeta(conversationId)

    expect(fetchThreadMessagesPage).toHaveBeenCalledTimes(1)
    expect(flagCalls()).toHaveLength(0)
  })

  it('(b) หน้าที่มีใบเก่ากว่าวันสร้างเธรด = หยุดและปักธง แม้ Meta ยังให้ next', async () => {
    db.conversation.findUnique.mockResolvedValue(conv())
    vi.mocked(fetchThreadMessagesPage)
      .mockResolvedValueOnce({ threadId: 't_1', nextAfter: 'c1', items: [msg('m-1', '2026-09-05T00:00:00Z')] })
      .mockResolvedValueOnce({
        threadId: 't_1',
        nextAfter: 'c2',
        items: [msg('m-2', '2026-09-02T00:00:00Z'), msg('m-3', '2026-09-01T00:00:00Z')],
      })

    await syncMissingMessagesFromMeta(conversationId)

    expect(fetchThreadMessagesPage).toHaveBeenCalledTimes(2)
    expect(flagCalls()).toHaveLength(1)
    expect(flagCalls()[0]![0].where).toEqual({ id: conversationId })
    expect(flagCalls()[0]![0].data.metaBackfilledAt).toBeInstanceOf(Date)
  })

  it('(c) ชนเพดานหน้า = หยุดที่หน้า MAX และห้ามปักธง', async () => {
    db.conversation.findUnique.mockResolvedValue(conv())
    let n = 0
    vi.mocked(fetchThreadMessagesPage).mockImplementation(async () => {
      n += 1
      return { threadId: 't_1', nextAfter: `c${n}`, items: [msg(`m-${n}`, '2026-09-10T00:00:00Z')] }
    })

    await syncMissingMessagesFromMeta(conversationId)

    expect(fetchThreadMessagesPage).toHaveBeenCalledTimes(MAX_BACKFILL_PAGES)
    expect(flagCalls()).toHaveLength(0)
  })
})
