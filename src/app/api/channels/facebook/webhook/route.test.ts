import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'

vi.mock('@/services/channel-chat.service', () => ({
  ingestInboundMessage: vi.fn().mockResolvedValue({ status: 'STORED', conversationId: 'conv1' }),
}))

const SECRET = 'wh_secret'
beforeAll(() => {
  process.env.FB_CHAT_APP_SECRET = SECRET
  process.env.FB_WEBHOOK_VERIFY_TOKEN = 'verify_me'
})

import { GET, POST } from '@/app/api/channels/facebook/webhook/route'
import { ingestInboundMessage } from '@/services/channel-chat.service'

const URL_BASE = 'https://seller.deepthailand.app/api/channels/facebook/webhook'
const sign = (b: string) => 'sha256=' + createHmac('sha256', SECRET).update(b).digest('hex')

function postReq(bodyObj: unknown, signature?: string) {
  const body = JSON.stringify(bodyObj)
  return new NextRequest(URL_BASE, {
    method: 'POST',
    body,
    headers: { 'x-hub-signature-256': signature ?? sign(body), 'content-type': 'application/json' },
  })
}

describe('GET (handshake)', () => {
  it('verify token ถูก → คืน challenge เป็น text', async () => {
    const req = new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=verify_me&hub.challenge=12345`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('12345')
  })

  it('verify token ผิด → 403', async () => {
    const req = new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`)
    expect((await GET(req)).status).toBe(403)
  })
})

describe('POST (รับ event)', () => {
  beforeEach(() => vi.clearAllMocks())

  const body = {
    object: 'page',
    entry: [
      {
        id: 'PAGE1', time: 1,
        messaging: [{ sender: { id: 'PSID_1' }, recipient: { id: 'PAGE1' }, message: { mid: 'mid.1', text: 'hi' } }],
      },
    ],
  }

  it('ลายเซ็นถูก → 200 และเรียก ingest', async () => {
    const res = await POST(postReq(body))
    expect(res.status).toBe(200)
    expect(ingestInboundMessage).toHaveBeenCalledTimes(1)
    expect((ingestInboundMessage as ReturnType<typeof vi.fn>).mock.calls[0]![0].pageExternalId).toBe('PAGE1')
  })

  it('ลายเซ็นผิด → 401 และไม่แตะ ingest เลย', async () => {
    const res = await POST(postReq(body, 'sha256=deadbeef'))
    expect(res.status).toBe(401)
    expect(ingestInboundMessage).not.toHaveBeenCalled()
  })

  it('object=instagram → ส่ง provider INSTAGRAM ให้ ingest', async () => {
    await POST(postReq({ ...body, object: 'instagram' }))
    expect((ingestInboundMessage as ReturnType<typeof vi.fn>).mock.calls[0]![0].provider).toBe('INSTAGRAM')
  })

  it('ingest พังจาก logic/data error (ไม่ใช่ Prisma) → ยังตอบ 200 (กัน Meta retry ไม่จบ)', async () => {
    ;(ingestInboundMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('unexpected bug'))
    expect((await POST(postReq(body))).status).toBe(200)
  })

  it('ingest พังจาก infra (DB ต่อไม่ติด) → ตอบ non-200 ให้ Meta retry แทนที่จะทำข้อความหายถาวร (I-3)', async () => {
    ;(ingestInboundMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Prisma.PrismaClientInitializationError('Cant reach database server', '5.x'),
    )
    expect((await POST(postReq(body))).status).toBe(503)
  })

  it('ingest พังจาก Prisma P1xxx (connection-level) → ตอบ non-200 เช่นกัน (I-3)', async () => {
    ;(ingestInboundMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('timed out', {
        code: 'P1001', clientVersion: 'test',
      }),
    )
    expect((await POST(postReq(body))).status).toBe(503)
  })

  it('ingest พังจาก Prisma P2xxx (query/constraint-level ที่หลุดรอดมา) → ยังตอบ 200 ไม่ใช่ infra (I-3)', async () => {
    ;(ingestInboundMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('record not found', {
        code: 'P2025', clientVersion: 'test',
      }),
    )
    expect((await POST(postReq(body))).status).toBe(200)
  })

  it('infra error เกิดตั้งแต่ event แรกใน batch → หยุดทันที ไม่ประมวลผล event ที่เหลือต่อ', async () => {
    const twoEventsBody = {
      object: 'page',
      entry: [
        {
          id: 'PAGE1', time: 1,
          messaging: [
            { sender: { id: 'PSID_1' }, recipient: { id: 'PAGE1' }, message: { mid: 'mid.1', text: 'a' } },
            { sender: { id: 'PSID_2' }, recipient: { id: 'PAGE1' }, message: { mid: 'mid.2', text: 'b' } },
          ],
        },
      ],
    }
    ;(ingestInboundMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Prisma.PrismaClientInitializationError('Cant reach database server', '5.x'),
    )
    const res = await POST(postReq(twoEventsBody))
    expect(res.status).toBe(503)
    expect(ingestInboundMessage).toHaveBeenCalledTimes(1)
  })

  it('payload ที่ parse ไม่ผ่าน → 200 (ไม่ retry) แต่ไม่เรียก ingest', async () => {
    const res = await POST(postReq({ object: 'page' }))
    expect(res.status).toBe(200)
    expect(ingestInboundMessage).not.toHaveBeenCalled()
  })
})
