import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/token-crypto'
import { validateSignature } from '@/lib/line/signature'
import { ingestLineTextMessage } from '@/services/channel-chat.service'

// Webhook ของ LINE Messaging API (feature 00025, S-6 — จุดเสี่ยงสูงสุดรองจาก S-1: public endpoint
// ไม่มี session)
//
// route นี้ถูกยกเว้นจาก CSRF Origin-check ใน proxy.ts เพราะ LINE ยิง server-to-server ไม่มี header
// Origin แบบ browser → ลายเซ็น x-line-signature คือ authentication เพียงอย่างเดียวของ route นี้
// (ดู proxy.ts บรรทัดที่ยกเว้น /api/channels/facebook/webhook อยู่แล้ว — เพิ่ม path นี้เข้าไปคู่กัน)
//
// กติกาการตอบ (API.md §4.1): **ตอบ 200 เสมอทุกกรณี** แม้ปฏิเสธ event หรือแม้ ingest ล้มเหลวจาก infra
// (TFR-LINE-03) — ต่างจาก webhook ของ Meta ที่ตอบ 503 เมื่อ DB ล่มเพื่อให้ retry: ที่นี่ยอมรับความเสี่ยง
// ว่าข้อความอาจหายถ้า DB ล่มพอดี เพราะ retry ไม่ช่วย (DB ยังล่มเหมือนเดิม) และการตอบ non-200 มีแต่ทำให้
// LINE ยิงซ้ำไม่จบ — เฝ้าระวังผ่าน log ระดับ error แทน ไม่ใช่ผ่าน status code
//
// waitUntil: SDS TD-003 เอ่ยถึง `waitUntil` จาก `@vercel/functions` แต่แพ็กเกจนั้นไม่ได้อยู่ใน
// dependency ของโปรเจกต์นี้ (ตรวจแล้วก่อนเขียนไฟล์นี้) — ใช้ `after()` จาก `next/server` แทน ซึ่งเป็น
// primitive ตัวเดียวกับที่ webhook ของ Meta (route ต้นแบบ) ใช้อยู่จริงบน production ผลลัพธ์เดียวกัน
// (เลื่อนงานไปทำหลังตอบ response แล้ว)

export const dynamic = 'force-dynamic'

// เผื่อ batch ที่มีหลาย event/ต้องรอ GET /v2/bot/profile หลายครั้งใน after() เดียวกัน — ไม่ประกาศ
// จะถูกตัดที่ค่า default ของ platform แล้วงาน ingest ที่เหลือใน batch จะหายกลางคันแบบเงียบ ๆ
// (pattern เดียวกับ maxDuration ของ facebook/webhook/route.ts)
export const maxDuration = 60

interface LineWebhookMessage {
  id?: unknown
  type?: unknown
  text?: unknown
}

interface LineWebhookEvent {
  type?: unknown
  timestamp?: unknown
  source?: { type?: unknown; userId?: unknown }
  replyToken?: unknown
  message?: LineWebhookMessage
}

interface LineWebhookBody {
  destination?: unknown
  events?: unknown
}

/**
 * ประมวลผล event เดียว — เรียกจากใน after() เท่านั้น (หลังตอบ 200 ไปแล้ว)
 *
 * รอบนี้ (S-6) รับเฉพาะ event ชนิด `message` ที่เป็น `text` — ชนิดอื่นทั้งหมด (image/video/audio/file/
 * location/sticker = S-7, follow/unfollow = S-11, postback/beacon/join/leave ฯลฯ) ข้ามอย่างปลอดภัย
 * ไว้ก่อนตามที่ scope baseline ระบุ ห้ามทำให้ทั้ง request ล้มเพราะ event ชนิดที่ยังไม่รองรับ
 *
 * event จากกลุ่ม/ห้อง (source.type !== 'user') ข้ามเงียบทุกชนิด (BR-LINE-08, OOS-02 — MVP รองรับ 1:1
 * เท่านั้น) เช็คนี้ต้องมาก่อนเช็คชนิด event เพราะครอบทุกชนิด ไม่ใช่แค่ message
 */
async function processLineEvent(params: {
  shopId: string
  shopChannelId: string
  accessToken: string
  event: LineWebhookEvent
}): Promise<void> {
  const { event } = params

  if (typeof event.source?.type !== 'string' || event.source.type !== 'user') return
  if (event.type !== 'message') return

  const message = event.message
  if (!message || message.type !== 'text') return
  if (typeof message.id !== 'string' || !message.id) return
  if (typeof message.text !== 'string') return

  const eventTimestamp = typeof event.timestamp === 'number' ? event.timestamp : Date.now()
  const externalUserId = typeof event.source.userId === 'string' ? event.source.userId : null
  if (!externalUserId) {
    // ตามสเปก LINE, source.type='user' ต้องมี userId เสมอ — กันไว้เผื่อ payload ผิดปกติ ไม่ throw
    console.warn('[line-webhook] event ชนิด user ไม่มี userId')
    return
  }

  await ingestLineTextMessage({
    shopId: params.shopId,
    shopChannelId: params.shopChannelId,
    accessToken: params.accessToken,
    externalUserId,
    lineMessageId: message.id,
    text: message.text,
    replyToken: typeof event.replyToken === 'string' ? event.replyToken : undefined,
    eventTimestamp,
  })
}

export async function POST(request: NextRequest) {
  // ต้องอ่าน raw text ก่อนเสมอ — ลายเซ็นคำนวณจาก byte ดิบ (TFR-LINE-02 ขั้น 1) ถ้า parse เป็น object
  // แล้ว stringify ใหม่ ลายเซ็นจะไม่ตรง
  const raw = await request.text()

  // TD-002: parse เพื่ออ่าน `destination` เท่านั้น — ข้อมูลนี้ **ยังไม่เชื่อถือได้** จนกว่าจะ verify
  // ลายเซ็นผ่าน ใช้ได้แค่เพื่อ "เลือก secret" (หา ShopChannel) ห้ามเขียน DB/เรียก LINE ก่อนหน้านั้น
  let body: LineWebhookBody
  try {
    body = JSON.parse(raw || '{}') as LineWebhookBody
  } catch {
    console.warn('[line-webhook] body ไม่ใช่ JSON')
    return NextResponse.json({ ok: true })
  }

  const destination = typeof body.destination === 'string' ? body.destination : null
  if (!destination) {
    console.warn('[line-webhook] ไม่มี destination ใน body')
    return NextResponse.json({ ok: true })
  }

  // หา ShopChannel ที่ ACTIVE ของ destination นี้ — ต้อง query ตรงด้วย prisma ที่นี่ (ไม่ผ่าน
  // getChannelByExternalId ของ shop-channel.service.ts) เพราะฟังก์ชันนั้นไม่คืน channelSecretEnc/status
  // ที่ route นี้ต้องใช้ตรวจลายเซ็น — และ shop-channel.service.ts เป็นไฟล์ของ S-5 ที่มี agent อื่นแก้
  // ขนานกันอยู่ในรอบนี้ (กัน conflict ระหว่างสอง task)
  //
  // ห่อทั้งก้อนด้วย try/catch: TFR-LINE-03 บังคับตอบ 200 เสมอแม้ DB ล่มชั่วคราว (ต่างจาก webhook ของ
  // Meta ที่ตอบ 503 ให้ retry — ที่นี่ retry ไม่ช่วยเพราะ DB ยังล่มเหมือนเดิม)
  let channel: { id: string; shopId: string; channelSecretEnc: string | null; accessTokenEnc: string } | null
  try {
    channel = await prisma.shopChannel.findFirst({
      where: { provider: 'LINE', externalId: destination, status: 'ACTIVE' },
      select: { id: true, shopId: true, channelSecretEnc: true, accessTokenEnc: true },
    })
  } catch (e) {
    console.error('[line-webhook] หา ShopChannel ไม่สำเร็จ (DB)', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: true })
  }

  if (!channel || !channel.channelSecretEnc) {
    console.warn('[line-webhook] ไม่พบช่องทาง ACTIVE ของ destination นี้')
    return NextResponse.json({ ok: true })
  }

  let channelSecret: string
  try {
    channelSecret = decryptToken(channel.channelSecretEnc)
  } catch (e) {
    console.error('[line-webhook] ถอดรหัส channelSecretEnc ไม่สำเร็จ', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: true })
  }

  // TFR-LINE-02 ขั้น 4: verify ลายเซ็น — ไม่ผ่าน = ตอบ 200 แล้วจบ ห้ามเขียน DB ห้ามเรียก LINE ใด ๆ
  // (BR-LINE-05/06) — TC-04 [ห้ามข้าม] พิสูจน์ว่าไม่มี write/outbound call เลยตอนลายเซ็นผิด
  if (!validateSignature(raw, channelSecret, request.headers.get('x-line-signature'))) {
    console.warn('[line-webhook] ลายเซ็นไม่ผ่าน')
    return NextResponse.json({ ok: true })
  }

  const events = Array.isArray(body.events) ? (body.events as LineWebhookEvent[]) : []

  let accessToken: string
  try {
    accessToken = decryptToken(channel.accessTokenEnc)
  } catch (e) {
    console.error('[line-webhook] ถอดรหัส accessTokenEnc ไม่สำเร็จ', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: true })
  }

  const shopId = channel.shopId
  const shopChannelId = channel.id

  // TD-003/TFR-LINE-03: ตอบ 200 ทันทีหลังผ่าน verify แล้วค่อยทำงานหนัก (upsert contact ที่อาจต้องยิง
  // GET /v2/bot/profile + เขียน DB) ใน after() — LINE มี reply token อายุแค่ 60 วินาที ยิ่งต้องตอบเร็ว
  after(async () => {
    for (const event of events) {
      try {
        await processLineEvent({ shopId, shopChannelId, accessToken, event })
      } catch (e) {
        // error ระดับไหนก็ตาม (infra หรือ logic) ห้าม throw ออกไปเปลี่ยนสถานะ HTTP ที่ตอบไปแล้ว
        // (TFR-LINE-03) — log ระดับ error ไว้ให้มี alert เพราะ LINE จะไม่ยิงซ้ำให้ (ตอบ 200 ไปแล้ว)
        console.error('[line-webhook] ingest ล้มเหลว', e instanceof Error ? e.message : e)
      }
    }
  })

  return NextResponse.json({ ok: true })
}
