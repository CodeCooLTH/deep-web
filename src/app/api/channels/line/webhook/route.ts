import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  recordLineInboundFailure,
  clearLineInboundFailure,
  recordLineDestinationMiss,
} from '@/services/line-inbound-health.service'
import { decryptToken } from '@/lib/token-crypto'
import { validateSignature } from '@/lib/line/signature'
import { describeLinePostback } from '@/lib/line/postback'
import { ingestLineTextMessage, ingestLineMediaMessage, type LineInboundMediaMessage } from '@/services/channel-chat.service'
import { deliverRoom } from '@/services/chat-outbox.service'

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
  // quoteToken (S-18a, quote reply): LINE ใส่มากับ message object ของ event ประเภท message "ทุกชนิด"
  // (text/image/video/audio/file/location/sticker) — ใช้ตอบกลับแบบอ้างข้อความนี้ในอนาคต ไม่มีก็ ingest
  // ข้อความได้ตามปกติ (แค่ quote ข้อความนี้ต่อไม่ได้)
  quoteToken?: unknown
  // quotedMessageId (bugfix 2026-08-10): message id ของข้อความ "ที่ถูกอ้างถึง" เมื่อข้อความนี้เป็นการ
  // reply แบบ swipe/long-press ในแอป LINE — มีเฉพาะตอนข้อความนี้ quote ข้อความเก่า (เอกสาร LINE:
  // "Message ID of a quoted message. Only included when the received message quotes a past message.")
  // มีทั้งชนิด text และ sticker (และชนิดอื่น) คนละเรื่องกับ quoteToken ด้านบน (quoteToken = โทเคนของ
  // ข้อความนี้เองไว้ให้คนอื่น quote ต่อ, quotedMessageId = ตัวชี้ไปข้อความเก่าที่ข้อความนี้กำลังอ้างถึง)
  quotedMessageId?: unknown
  // file (S-7): LINE ส่งชื่อไฟล์เดิม + ขนาดมาด้วย (image/video/audio ไม่มีฟิลด์เหล่านี้)
  fileName?: unknown
  fileSize?: unknown
  // sticker (S-7, stickerResourceType เพิ่มใน S-7b) — stickerResourceType มีอย่างน้อย 10 ค่าตามเอกสาร
  // LINE (STATIC/ANIMATION/SOUND/ANIMATION_SOUND/POPUP/POPUP_SOUND/CUSTOM/MESSAGE/NAME_TEXT/
  // PER_STICKER_TEXT) และเอกสารเตือนเองว่าจะมีค่าใหม่เพิ่มโดยไม่ประกาศ — เก็บเป็น string ดิบ ไม่ตี
  // เป็น union ปิด (ห้าม switch ที่ไม่มี default ตัดสิทธิ์ค่าที่ไม่รู้จัก)
  packageId?: unknown
  stickerId?: unknown
  stickerResourceType?: unknown
  // location (S-7) — title/address เป็น optional จริงตามสเปก LINE, latitude/longitude บังคับเสมอ
  title?: unknown
  address?: unknown
  latitude?: unknown
  longitude?: unknown
}

interface LineWebhookEvent {
  type?: unknown
  timestamp?: unknown
  source?: { type?: unknown; userId?: unknown }
  replyToken?: unknown
  message?: LineWebhookMessage
  /** (2026-08-11) id ที่ LINE รับประกันว่าไม่ซ้ำต่อ event — postback ไม่มี message.id ให้ dedupe */
  webhookEventId?: unknown
  /** (2026-08-11) มีเฉพาะ event ชนิด postback — `params` มีเมื่อปุ่มเป็น datetimepicker/richmenuswitch */
  postback?: { data?: unknown; params?: Record<string, unknown> }
}

interface LineWebhookBody {
  destination?: unknown
  events?: unknown
}

/**
 * ตรวจ shape ของ LineWebhookMessage แบบ unchecked (มาจาก JSON ดิบ) แล้วแปลงเป็น LineInboundMediaMessage
 * ที่ service เชื่อถือได้ — คืน null เมื่อเป็นชนิดที่ยังไม่รองรับ (postback/beacon ฯลฯ) หรือ field
 * บังคับของชนิดนั้นหายไป (เช่น location ไม่มี latitude/longitude — ไม่ควรเกิดตามสเปก LINE แต่กันไว้
 * เผื่อ payload ผิดปกติ ห้าม throw ทั้ง route เพราะ field เดียวหาย)
 */
function toLineInboundMediaMessage(message: LineWebhookMessage): LineInboundMediaMessage | null {
  if (typeof message.id !== 'string' || !message.id) return null
  const id = message.id

  switch (message.type) {
    case 'image':
    case 'video':
    case 'audio':
      return { type: message.type, id }
    case 'file':
      return {
        type: 'file',
        id,
        fileName: typeof message.fileName === 'string' ? message.fileName : null,
        fileSize: typeof message.fileSize === 'number' ? message.fileSize : null,
      }
    case 'sticker':
      if (typeof message.packageId !== 'string' || typeof message.stickerId !== 'string') return null
      return {
        type: 'sticker',
        id,
        packageId: message.packageId,
        stickerId: message.stickerId,
        // ค่าที่ไม่ใช่ string (หรือหายไป) → null แทนที่จะปฏิเสธ event ทั้งก้อน — resourceType เป็น
        // metadata เสริม ไม่ใช่ field ที่ตัดสินว่า mirror ได้ไหม (S-7b: mirror ด้วย stickerId เสมอ)
        stickerResourceType: typeof message.stickerResourceType === 'string' ? message.stickerResourceType : null,
      }
    case 'location':
      if (typeof message.latitude !== 'number' || typeof message.longitude !== 'number') return null
      return {
        type: 'location',
        id,
        title: typeof message.title === 'string' ? message.title : null,
        address: typeof message.address === 'string' ? message.address : null,
        latitude: message.latitude,
        longitude: message.longitude,
      }
    default:
      // text (แยกไป ingestLineTextMessage ก่อนเรียกฟังก์ชันนี้แล้ว), หรือชนิดที่ยังไม่รองรับ
      return null
  }
}

/**
 * ประมวลผล event เดียว — เรียกจากใน after() เท่านั้น (หลังตอบ 200 ไปแล้ว)
 *
 * รับ event ชนิด `message` ที่เป็น text (S-6) และ image/video/audio/file/sticker/location (S-7) —
 * ชนิดอื่นที่เหลือ (follow/unfollow = S-11, postback/beacon/join/leave ฯลฯ) ยังข้ามอย่างปลอดภัยไว้ก่อน
 * ตามที่ scope baseline ระบุ ห้ามทำให้ทั้ง request ล้มเพราะ event ชนิดที่ยังไม่รองรับ
 *
 * event จากกลุ่ม/ห้อง (source.type !== 'user') ข้ามเงียบทุกชนิด (BR-LINE-08, OOS-02 — MVP รองรับ 1:1
 * เท่านั้น) เช็คนี้ต้องมาก่อนเช็คชนิด event เพราะครอบทุกชนิด ไม่ใช่แค่ message
 *
 * คืน `conversationId` ของเธรดที่ event นี้ตกลงไป (หรือ `null` ถ้า event นี้ไม่ได้ ingest อะไร)
 *
 * ค่านี้มีไว้ให้ผู้เรียกระบายคิว **ขาออก** ของห้องเดียวกันต่อ (ชั้น 2 ของ CR 2026-08-23) —
 * เคสที่พบบ่อยที่สุดคือร้านพิมพ์ตอบแล้วปิดแอป แล้วลูกค้าทักกลับมา ⇒ event นี้คือโอกาสแรก
 * ที่จะส่งของที่ค้างออกไป
 */
async function processLineEvent(params: {
  shopId: string
  shopChannelId: string
  accessToken: string
  event: LineWebhookEvent
}): Promise<string | null> {
  const { event } = params

  if (typeof event.source?.type !== 'string' || event.source.type !== 'user') return null

  // (2026-08-11) postback — เกิดเมื่อลูกค้าแตะปุ่มที่เราส่งไป (quick reply / ปุ่มใน Flex / rich menu)
  //
  // 🛑 postback **ไม่มี `message.id`** ให้ใช้ dedupe เหมือน event ชนิด message — ใช้ `webhookEventId`
  // ซึ่ง LINE รับประกันว่าไม่ซ้ำต่อ event แทน (ถ้าใช้ timestamp หรือ data จะซ้ำทันทีที่ลูกค้ากดปุ่มเดิม
  // สองครั้ง แล้วการกดครั้งที่สองจะหายเงียบ ซึ่งเป็นการกดที่ตั้งใจจริง ๆ)
  //
  // ที่สำคัญกว่าตัวข้อความ: postback **มี replyToken มาด้วย** — การที่ลูกค้าแตะปุ่มจึงเปิดหน้าต่าง
  // ตอบฟรี 60 วินาทีให้ร้านเหมือนกับการพิมพ์ข้อความทุกประการ (ประหยัดโควตาจริง ไม่ใช่ผลพลอยได้)
  if (event.type === 'postback') {
    const postbackData = typeof event.postback?.data === 'string' ? event.postback.data : ''
    const webhookEventId = typeof event.webhookEventId === 'string' ? event.webhookEventId : ''
    if (!postbackData || !webhookEventId) return null

    const userId = typeof event.source.userId === 'string' ? event.source.userId : null
    if (!userId) return null

    const ingested = await ingestLineTextMessage({
      shopId: params.shopId,
      shopChannelId: params.shopChannelId,
      accessToken: params.accessToken,
      externalUserId: userId,
      // prefix `pb:` กัน id ชนกับ message id จริงของ LINE ในคอลัมน์ externalMessageId เดียวกัน
      lineMessageId: `pb:${webhookEventId}`,
      text: describeLinePostback(postbackData, event.postback?.params),
      replyToken: typeof event.replyToken === 'string' ? event.replyToken : undefined,
      eventTimestamp: typeof event.timestamp === 'number' ? event.timestamp : Date.now(),
    })

    /**
     * ปุ่ม "เช็คสถานะพัสดุ" บนเมนูลัด (feature 00045 FR-RM-09 / D-RM-3) — ตอบให้ทันที
     *
     * 🛑 ต้องเรียก **หลัง** ingest เสมอ: บับเบิล "ลูกค้าแตะปุ่ม: …" ต้องอยู่ในเธรดก่อนคำตอบ
     * ไม่งั้นผู้ขายจะเห็นคำตอบลอยมาโดยไม่รู้ว่าตอบอะไร (และถ้าตอบไม่ได้ บับเบิลนั้นคือสิ่งเดียว
     * ที่บอกว่าลูกค้าต้องการอะไร)
     *
     * 🛑 ล้มแล้วต้องไม่ทำให้ webhook ตอบ error — LINE จะ retry ทั้ง event แล้วบับเบิลจะซ้ำ
     */
    const qs = new URLSearchParams(postbackData)
    if (qs.get('src') === 'rm' && qs.get('action') === 'order_status') {
      // 🛑 dynamic import โดยตั้งใจ: service นี้มี `server-only` ซึ่งทำให้ไฟล์เทสของ route นี้
      // โหลดไม่ขึ้นทั้งไฟล์ถ้า import ที่ระดับบนสุด (เจอจริงตอนเพิ่มครั้งแรก) — และได้ผลพลอยได้
      // คือไม่ต้องโหลด service สำหรับ event ที่ไม่ใช่ปุ่มนี้ ซึ่งเป็น event ส่วนใหญ่
      const { replyOrderStatus } = await import('@/services/line-rich-menu-reply.service')
      await replyOrderStatus({
        shopId: params.shopId,
        shopChannelId: params.shopChannelId,
        externalUserId: userId,
        // คำจริงที่ร้านตั้งไว้บนปุ่ม (ฝังมากับ data ตอนสร้างเมนู) — ห้าม hardcode
        buttonLabel: qs.get('label') || 'เช็คสถานะพัสดุ',
      }).catch((e) => console.error('[rich-menu] ตอบสถานะพัสดุอัตโนมัติไม่สำเร็จ', e))
    }
    return ingested.conversationId ?? null
  }

  if (event.type !== 'message') return null

  const message = event.message
  if (!message) return null

  const eventTimestamp = typeof event.timestamp === 'number' ? event.timestamp : Date.now()
  const externalUserId = typeof event.source.userId === 'string' ? event.source.userId : null
  if (!externalUserId) {
    // ตามสเปก LINE, source.type='user' ต้องมี userId เสมอ — กันไว้เผื่อ payload ผิดปกติ ไม่ throw
    console.warn('[line-webhook] event ชนิด user ไม่มี userId')
    return null
  }
  const replyToken = typeof event.replyToken === 'string' ? event.replyToken : undefined
  // (S-18a) quote reply — token นี้ผูกกับ "ข้อความนี้โดยเฉพาะ" (ไม่ใช่ผูกกับ event เหมือน replyToken)
  // เก็บไว้ใน rawMessage เพื่อให้ตอบกลับแบบอ้างข้อความนี้ได้ในอนาคต ไม่มีก็ ingest ต่อได้ตามปกติ
  const quoteToken = typeof message.quoteToken === 'string' ? message.quoteToken : undefined
  // bugfix 2026-08-10 (ลูกค้ากด reply อ้างข้อความจากแอป LINE แล้วเข้ากล่องแชทเป็นข้อความธรรมดา):
  // ส่งต่อ id ดิบจาก LINE เข้า service — service เป็นคนแปลงเป็น externalMessageId รูปแบบของเรา
  // (buildLineExternalMessageId → `LINE:${id}`) ห้ามแปลงที่ route เพราะ route ไม่รู้จักฟังก์ชันนั้น
  const quotedMessageId = typeof message.quotedMessageId === 'string' ? message.quotedMessageId : undefined

  if (message.type === 'text') {
    if (typeof message.id !== 'string' || !message.id) return null
    if (typeof message.text !== 'string') return null

    const ingested = await ingestLineTextMessage({
      shopId: params.shopId,
      shopChannelId: params.shopChannelId,
      accessToken: params.accessToken,
      externalUserId,
      lineMessageId: message.id,
      text: message.text,
      replyToken,
      eventTimestamp,
      quoteToken,
      quotedMessageId,
    })
    return ingested.conversationId ?? null
  }

  // S-7: image/video/audio/file/sticker/location — ชนิดที่ toLineInboundMediaMessage ไม่รู้จัก
  // (postback/beacon ฯลฯ) คืน null แล้วข้ามเงียบตามเดิม
  const media = toLineInboundMediaMessage(message)
  if (!media) return null

  const ingested = await ingestLineMediaMessage({
    shopId: params.shopId,
    shopChannelId: params.shopChannelId,
    accessToken: params.accessToken,
    externalUserId,
    message: media,
    replyToken,
    eventTimestamp,
    quoteToken,
    quotedMessageId,
  })
  return ingested.conversationId ?? null
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
  let channel: {
    id: string
    shopId: string
    channelSecretEnc: string | null
    accessTokenEnc: string
    lineInboundFailCount: number
  } | null
  try {
    channel = await prisma.shopChannel.findFirst({
      where: { provider: 'LINE', externalId: destination, status: 'ACTIVE' },
      select: {
        id: true,
        shopId: true,
        channelSecretEnc: true,
        accessTokenEnc: true,
        // (ส่วนขยาย 2026-08-12) อ่านมาด้วยเพื่อตัดสินว่าต้องล้างตัวนับไหมหลังลายเซ็นผ่าน —
        // ไม่งั้นทุกข้อความที่เข้ามาปกติจะกลายเป็น UPDATE เปล่าหนึ่งครั้ง
        lineInboundFailCount: true,
      },
    })
  } catch (e) {
    console.error('[line-webhook] หา ShopChannel ไม่สำเร็จ (DB)', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: true })
  }

  if (!channel || !channel.channelSecretEnc) {
    console.warn('[line-webhook] ไม่พบช่องทาง ACTIVE ของ destination นี้')
    // (ส่วนขยาย 2026-08-12 / AC-CH-13) 🛑 เส้นทางนี้ต้องนับด้วย ไม่ใช่นับแค่ลายเซ็นไม่ผ่าน —
    // "ไม่มีแถวให้ตรงกับ destination" ทำให้ข้อความหายเงียบเท่ากันทุกประการ การกั้นแค่เส้นเดียว
    // ของกฎที่เป็น OR คือการแก้ครึ่งเดียว (docs/conventions/... กฎ OR ต้องกั้นทุก operand)
    // ไม่มีแถวให้เขียน จึงเก็บเป็นตัวนับระดับ process ให้ปุ่มทดสอบอ่านได้ในหน้าต่างสั้น ๆ
    recordLineDestinationMiss()
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
    // (ส่วนขยาย 2026-08-12 / AC-CH-12) จดไว้ให้อ่านทีหลังได้ — 🛑 **ยังไม่มี write อื่น ไม่มี
    // outbound call และยังตอบ 200 เหมือนเดิม** ข้อห้ามของ TC-04 [ห้ามข้าม] คือห้าม *ingest*
    // เนื้อหาที่ยังพิสูจน์ไม่ได้ ไม่ใช่ห้ามจดว่าถูกปฏิเสธ. ตัวเขียนมี throttle ในตัวเพราะคำขอที่
    // ลายเซ็นไม่ผ่าน = คำขอที่ยังไม่ผ่านการยืนยันตัวตน ปล่อยให้เขียนรัวไม่ได้
    void recordLineInboundFailure(channel.id, 'SIGNATURE_MISMATCH')
    return NextResponse.json({ ok: true })
  }

  // ลายเซ็นผ่าน = พิสูจน์แล้วว่า channel secret ถูกต้อง ⇒ ล้างประวัติทิ้ง (AC-CH-15)
  // เช็ค > 0 ก่อนเพื่อไม่ให้ข้อความปกติทุกข้อความกลายเป็น UPDATE เปล่า
  if (channel.lineInboundFailCount > 0) {
    void clearLineInboundFailure(channel.id)
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
    // ห้องที่มี event เข้ามาใน batch นี้ — `Set` เพราะ batch เดียวมักมีหลาย event ของห้องเดียวกัน
    const touchedConversationIds = new Set<string>()

    for (const event of events) {
      try {
        const conversationId = await processLineEvent({ shopId, shopChannelId, accessToken, event })
        // เก็บ **หลัง** ingest สำเร็จเท่านั้น (ค่าที่คืนมามีก็ต่อเมื่อมีแถวลงเธรดจริง)
        if (conversationId) touchedConversationIds.add(conversationId)
      } catch (e) {
        // error ระดับไหนก็ตาม (infra หรือ logic) ห้าม throw ออกไปเปลี่ยนสถานะ HTTP ที่ตอบไปแล้ว
        // (TFR-LINE-03) — log ระดับ error ไว้ให้มี alert เพราะ LINE จะไม่ยิงซ้ำให้ (ตอบ 200 ไปแล้ว)
        console.error('[line-webhook] ingest ล้มเหลว', e instanceof Error ? e.message : e)
      }
    }

    // ── ชั้น 2 ของคิวขาออก: ระบายคิวของห้องที่เพิ่งมี event เข้ามา (CR 2026-08-23) ──
    //
    // ทำไมเกาะกับ webhook: เส้นทางคิวขาออก **ไม่มี auto-retry** (D-2) แถวที่ `after()` ของ POST
    // /messages ไม่ได้รัน (ผู้ขายกดส่งแล้วปิดแอป = อาการเดียวกับบั๊กต้นเรื่อง) จะค้าง `QUEUED`
    // จนกว่าจะมีใครมาหยิบ — และเคสที่พบบ่อยที่สุดคือ **ห้องเดียวกันนี้เอง** (ลูกค้าทักกลับมา)
    //
    // 🛑 เป็น `deliverRoom` ของห้องที่ event เข้ามา ไม่ใช่ `sweepOutbox` ทั้งระบบ: webhook ถูกยิงถี่
    // การกวาดทั้งระบบทุกใบคือการสแกนซ้ำเปล่า ๆ และไปแย่ง connection pool กับ cron ที่กวาดอยู่พอดี
    // ห้องอื่นที่ค้างเป็นหน้าที่ของ cron (ทุก 1 นาที)
    //
    // 🛑 อยู่ **ในก้อน after() เดียวกับ ingest และต่อท้ายลูป** ไม่ใช่ after() ใบใหม่: ลำดับการรัน
    // ของ after() หลายใบไม่ใช่สิ่งที่รับประกันได้ แต่ข้อกำหนดคือระบาย "หลัง ingest สำเร็จ" —
    // การต่อท้ายลูปในก้อนเดียวกันคือรูปแบบเดียวที่บังคับลำดับนั้นได้จริง
    //
    // 🛑 best-effort **กลืน error เสมอ ห้าม throw** — ก้อน after() นี้ถูกเรียกหลังตอบ 200 ไปแล้ว
    // (TFR-LINE-03) error ที่หลุดออกไปไม่ช่วยอะไรและมีแต่จะกลบสาเหตุจริง; งานคิว *ขาออก*
    // ไม่มีสิทธิ์ทำให้เส้นทาง ingest *ขาเข้า* เสียหาย
    // try/catch ครอบทั้ง await: กันทั้งกรณี reject และกรณี throw แบบ synchronous
    for (const conversationId of touchedConversationIds) {
      try {
        const drained = await deliverRoom(conversationId, 'sweep')
        if (drained > 0) console.log('[line-webhook] ระบายคิวขาออก', { conversationId, drained })
      } catch (e) {
        console.error('[line-webhook] ระบายคิวขาออกล้มเหลว', conversationId, e instanceof Error ? e.message : e)
      }
    }
  })

  return NextResponse.json({ ok: true })
}
