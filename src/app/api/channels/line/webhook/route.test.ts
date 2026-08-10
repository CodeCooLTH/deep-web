import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'

// next/server `after()` throw ทันทีถ้าไม่ได้อยู่ใน request context จริงของ Next.js runtime (vitest
// ไม่มี context นั้น) — mock ให้รันงานที่ส่งเข้ามาแล้ว await ทันที (behavior เทียบเท่าเดิมสำหรับเทส
// ที่ต้องการยืนยันผลลัพธ์ "หลัง" after() ทำงานแล้ว) คง export อื่น (NextRequest/NextResponse) ของจริงไว้
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => unknown) => fn() }
})

// (S-6) mock prisma — route query ShopChannel ตรง (ไม่ผ่าน shop-channel.service.ts เพราะไฟล์นั้น
// เป็นของ S-5 ที่มี agent อื่นแก้ขนานกันอยู่)
vi.mock('@/lib/prisma', () => ({
  prisma: {
    shopChannel: { findFirst: vi.fn() },
  },
}))

// decryptToken เป็น identity function ในเทสนี้ — ให้ channelSecretEnc/accessTokenEnc "ที่เก็บ" เป็น
// ค่าเดียวกับ plaintext ที่ใช้คำนวณลายเซ็น/ยิง LineAdapter ตรง ๆ (โฟกัสเทสที่ route ไม่ใช่ crypto)
vi.mock('@/lib/token-crypto', () => ({
  decryptToken: vi.fn((v: string) => v),
}))

vi.mock('@/services/channel-chat.service', () => ({
  ingestLineTextMessage: vi.fn().mockResolvedValue({ status: 'STORED', conversationId: 'conv1' }),
  // (S-7) media/sticker/location dispatch — mock แยกจาก ingestLineTextMessage เพราะ route แยก path
  // ตั้งแต่ message.type === 'text' ก่อนเรียก ingest ตัวไหนเลย
  ingestLineMediaMessage: vi.fn().mockResolvedValue({ status: 'STORED', conversationId: 'conv1' }),
}))

import { POST } from '@/app/api/channels/line/webhook/route'
import { prisma } from '@/lib/prisma'
import { ingestLineTextMessage, ingestLineMediaMessage } from '@/services/channel-chat.service'

const URL_BASE = 'https://deepthailand.app/api/channels/line/webhook'
const SECRET = '0123456789abcdef0123456789abcdef' // 32 hex chars ตามฟอร์แมตของ LINE channel secret

const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('base64')

function postReq(bodyObj: unknown, signatureOverride?: string) {
  const body = JSON.stringify(bodyObj)
  return new NextRequest(URL_BASE, {
    method: 'POST',
    body,
    headers: { 'x-line-signature': signatureOverride ?? sign(body), 'content-type': 'application/json' },
  })
}

const ACTIVE_CHANNEL = {
  id: 'channel-1',
  shopId: 'shop-1',
  channelSecretEnc: SECRET,
  accessTokenEnc: 'access-token-plain',
}

const textEventBody = {
  destination: 'Uee65ad697de752be32ab09904219db5c',
  events: [
    {
      type: 'message',
      webhookEventId: 'wh1',
      deliveryContext: { isRedelivery: false },
      timestamp: 1785000000000,
      source: { type: 'user', userId: 'U0987654321' },
      replyToken: 'reply-token-1',
      mode: 'active',
      message: { id: 'msg-1', type: 'text', text: 'สนใจรุ่นนี้ค่ะ' },
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.shopChannel.findFirst).mockResolvedValue(ACTIVE_CHANNEL as never)
})

describe('POST /api/channels/line/webhook', () => {
  it('ลายเซ็นถูก → 200 และเรียก ingest ด้วยข้อมูลที่ถูกต้อง (TC-03)', async () => {
    const res = await POST(postReq(textEventBody))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(ingestLineTextMessage).toHaveBeenCalledTimes(1)
    expect(ingestLineTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'shop-1',
        shopChannelId: 'channel-1',
        accessToken: 'access-token-plain',
        externalUserId: 'U0987654321',
        lineMessageId: 'msg-1',
        text: 'สนใจรุ่นนี้ค่ะ',
        replyToken: 'reply-token-1',
        eventTimestamp: 1785000000000,
      }),
    )
  })

  it('ลายเซ็นผิด → 200 (ห้าม 4xx ตาม API.md) แต่ไม่มี write และไม่มี outbound call ใด ๆ (TC-04 [ห้ามข้าม])', async () => {
    const res = await POST(postReq(textEventBody, sign(JSON.stringify(textEventBody), 'wrong-secret-xxxxxxxxxxxxxxxx')))
    expect(res.status).toBe(200)
    expect(ingestLineTextMessage).not.toHaveBeenCalled()
  })

  it('ลายเซ็นผิดแบบสุ่ม (ความยาวไม่ตรง) → 200 และไม่เรียก ingest', async () => {
    const res = await POST(postReq(textEventBody, 'not-a-valid-base64-signature=='))
    expect(res.status).toBe(200)
    expect(ingestLineTextMessage).not.toHaveBeenCalled()
  })

  it('ไม่มี header x-line-signature → 200 และไม่เรียก ingest (TC-05)', async () => {
    const body = JSON.stringify(textEventBody)
    const req = new NextRequest(URL_BASE, { method: 'POST', body, headers: { 'content-type': 'application/json' } })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(ingestLineTextMessage).not.toHaveBeenCalled()
  })

  it('body ไม่ใช่ JSON → 200 และไม่เรียก ingest (TC-05)', async () => {
    const req = new NextRequest(URL_BASE, {
      method: 'POST',
      body: 'not-json{{{',
      headers: { 'x-line-signature': 'whatever', 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(ingestLineTextMessage).not.toHaveBeenCalled()
  })

  it('destination ไม่มีร้านเชื่อม (ACTIVE) → 200 และไม่เรียก ingest (TC-06)', async () => {
    vi.mocked(prisma.shopChannel.findFirst).mockResolvedValue(null)
    const res = await POST(postReq(textEventBody))
    expect(res.status).toBe(200)
    expect(ingestLineTextMessage).not.toHaveBeenCalled()
  })

  it('ไม่มี destination ใน body เลย → 200 และไม่เรียก ingest', async () => {
    const bodyNoDestination = { events: textEventBody.events }
    const res = await POST(postReq(bodyNoDestination))
    expect(res.status).toBe(200)
    expect(ingestLineTextMessage).not.toHaveBeenCalled()
  })

  it('redelivery (ingest คืน DUPLICATE) → ยังตอบ 200 ปกติไม่ throw (TC-07)', async () => {
    vi.mocked(ingestLineTextMessage).mockResolvedValueOnce({ status: 'DUPLICATE' })
    const res = await POST(postReq(textEventBody))
    expect(res.status).toBe(200)
    expect(ingestLineTextMessage).toHaveBeenCalledTimes(1)
  })

  it('event จากกลุ่ม/ห้อง (source.type != user) → ข้ามเงียบ ไม่เรียก ingest ไม่ throw (TC-26)', async () => {
    const groupBody = {
      destination: textEventBody.destination,
      events: [
        {
          type: 'message',
          timestamp: 1785000000000,
          source: { type: 'group', groupId: 'G123' },
          replyToken: 'reply-token-group',
          message: { id: 'msg-group-1', type: 'text', text: 'สวัสดีกลุ่ม' },
        },
      ],
    }
    const res = await POST(postReq(groupBody))
    expect(res.status).toBe(200)
    expect(ingestLineTextMessage).not.toHaveBeenCalled()
  })

  it('event ชนิด image message (S-7) → เรียก ingestLineMediaMessage ไม่ใช่ ingestLineTextMessage (TC-08)', async () => {
    const imageBody = {
      destination: textEventBody.destination,
      events: [
        {
          type: 'message',
          timestamp: 1785000000000,
          source: { type: 'user', userId: 'U0987654321' },
          replyToken: 'reply-token-img',
          message: { id: 'msg-img-1', type: 'image' },
        },
      ],
    }
    const res = await POST(postReq(imageBody))
    expect(res.status).toBe(200)
    expect(ingestLineTextMessage).not.toHaveBeenCalled()
    expect(ingestLineMediaMessage).toHaveBeenCalledTimes(1)
    expect(ingestLineMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'shop-1',
        shopChannelId: 'channel-1',
        externalUserId: 'U0987654321',
        message: { type: 'image', id: 'msg-img-1' },
        replyToken: 'reply-token-img',
      }),
    )
  })

  it('event ชนิด file message (S-7) → ส่ง fileName/fileSize เข้า ingestLineMediaMessage', async () => {
    const fileBody = {
      destination: textEventBody.destination,
      events: [
        {
          type: 'message',
          timestamp: 1785000000000,
          source: { type: 'user', userId: 'U0987654321' },
          replyToken: 'reply-token-file',
          message: { id: 'msg-file-1', type: 'file', fileName: 'ใบเสร็จ.pdf', fileSize: 12345 },
        },
      ],
    }
    const res = await POST(postReq(fileBody))
    expect(res.status).toBe(200)
    expect(ingestLineMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: { type: 'file', id: 'msg-file-1', fileName: 'ใบเสร็จ.pdf', fileSize: 12345 },
      }),
    )
  })

  it('event ชนิด sticker message (S-7) → ส่ง packageId/stickerId เข้า ingestLineMediaMessage (TC-25)', async () => {
    const stickerBody = {
      destination: textEventBody.destination,
      events: [
        {
          type: 'message',
          timestamp: 1785000000000,
          source: { type: 'user', userId: 'U0987654321' },
          replyToken: 'reply-token-sticker',
          message: { id: 'msg-sticker-1', type: 'sticker', packageId: '446', stickerId: '1988' },
        },
      ],
    }
    const res = await POST(postReq(stickerBody))
    expect(res.status).toBe(200)
    expect(ingestLineMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: {
          type: 'sticker',
          id: 'msg-sticker-1',
          packageId: '446',
          stickerId: '1988',
          stickerResourceType: null,
        },
      }),
    )
  })

  it('event ชนิด sticker message มี stickerResourceType (S-7b) → ส่งต่อเข้า ingestLineMediaMessage', async () => {
    const stickerBody = {
      destination: textEventBody.destination,
      events: [
        {
          type: 'message',
          timestamp: 1785000000000,
          source: { type: 'user', userId: 'U0987654321' },
          replyToken: 'reply-token-sticker-2',
          message: {
            id: 'msg-sticker-2',
            type: 'sticker',
            packageId: '446',
            stickerId: '1989',
            stickerResourceType: 'ANIMATION',
          },
        },
      ],
    }
    const res = await POST(postReq(stickerBody))
    expect(res.status).toBe(200)
    expect(ingestLineMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: {
          type: 'sticker',
          id: 'msg-sticker-2',
          packageId: '446',
          stickerId: '1989',
          stickerResourceType: 'ANIMATION',
        },
      }),
    )
  })

  it('event ชนิด location message (S-7) → ส่ง title/address/lat/lng เข้า ingestLineMediaMessage (TC-25)', async () => {
    const locationBody = {
      destination: textEventBody.destination,
      events: [
        {
          type: 'message',
          timestamp: 1785000000000,
          source: { type: 'user', userId: 'U0987654321' },
          replyToken: 'reply-token-location',
          message: {
            id: 'msg-location-1',
            type: 'location',
            title: 'ร้านกาแฟ',
            address: '123 ถ.สุขุมวิท',
            latitude: 13.7563,
            longitude: 100.5018,
          },
        },
      ],
    }
    const res = await POST(postReq(locationBody))
    expect(res.status).toBe(200)
    expect(ingestLineMediaMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: {
          type: 'location',
          id: 'msg-location-1',
          title: 'ร้านกาแฟ',
          address: '123 ถ.สุขุมวิท',
          latitude: 13.7563,
          longitude: 100.5018,
        },
      }),
    )
  })

  it('location message ไม่มี latitude/longitude (payload ผิดปกติ) → ข้ามอย่างปลอดภัย ไม่เรียก ingest ใด ๆ', async () => {
    const badLocationBody = {
      destination: textEventBody.destination,
      events: [
        {
          type: 'message',
          timestamp: 1785000000000,
          source: { type: 'user', userId: 'U0987654321' },
          replyToken: 'reply-token-bad-location',
          message: { id: 'msg-bad-location-1', type: 'location', title: 'ร้านกาแฟ' },
        },
      ],
    }
    const res = await POST(postReq(badLocationBody))
    expect(res.status).toBe(200)
    expect(ingestLineTextMessage).not.toHaveBeenCalled()
    expect(ingestLineMediaMessage).not.toHaveBeenCalled()
  })

  it('event ชนิดที่ยังไม่รองรับ (postback) → ข้ามอย่างปลอดภัย ไม่เรียก ingest ไม่ล้มทั้ง request', async () => {
    const postbackBody = {
      destination: textEventBody.destination,
      events: [
        {
          type: 'postback',
          timestamp: 1785000000000,
          source: { type: 'user', userId: 'U0987654321' },
          replyToken: 'reply-token-postback',
        },
      ],
    }
    const res = await POST(postReq(postbackBody))
    expect(res.status).toBe(200)
    expect(ingestLineTextMessage).not.toHaveBeenCalled()
    expect(ingestLineMediaMessage).not.toHaveBeenCalled()
  })

  it('event follow/unfollow (ยังไม่รองรับ — S-11) → ข้ามอย่างปลอดภัย ไม่เรียก ingest', async () => {
    const followBody = {
      destination: textEventBody.destination,
      events: [
        {
          type: 'follow',
          timestamp: 1785000000000,
          source: { type: 'user', userId: 'U0987654321' },
          replyToken: 'reply-token-follow',
        },
      ],
    }
    const res = await POST(postReq(followBody))
    expect(res.status).toBe(200)
    expect(ingestLineTextMessage).not.toHaveBeenCalled()
  })

  it('ingest ล้มเหลว (throw) → ยังตอบ 200 (TFR-LINE-03 ห้าม throw ออกไปเปลี่ยนสถานะ HTTP)', async () => {
    vi.mocked(ingestLineTextMessage).mockRejectedValueOnce(new Error('db down'))
    const res = await POST(postReq(textEventBody))
    expect(res.status).toBe(200)
  })

  it('หลาย event ใน batch เดียว — event ที่ล้มไม่ทำให้ event ถัดไปถูกข้าม', async () => {
    const twoEventsBody = {
      destination: textEventBody.destination,
      events: [
        {
          type: 'message',
          timestamp: 1785000000000,
          source: { type: 'user', userId: 'U1' },
          replyToken: 'rt1',
          message: { id: 'm1', type: 'text', text: 'a' },
        },
        {
          type: 'message',
          timestamp: 1785000001000,
          source: { type: 'user', userId: 'U2' },
          replyToken: 'rt2',
          message: { id: 'm2', type: 'text', text: 'b' },
        },
      ],
    }
    vi.mocked(ingestLineTextMessage)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ status: 'STORED', conversationId: 'conv2' })
    const res = await POST(postReq(twoEventsBody))
    expect(res.status).toBe(200)
    // after() เป็น fire-and-forget โดยตั้งใจ (TD-003 — ตอบ 200 ไม่รอ ingest จบ) การไล่ event ที่ 2
    // ต้องรอ await หลายชั้นคลี่ตัวก่อน (processLineEvent → ingestLineTextMessage) จึงยังไม่เสร็จ
    // ทันทีที่ POST() คืนค่า — ใช้ vi.waitFor แทนการเช็คทันที กันเทส flaky จากช่วงเวลา microtask
    await vi.waitFor(() => expect(ingestLineTextMessage).toHaveBeenCalledTimes(2))
  })
})
