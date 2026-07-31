import { NextRequest, NextResponse, after } from 'next/server'
import * as v from 'valibot'
import { Prisma } from '@prisma/client'
import { timingSafeEqual } from 'crypto'
import { verifyWebhookSignature } from '@/lib/facebook/signature'
import { WebhookBodySchema, extractMessagingEvents } from '@/lib/facebook/webhook-types'
import { ingestAdReferral, ingestInboundMessage, ingestReadEvent, ingestReactionEvent } from '@/services/channel-chat.service'
import { enqueueAutoReplyJob, processPendingForConversation } from '@/services/auto-reply.service'

// Webhook ของ Messenger + Instagram (feature 00018)
//
// route นี้ถูกยกเว้นจาก CSRF Origin-check ใน proxy.ts เพราะ Meta ไม่ส่ง header Origin
// → ลายเซ็น X-Hub-Signature-256 คือ authentication เพียงอย่างเดียวของ route นี้
//
// กติกาการตอบ: ตอบ 200 ให้เร็วและเกือบทุกกรณี ยกเว้นลายเซ็นไม่ผ่าน หรือ ingest พังจาก infra
// Meta จะ retry ซ้ำเรื่อย ๆ ถ้าได้ non-200 ซึ่งทำให้ปัญหาบานปลายแทนที่จะหาย — "เกือบทุกกรณี" เพราะ
// ยังมีข้อยกเว้น: infra error (DB ต่อไม่ติด/pool เต็ม/ปิดกลางคัน) ต้องตอบ non-200 ให้ Meta retry
// เพราะข้อความไม่ได้ถูกเขียนแน่ ๆ และ retry ปลอดภัยอยู่แล้ว (externalMessageId @unique dedupe ให้)
// — ตอบ 200 ทั้งที่ DB ล่มจะทำให้ข้อความหายถาวรโดยไม่จำเป็น (I-3) ส่วน logic/data error อื่น ๆ
// retry ไปก็พังซ้ำเหมือนเดิม ไม่มีประโยชน์ → คง 200 กัน Meta ยิงรัว ๆ ไม่จบ

export const dynamic = 'force-dynamic'

// feature 00023: งานที่ทำใน after() นับรวมในอายุของ function เดียวกับ request นี้
// ไม่ประกาศ = ถูกตัดที่ค่า default ของ platform แล้วงานตอบอัตโนมัติจะหายกลางคันแบบเงียบ ๆ
export const maxDuration = 60

// (S-2) เทียบ verify_token ด้วย timingSafeEqual แทน === — impact ต่ำ (เรียกครั้งเดียวตอน setup)
// แต่ทำให้สอดคล้องกับหลักที่ประกาศไว้เองว่าลายเซ็นคือ authentication (เห็น pattern เดียวกันใน
// signature.ts) ห้าม leak ความยาว/ค่าจริงผ่าน timing side-channel แม้ risk จะน้อยก็ตาม
function verifyHandshakeToken(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided)
  const expectedBuf = Buffer.from(expected)
  // timingSafeEqual throw ถ้าความยาวไม่เท่ากัน — เช็คก่อนเพื่อคืน false แทนที่จะพัง (500)
  if (providedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(providedBuf, expectedBuf)
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  const expectedToken = process.env.FB_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && token && expectedToken && verifyHandshakeToken(token, expectedToken)) {
    // ต้องคืน challenge เป็น text เปล่า ๆ ไม่ใช่ JSON
    return new NextResponse(challenge ?? '', { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  // ต้องอ่าน raw text ไม่ใช่ .json() — ลายเซ็นคำนวณจาก byte ดิบ
  // ถ้า parse เป็น object แล้ว stringify ใหม่ ลายเซ็นจะไม่ตรง
  const rawBody = await request.text()

  if (!verifyWebhookSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    console.warn('[fb-webhook] signature ไม่ผ่าน')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  const parsed = v.safeParse(WebhookBodySchema, JSON.parse(rawBody || '{}'))
  if (!parsed.success) {
    // shape ที่เราไม่รู้จัก — ตอบ 200 เพื่อไม่ให้ retry แต่ log ไว้ดู
    console.warn('[fb-webhook] payload parse ไม่ผ่าน', parsed.issues[0]?.message)
    return NextResponse.json({ ok: true })
  }

  const provider = parsed.output.object === 'instagram' ? 'INSTAGRAM' : 'MESSENGER'

  // เธรดที่มีงานตอบอัตโนมัติรอ — ประมวลผลใน after() หลังตอบ 200 ให้ Meta แล้ว (feature 00023)
  const pendingConversationIds = new Set<string>()

  for (const { pageId, event } of extractMessagingEvents(parsed.output)) {
    try {
      if (event.read) {
        // read receipt (message_reads) — ลูกค้าอ่านข้อความของเพจ (feature 00018)
        await ingestReadEvent({
          provider,
          pageExternalId: pageId,
          contactExternalId: event.sender.id,
          watermark: event.read.watermark,
        })
      } else if (event.reaction) {
        // reaction (message_reactions) — react/unreact บนข้อความ (feature 00018 Phase 2)
        await ingestReactionEvent({
          provider,
          pageExternalId: pageId,
          mid: event.reaction.mid,
          action: event.reaction.action,
          emoji: event.reaction.emoji,
          // ส่งผู้กดกับเวลาไปด้วย — react ของ "ลูกค้า" เปิดหน้าต่าง 24 ชม. ใหม่ตามนโยบาย Meta
          reactorExternalId: event.sender.id,
          timestamp: event.timestamp,
        })
      } else {
        const ingested = await ingestInboundMessage({ provider, pageExternalId: pageId, event })

        // ที่มาจากโฆษณา (E5) — referral มา 2 ที่: ซ้อนใน message (ลูกค้ากดโฆษณาแล้วทักครั้งแรก)
        // หรือระดับ event (ลูกค้าที่มีเธรดอยู่แล้วกดโฆษณาตัวใหม่). ต้องทำ "หลัง" ingest ข้อความเสมอ
        // เพราะเธรดเพิ่งถูกสร้างในขั้นตอนนั้น
        const referral = event.message?.referral ?? event.referral
        if (referral) {
          try {
            await ingestAdReferral({
              provider,
              pageExternalId: pageId,
              // echo = ข้อความฝั่งเพจ ผู้ติดต่อคือ "อีกฝั่ง" (ตรรกะเดียวกับ ingestInboundMessage)
              contactExternalId: event.message?.is_echo ? event.recipient.id : event.sender.id,
              referral,
            })
          } catch (e) {
            // referral เป็นข้อมูลเสริม — พังแล้วต้องไม่ทำให้ Meta retry ทั้ง batch จนข้อความค้าง
            console.error('[fb-webhook] บันทึก ad referral ล้มเหลว', e instanceof Error ? e.message : e)
          }
        }

        // ตอบอัตโนมัติ (feature 00023) — ต้องอยู่ "หลัง" ingestAdReferral เสมอ
        //
        // ลำดับนี้ไม่ใช่เรื่องความสวยงามของโค้ด: เคสหลักของทั้งฟีเจอร์คือลูกค้ากดโฆษณาแล้วทัก
        // ครั้งแรก ถ้า enqueue ก่อน referral ถูกบันทึก งานจะถูกประมวลผลโดยยังไม่มี adId ในเธรด
        // แล้วเลือกกฎระดับเพจแทนระดับโฆษณา = ตอบราคาผิดรุ่น ซึ่งเป็นความเสียหายอันดับ 1 ใน PRD §6.1
        //
        // try/catch ของตัวเอง + enqueueAutoReplyJob ที่ไม่ throw (TD-008) = สองชั้น เพื่อให้แน่ใจว่า
        // เส้นทาง isInfraError -> 503 ด้านล่างยังสงวนไว้ให้ ingestInboundMessage เท่านั้น
        if (
          ingested.status === 'STORED' &&
          ingested.headMessageId &&
          ingested.conversationId &&
          ingested.shopId
        ) {
          try {
            const job = await enqueueAutoReplyJob({
              chatMessageId: ingested.headMessageId,
              conversationId: ingested.conversationId,
              shopId: ingested.shopId,
              senderRole: ingested.senderRole ?? '',
              hasCustomerText: ingested.hasCustomerText ?? false,
            })
            if (job.enqueued) pendingConversationIds.add(ingested.conversationId)
          } catch (e) {
            console.error('[fb-webhook] enqueue auto-reply ล้มเหลว', e instanceof Error ? e.message : e)
          }
        }
      }
    } catch (e) {
      console.error('[fb-webhook] ingest ล้มเหลว', e instanceof Error ? e.message : e)
      // infra error (ต่อ DB ไม่ติด/pool เต็ม/ปิดกลางคัน) — ข้อความช่วงนี้ยังไม่ถูกเขียนแน่ ๆ ต้อง
      // ให้ Meta retry ทั้ง batch ไม่งั้นข้อความหายถาวรทั้งที่ retry ปลอดภัย (I-3) หยุด loop ทันที
      // เพราะ DB ล่มแล้ว event ที่เหลือใน batch ก็ไม่มีทางสำเร็จเช่นกัน
      if (isInfraError(e)) {
        return NextResponse.json({ error: 'temporarily unavailable' }, { status: 503 })
      }
      // logic/data error อื่น ๆ — ข้อความเดียวพังต้องไม่ทำให้ทั้ง batch ตกและถูก retry ทั้งก้อน
      // (retry ไปก็พังซ้ำเหมือนเดิม ไม่มีประโยชน์)
    }
  }

  // ตอบอัตโนมัติ (feature 00023) — ทำ "หลัง" ตอบ 200 ให้ Meta แล้วเท่านั้น
  //
  // Meta รอ 200 อยู่ ถ้าเราไปเลือกกฎ + ยิง Send API ก่อนตอบ เวลาที่ Meta ต้องรอจะผูกกับจำนวน
  // event ใน batch แล้วพอช้าเกิน Meta จะส่ง batch เดิมซ้ำ ซึ่งยิ่งช้ายิ่งซ้ำเป็นวงจร (AC-022-01/02)
  //
  // callback ถูกห่อ try/catch ทั้งก้อน: งานตอบอัตโนมัติพังต้องไม่ทำให้ response ที่ส่งไปแล้ว
  // กลายเป็น error และต้องไม่ไปแตะเส้นทาง isInfraError -> 503 ด้านบนซึ่งสงวนไว้ให้ ingest เท่านั้น
  if (pendingConversationIds.size > 0) {
    after(async () => {
      for (const conversationId of pendingConversationIds) {
        try {
          await processPendingForConversation(conversationId)
        } catch (e) {
          console.error('[fb-webhook] auto-reply ล้มเหลว', conversationId, e instanceof Error ? e.message : e)
        }
      }
    })
  }

  return NextResponse.json({ ok: true })
}

// แยก error สอง "รส" ตอน ingest พัง (I-3): connection-level (infra) vs query/logic-level
// - PrismaClientInitializationError / PrismaClientRustPanicError / PrismaClientUnknownRequestError
//   = connect ไม่ได้ตั้งแต่แรก หรือ error ที่ Prisma engine เองก็ไม่รู้จัก มักเป็นปัญหา infra
// - PrismaClientKnownRequestError โค้ด P1xxx = connection-level (ต่อ DB ไม่ติด/timeout/ปิดกลางคัน)
//   ต่างจาก P2xxx ที่เป็น query/constraint error (เช่น P2002 ที่ service ชั้นในจัดการเป็น
//   DUPLICATE ไปแล้ว — ไม่หลุดมาถึงตรงนี้)
function isInfraError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientInitializationError) return true
  if (e instanceof Prisma.PrismaClientRustPanicError) return true
  if (e instanceof Prisma.PrismaClientUnknownRequestError) return true
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code.startsWith('P1')) return true
  return false
}
