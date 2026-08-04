import { NextRequest, NextResponse, after } from 'next/server'
import * as v from 'valibot'
import { Prisma } from '@prisma/client'
import { timingSafeEqual } from 'crypto'
import { verifyWebhookSignature } from '@/lib/facebook/signature'
import { WebhookBodySchema, extractMessagingEventsWithRaw, extractFeedChanges } from '@/lib/facebook/webhook-types'
import { ingestAdReferral, ingestInboundMessage, ingestReadEvent, ingestReactionEvent, ingestMessageEdit } from '@/services/channel-chat.service'
import { enqueueAutoReplyJob, processPendingForConversation } from '@/services/auto-reply.service'
import { pushNewChatMessage } from '@/services/seller-push.service'
import { ingestFeedComment } from '@/services/page-comment.service'

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

  // ชั่วคราว (2026-08-03) — สืบว่า Meta ส่ง message_edits มาในรูปแบบไหนกันแน่
  //
  // ทำไมต้อง log "ก่อน" parse: Valibot ตัด field ที่เราไม่ได้ประกาศทิ้งทั้งหมด และ rawMessage
  // ที่เราเก็บลงฐานก็คือ payload **หลัง** parse แล้ว — field แปลกหน้าที่ Meta ส่งมาจึงมองไม่เห็น
  // จากทั้ง log และฐาน (พบ 2026-08-03 ตอนไล่ว่าทำไมแก้ข้อความแล้วเธรดไม่ขยับ)
  //
  // log เฉพาะ "ชื่อ field" ไม่แตะเนื้อหา — พอบอกได้ว่า event ที่เข้ามามีอะไรบ้างจริง ๆ
  // ถอดออกเมื่อได้คำตอบแล้ว
  const rawJson: unknown = (() => {
    try {
      return JSON.parse(rawBody || '{}')
    } catch {
      return {}
    }
  })()

  try {
    const probe = rawJson as {
      entry?: Array<{ messaging?: Array<Record<string, unknown>>; changes?: Array<{ field?: string }> }>
    }
    for (const e of probe.entry ?? []) {
      for (const ev of e.messaging ?? []) {
        const msg = (ev.message ?? {}) as Record<string, unknown>
        console.log('[fb-raw-evt]', JSON.stringify({ evt: Object.keys(ev), msg: Object.keys(msg) }))
      }
      for (const c of e.changes ?? []) console.log('[fb-raw-chg]', c.field)
    }
  } catch {
    // probe เท่านั้น — พังก็ปล่อยผ่าน ห้ามทำให้ webhook ล้ม
  }

  const parsed = v.safeParse(WebhookBodySchema, rawJson)
  if (!parsed.success) {
    // shape ที่เราไม่รู้จัก — ตอบ 200 เพื่อไม่ให้ retry แต่ log ไว้ดู
    console.warn('[fb-webhook] payload parse ไม่ผ่าน', parsed.issues[0]?.message)
    return NextResponse.json({ ok: true })
  }

  const provider = parsed.output.object === 'instagram' ? 'INSTAGRAM' : 'MESSENGER'

  // เธรดที่มีงานตอบอัตโนมัติรอ — ประมวลผลใน after() หลังตอบ 200 ให้ Meta แล้ว (feature 00023)
  const pendingConversationIds = new Set<string>()

  // ── feed: คอมเมนต์/โพสต์บนหน้าเพจ (user สั่ง 2026-08-03 "อยากรับ facebook comment") ──
  //
  // ชั่วคราว — ยังไม่มีโมเดลเก็บคอมเมนต์ (รอ PRD/BRD ตาม Hard Rule 11) ระยะนี้แค่ log
  // โครง payload จริงไว้ออกแบบต่อ แล้วค่อยถอด log ออกเมื่อมีที่เก็บจริง
  //
  // ตัดข้อความเหลือ 80 ตัวอักษรก่อน log: เนื้อคอมเมนต์เป็นข้อมูลของลูกค้า ไม่ควรไหลเข้า log
  // เต็ม ๆ — เท่านี้พอตอบคำถามที่ต้องรู้ (ภาษาไทยมาครบไหม, Meta ให้ชื่อคนคอมเมนต์หรือเปล่า)
  for (const { pageId, change } of extractFeedChanges(parsed.output)) {
    const val = change.value ?? {}
    // เก็บคอมเมนต์ลงฐานจริง (feature 00029) — ไม่ throw: webhook ต้องตอบ 200 เสมอ
    if (val.item === 'comment') {
      await ingestFeedComment({ pageExternalId: pageId, change, rawChange: change }).catch((e) =>
        console.error('[fb-feed] เก็บคอมเมนต์ไม่สำเร็จ', e instanceof Error ? e.message : e),
      )
    }
    console.log(
      '[fb-feed]',
      JSON.stringify({
        pageId,
        item: val.item,
        verb: val.verb,
        commentId: val.comment_id,
        postId: val.post_id,
        parentId: val.parent_id,
        fromId: val.from?.id,
        fromName: val.from?.name,
        hasPhoto: !!val.photo,
        hasVideo: !!val.video,
        msgLen: val.message?.length ?? 0,
        msgHead: val.message?.slice(0, 80),
      }),
    )
  }

  for (const { pageId, event, rawEvent } of extractMessagingEventsWithRaw(parsed.output, rawJson)) {
    try {
      if (event.read) {
        // read receipt (message_reads) — ลูกค้าอ่านข้อความของเพจ (feature 00018)
        await ingestReadEvent({
          provider,
          pageExternalId: pageId,
          contactExternalId: event.sender.id,
          watermark: event.read.watermark,
        })
      } else if (event.message_edit) {
        // ลูกค้าแก้ข้อความที่ส่งไปแล้ว (message_edits) — ต้องอัปเดตเนื้อความฝั่งเราตาม
        // ไม่งั้นร้านอ่าน "เวอร์ชันก่อนแก้" ไปทำงานต่อ ทั้งที่ลูกค้าเห็นของใหม่แล้ว
        await ingestMessageEdit({
          provider,
          pageExternalId: pageId,
          mid: event.message_edit.mid,
          text: event.message_edit.text,
          numEdit: event.message_edit.num_edit,
          timestamp: event.timestamp,
        })
      } else if (event.reaction) {
        // reaction (message_reactions) — react/unreact บนข้อความ (feature 00018 Phase 2)
        await ingestReactionEvent({
          provider,
          pageExternalId: pageId,
          mid: event.reaction.mid,
          action: event.reaction.action,
          emoji: event.reaction.emoji,
          // ชื่อเชิงความหมาย ("love"/"like"/…) — ทางสำรองเมื่อ payload ไม่มี emoji (echo ของฝั่งเพจ)
          reactionName: event.reaction.reaction,
          // ส่งผู้กดกับเวลาไปด้วย — react ของ "ลูกค้า" เปิดหน้าต่าง 24 ชม. ใหม่ตามนโยบาย Meta
          reactorExternalId: event.sender.id,
          timestamp: event.timestamp,
        })
      } else {
        const ingested = await ingestInboundMessage({ provider, pageExternalId: pageId, event, rawEvent })

        // NO_CHANNEL = Meta ส่งข้อความของเพจที่ไม่มีร้านไหนในฐานเราเชื่อมอยู่ (หรือถอดไปแล้ว)
        // — subscription อยู่ฝั่ง Meta ไม่ได้อยู่ในฐานเรา เพจที่ยัง subscribe ค้างจึงยิงเข้ามาต่อ
        // ได้เรื่อย ๆ แล้วถูกทิ้งที่ ingestInboundMessage (ตอบ 200 กัน Meta retry ไม่จบ)
        //
        // ทำไมต้อง log: ก่อนหน้านี้เคสนี้ตกพื้นเงียบสนิท ไม่มีตัวนับสักตัว จึงไม่มีใครรู้ว่ามีเพจ
        // ค้างอยู่กี่เพจ/ข้อความหายไปเท่าไหร่ — และการ "รับมาแล้วทิ้ง" ยังนับว่าเราแตะข้อมูล
        // บทสนทนาที่ร้านเลิกอนุญาตแล้ว ซึ่งเป็นข้อที่ Meta ตรวจตอนรีวิว pages_manage_metadata
        // (เหตุผลเดียวกับที่ unsubscribePageFromApp มีอยู่ — ดู lib/facebook/graph.ts)
        //
        // เก็บแค่ provider + page id: พอสำหรับตามว่าต้องให้ร้านไหนกลับมาเชื่อมเพจใหม่ และไม่แตะ
        // เนื้อหา/ตัวตนลูกค้าของเพจที่เราไม่มีสิทธิ์เก็บอยู่แล้ว
        if (ingested.status === 'NO_CHANNEL') {
          console.warn('[fb-webhook] NO_CHANNEL — เพจไม่มีร้านเชื่อม ข้อความถูกทิ้ง', { provider, pageId })
        }

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
              // referral ที่ไม่ใช่ echo = ลูกค้าเป็นคนคลิกโฆษณา/ปุ่ม CTA/ลิงก์ m.me เอง ซึ่งเปิด
              // หน้าต่าง 24 ชม. ตามนโยบาย Meta เท่ากับการส่งข้อความ (user report 2026-08-02:
              // ลูกค้าเก่ากดโฆษณาตัวใหม่แล้วไม่พิมพ์ ระบบขึ้นว่าหมดเวลาทั้งที่ Meta ให้ตอบได้)
              // echo = เพจเป็นฝ่ายส่ง ไม่ใช่ action ของลูกค้า → ไม่ส่งเวลาไป = ไม่แตะหน้าต่าง
              // fallback Date.now(): timestamp เป็น optional ใน schema แต่ถ้าเป็น action ของลูกค้า
              // จริง หน้าต่างต้องเปิด การปล่อยให้ตกเพราะฟิลด์หายคือกลับไปเป็นบั๊กเดิม
              customerActionAt: event.message?.is_echo ? undefined : (event.timestamp ?? Date.now()),
            })
          } catch (e) {
            // referral เป็นข้อมูลเสริม — พังแล้วต้องไม่ทำให้ Meta retry ทั้ง batch จนข้อความค้าง
            console.error('[fb-webhook] บันทึก ad referral ล้มเหลว', e instanceof Error ? e.message : e)
          }
        }

        // Push notification เข้าแอปผู้ขาย — เฉพาะข้อความที่ "ลูกค้า" ส่งเข้ามาจริง
        //
        // senderRole !== 'BUYER' ถูกตัดออกด้วยเหตุผลตรง ๆ: echo ของข้อความที่เพจส่งเอง (รวมถึงที่
        // DeepBot ตอบอัตโนมัติ) ก็วิ่งผ่าน webhook เส้นเดียวกันนี้ ถ้าไม่กรอง ผู้ขายจะได้ noti
        // จากข้อความของตัวเอง — น่ารำคาญจนต้องปิด noti ทิ้ง
        //
        // after(): ยิงหลังตอบ 200 ให้ Meta แล้ว — Meta วัด latency ของ webhook และ retry ทั้ง batch
        // ถ้าช้า/พัง; งาน push ไม่ควรมีสิทธิ์ทำให้ข้อความลูกค้าค้าง (เหตุผลเดียวกับที่ไฟล์นี้ห่อ
        // ingestAdReferral ด้วย try/catch ของตัวเอง). ตัว service เองก็กลืน error อีกชั้นหนึ่ง
        if (ingested.status === 'STORED' && ingested.shopId && ingested.conversationId && ingested.senderRole === 'BUYER') {
          const { shopId, conversationId } = ingested
          after(() => pushNewChatMessage({ shopId, conversationId }))
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
