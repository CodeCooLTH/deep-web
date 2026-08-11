import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'

/**
 * สติกเกอร์ขาออก (Meta) — บับเบิลต้องไม่ว่างเปล่าเด็ดขาด
 *
 * บั๊กจริงที่ user เจอบน prod 2026-08-11 (แถว `5d43926a…`, 10:13 น.): กดส่งสติกเกอร์จากแท็บ
 * "ใช้ล่าสุด" → Meta รับ `sticker_id` ไปส่งถึงลูกค้าเรียบร้อย (`ok:true` + mid) แต่ URL รูปที่ client
 * ส่งมาด้วยเป็นของเก่าที่หมดอายุแล้ว (`oe=` ของ fbcdn อายุ ~4 วัน ส่วน localStorage เก็บไว้ตลอดไป)
 * → mirror ไม่ผ่าน → `imageUrl` เป็น null และ `body` ก็ null อยู่แล้วตามดีไซน์ของสติกเกอร์
 * → ChatThread วาด "ข้อความไม่รองรับ — เปิดดูใน Messenger" ทับสติกเกอร์ที่ส่งสำเร็จไปแล้ว
 *
 * [blocker] เทสในไฟล์นี้ผูก 2 กติกาที่ไม่มี tsc/build/grep ตัวไหนมองเห็น:
 *   1. mirror รอบแรกล้ม → ต้องขอ URL สดจาก Graph ด้วย mid แล้ว mirror ใหม่
 *   2. ล้มทั้งสองทาง → ต้องมี body เสมอ (ห้าม body และ imageUrl ว่างพร้อมกัน)
 */

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  chatMessage: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  shop: { findUnique: vi.fn() },
  shopMember: { findUnique: vi.fn() },
  shopChannel: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

vi.mock('@/lib/facebook/graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/facebook/graph')>('@/lib/facebook/graph')
  return { ...actual, sendStickerMessage: vi.fn(), fetchAttachmentUrl: vi.fn(), getContactProfile: vi.fn() }
})
vi.mock('@/services/shop-channel.service', () => ({
  getChannelByExternalId: vi.fn(),
  markChannelTokenInvalid: vi.fn(),
}))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: vi.fn().mockReturnValue('page-token-plain') }))
// saveFile คือปลายทางของ mirrorRemoteImage — คืน fileId ปลอมให้ตรวจได้ว่ารูปไหนถูกเก็บ
vi.mock('@/lib/storage', () => ({
  saveFile: vi.fn().mockResolvedValue('file-mirrored'),
  getFileUrl: vi.fn(),
  getFile: vi.fn(),
  getFileMeta: vi.fn(),
}))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'd'.repeat(64)
})

import { sendOutboundMessage } from '@/services/channel-chat.service'
import { sendStickerMessage, fetchAttachmentUrl } from '@/lib/facebook/graph'
import { saveFile } from '@/lib/storage'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

/** URL ของ Sticker Catalog ที่ client ส่งมา (โฮสต์อยู่ใน allow-list ของ mirrorRemoteImage) */
const STALE_URL = 'https://scontent.fbkk7-2.fna.fbcdn.net/v/t39.1997-6/sticker.png?oe=6A005C0C'
const FRESH_URL = 'https://scontent.fbkk7-2.fna.fbcdn.net/v/t39.1997-6/sticker.png?oe=6AFFFFFF'

const realFetch = globalThis.fetch
/** URL ไหนตอบ 200 บ้าง — ที่เหลือตอบ 403 เหมือน fbcdn ตอบ URL ที่ลายเซ็นหมดอายุ */
let okUrls = new Set<string>()

beforeEach(() => {
  vi.clearAllMocks()
  okUrls = new Set<string>()
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!okUrls.has(url)) return new Response('expired', { status: 403 })
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })
  }) as unknown as typeof fetch

  db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
  db.conversation.findUnique.mockResolvedValue({
    id: 'conv1', shopId: 'shop1', channel: 'MESSENGER', buyerUserId: null,
    lastInboundAt: new Date(Date.now() - 1000),
    shopChannel: { id: 'ch1', externalId: 'PAGE1', accessTokenEnc: 'enc', status: 'ACTIVE' },
    externalContact: { id: 'ec1', externalUserId: 'PSID_1', name: 'ลูกค้า' },
  })
  db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้าน' })
  db.chatMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() })
  db.chatMessage.findUnique.mockResolvedValue(null)
  db.conversation.update.mockResolvedValue({})
  asMock(sendStickerMessage).mockResolvedValue('mid.sticker.1')
})

afterAll(() => {
  globalThis.fetch = realFetch
})

const send = () =>
  sendOutboundMessage({
    conversationId: 'conv1',
    actorUserId: 'owner1',
    sticker: { id: '1493791024281561', imageUrl: STALE_URL },
  })

const createdData = () => db.chatMessage.create.mock.calls[0]![0].data

describe('สติกเกอร์ขาออก Meta — mirror รูป', () => {
  it('[blocker] URL จาก client หมดอายุ (403) → ขอ URL สดจาก Graph ด้วย mid แล้ว mirror สำเร็จ', async () => {
    okUrls.add(FRESH_URL)
    asMock(fetchAttachmentUrl).mockResolvedValue(FRESH_URL)

    await send()

    expect(fetchAttachmentUrl).toHaveBeenCalledWith('mid.sticker.1', 'page-token-plain')
    expect(saveFile).toHaveBeenCalledTimes(1)
    const data = createdData()
    expect(data.imageUrl).toBe('file-mirrored')
    // มีรูปแล้ว = บับเบิลรูปล้วนเหมือนเดิม ห้ามมีข้อความมาเกะกะใต้สติกเกอร์
    expect(data.body).toBeNull()
  })

  it('[blocker] mirror ล้มทั้งสองทาง → body ต้องไม่ว่าง (ห้ามได้บับเบิล "ข้อความไม่รองรับ")', async () => {
    asMock(fetchAttachmentUrl).mockResolvedValue(null)

    await send()

    const data = createdData()
    expect(data.imageUrl).toBeNull()
    // เงื่อนไขที่ ChatThread ใช้วาด placeholder คือ `!body && !imageUrl` — ต้องไม่จริงพร้อมกัน
    expect(Boolean(data.body) || Boolean(data.imageUrl)).toBe(true)
    expect(data.body).toContain('สติกเกอร์')
    expect(data.body).toContain('Messenger')
    // ส่งถึงลูกค้าแล้วจริง — ห้ามกลายเป็นข้อความที่ดูเหมือนส่งไม่สำเร็จ
    expect(data.deliveryStatus).toBe('SENT')
  })

  it('URL จาก client ยังใช้ได้ → ไม่ต้องยิง Graph เพิ่มเลย', async () => {
    okUrls.add(STALE_URL)

    await send()

    expect(fetchAttachmentUrl).not.toHaveBeenCalled()
    expect(createdData().imageUrl).toBe('file-mirrored')
  })

  it('เก็บ stickerId ลง rawMessage — แถวที่ mirror ไม่ผ่านต้องสืบย้อนได้ว่าเป็นสติกเกอร์ตัวไหน', async () => {
    asMock(fetchAttachmentUrl).mockResolvedValue(null)

    await send()

    const raw = createdData().rawMessage as { payload: { kind?: string; stickerId?: string } }
    expect(raw.payload.kind).toBe('sticker')
    expect(raw.payload.stickerId).toBe('1493791024281561')
  })
})
