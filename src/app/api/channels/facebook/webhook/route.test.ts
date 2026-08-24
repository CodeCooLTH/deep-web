import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'

vi.mock('@/services/channel-chat.service', () => ({
  ingestInboundMessage: vi.fn().mockResolvedValue({ status: 'STORED', conversationId: 'conv1' }),
}))

// (CR 2026-08-23 outbound-queue) ตัวระบายคิวขาออกชั้น 2 — mock ไว้เพื่อให้เทสไม่แตะ DB จริง
const deliverRoom = vi.fn()
vi.mock('@/services/chat-outbox.service', () => ({
  deliverRoom: (...a: unknown[]) => deliverRoom(...a),
}))

// next/server `after()` throw ทันทีถ้าไม่ได้อยู่ใน request context จริงของ Next runtime (vitest ไม่มี)
// — mock ให้ "รันทันที **แล้วเก็บ promise ที่ได้ไว้**" ไม่ใช่แค่เรียกทิ้ง: การเก็บไว้คือสิ่งเดียวที่
// ทำให้เทส "งานเบื้องหลังพังต้องไม่ทำให้ webhook พัง" มีของให้ตรวจ — ถ้าเรียกทิ้งเฉย ๆ callback ที่
// reject จะกลายเป็น unhandled rejection ที่ไม่มีเทสไหนเห็น แล้วด่านจะเขียวทั้งที่ error หลุดออกไปแล้ว
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

  // (S-2) timingSafeEqual throw ถ้าความยาว buffer ไม่เท่ากัน — ต้องเช็คความยาวก่อนเทียบ
  // ไม่งั้น token ที่ความยาวต่างจาก verify_me จะทำให้ route โยน 500 แทนที่จะตอบ 403 ปกติ
  it('verify token ความยาวสั้นกว่าตัวจริงมาก → ยังคืน 403 ไม่ throw 500', async () => {
    const req = new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1`)
    expect((await GET(req)).status).toBe(403)
  })

  it('verify token ความยาวยาวกว่าตัวจริงมาก → ยังคืน 403 ไม่ throw 500', async () => {
    const req = new NextRequest(
      `${URL_BASE}?hub.mode=subscribe&hub.verify_token=${'x'.repeat(200)}&hub.challenge=1`,
    )
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

// ══════════════════════════════════════════════════════════════════════════
// ชั้น 2 ของคิวขาออก (CR 2026-08-23)
//
// 🛑 ทำไมเป็น [blocker]: เส้นทางคิวขาออกไม่มี auto-retry (D-2) — แถวที่ `after()` ของ POST
// /messages ไม่ได้รัน (ผู้ขายกดส่งแล้วปิดแอป = บั๊กต้นเรื่อง) จะค้าง QUEUED จนกว่าจะมีใครมาหยิบ
// ถ้าด่านนี้หายไป webhook จะยังทำงาน "ถูกต้อง" ทุกประการ ไม่มี error ไม่มี tsc ตัวไหนฟ้อง —
// สิ่งที่หายคือโอกาสที่ข้อความของร้านจะออกไปถึงลูกค้า
// ══════════════════════════════════════════════════════════════════════════
describe('POST — ระบายคิวขาออกของห้องที่มี event เข้ามา', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    afterPromises.length = 0
    ;(ingestInboundMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'STORED',
      conversationId: 'conv1',
    })
    deliverRoom.mockResolvedValue(0)
  })

  const body = {
    object: 'page',
    entry: [
      {
        id: 'PAGE1', time: 1,
        messaging: [{ sender: { id: 'PSID_1' }, recipient: { id: 'PAGE1' }, message: { mid: 'mid.1', text: 'hi' } }],
      },
    ],
  }

  it('[blocker] ingest สำเร็จ → ระบายคิวของ "ห้องนั้น" ด้วย owner "sweep"', async () => {
    await POST(postReq(body))
    await Promise.all(afterPromises)

    expect(deliverRoom).toHaveBeenCalledTimes(1)
    // owner ต้องเป็น 'sweep' ไม่ใช่ 'cron'/'after' — `sendLockedBy` ไม่ถูกเคลียร์ตอนสำเร็จโดยตั้งใจ
    // เพราะมันคือตัววัดว่า "ใครเป็นคนส่งสำเร็จ" = บั๊กต้นเรื่องเกิดจริงกี่ครั้ง (spec §9)
    // ส่งผิดค่า = ตัววัดทั้งชุดโกหกโดยไม่มีอะไรฟ้อง
    expect(deliverRoom).toHaveBeenCalledWith('conv1', 'sweep')
  })

  it('[blocker] ห้องเดียวกันหลาย event ใน batch เดียว → ระบายครั้งเดียว (ไม่ใช่ทุก event)', async () => {
    await POST(
      postReq({
        object: 'page',
        entry: [
          {
            id: 'PAGE1', time: 1,
            messaging: [
              { sender: { id: 'PSID_1' }, recipient: { id: 'PAGE1' }, message: { mid: 'mid.1', text: 'a' } },
              { sender: { id: 'PSID_1' }, recipient: { id: 'PAGE1' }, message: { mid: 'mid.2', text: 'b' } },
            ],
          },
        ],
      }),
    )
    await Promise.all(afterPromises)

    expect(deliverRoom).toHaveBeenCalledTimes(1)
  })

  it('[blocker] ตัวระบายพัง → webhook ต้องไม่ล้ม (ไม่งั้น Meta retry ทั้ง batch แล้วข้อความขาเข้าค้าง)', async () => {
    deliverRoom.mockRejectedValue(new Error('DB ล่ม'))

    const res = await POST(postReq(body))
    expect(res.status).toBe(200)

    // 🛑 ข้อสำคัญของเทสนี้อยู่ที่บรรทัดนี้ ไม่ใช่ที่ status: ถ้า error หลุดออกจาก callback ของ
    // after() มันจะกลายเป็น rejection ที่ไม่มีใครรับ (บน Vercel = ทำให้ invocation ล้มหลังตอบ
    // ไปแล้ว) — status 200 เพียงอย่างเดียวจึงพิสูจน์อะไรไม่ได้เลย
    await expect(Promise.all(afterPromises)).resolves.toBeDefined()
  })

  it('เพจที่ไม่มีร้านเชื่อม (NO_CHANNEL — ไม่มีเธรด) → ไม่มีอะไรให้ระบาย', async () => {
    ;(ingestInboundMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'NO_CHANNEL' })

    await POST(postReq(body))
    await Promise.all(afterPromises)

    expect(deliverRoom).not.toHaveBeenCalled()
  })
})
