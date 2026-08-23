/**
 * transmit-outbound-channel-branch.test.ts — [blocker] `transmitOutbound` ต้องเลือกช่องทางถูก
 *
 * 🛑 ทำไมเทสนี้ถึงต้องมี (F1 จากรีวิว Task 6): reviewer พิสูจน์แล้วว่า **สลับกิ่ง LINE ให้ไปเรียก
 * `transmitMetaMessage` แล้วเทสทั้ง 3,626 ข้อยังเขียวหมด** — ตัวเลือกช่องทางซึ่งเป็น *เหตุผลเดียว*
 * ที่ `transmitOutbound` มีอยู่ ไม่มีอะไรกันเลย ผิดแล้วเงียบสนิท: ข้อความ LINE ทุกใบที่ออกจากคิว
 * จะไปเดินตรรกะหน้าต่าง 24 ชม./HUMAN_AGENT tag ของ Meta แทนตรรกะ reply/push/โควตาของ LINE
 *
 * 🛑 ต้อง mock **แค่ชั้นขนส่ง** (`lineApiRequest` / `sendTextMessage`) ไม่ใช่ mock ตัวยิงทิ้ง —
 * ไม่งั้นได้เทสที่ยืนยันความคิดของคนเขียนเทส ไม่ใช่พฤติกรรมของโค้ด (บทเรียน 00038)
 * ⇒ ทั้ง `LineAdapter` และ `MetaAdapter` ตัวจริงถูกรันจริงในเทสนี้
 *
 * ตัวชี้ขาดที่เลือกใช้คือ `sendMethod`: LINE เท่านั้นที่มีแนวคิด REPLY/PUSH — Meta คืน `null` เสมอ
 * (ดู `TransmitResult.sendMethod` ใน channel-chat.service.ts) จึงแยกสองกิ่งออกจากกันได้โดยไม่ต้อง
 * พึ่งรายละเอียดภายในของกิ่งไหนเลย
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const db = vi.hoisted(() => ({
  conversation: { updateMany: vi.fn(), update: vi.fn() },
  chatMessage: { findFirst: vi.fn() },
  externalContact: { update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: vi.fn().mockReturnValue('token-plain') }))
vi.mock('@/services/shop-channel.service', () => ({
  getChannelByExternalId: vi.fn(),
  markChannelTokenInvalid: vi.fn(),
}))

// ── ชั้นขนส่งของ LINE (ต่ำสุด — LineAdapter ตัวจริงเรียกตัวนี้) ──
const lineApiRequest = vi.hoisted(() => vi.fn())
vi.mock('@/lib/line/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/line/client')>('@/lib/line/client')
  return { ...actual, lineApiRequest, lineDataApiRequest: vi.fn() }
})
// โควตา LINE — ไม่ใช่ชั้นขนส่ง แต่เป็น I/O ที่ต้องตัดออกให้เทสตัดสินใจได้เอง
vi.mock('@/services/line-quota.service', () => ({
  getLineQuota: vi.fn(async () => ({ level: 'OK' })),
  noteLinePushConsumed: vi.fn(async () => {}),
  invalidateLineQuota: vi.fn(async () => {}),
}))

// ── ชั้นขนส่งของ Meta (MetaAdapter ตัวจริง delegate มาที่ฟังก์ชันพวกนี้) ──
vi.mock('@/lib/facebook/graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/facebook/graph')>('@/lib/facebook/graph')
  return { ...actual, sendTextMessage: vi.fn(async () => 'mid.meta.1'), getContactProfile: vi.fn() }
})

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'e'.repeat(64)
})

import { transmitOutbound } from '@/services/channel-chat.service'
import { sendTextMessage } from '@/lib/facebook/graph'

/** เธรดที่ผ่านด่าน `resolveOutboundContext` มาแล้ว (ไม่ใช่ DEEP · มี shopChannel · มี externalContact) */
function conv(channel: 'LINE' | 'MESSENGER') {
  return {
    id: 'conv-1',
    shopId: 'shop-1',
    channel,
    // หน้าต่าง 24 ชม. ของ Meta ยังเปิด — กันไม่ให้กิ่ง Meta ตกไป WINDOW_CLOSED ก่อนถึงตัวยิง
    lastInboundAt: new Date(Date.now() - 60_000),
    // ไม่มี replyToken ⇒ กิ่ง LINE ตกไป PUSH ตรง ๆ ไม่ต้องพึ่ง CAS
    replyToken: null,
    replyTokenUsedAt: null,
    shopChannel: {
      id: 'ch-1',
      shopId: 'shop-1',
      externalId: 'EXT-1',
      accessTokenEnc: 'enc',
      status: 'ACTIVE',
      provider: channel,
    },
    externalContact: { id: 'ec-1', externalUserId: 'U-1', name: 'ลูกค้า', isBlocked: false },
  } as unknown as Parameters<typeof transmitOutbound>[0]
}

describe('[blocker] transmitOutbound — ตัวเลือกช่องทาง', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.chatMessage.findFirst.mockResolvedValue(null)
    db.conversation.updateMany.mockResolvedValue({ count: 0 })
    db.conversation.update.mockResolvedValue({})
    lineApiRequest.mockResolvedValue({ sentMessages: [{ id: 'mid.line.1' }] })
    ;(sendTextMessage as ReturnType<typeof vi.fn>).mockResolvedValue('mid.meta.1')
  })

  it('LINE → เดินกิ่ง LINE จริง (ยิง LINE API + ได้ sendMethod ที่มีค่า)', async () => {
    const out = await transmitOutbound(conv('LINE'), {
      conversationId: 'conv-1',
      actorUserId: 'u1',
      text: 'สวัสดีครับ',
    })

    // sendMethod มีค่า = แนวคิด REPLY/PUSH ซึ่งมีเฉพาะ LINE (Meta คืน null เสมอ)
    expect(out.sendMethod).toBe('PUSH')
    expect(out.externalMessageId).toBe('mid.line.1')
    // ยิงไปที่ endpoint ของ LINE จริง ไม่ใช่ของ Meta
    expect(lineApiRequest).toHaveBeenCalledTimes(1)
    expect(lineApiRequest.mock.calls[0][0]).toBe('/v2/bot/message/push')
    expect(sendTextMessage).not.toHaveBeenCalled()
  })

  it('MESSENGER → เดินกิ่ง Meta จริง (ยิง Graph + sendMethod เป็น null)', async () => {
    const out = await transmitOutbound(conv('MESSENGER'), {
      conversationId: 'conv-1',
      actorUserId: 'u1',
      text: 'สวัสดีครับ',
    })

    expect(out.sendMethod).toBeNull()
    expect(out.externalMessageId).toBe('mid.meta.1')
    expect(sendTextMessage).toHaveBeenCalledTimes(1)
    expect(lineApiRequest).not.toHaveBeenCalled()
  })

  it('ตัวยิงไม่เขียนแถว ChatMessage เลย (R-14) — อ่าน quoteToken ได้อย่างเดียว', async () => {
    await transmitOutbound(conv('LINE'), { conversationId: 'conv-1', actorUserId: 'u1', text: 'x' })
    await transmitOutbound(conv('MESSENGER'), { conversationId: 'conv-1', actorUserId: 'u1', text: 'x' })

    // mock ของ prisma.chatMessage ไม่มี create/update/updateMany เลย — ถ้าตัวยิงเผลอเขียน
    // แถวเมื่อไหร่ เทสนี้จะพังด้วย TypeError ทันที ไม่ใช่ผ่านไปเงียบ ๆ
    expect(Object.keys(db.chatMessage)).toEqual(['findFirst'])
  })
})
