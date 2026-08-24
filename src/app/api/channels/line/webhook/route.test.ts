import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'

// next/server `after()` throw ทันทีถ้าไม่ได้อยู่ใน request context จริงของ Next.js runtime (vitest
// ไม่มี context นั้น) — mock ให้รันงานที่ส่งเข้ามาแล้ว await ทันที (behavior เทียบเท่าเดิมสำหรับเทส
// ที่ต้องการยืนยันผลลัพธ์ "หลัง" after() ทำงานแล้ว) คง export อื่น (NextRequest/NextResponse) ของจริงไว้
//
// 🛑 เก็บ promise ที่ callback คืนไว้ด้วย ไม่ใช่เรียกทิ้ง — เทส "งานเบื้องหลังพังต้องไม่ทำให้ webhook
// พัง" ต้องมีของให้ตรวจ ถ้าเรียกทิ้งเฉย ๆ callback ที่ reject จะกลายเป็น unhandled rejection ที่ไม่มี
// เทสไหนเห็น แล้วด่านจะเขียวทั้งที่ error หลุดออกไปแล้ว
const afterPromises: unknown[] = []
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: (fn: () => unknown) => {
      const p = fn()
      afterPromises.push(p)
      return p
    },
  }
})

// (CR 2026-08-23 outbound-queue) ตัวระบายคิวขาออกชั้น 2 — mock ไว้เพื่อให้เทสไม่แตะ DB จริง
const deliverRoom = vi.fn()
// 🛑 ค่านี้ต้องตรงกับของจริงใน service — ปักหมุดความสัมพันธ์กับ `maxDuration` ของ route ไว้ที่
// `outbox-time-budget-contract.test.ts` (ที่นั่นอ่านทั้งสองฝั่งจากของจริง ไม่ใช่ค่าที่พิมพ์ซ้ำ)
const WEBHOOK_DRAIN_BUDGET_MS = 45_000
vi.mock('@/services/chat-outbox.service', () => ({
  deliverRoom: (...a: unknown[]) => deliverRoom(...a),
  WEBHOOK_DRAIN_BUDGET_MS: 45_000,
}))

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

// (ส่วนขยาย 2026-08-12) ตัวจดความล้มเหลวขาเข้า — mock เพื่อยืนยันว่า route "เรียกจริง"
// ไม่ใช่แค่ import ไว้เฉย ๆ (ด่านที่วางไว้แต่ไม่มีใครเรียกก็ผ่าน tsc เหมือนกันทุกประการ)
vi.mock('@/services/line-inbound-health.service', () => ({
  recordLineInboundFailure: vi.fn().mockResolvedValue(undefined),
  clearLineInboundFailure: vi.fn().mockResolvedValue(undefined),
  recordLineDestinationMiss: vi.fn(),
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
import {
  recordLineInboundFailure,
  clearLineInboundFailure,
  recordLineDestinationMiss,
} from '@/services/line-inbound-health.service'

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
  // (ส่วนขยาย 2026-08-12) 0 = ยังไม่เคยถูกปฏิเสธ — ค่าตั้งต้นของช่องทางที่ทำงานปกติ
  lineInboundFailCount: 0,
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
  afterPromises.length = 0
  deliverRoom.mockResolvedValue(0)
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

  it('postback ที่ payload ไม่ครบ (ไม่มี data/webhookEventId) → ข้ามอย่างปลอดภัย ไม่เรียก ingest', async () => {
    // 🛑 ไม่มี webhookEventId = ไม่มีคีย์ dedupe → ingest ไปก็เสี่ยงข้อความซ้ำทุกครั้งที่ LINE redeliver
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

  it('[blocker] postback ครบถ้วน → ingest เป็นข้อความขาเข้า + ส่ง replyToken ต่อ (เปิดหน้าต่างตอบฟรี)', async () => {
    // ที่มา 2026-08-11: การที่ลูกค้า "แตะปุ่ม" ให้ replyToken มาเหมือนการพิมพ์ข้อความทุกประการ —
    // ถ้าทิ้ง event นี้ ร้านจะเสียทั้งสัญญาณว่าลูกค้าตอบสนอง และเสียโอกาสตอบฟรี 60 วินาที
    const postbackBody = {
      destination: textEventBody.destination,
      events: [
        {
          type: 'postback',
          timestamp: 1785000000000,
          webhookEventId: '01FZ74A0TDDPYRVKNK77XKC3ZR',
          source: { type: 'user', userId: 'U0987654321' },
          replyToken: 'reply-token-postback',
          postback: { data: 'action=book&label=เลือกวันเข้าใช้บริการ', params: { datetime: '2026-08-12T10:00' } },
        },
      ],
    }
    const res = await POST(postReq(postbackBody))
    expect(res.status).toBe(200)
    expect(ingestLineMediaMessage).not.toHaveBeenCalled()
    expect(ingestLineTextMessage).toHaveBeenCalledTimes(1)

    const arg = (ingestLineTextMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      lineMessageId: string
      text: string
      replyToken?: string
      externalUserId: string
    }
    // dedupe key ต้องมาจาก webhookEventId และต้องมี prefix กันชนกับ message id จริงของ LINE
    expect(arg.lineMessageId).toBe('pb:01FZ74A0TDDPYRVKNK77XKC3ZR')
    expect(arg.replyToken).toBe('reply-token-postback')
    expect(arg.externalUserId).toBe('U0987654321')
    expect(arg.text).toContain('เลือกวันเข้าใช้บริการ')
    expect(arg.text).toContain('2026-08-12T10:00')
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

// ── ความทนของการเชื่อมต่อ (ส่วนขยาย 2026-08-12) ─────────────────────────────
//
// 🛑 เทสกลุ่มนี้มีอยู่เพราะ TC-04 ด้านบน **ชื่อบอกว่า "ไม่มี write"** แต่ที่ตรวจจริงมีข้อเดียวคือ
// `ingestLineTextMessage` ไม่ถูกเรียก — ช่องว่างนี้มีมาก่อนรอบนี้ และมันคือชนิดของช่องว่างที่ทำให้
// "ด่านที่วางไว้แต่ไม่มีใครเรียก" ผ่านได้ทุก gate (บทเรียน 00038)

describe('POST /api/channels/line/webhook — บันทึกความล้มเหลวขาเข้า', () => {
  it('[blocker] ลายเซ็นไม่ผ่าน → จดว่า SIGNATURE_MISMATCH และยังไม่ ingest อะไรเลย', async () => {
    // mutation: ลบบรรทัด recordLineInboundFailure ในเส้นทางลายเซ็นไม่ผ่าน → ข้อนี้แดง
    const res = await POST(postReq(textEventBody, sign(JSON.stringify(textEventBody), 'wrong-secret-xxxxxxxxxxxxxxxx')))
    expect(res.status).toBe(200)
    expect(recordLineInboundFailure).toHaveBeenCalledTimes(1)
    expect(recordLineInboundFailure).toHaveBeenCalledWith('channel-1', 'SIGNATURE_MISMATCH')
    expect(ingestLineTextMessage).not.toHaveBeenCalled()
    expect(ingestLineMediaMessage).not.toHaveBeenCalled()
  })

  it('[blocker] หา destination ไม่เจอ → ต้องนับด้วย ไม่ใช่นับแค่ลายเซ็น', async () => {
    // 🛑 กฎที่เป็น OR ต้องกั้นทุก operand — สองเส้นทางนี้ทำให้ข้อความหายเงียบเท่ากันทุกประการ
    // mutation: ลบ recordLineDestinationMiss() ออก → ข้อนี้แดง
    vi.mocked(prisma.shopChannel.findFirst).mockResolvedValue(null as never)
    const res = await POST(postReq(textEventBody))
    expect(res.status).toBe(200)
    expect(recordLineDestinationMiss).toHaveBeenCalledTimes(1)
    expect(recordLineInboundFailure).not.toHaveBeenCalled()
  })

  it('[blocker] ลายเซ็นผ่านและเคยล้มมาก่อน → ล้างตัวนับ (ลายเซ็นผ่าน = พิสูจน์ว่า secret ถูก)', async () => {
    vi.mocked(prisma.shopChannel.findFirst).mockResolvedValue({ ...ACTIVE_CHANNEL, lineInboundFailCount: 4 } as never)
    const res = await POST(postReq(textEventBody))
    expect(res.status).toBe(200)
    expect(clearLineInboundFailure).toHaveBeenCalledWith('channel-1')
  })

  it('[blocker] ลายเซ็นผ่านและตัวนับเป็น 0 อยู่แล้ว → ไม่ยิง UPDATE เปล่า', async () => {
    // ทุกข้อความที่เข้ามาปกติจะกลายเป็น write หนึ่งครั้งถ้าไม่มีด่านนี้
    // mutation: ถอด `if (channel.lineInboundFailCount > 0)` ออก → ข้อนี้แดง
    const res = await POST(postReq(textEventBody))
    expect(res.status).toBe(200)
    expect(clearLineInboundFailure).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════════════
// ชั้น 2 ของคิวขาออก (CR 2026-08-23)
//
// 🛑 ทำไมเป็น [blocker]: เส้นทางคิวขาออกไม่มี auto-retry (D-2) — แถวที่ `after()` ของ POST
// /messages ไม่ได้รัน (ผู้ขายกดส่งแล้วปิดแอป = บั๊กต้นเรื่อง) จะค้าง QUEUED จนกว่าจะมีใครมาหยิบ
// ถ้าด่านนี้หายไป webhook จะยังทำงาน "ถูกต้อง" ทุกประการ ไม่มี error ไม่มี tsc ตัวไหนฟ้อง
// ══════════════════════════════════════════════════════════════════════════
describe('POST — ระบายคิวขาออกของห้องที่มี event เข้ามา', () => {
  it('[blocker] ingest สำเร็จ → ระบายคิวของ "ห้องนั้น" ด้วย owner "sweep"', async () => {
    await POST(postReq(textEventBody))
    await Promise.all(afterPromises)

    expect(deliverRoom).toHaveBeenCalledTimes(1)
    // owner ต้องเป็น 'sweep' ไม่ใช่ 'cron'/'after' — `sendLockedBy` ไม่ถูกเคลียร์ตอนสำเร็จโดยตั้งใจ
    // เพราะมันคือตัววัดว่า "ใครเป็นคนส่งสำเร็จ" = บั๊กต้นเรื่องเกิดจริงกี่ครั้ง (spec §9)
    /**
     * 🛑 อาร์กิวเมนต์ที่ 3 (งบเวลา) ต้องมีจริง — ไม่ใช่แค่ห้อง+เจ้าของ
     *
     * ชั้น 2 เคยเรียกโดยไม่ส่ง deadline เลย ⇒ ก้อน `after()` ระบายได้ 20 รอบต่อห้อง คูณจำนวนห้อง
     * ใน batch ใต้ `maxDuration` ของ webhook โดยไม่มีเพดาน ⇒ ถูกตัดกลาง claim ⇒ อีก 3 นาที
     * แถวถูกปิดเป็น "ไม่แน่ใจว่าส่งไปหรือยัง" (คลาสเดียวกับ R-E แต่บนชั้น 2)
     */
    const [convId, owner, deadline] = deliverRoom.mock.calls[0] as [string, string, number]
    expect(convId).toBe('conv1')
    expect(owner).toBe('sweep')
    expect(typeof deadline, 'ไม่ส่งงบเวลา = ชั้น 2 ไม่มีเพดานเลย').toBe('number')
    expect(deadline).toBeGreaterThan(Date.now())
    expect(deadline).toBeLessThanOrEqual(Date.now() + WEBHOOK_DRAIN_BUDGET_MS)
  })

  it('[blocker] ตัวระบายพัง → webhook ต้องไม่ล้ม (TFR-LINE-03 ตอบ 200 ไปแล้ว error หลุดไม่ได้)', async () => {
    deliverRoom.mockRejectedValue(new Error('DB ล่ม'))

    const res = await POST(postReq(textEventBody))
    expect(res.status).toBe(200)

    // 🛑 ข้อสำคัญอยู่ที่บรรทัดนี้ ไม่ใช่ที่ status: error ที่หลุดออกจาก callback ของ after() จะกลาย
    // เป็น rejection ที่ไม่มีใครรับ — status 200 เพียงอย่างเดียวจึงพิสูจน์อะไรไม่ได้เลย
    await expect(Promise.all(afterPromises)).resolves.toBeDefined()
  })

  it('[blocker] ingest ตัวเดียวพัง → ยังต้องไม่ค้าง และไม่ระบายห้องที่ไม่มีเธรด', async () => {
    vi.mocked(ingestLineTextMessage).mockRejectedValueOnce(new Error('พัง'))

    const res = await POST(postReq(textEventBody))
    expect(res.status).toBe(200)
    await Promise.all(afterPromises)

    expect(deliverRoom).not.toHaveBeenCalled()
  })

  it('event ที่ไม่ ingest อะไร (กลุ่ม/ชนิดที่ยังไม่รองรับ) → ไม่มีอะไรให้ระบาย', async () => {
    await POST(
      postReq({
        destination: 'Uline-bot-id',
        events: [
          {
            type: 'message',
            timestamp: 1785000000000,
            source: { type: 'group', groupId: 'G1' },
            message: { id: 'msg-9', type: 'text', text: 'ในกลุ่ม' },
          },
        ],
      }),
    )
    await Promise.all(afterPromises)

    expect(deliverRoom).not.toHaveBeenCalled()
  })
})
