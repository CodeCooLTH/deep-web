/**
 * channel-chat-backfill-pages.test.ts — ส่วนขยาย 00018 (2026-09-14) backfill ที่มีขอบเขต
 *
 * syncMissingMessagesFromMeta ไล่ย้อนทีละหน้าจนถึง Conversation.createdAt แล้วปักธง metaBackfilledAt
 * mock ที่ขอบ module (prisma/graph/token) แบบเดียวกับ channel-chat-backfill-shopid.test.ts
 * ข้อความในเทสเป็นข้อความตัวอักษรล้วน ⇒ ไม่แตะ mirror/storage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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

describe('syncMissingMessagesFromMeta — ข้อความระบบของ Meta', () => {
  let conversationId: string
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchThreadMessagesPage).mockReset()
    conversationId = `conv-sysnotice-${Date.now()}-${seq++}`
    db.chatMessage.findMany.mockResolvedValue([])
    db.chatMessage.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }))
    db.conversation.update.mockResolvedValue({})
    db.conversation.updateMany.mockResolvedValue({ count: 1 })
  })

  it('ข้อความระบบของ Meta ในนามเพจ (Lead stage …) ไม่ถูกเก็บ · ข้อความลูกค้าข้อความเดียวกันยังเก็บ', async () => {
    db.conversation.findUnique.mockResolvedValue(conv({ metaBackfilledAt: new Date('2026-09-13T00:00:00Z') }))
    vi.mocked(fetchThreadMessagesPage).mockResolvedValue({
      threadId: 't_1',
      nextAfter: null,
      items: [
        msg('m-sys', '2026-09-12T10:00:00Z', PAGE_ID, 'Lead stage set to Qualified'),
        msg('m-shop', '2026-09-12T10:01:00Z', PAGE_ID, 'ส่งของแล้วค่ะ'),
        msg('m-buyer', '2026-09-12T10:02:00Z', PSID, 'Lead stage set to Qualified'),
      ],
    })

    await syncMissingMessagesFromMeta(conversationId)

    const ids = db.chatMessage.createMany.mock.calls.flatMap((c) => c[0].data.map((d: { externalMessageId: string }) => d.externalMessageId))
    expect(ids).toEqual(['m-shop', 'm-buyer'])
  })
})
