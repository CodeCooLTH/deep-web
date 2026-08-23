/**
 * channel-chat-backfill-shopid.test.ts — feature 00051 (S-3) TC-SHOPID-03
 *
 * resolveBackfillContent/mirrorGraphCards (private ในไฟล์ channel-chat.service.ts) ต้องได้รับ
 * shopId จาก conv.shopChannel.shopId ของเธรดจริง — เทสนี้เดินทาง syncMissingMessagesFromMeta
 * เต็ม flow (ตัวเดียวที่เรียก resolveBackfillBatch) แล้วตรวจว่า MediaAsset ที่ถูกเขียนผูกกับ
 * shopId ที่ถูกต้อง (ไม่ mock mirrorRemoteImage เพราะเป็นฟังก์ชันในไฟล์เดียวกับที่เทส — สังเกตผล
 * ผ่าน prisma.mediaAsset.create call arg แทน, mock เฉพาะ prisma/graph/storage/fetch)
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  chatMessage: { findMany: vi.fn(), createMany: vi.fn() },
  mediaAsset: { findUnique: vi.fn(), create: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: vi.fn((s: string) => s) }))
vi.mock('@/lib/facebook/graph', () => ({
  fetchThreadMessages: vi.fn(),
  getLastInboundTime: vi.fn(),
  fetchMessageText: vi.fn(),
  fetchAdPostContent: vi.fn(),
  sendMessageReaction: vi.fn(),
  GraphApiError: class extends Error {},
}))
const { saveFile } = vi.hoisted(() => ({ saveFile: vi.fn() }))
vi.mock('@/lib/storage', () => ({ saveFile }))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'a'.repeat(64)
})

import { syncMissingMessagesFromMeta } from '@/services/channel-chat.service'
import { fetchThreadMessages } from '@/lib/facebook/graph'

const REAL_SHOP_ID = 'shop-backfill-owner'

function fakeImageResponse(): Response {
  return new Response(new Uint8Array([9, 9, 9, 9]) as unknown as BodyInit, {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  })
}

describe('syncMissingMessagesFromMeta — TC-SHOPID-03: shopId ต้องมาจาก conv.shopChannel.shopId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () => fakeImageResponse()))
    // throttle ใน syncMissingMessagesFromMeta เก็บ state ใน globalThis ข้ามเทส — ใช้ conversationId
    // ที่ไม่ซ้ำกันทุกเทส (Date.now() ต่อท้าย) กันเทสถัดไปโดน throttle จากเทสก่อนหน้า
    db.chatMessage.findMany.mockResolvedValue([])
    db.chatMessage.createMany.mockResolvedValue({ count: 1 })
    db.mediaAsset.findUnique.mockResolvedValue(null)
    db.mediaAsset.create.mockResolvedValue({})
    saveFile.mockResolvedValue('2026/08/19/backfill.jpg')
  })

  it('เธรดของร้าน X — MediaAsset ที่เขียนต้องผูกกับ shopId ของร้าน X (conv.shopChannel.shopId) ไม่ใช่ค่าอื่น', async () => {
    const conversationId = `conv-shopid03-${Date.now()}`
    db.conversation.findUnique.mockResolvedValue({
      id: conversationId,
      channel: 'MESSENGER',
      lastMessageAt: null,
      shopChannel: {
        id: 'ch-1',
        shopId: REAL_SHOP_ID,
        status: 'ACTIVE',
        externalId: 'PAGE1',
        accessTokenEnc: 'token-plain',
      },
      externalContact: { externalUserId: 'PSID_1' },
    })
    vi.mocked(fetchThreadMessages).mockResolvedValue([
      {
        id: 'mid-1',
        createdTime: new Date('2026-08-19T10:00:00Z'),
        fromId: 'PSID_1',
        text: null,
        attachments: [
          {
            kind: 'image',
            title: null,
            subtitle: null,
            mediaUrl: 'https://scontent.fbcdn.net/backfill-img.jpg',
            isSticker: false,
            name: null,
            mimeType: 'image/jpeg',
            size: 1234,
          },
        ],
      },
    ])

    const result = await syncMissingMessagesFromMeta(conversationId)

    expect(result.outcome).toBe('added')
    expect(db.mediaAsset.create).toHaveBeenCalledTimes(1)
    const createArg = db.mediaAsset.create.mock.calls[0]![0].data
    // 🛑 การพิสูจน์หลักของเคสนี้: shopId ของแถวที่เขียนต้องตรงกับ shopId ของร้านเจ้าของเธรด
    expect(createArg.shopId).toBe(REAL_SHOP_ID)
  })
})
