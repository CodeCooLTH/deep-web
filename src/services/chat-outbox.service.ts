/**
 * chat-outbox.service — วงจรชีวิตของแถวคิวส่งข้อความขาออกฝั่งผู้ขาย
 * (CR 2026-08-23 ของ feature 00018 — `EXTENSIONS-2026-08-23-outbound-queue.md`)
 *
 * ไฟล์นี้คือ **ที่เดียวที่เขียน `deliveryStatus` ของเส้นทางคิว** — เขียนแถวเป็น `QUEUED` ก่อนตอบ
 * client (`enqueueOutbound`) แล้วยิงออกช่องทางทีหลัง **ครั้งเดียวต่อแถว ไม่มี auto-retry** (D-2)
 *
 * 🛑 กฎที่ห้ามผ่อนเด็ดขาด: `sendLockedAt IS NULL` คือเกณฑ์ความปลอดภัยเดียวของทั้งฟีเจอร์ (D-6/E-1)
 * Meta ไม่มี idempotency key ⇒ ยิงแถวที่ "เคยเริ่มยิง" ซ้ำ = ลูกค้าได้ 2 ข้อความ ซึ่งผู้ขายแก้ไม่ได้
 * และลูกค้าเห็น. การ claim จึงต้องเป็น conditional `updateMany` แล้วเช็ค `count` ทุกครั้ง —
 * `count === 0` แปลว่าแพ้ race **จบทันที ห้ามยิง**
 */

import { Prisma, type ChatMessage } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildLineExternalMessageId } from '@/lib/channels/line-adapter'
import { APPOINTMENT_CARD_PREVIEW } from '@/lib/appointment-summary'
import {
  headOfRoom,
  isStaleClaim,
  UNCERTAIN_SEND_REASON,
  type ClaimOwner,
  type QueueRow,
} from '@/lib/chat-send-queue'
import {
  resolveOutboundContext,
  transmitOutbound,
  mirrorRemoteImage,
  toRawMessage,
  stickerMirrorFailedText,
  buildLineStickerImageUrl,
  isUniqueViolationOn,
  type SendOutboundParams,
} from '@/services/channel-chat.service'
import { pauseForHumanTakeover } from '@/services/auto-reply-takeover.service'

/** แถวที่คืนออกไปให้ผู้เรียก — `rawMessage` ถูก global omit ที่ `src/lib/prisma.ts` */
type OutboxMessageRow = Omit<ChatMessage, 'rawMessage'>

/** แถวคิวเท่าที่ deliver ต้องใช้ (ซุปเปอร์เซ็ตของ `QueueRow` + คอลัมน์เจตนาการส่ง) */
type ClaimableRow = QueueRow & { sendPayload: Prisma.JsonValue | null }

const CLAIM_SELECT = {
  id: true,
  conversationId: true,
  createdAt: true,
  deliveryStatus: true,
  sendLockedAt: true,
  sendPayload: true,
} as const

// ══════════════════════════════════════════════════════════════════════════
// enqueueOutbound — เขียนแถว QUEUED (ตรรกะประกอบแถวยกมาจาก `sendOutboundMessage` ทั้งดุ้น)
// ══════════════════════════════════════════════════════════════════════════

/**
 * ทำไมเก็บ **params ทั้งก้อน** ลง `sendPayload` ไม่ใช่เฉพาะ sticker/template/flex ตามที่สคีมาเขียนไว้:
 *
 * `text` ของ **การ์ดออเดอร์/การ์ดสินค้า** คือข้อความลิงก์ที่ยิงให้ลูกค้าจริง แต่แถวเก็บ `body = null`
 * โดยตั้งใจ (กันบับเบิลซ้อน) ⇒ **ไม่มีคอลัมน์ไหนเก็บมันไว้เลย** ถ้าไม่พกไปกับ payload ตัวยิงจะส่ง
 * ข้อความเปล่าออกไป และไม่มี tsc/เทสตัวไหนฟ้อง (ค่าเป็น `''` ที่ถูกชนิดทุกประการ)
 *
 * และการ "ประกอบ params กลับจากคอลัมน์" คือการสร้างนิยามที่สองของ *เจตนาการส่ง* ซึ่งต้องตรงกับ
 * ตัวประกอบแถวตลอดกาล = HR16 รอเกิด — เก็บของจริงไว้ทั้งก้อนถูกกว่าและตายตัวกว่า
 */
function toSendPayload(params: SendOutboundParams): Prisma.InputJsonValue {
  // JSON round-trip ก่อน — ตัด undefined/ค่าที่ Prisma รับไม่ได้ออก และยืนยันว่า serialize ได้จริง
  return JSON.parse(JSON.stringify(params)) as Prisma.InputJsonValue
}

export async function enqueueOutbound(params: SendOutboundParams): Promise<OutboxMessageRow> {
  // ด่านเดิมทุกตัว (CONVERSATION_NOT_FOUND / NOT_EXTERNAL_CHANNEL / FORBIDDEN / INVALID_ACTOR)
  // ยังอยู่ใน POST เหมือนเดิม (D-5) — ผู้ขายต้องได้คำเตือนตอนกดส่ง ไม่ใช่ไปรู้ทีหลังจากหลังบ้าน
  const conversation = await resolveOutboundContext(params)

  /**
   * (R-21) ด่านที่ **ตรวจล่วงหน้าได้จริง** ต้องอยู่ใน POST ไม่ใช่รอไปล้มหลังบ้าน (D-5)
   *
   * ก่อนหน้านี้ทั้งสองเงื่อนไขนี้ถูกตรวจใน `transmit*` ⇒ พอการยิงย้ายไปหลังบ้าน ผู้ขายที่กดส่งใน
   * ห้องของเพจที่ถูกถอดการเชื่อมต่อไปแล้ว จะได้ 202 "เข้าคิวแล้ว" แล้วอีกครู่บับเบิลกลายเป็นแดง
   * ทั้งที่เรารู้ตั้งแต่วินาทีที่กดว่าไม่มีทางผ่าน
   *
   * 🛑 ห้ามย้ายเข้า `resolveOutboundContext` — `sendOutboundMessage` (auto-reply / rich-menu) ใช้
   * ตัวนั้นร่วมกันอยู่ การเติมด่านที่นั่นคือการเปลี่ยนลำดับ error ของเส้นทางนอกขอบเขต
   *
   * 🛑 เช็ค **ตามช่องทาง** ให้ตรงกับด่านเดิมของช่องทางนั้นเป๊ะ ไม่ใช่เช็คทั้งคู่ทุกช่องทาง:
   *   LINE  → `CONTACT_BLOCKED` มาก่อน `CHANNEL_NOT_ACTIVE` (`channel-chat.service.ts:3213,3216`)
   *   Meta  → `CHANNEL_NOT_ACTIVE` อย่างเดียว (`:3493`) **ไม่มีด่าน isBlocked**
   * เพราะ `ExternalContact.isBlocked` มีผู้เขียนคือ LINE เท่านั้น (BR-LINE-15 — ยืนยันด้วย
   * `rg isBlocked src/`: ผู้เขียน 2 จุดอยู่ในกิ่ง LINE ทั้งคู่ และหน้าเธรดก็อ่านมันใต้เงื่อนไข
   * `channel === 'LINE'`) ⇒ เอาไปกั้น Meta ด้วย = ด่านใหม่ที่ไม่เคยมี บนธงที่ฝั่ง Meta ไม่เคยตั้ง
   * และถ้อยคำของ `CONTACT_BLOCKED` ก็พูดถึง "LINE OA" ตรงตัว
   */
  if (conversation.channel === 'LINE' && conversation.externalContact.isBlocked) {
    throw new Error('CONTACT_BLOCKED')
  }
  if (conversation.shopChannel.status !== 'ACTIVE') throw new Error('CHANNEL_NOT_ACTIVE')

  // ── ตั้งแต่บรรทัดนี้ลงไปคือตรรกะประกอบแถวที่ **ยกมาจาก `sendOutboundMessage` ทั้งดุ้น** ──
  // รวม 2 ทางเข้าเป็นตัวแปรเดียว — imageFileId (auto-reply เดิม) กับ attachment (composer ใหม่)
  const attachment =
    params.attachment ??
    (params.imageFileId ? { fileId: params.imageFileId, kind: 'IMAGE' as const, name: null, size: null } : null)
  const bodyText = params.text ?? ''
  const isOrder = !!params.orderRefToken
  // การ์ดสินค้า — ใบเดียว (productRefId) หรือหลายใบ (productRefIds) ต้องตัดสินด้วยเกณฑ์เดียว
  const isProductCard = !!params.productRefId || (params.productRefIds?.length ?? 0) > 0

  /**
   * สติกเกอร์ mirror ตั้งแต่ตอนเข้าคิว (ไม่ใช่ตอนยิง) เพราะบับเบิลของผู้ขายต้องมีรูปทันทีที่แถวเกิด
   *
   * 🛑 หนี้ที่รู้ตัว (KG-OQ-STICKER): เส้นทางเดิมของ Meta มีทางกู้ชั้นที่สอง — mirror รอบแรกล้ม
   * (URL ของ Sticker Catalog หมดอายุ ~4 วัน) แล้วถาม Graph ด้วย `mid` เพื่อขอ URL สดมา mirror ใหม่
   * เส้นทางคิว **ทำไม่ได้ตรงนี้** เพราะยังไม่มี mid (ยังไม่ยิง) และตัวช่วยที่ต้องใช้
   * (`getAdapter`/`decryptToken` context) เป็นของภายใน `channel-chat.service` ⇒ เคสนี้ตกไปที่
   * `stickerMirrorFailedText` (บับเบิลมีคำบอกให้ไปเปิดดูในแอปต้นทาง) แทนที่จะได้รูป — ยังส่งถึง
   * ลูกค้าถูกต้องทุกกรณี เสียแค่รูปฝั่งผู้ขาย. ห้ามปล่อยว่างทั้ง body และ imageUrl เด็ดขาด
   */
  let stickerFileId: string | null = null
  if (params.sticker) {
    stickerFileId =
      conversation.channel === 'LINE'
        ? // LINE ประกอบ URL เองจาก stickerId ล้วน ๆ (ไม่เชื่อค่าที่ client ส่งมา — กัน SSRF)
          await mirrorRemoteImage(buildLineStickerImageUrl(params.sticker.id), {
            shopId: conversation.shopId,
            filenamePrefix: 'line-sticker',
          })
        : await mirrorRemoteImage(params.sticker.imageUrl, { shopId: conversation.shopId })
    if (!stickerFileId) {
      console.warn('[chat-outbox] mirror สติกเกอร์ไม่ผ่านตอนเข้าคิว', {
        stickerId: params.sticker.id,
        channel: conversation.channel,
      })
    }
  }

  const preview = isOrder
    ? // การ์ดสรุปนัดใช้ `type='ORDER'` ร่วมกับการ์ดออเดอร์ — แต่ "[คำสั่งซื้อ]" กับใบยืนยันนัด
      // ของร้านคิวงานคือคำผิดเรื่อง (คำมาจาก SSOT เดียว ห้ามพิมพ์เอง — HR16)
      params.isAppointmentCard
      ? APPOINTMENT_CARD_PREVIEW
      : '[คำสั่งซื้อ]'
    : params.sticker
      ? '[สติกเกอร์]'
      : attachment
        ? attachment.kind === 'IMAGE'
          ? '[รูปภาพ]'
          : attachment.kind === 'VIDEO'
            ? '[วิดีโอ]'
            : attachment.kind === 'AUDIO'
              ? '[ข้อความเสียง]'
              : `[ไฟล์] ${attachment.name ?? ''}`.trim()
        : bodyText.slice(0, 100)

  // create + อัปเดต snapshot ต้องอยู่ในทรานแซกชันเดียวกันเสมอ — invariant M-2 ที่ประกาศไว้เองใน
  // prisma/schema.prisma:933
  //
  // ไม่มี catch P2002 บน externalMessageId เหมือนเส้นทางเดิม เพราะแถวคิวเขียน `externalMessageId`
  // เป็น null ตั้งแต่ต้น จึงไม่มีทางชนกับ echo ที่ตอนนี้ยังไม่เกิด (mid เขียนตอน deliver แทน)
  return await prisma.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderUserId: params.actorUserId,
        senderRole: 'SHOP',
        type: isOrder ? 'ORDER' : isProductCard ? 'PRODUCT' : params.sticker ? 'IMAGE' : (attachment?.kind ?? 'TEXT'),
        // 🛑 การ์ดสรุปนัดเก็บ `body` จริง ต่างจากการ์ดออเดอร์/สินค้า (2026-08-12) — ตัวเรนเดอร์
        // แตกที่ `type === 'ORDER'` ก่อนเสมอ body จึงไม่มีทางโผล่เป็นบับเบิลที่สอง และสิ่งที่ได้
        // กลับมาคือร้านค้นหาข้อความที่ตัวเองส่งเจอ
        body:
          (isOrder && !params.isAppointmentCard) || isProductCard || attachment
            ? null
            : params.sticker
              ? stickerFileId
                ? null
                : stickerMirrorFailedText(conversation.channel)
              : bodyText,
        imageUrl: stickerFileId ?? attachment?.fileId ?? null,
        attachmentName: attachment?.name ?? null,
        attachmentSize: attachment?.size ?? null,
        orderRefToken: isOrder ? params.orderRefToken! : null,
        productRefId: params.productRefId ?? null,
        productRefIds: params.productRefIds ?? [],
        replyToMid: params.replyToMid ?? null,
        autoReplyKind: params.autoReplyKind ?? null,

        // ── 3 ฟิลด์ที่ต่างจากเส้นทางเดิม (ที่เหลือเหมือนกันทุกบรรทัด) ──
        deliveryStatus: 'QUEUED',
        externalMessageId: null,
        sendPayload: toSendPayload(params),
        // `sendMethod` (LINE) และ `rawMessage` ยังไม่รู้จนกว่าจะยิงจริง — เขียนตอน deliver
      },
    })

    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: created.createdAt, lastMessagePreview: preview, lastSenderRole: 'SHOP' },
    })

    return created
  })
}

// ══════════════════════════════════════════════════════════════════════════
// deliverRoom — claim หัวคิวของห้องหนึ่ง แล้วยิงครั้งเดียว
// ══════════════════════════════════════════════════════════════════════════

type DeliverOutcome = 'NONE' | 'SENT' | 'FAILED'

/**
 * E-7: `sendPayload` ที่อ่านไม่ออก (แถวค้างจาก deploy คนละ shape) ต้องปิดแถวเป็น FAILED
 * **ห้าม throw ทั้ง worker** ไม่งั้นแถวเดียวที่เพี้ยนจะฆ่าการกวาดของทุกห้องที่เหลือในรอบนั้น
 */
function parseSendPayload(value: Prisma.JsonValue | null, conversationId: string): SendOutboundParams | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  return {
    ...raw,
    // ปักหมุดจากแถวจริงเสมอ ไม่เชื่อค่าใน payload — แถวอยู่ห้องไหนคือความจริงของ DB
    conversationId,
    // `actorUserId` เป็นฟิลด์บังคับของ SendOutboundParams และมีผลกับตัวยิงจริง
    // (`sentByHuman = actorUserId !== null && !autoReplyKind` → HUMAN_AGENT tag)
    actorUserId: typeof raw.actorUserId === 'string' ? raw.actorUserId : null,
  } as SendOutboundParams
}

async function closeRow(id: string, data: Prisma.ChatMessageUpdateInput): Promise<void> {
  try {
    await prisma.chatMessage.update({ where: { id }, data })
  } catch (e) {
    /**
     * echo ของ Meta ชิงเขียน mid เดียวกันลง DB ไปก่อน (E-17) — ข้อความ **ส่งสำเร็จจริง** แล้ว
     * ถ้าปล่อยให้ throw แถวนี้จะค้าง QUEUED จนถูกกวาดเป็น "ไม่แน่ใจว่าส่งไปหรือยัง" ทั้งที่รู้แน่
     * ว่าส่งแล้ว = เชิญให้ผู้ขายกดส่งซ้ำ ซึ่งเป็นวิธีเดียวที่จะเกิดข้อความซ้ำในดีไซน์นี้
     * ⇒ เขียนสถานะซ้ำโดย **ไม่แตะ `externalMessageId`** (mid ตัวนั้นเป็นของแถว echo ไปแล้ว)
     */
    if (isUniqueViolationOn(e, 'externalMessageId')) {
      const { externalMessageId: _dropped, ...rest } = data
      await prisma.chatMessage.update({ where: { id }, data: rest })
      return
    }
    throw e
  }
}

async function deliverHead(conversationId: string, owner: ClaimOwner): Promise<DeliverOutcome> {
  const rows = (await prisma.chatMessage.findMany({
    where: { conversationId, deliveryStatus: 'QUEUED' },
    select: CLAIM_SELECT,
    orderBy: { createdAt: 'asc' },
  })) as ClaimableRow[]

  // 🛑 `headOfRoom` คืน null เมื่อใบเก่าสุด **ถูก claim ไปแล้ว** โดยตั้งใจ — ห้ามข้ามไปทำใบถัดไป
  // ไม่งั้นลูกค้าอ่านข้อความสลับลำดับกับที่ร้านพิมพ์ (D-3). ใช้ `rows[0]` แทนไม่ได้เด็ดขาด
  const head = headOfRoom(rows)
  if (!head) return 'NONE'
  const row = rows.find((r) => r.id === head.id)!

  // 🛑 conditional claim — `sendLockedAt: null` ใน where คือสิ่งเดียวที่กันข้อความซ้ำ (D-6)
  const claim = await prisma.chatMessage.updateMany({
    where: { id: row.id, sendLockedAt: null },
    data: { sendLockedAt: new Date(), sendLockedBy: owner },
  })
  // count === 0 = มีคนอื่นชิงไปแล้ว **จบทันที ห้ามยิง** (ไม่รู้ว่าเขายิงไปหรือยัง)
  if (claim.count === 0) return 'NONE'

  const params = parseSendPayload(row.sendPayload, conversationId)
  if (!params) {
    await closeRow(row.id, {
      deliveryStatus: 'FAILED',
      failureReason: 'อ่านเจตนาการส่งของข้อความนี้ไม่ออก (sendPayload เสียหาย) — กดส่งใหม่อีกครั้ง',
      sendPayload: Prisma.DbNull,
    })
    return 'FAILED'
  }

  let conversation
  try {
    conversation = await resolveOutboundContext(params)
  } catch (e) {
    // เพจถูกถอด / เธรดหาย / สิทธิ์หาย ระหว่างอยู่ในคิว (E-5) — ปิดแถวพร้อมเหตุผลดิบ
    // ห้ามปล่อยค้าง: แถวที่ claim แล้วไม่มีใครมาปิดจะถูกกวาดเป็น "ไม่แน่ใจ" ทั้งที่รู้ว่าไม่เคยยิง
    await closeRow(row.id, {
      deliveryStatus: 'FAILED',
      failureReason: e instanceof Error ? e.message : String(e),
      sendPayload: Prisma.DbNull,
    })
    return 'FAILED'
  }

  let result
  try {
    // 🛑 ยิง **ครั้งเดียว** — ไม่มี retry loop ไม่มี backoff ในไฟล์นี้ทั้งไฟล์ (D-2)
    result = await transmitOutbound(conversation, params)
  } catch (e) {
    await closeRow(row.id, {
      deliveryStatus: 'FAILED',
      failureReason: e instanceof Error ? e.message : String(e),
      sendPayload: Prisma.DbNull,
    })
    return 'FAILED'
  }

  const { externalMessageId: mid, outboundResponse, failureReason, sendMethod } = result

  if (failureReason) {
    await closeRow(row.id, {
      deliveryStatus: 'FAILED',
      failureReason,
      sendMethod,
      sendPayload: Prisma.DbNull,
      rawMessage: toRawMessage(conversation.channel, outboundResponse, 'outbound-response'),
    })
    return 'FAILED'
  }

  await closeRow(row.id, {
    deliveryStatus: 'SENT',
    // 🛑 R-13: LINE คืน **mid ดิบ** — ต้องผ่าน `buildLineExternalMessageId()` ก่อนเขียน DB เสมอ
    // ไม่งั้น mid ที่ไม่มี prefix จะไม่ชนกับ echo ที่มี prefix ⇒ ข้อความเดียวขึ้นสองบับเบิล
    // และ `replyToMid` ของ quote จะหาต้นทางไม่เจอ — ไม่มี error ให้ใครเห็นสักบรรทัด
    externalMessageId: mid ? (conversation.channel === 'LINE' ? buildLineExternalMessageId(mid) : mid) : null,
    failureReason: null,
    sendMethod,
    sendPayload: Prisma.DbNull,
    rawMessage: toRawMessage(conversation.channel, outboundResponse, 'outbound-response'),
    // 🛑 ห้ามเคลียร์ `sendLockedBy` — บนแถว SENT มันคือคำตอบว่า "ใครส่งสำเร็จ" (after/sweep/cron)
    // ซึ่งเป็นตัววัดที่บอกว่าบั๊กต้นเรื่อง (คำขอตายกลางทาง) เกิดจริงกี่ครั้ง (spec §9)
  })

  // D-7: บอทหลบเมื่อ "คนส่งสำเร็จ" เท่านั้น — ไม่ย้ายมาตอนเข้าคิว และไม่ทำเมื่อบอทเป็นผู้ส่งเอง
  if (!params.autoReplyKind) {
    await pauseForHumanTakeover(conversationId, conversation.shopId)
  }
  return 'SENT'
}

/**
 * เพดานรอบต่อการเรียก `deliverRoom` หนึ่งครั้ง — กันงานไม่รู้จบใน invocation เดียว
 *
 * ครบเพดานแล้วยังมีของค้าง = จบไปเฉย ๆ ตัวกวาด (`sweepOutbox`) รับช่วงต่อในรอบถัดไป
 * ตัวเลขจริงบน prod 14 วัน: สูงสุด 28 ข้อความ/นาที ทั้งระบบ · p99 = 13 ⇒ 20 ต่อ *ห้อง*
 * กว้างกว่าการใช้งานจริงมาก ไม่ได้ตั้งไว้เผื่อ throughput
 */
const MAX_DELIVER_ROUNDS = 20

/**
 * ระบายคิวของห้องหนึ่งจนหมด (หรือจนครบเพดานรอบ) — **ไม่ใช่ทำใบเดียวแล้วจบ**
 *
 * 🛑 ทำไมต้องวน: `after()` ของใบที่ 2 จะเห็นหัวคิว (ใบที่ 1) ถูก claim อยู่ ⇒ `headOfRoom` คืน null
 * ⇒ มันจบโดยไม่ทำอะไรเลย แล้วใบที่ 2 จะค้างจนตัวกวาดรอบถัดไปมา (นานได้ถึงหนึ่งนาที) —
 * เกิดที่ทุกปริมาณการใช้งาน ไม่ใช่แค่ตอนคนใช้เยอะ (แค่ผู้ขายพิมพ์รัว 2 ใบก็เจอ)
 *
 * 🛑 ต้อง **อ่านแถวใหม่ทุกรอบ** (อยู่ใน `deliverHead`) ไม่ใช่ใช้ก้อนที่ดึงมาตอนแรก — ระหว่างที่
 * ยิงใบ 1 อยู่ ผู้ขายอาจพิมพ์ใบ 4 เข้ามาแล้ว
 *
 * 🛑 แพ้ race = **ออกจากลูปทันที** ไม่ใช่ข้ามไปทำใบถัดไป: มี worker อื่นกำลังระบายห้องนี้อยู่
 * ปล่อยให้มันทำต่อ. ข้ามไปทำใบถัดไป = ลูกค้าอ่านสลับลำดับกับที่ร้านพิมพ์ (ผิด D-3 ตรงตัว)
 * — `deliverHead` คืน 'NONE' ทั้งกรณี "ไม่มีหัวคิว" และ "แพ้ race" ซึ่งทั้งคู่ต้องหยุดเหมือนกัน
 *
 * 🛑 ใบที่จบเป็น FAILED **ไม่บล็อกใบถัดไป** โดยตั้งใจ — มันไม่ใช่ `QUEUED` แล้ว `headOfRoom`
 * รอบถัดไปจึงคืนใบถัดไปเอง (ข้อความที่ส่งไม่ผ่านขึ้นบับเบิลแดงให้เห็น ไม่ควรขังทั้งห้องตลอดกาล)
 * ห้ามเพิ่มเงื่อนไขหยุดลูปเมื่อเจอ FAILED
 */
async function drainRoom(
  conversationId: string,
  owner: ClaimOwner,
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0
  for (let round = 0; round < MAX_DELIVER_ROUNDS; round += 1) {
    const outcome = await deliverHead(conversationId, owner)
    if (outcome === 'NONE') break
    if (outcome === 'SENT') sent += 1
    else failed += 1
  }
  return { sent, failed }
}

/** ระบายคิวของห้องหนึ่ง — คืนจำนวนแถวที่เปลี่ยนสถานะจริงในการเรียกครั้งนี้ */
export async function deliverRoom(conversationId: string, owner: ClaimOwner): Promise<number> {
  const { sent, failed } = await drainRoom(conversationId, owner)
  return sent + failed
}

// ══════════════════════════════════════════════════════════════════════════
// sweepOutbox — กวาดทุกห้องที่มีแถวค้าง
// ══════════════════════════════════════════════════════════════════════════

export async function sweepOutbox(opts: { owner: ClaimOwner; limit?: number }): Promise<{
  rooms: number
  sent: number
  failed: number
  stale: number
}> {
  const limit = opts.limit ?? 50
  const now = new Date()

  // ── 1) ปิดแถวที่ claim ค้างเกินเพดาน **ก่อน** ยิงอะไรทั้งสิ้น ──
  // 🛑 ไม่กรองด้วย cutoff ใน SQL โดยตั้งใจ — เกณฑ์ "ค้างจริงไหม" มีนิยามเดียวที่ `isStaleClaim`
  // เขียน `sendLockedAt: { lt: cutoff }` ตรงนี้คือการสร้างนิยามที่สองที่ต้องตรงกันตลอดกาล (HR16)
  const locked = (await prisma.chatMessage.findMany({
    where: { deliveryStatus: 'QUEUED', sendLockedAt: { not: null } },
    select: CLAIM_SELECT,
  })) as ClaimableRow[]
  const staleIds = locked.filter((r) => isStaleClaim(r, now)).map((r) => r.id)

  let stale = 0
  if (staleIds.length > 0) {
    // เงื่อนไข `deliveryStatus: 'QUEUED'` ใน where กันเขียนทับแถวที่เพิ่งจบไปหมาด ๆ ระหว่างทาง
    const closed = await prisma.chatMessage.updateMany({
      where: { id: { in: staleIds }, deliveryStatus: 'QUEUED' },
      data: {
        deliveryStatus: 'FAILED',
        // 🛑 ถ้อยคำต้องพูดความจริงว่าเราไม่รู้ผล — ข้อความกลาง ๆ อย่าง "ส่งไม่สำเร็จ" ชวนให้กดซ้ำ
        // ทันทีโดยไม่ตรวจ ซึ่งเป็นทางเดียวที่เหลืออยู่ที่จะทำให้ลูกค้าได้ข้อความซ้ำ (E-1)
        failureReason: UNCERTAIN_SEND_REASON,
        sendPayload: Prisma.DbNull,
      },
    })
    stale = closed.count
  }

  // ── 2) ห้องที่ยังมีแถว "หยิบได้" เหลืออยู่ ──
  const rooms = await prisma.chatMessage.findMany({
    where: { deliveryStatus: 'QUEUED', sendLockedAt: null },
    select: { conversationId: true },
    distinct: ['conversationId'],
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  const roomIds = rooms.map((r) => r.conversationId)
  if (roomIds.length === 0) return { rooms: 0, sent: 0, failed: 0, stale }

  // ── 3) จัดกลุ่มตาม `shopChannelId` แล้วยิง **ทีละห้องภายในเพจเดียวกัน** ──
  // 🛑 E-8: จำกัด concurrency ต่อ `shopChannelId` ไม่ใช่ต่อรอบ — ห้องหลายห้องของเพจเดียวกันยิง
  // พร้อมกันจะโดน rate limit ของ Meta (เพจคือหน่วยที่ Meta นับ ไม่ใช่คำขอของเรา)
  const conversations = await prisma.conversation.findMany({
    where: { id: { in: roomIds } },
    select: { id: true, shopChannelId: true },
  })
  const channelOf = new Map(conversations.map((c) => [c.id, c.shopChannelId]))

  const groups = new Map<string, string[]>()
  for (const id of roomIds) {
    // ไม่รู้ว่าอยู่เพจไหน = ให้เป็นกลุ่มของตัวเอง (fail-safe ฝั่งความถูกต้อง: อย่างมากคือขนานเกินไป
    // หนึ่งห้อง ดีกว่าเหมารวมเข้ากลุ่มมั่ว ๆ แล้วห้องของคนละเพจต้องรอกัน)
    const key = channelOf.get(id) ?? `conversation:${id}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(id)
    else groups.set(key, [id])
  }

  let sent = 0
  let failed = 0
  await Promise.all(
    [...groups.values()].map(async (ids) => {
      for (const conversationId of ids) {
        try {
          // ระบายจนหมดห้อง ไม่ใช่ใบเดียวต่อรอบกวาด — ไม่งั้นห้องที่มี 3 ใบค้างต้องรอ 3 นาที
          const res = await drainRoom(conversationId, opts.owner)
          sent += res.sent
          failed += res.failed
        } catch (e) {
          // ห้องเดียวพังต้องไม่ฆ่าการกวาดของห้องที่เหลือ — แถวยังค้าง QUEUED + claim ไว้แล้ว
          // จึงจะถูกปิดเป็น "ไม่แน่ใจ" ในรอบถัดไปตามเพดานเวลา ไม่ถูกยิงซ้ำ
          console.error('[chat-outbox] กวาดห้องไม่สำเร็จ', { conversationId, error: e })
        }
      }
    }),
  )

  return { rooms: roomIds.length, sent, failed, stale }
}
