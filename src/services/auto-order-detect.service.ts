/**
 * auto-order-detect.service — ตัวดักจับข้อความสรุปคำสั่งซื้อที่ร้านพิมพ์เอง (00061)
 *
 * TFR-005 (จุดเข้าเดียว) · TFR-011 (สร้างออเดอร์จริงผ่าน createOrder) · TFR-015 (กันซ้ำ) ·
 * TFR-016 (supersedes) · TFR-019 (ร่าง) · TFR-023 (ตัวนับร่าง)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🛑 `detectAutoOrderTrigger()` เรียกได้จาก **2 จุดเท่านั้น** และตั้งชื่อตายตัวไว้ในเทส
 * (`chat.service.ts` = ร้านพิมพ์ในกล่องแชทของเรา · webhook ของ Meta = ร้านพิมพ์ในแอปของ Meta)
 *
 * ทั้งสองจุดส่งมาแค่ `chatMessageId` **ไม่ส่ง payload ดิบ** ⇒ ตัวแกะโหลดข้อมูลเองจาก DB เสมอ
 * เพื่อกัน parity พังจากการที่ 2 จุดเข้าเตรียม input ต่างกัน (เคสคลาสสิกที่ tsc มองไม่เห็น
 * เพราะทั้งสองฝั่งส่ง type ถูกต้องทั้งคู่ แค่ *เนื้อใน* ต่างกัน)
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import 'server-only'

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

import { computeContentHash } from '@/lib/auto-order-normalize'
import { matchesTriggerPhrase, parseAutoOrderMessage } from '@/lib/auto-order-parser'
import { computeItemsTotal, type DraftReasonCode } from '@/lib/auto-order-reasons'
import { DRAFT_DISCARD_REASON } from '@/lib/cancel-reasons'
import { createOrder, promoteAutoOrderDraft, DraftNotPromotableError, OrderNotFoundError } from '@/services/order.service'
import { validateAutoOrderCompleteness, type MatchedAutoOrderItem } from '@/services/auto-order-validate.service'
import {
  writeAutoOrderResultMessage,
  attachAutoOrderToCard,
  findOrphanAutoOrderCard,
} from '@/services/auto-order-internal-message.service'

/** ร่างอยู่ได้ 7 วันนับจาก **เวลาที่แถวถูก insert จริง** — ไม่ใช่จาก `createdAt` */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * หน้าต่างกันข้อความซ้ำ — 2 นาที
 *
 * 🛑 ห้ามเป็น unbounded: ร้านขายของชุดเดิมให้ลูกค้าคนเดิมเดือนหน้าด้วยข้อความหน้าตาเหมือนเดิม
 * ทุกตัวอักษรเป็นเรื่องปกติมาก — ถ้าไม่มีหน้าต่างเวลา ใบที่สองจะถูกเมินอย่างเงียบ ๆ **ตลอดไป**
 */
export const DEDUP_WINDOW_MS = 2 * 60 * 1000

/**
 * เพดานเวลาของสาย "มาแทนใบก่อนหน้า" — 24 ชั่วโมง (มติ user 2026-09-05)
 *
 * 🛑 เดาผิดทางนี้ = **ไม่ติดป้าย** (ผู้ขายยังกดยกเลิกใบเก่าเองได้ตามปกติ) ซึ่งเสียหายน้อยกว่า
 * การติดป้ายผิด (ออเดอร์คนละเดือนของลูกค้าคนเดิมขึ้นว่า "มาแทนกัน" แล้วชวนให้กดยกเลิกใบที่
 * ส่งของไปแล้ว) — "สั่งซ้ำเพราะแก้ข้อมูล" เป็นพฤติกรรมในรอบการคุยครั้งเดียว
 */
export const SUPERSEDES_WINDOW_MS = 24 * 60 * 60 * 1000

export type DetectOutcome =
  | { outcome: 'SKIPPED'; reason: string }
  | { outcome: 'DUPLICATE' }
  | { outcome: 'ORDER_CREATED'; orderId: string }
  | { outcome: 'DRAFTED'; orderId: string; reasons: DraftReasonCode[] }

/* ─────────────────────────────────────────────────────────────────────────────
 * จุดเข้าเดียว
 * ────────────────────────────────────────────────────────────────────────── */

export async function detectAutoOrderTrigger(chatMessageId: string): Promise<DetectOutcome> {
  const message = await prisma.chatMessage.findUnique({
    where: { id: chatMessageId },
    select: {
      id: true,
      senderRole: true,
      type: true,
      body: true,
      createdAt: true,
      conversationId: true,
      conversation: { select: { shopId: true, shopChannelId: true } },
    },
  })
  if (!message) return { outcome: 'SKIPPED', reason: 'MESSAGE_NOT_FOUND' }

  // (1) ร้านเป็นคนพิมพ์เท่านั้น — ข้อความของลูกค้าไม่เกี่ยวกับฟีเจอร์นี้เลย (AC-ACO-11)
  if (message.senderRole !== 'SHOP') return { outcome: 'SKIPPED', reason: 'NOT_SHOP' }
  // การ์ดภายในของฟีเจอร์นี้เองก็เป็น senderRole='SHOP' ⇒ ต้องกันวงจรป้อนกลับที่นี่ด้วย
  // (ชั้นแรกคือ "ไม่มีสายให้ตัด" — ตัวเขียนการ์ดไม่ import ไฟล์นี้เลย ชั้นนี้คือชั้นสอง)
  if (message.type !== 'TEXT') return { outcome: 'SKIPPED', reason: 'NOT_TEXT' }
  const rawBody = message.body?.trim()
  if (!rawBody) return { outcome: 'SKIPPED', reason: 'EMPTY_BODY' }

  const shopId = message.conversation.shopId

  const config = await prisma.autoOrderAgentConfig.findUnique({
    where: { shopId },
    select: {
      id: true,
      status: true,
      phrases: { select: { normalizedPhrase: true } },
      channels: { where: { channel: { status: 'ACTIVE' } }, select: { shopChannelId: true } },
      testThreads: { select: { conversationId: true } },
    },
  })
  if (!config || config.status === 'OFFLINE') return { outcome: 'SKIPPED', reason: 'OFFLINE' }

  // (3) เพจต้องอยู่ในชุดที่ร้านเลือกไว้ *และยัง ACTIVE อยู่*
  //
  // 🛑 ไม่มีเคสยกเว้น — ห้องที่ `channel='DEEP'` (ลูกค้าเป็นบัญชี buyer ในแอปเรา) ไม่มี
  // `ShopChannel` เลย และอยู่นอกขอบเขต v1 ตรงตัวตาม PRD §5 ⇒ ตกที่ด่านนี้อย่างถูกต้อง
  const effective = new Set(config.channels.map((c) => c.shopChannelId))
  if (!message.conversation.shopChannelId || !effective.has(message.conversation.shopChannelId)) {
    return { outcome: 'SKIPPED', reason: 'CHANNEL_NOT_ENABLED' }
  }

  // โหมดทดสอบ: ทำงานเฉพาะห้องที่ร้านเลือกไว้
  const isDryRun = config.status === 'TEST'
  if (isDryRun) {
    const testThreads = new Set(config.testThreads.map((t) => t.conversationId))
    if (!testThreads.has(message.conversationId)) {
      return { outcome: 'SKIPPED', reason: 'NOT_TEST_THREAD' }
    }
  }

  // (4) วลีจุดชนวน
  const matchedPhrase = matchesTriggerPhrase(
    rawBody,
    config.phrases.map((p) => p.normalizedPhrase),
  )
  if (!matchedPhrase) return { outcome: 'SKIPPED', reason: 'NO_PHRASE_MATCH' }

  // ── (2) กันข้อความซ้ำในห้องเดียวกันภายในหน้าต่างเวลา ─────────────────────────
  const contentHash = computeContentHash(rawBody)
  const nowMs = Date.now()
  const duplicate = await prisma.order.findFirst({
    where: {
      conversationId: message.conversationId,
      contentHash,
      createdVia: 'CHAT_AUTO_ORDER',
      createdAt: { gt: new Date(nowMs - DEDUP_WINDOW_MS) },
    },
    select: { id: true },
  })
  if (duplicate) {
    // 🛑 ต้อง log ทุกครั้งที่กลืน — ระบบแยกไม่ได้จริงระหว่าง "ร้านตั้งใจสั่งซ้ำ" กับ
    // "กดส่งซ้ำเพราะเน็ตค้าง" และเลือกเชื่อฝั่งหลังเสมอ ⇒ ร้านที่ตั้งใจสั่งซ้ำจะไม่ได้อะไรเลย
    // **โดยไม่มีสัญญาณบนหน้าจอ** (v1 ไม่มี UI สำหรับเคสนี้) log คือทางเดียวที่ตามเรื่องได้
    console.info('[auto-order] suppressed duplicate', {
      chatMessageId,
      conversationId: message.conversationId,
      existingOrderId: duplicate.id,
    })
    return { outcome: 'DUPLICATE' }
  }

  // ── การ์ด "กำลังอ่าน" ต้องขึ้นก่อน ไม่รอ query อื่น ──────────────────────────
  // ถ้ารอจนรู้ผล ผู้ขายจะเห็นความเงียบตลอดช่วงที่ระบบทำงาน ซึ่งอ่านเป็น "มันไม่ทำงาน"
  const card = await writeAutoOrderResultMessage({
    conversationId: message.conversationId,
    orderId: null,
    kind: 'RESULT',
  })

  const parsed = parseAutoOrderMessage(rawBody)
  const validation = await validateAutoOrderCompleteness(shopId, parsed, message.createdAt, nowMs)

  const supersedesOrderId = await findSupersededOrderId(message.conversationId, nowMs)

  const shared = {
    conversationId: message.conversationId,
    sourceChatMessageId: message.id,
    matchedTriggerPhrase: matchedPhrase,
    contentHash,
    createdVia: 'CHAT_AUTO_ORDER' as const,
    detectionResolvedAt: new Date(),
    isDryRun,
  }

  // 🛑 โหมดทดสอบต้องไม่เรียก `createOrder()` เลยแม้ผลจะครบ — ใบทดสอบที่ตัดสต๊อกจริง
  // คือสิ่งที่ทั้งโหมดนี้มีไว้กัน (AC-ACO-06)
  if (validation.complete && !isDryRun) {
    const order = await createOrder(shopId, {
      items: validation.matchedItems.map((i) => ({
        productId: i.matchedProductId ?? undefined,
        name: i.rawName,
        qty: i.qty,
        // ถึงจุดนี้ `complete` การันตีแล้วว่าไม่มีรายการไหน price เป็น null
        price: i.price ?? 0,
      })),
      type: 'PHYSICAL',
      buyerContact: parsed.phone ?? undefined,
      buyerName: parsed.customerName ?? undefined,
      paymentMethod: parsed.paymentMethod ?? undefined,
      internalNote: parsed.note ?? undefined,
      discount: parsed.discount ?? undefined,
      shippingAddress: toShippingAddress(parsed),
      // 🛑 วันที่ = เวลาที่ **ข้อความถูกส่ง** ไม่ใช่เวลาที่ตัวดักจับเริ่มทำงาน (TFR-009)
      // สองค่านี้ต่างกันจริงเมื่อ webhook มาช้าหรือ watchdog เป็นคนเก็บตก
      createdAt: message.createdAt,
      // ไม่มีคนกด ⇒ null ตรงตามที่คอมเมนต์ของคอลัมน์เขียนไว้เอง (หน้าจอแสดง "ระบบ")
      createdByUserId: null,
      supersedesOrderId: supersedesOrderId ?? undefined,
      ...shared,
    })
    await attachAutoOrderToCard(card.id, order.id)
    return { outcome: 'ORDER_CREATED', orderId: order.id }
  }

  const draft = await writeAutoOrderDraft({
    shopId,
    reasons: validation.reasons,
    matchedItems: validation.matchedItems,
    parsed,
    messageCreatedAt: message.createdAt,
    supersedesOrderId,
    ...shared,
  })
  await attachAutoOrderToCard(card.id, draft.id)
  return { outcome: 'DRAFTED', orderId: draft.id, reasons: validation.reasons }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ตัวเขียนแถวร่าง — มี **แค่ 2 ฟังก์ชันในระบบ** ที่เขียน `Order.draftReasons`
 * (ตัวนี้ กับ `writeProcessingFailedDraft` ข้างล่าง) และทั้งคู่ไม่มีทางผลิตค่าปนกัน
 * ────────────────────────────────────────────────────────────────────────── */

async function writeAutoOrderDraft(input: {
  shopId: string
  conversationId: string
  sourceChatMessageId: string
  matchedTriggerPhrase: string
  contentHash: string
  createdVia: 'CHAT_AUTO_ORDER'
  detectionResolvedAt: Date
  isDryRun: boolean
  reasons: DraftReasonCode[]
  matchedItems: MatchedAutoOrderItem[]
  parsed: ReturnType<typeof parseAutoOrderMessage>
  messageCreatedAt: Date
  supersedesOrderId: string | null
}) {
  const now = Date.now()
  return prisma.order.create({
    data: {
      shopId: input.shopId,
      conversationId: input.conversationId,
      status: 'DRAFTED',
      type: 'PHYSICAL',
      // 🛑 ยอดเป็น 0 เสมอ ไม่ใช่ยอดที่ร้านพิมพ์ — ยอดจริงอยู่ที่ `draftStatedTotalAmount`
      // เลือกค่าที่ทำให้ความผิดพลาดส่งเสียง (ค่าเฉลี่ยต่อบิลตกฮวบ = เห็นได้) แทนค่าที่ทำให้
      // มันเงียบ (ยอดขายเพี้ยนเป็นเงินที่ดูสมเหตุสมผล)
      totalAmount: 0,
      orderNo: null,
      draftReasons: input.reasons,
      // เก็บ **ทุกบรรทัด** ในรูปดิบ ไม่ใช่เฉพาะบรรทัดที่แปลงไม่ได้ — เก็บครึ่งเดียวแล้วหน้าจอ
      // ต้องรวมข้อมูล 2 แหล่งคนละรูปแบบ ซึ่งเป็นที่มาของบั๊กคลาส one-value-many-entry-points
      draftRawItems: input.matchedItems.map((i) => ({
        rawName: i.rawName,
        productId: i.matchedProductId,
        qty: i.qty,
        price: i.price,
      })) as Prisma.InputJsonValue,
      draftStatedTotalAmount: input.parsed.statedTotal ?? null,
      buyerContact: input.parsed.phone ?? null,
      buyerName: input.parsed.customerName ?? null,
      paymentMethod: input.parsed.paymentMethod ?? null,
      internalNote: input.parsed.note ?? null,
      discount: input.parsed.discount ?? null,
      shippingAddress: (toShippingAddress(input.parsed) ?? Prisma.DbNull) as Prisma.InputJsonValue,
      createdAt: input.messageCreatedAt,
      // 🛑 อายุร่างนับจาก **ตอนนี้** ไม่ใช่จาก `createdAt` — `createdAt` แปลว่า "วันที่ลูกค้าสั่ง"
      // ตั้งแต่ 00033 ซึ่งย้อนหลังได้ 90 วัน ⇒ ผูกกันแล้วร่างจะหมดอายุตั้งแต่วินาทีแรก
      expiresAt: new Date(now + DRAFT_TTL_MS),
      supersedesOrderId: input.supersedesOrderId,
      sourceChatMessageId: input.sourceChatMessageId,
      matchedTriggerPhrase: input.matchedTriggerPhrase,
      contentHash: input.contentHash,
      createdVia: input.createdVia,
      detectionResolvedAt: input.detectionResolvedAt,
      isDryRun: input.isDryRun,
      createdByUserId: null,
    },
    select: { id: true },
  })
}

/**
 * ร่างระดับระบบ — เขียนจาก **watchdog เท่านั้น**
 *
 * 🛑 signature ไม่มีช่องรับ `reasons` จากใครเลยโดยตั้งใจ ⇒ `PROCESSING_FAILED` ไม่มีทาง
 * ปนกับเหตุผลเชิงเนื้อหาได้ในระดับโครงสร้าง ไม่ใช่ระดับ `if`
 * (CHECK `Order_draft_reasons_system_exclusive` เป็นด่านสุดท้ายที่ไม่ควรมีวันถูกชน)
 */
export async function writeProcessingFailedDraft(chatMessageId: string) {
  const message = await prisma.chatMessage.findUnique({
    where: { id: chatMessageId },
    select: {
      id: true,
      body: true,
      createdAt: true,
      conversationId: true,
      conversation: { select: { shopId: true } },
    },
  })
  if (!message) return null

  const now = Date.now()
  const draft = await prisma.order.create({
    data: {
      shopId: message.conversation.shopId,
      conversationId: message.conversationId,
      status: 'DRAFTED',
      type: 'PHYSICAL',
      totalAmount: 0,
      orderNo: null,
      draftReasons: ['PROCESSING_FAILED'],
      createdAt: message.createdAt,
      expiresAt: new Date(now + DRAFT_TTL_MS),
      sourceChatMessageId: message.id,
      contentHash: message.body ? computeContentHash(message.body) : null,
      createdVia: 'CHAT_AUTO_ORDER',
      detectionResolvedAt: new Date(),
      createdByUserId: null,
    },
    select: { id: true },
  })

  // การ์ด "กำลังอ่าน" ที่ค้างจากรอบที่ล้มกลางทาง — ผูกให้ถ้าเจอ ไม่เจอก็เขียนใหม่
  // (ข้ามสถานะ "กำลังอ่าน" ไปเลย เพราะไม่มีใครรอดูมันแล้ว)
  const orphan = await findOrphanAutoOrderCard(message.conversationId, message.createdAt)
  if (orphan) await attachAutoOrderToCard(orphan.id, draft.id)
  else await writeAutoOrderResultMessage({ conversationId: message.conversationId, orderId: draft.id, kind: 'RESULT' })

  return draft
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ปุ่มบนการ์ด
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * "อ่านใหม่" — อ่านข้อความต้นทางเดิมแล้ววิเคราะห์ซ้ำ
 *
 * 🛑 **ยึด `sourceChatMessageId` เดิม (UPDATE ไม่ใช่ INSERT)** — ถ้าสร้างแถวใหม่จะชน
 * UNIQUE ทันที และผู้ขายจะเห็นร่างซ้ำสองใบสำหรับข้อความเดียว
 *
 * 🛑 เดินเส้นทาง **อัตโนมัติ** (ห้าม Quick-Create) ต่างจากปุ่ม "เปิดฟอร์ม" ซึ่งเป็นเส้นทางมนุษย์
 * — ปุ่มนี้ไม่มีใครกรอกอะไรเพิ่ม มันแค่ให้ระบบลองอ่านใหม่ ⇒ กติกาต้องเหมือนตอนอ่านครั้งแรกเป๊ะ
 */
export async function retryAutoOrderDraft(shopId: string, publicToken: string): Promise<DetectOutcome> {
  const draft = await prisma.order.findFirst({
    where: { publicToken, shopId, status: 'DRAFTED' },
    select: {
      id: true,
      publicToken: true,
      isDryRun: true,
      sourceChatMessage: { select: { id: true, body: true, createdAt: true } },
    },
  })
  if (!draft) throw new OrderNotFoundError()
  const source = draft.sourceChatMessage
  if (!source?.body) throw new DraftNotPromotableError()

  const nowMs = Date.now()
  const parsed = parseAutoOrderMessage(source.body)
  const validation = await validateAutoOrderCompleteness(shopId, parsed, source.createdAt, nowMs)

  if (!validation.complete || draft.isDryRun) {
    await prisma.order.update({
      where: { id: draft.id },
      data: {
        draftReasons: validation.reasons,
        draftRawItems: validation.matchedItems.map((i) => ({
          rawName: i.rawName,
          productId: i.matchedProductId,
          qty: i.qty,
          price: i.price,
        })) as Prisma.InputJsonValue,
        draftStatedTotalAmount: parsed.statedTotal ?? null,
        detectionResolvedAt: new Date(),
      },
    })
    return { outcome: 'DRAFTED', orderId: draft.id, reasons: validation.reasons }
  }

  const order = await promoteAutoOrderDraft(shopId, draft.publicToken, {
    items: validation.matchedItems.map((i) => ({
      productId: i.matchedProductId ?? undefined,
      name: i.rawName,
      qty: i.qty,
      price: i.price ?? 0,
    })),
    type: 'PHYSICAL',
    buyerContact: parsed.phone ?? undefined,
    buyerName: parsed.customerName ?? undefined,
    paymentMethod: parsed.paymentMethod ?? undefined,
    internalNote: parsed.note ?? undefined,
    discount: parsed.discount ?? undefined,
    shippingAddress: toShippingAddress(parsed),
  })
  return { outcome: 'ORDER_CREATED', orderId: order.id }
}

/**
 * "ทิ้งร่างนี้" — ผู้ขายกดเอง
 *
 * 🛑 ไม่เรียก `cancelOrder()` — ตัวนั้นคืนสต๊อก/แตะพัสดุ/บันทึกเหตุการณ์ของ *ออเดอร์จริง*
 * แต่ร่างไม่เคยตัดสต๊อกและไม่เคยมีพัสดุ ⇒ เรียกไปก็ไม่มีอะไรให้คืน มีแต่จะพาผลข้างเคียง
 * ของออเดอร์จริงมาติดกับสิ่งที่ไม่เคยเป็นออเดอร์
 */
export async function discardAutoOrderDraft(shopId: string, publicToken: string) {
  const draft = await prisma.order.findFirst({
    where: { publicToken, shopId, status: 'DRAFTED' },
    select: { id: true },
  })
  if (!draft) throw new OrderNotFoundError()

  return prisma.order.update({
    where: { id: draft.id },
    data: {
      status: 'CANCELLED',
      cancelReason: DRAFT_DISCARD_REASON,
      // 🛑 ต้องล้าง draftReasons — CHECK `Order_draft_reasons_only_when_drafted` บังคับว่า
      // แถวที่ไม่ใช่ DRAFTED ต้องมีอาร์เรย์ว่าง (ลืมล้าง = 23514 ตอนผู้ขายกดปุ่ม)
      draftReasons: [],
      expiresAt: null,
      // ผู้ขายกดเอง ⇒ ไม่ใช่ผู้ซื้อ (ค่านี้มีผลกับอัตราความสำเร็จ ห้ามใส่ 'buyer' มั่ว)
      cancelInitiator: 'seller',
    },
    select: { id: true, status: true, cancelReason: true },
  })
}

/* ─────────────────────────────────────────────────────────────────────────────
 * helper
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * SSOT เดียวของ "ร้านนี้มีร่างค้างกี่ใบ" (TFR-023)
 *
 * 🛑 ใช้ `status:'DRAFTED'` ตรง ๆ **ไม่ใช่ `excludeDraftedWhere`** — helper ตัวนั้นมีไว้ *ตัด*
 * ร่างออก คนละทิศกับตรงนี้ที่ต้องการ *นับเฉพาะ* ร่าง
 *
 * 🛑 ทุกจุดที่แสดงตัวเลขนี้ (ชิปใน /orders · badge แถวห้องแชท · หน้าตั้งค่า) ต้องเรียกตัวนี้
 * ห้ามประกอบ query เอง — คลาส "ตัวเลขเดียวกันโผล่ >1 ที่แล้วไม่ตรงกัน" เกิดจริงกับ 00029 มาแล้ว
 */
const DRAFT_COUNT_WHERE = {
  status: 'DRAFTED',
  // ใบทดสอบไม่ใช่งานค้างที่ร้านต้องจัดการ — ไม่นับเข้า badge ทุกจุด
  isDryRun: false,
} as const

export async function countDraftedOrders(
  shopId: string,
  opts: { conversationId?: string } = {},
): Promise<number> {
  return prisma.order.count({
    where: {
      shopId,
      ...DRAFT_COUNT_WHERE,
      ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
    },
  })
}

/**
 * ตัวนับร่างแบบ batch สำหรับ **รายการห้องแชท** — ตัวเดียวกับ `countDraftedOrders` ทุกเงื่อนไข
 *
 * 🛑 `DRAFT_COUNT_WHERE` เป็น symbol ที่ทั้งสองฟังก์ชันอ่านร่วมกัน **ไม่ใช่เงื่อนไขที่เขียนซ้ำ
 * ให้เหมือนกัน** — คลาสบั๊กที่กันอยู่คือ "ตัวเลขเดียวกันโผล่ 2 จอแล้วไม่ตรงกัน" (จอเดียวเคยโชว์
 * "ยังไม่ตอบ" 7 กับ 8 ใน 00029) ซึ่งเกิดจากการนับด้วยเกณฑ์ที่ *ตั้งใจให้เหมือนกัน* แต่ drift
 *
 * คืน Map เฉพาะห้องที่มีร่าง — ห้องที่ไม่มีไม่อยู่ใน Map (ผู้เรียกใช้ `?? 0`)
 */
export async function countDraftedOrdersByConversation(
  shopIds: string[],
  conversationIds: string[],
): Promise<Map<string, number>> {
  if (shopIds.length === 0 || conversationIds.length === 0) return new Map()
  const rows = await prisma.order.groupBy({
    by: ['conversationId'],
    where: {
      shopId: { in: shopIds },
      conversationId: { in: conversationIds },
      ...DRAFT_COUNT_WHERE,
    },
    _count: { _all: true },
  })
  return new Map(
    rows
      .filter((r): r is typeof r & { conversationId: string } => r.conversationId !== null)
      .map((r) => [r.conversationId, r._count._all]),
  )
}

/**
 * ใบก่อนหน้าที่ใบใหม่ "มาแทน" (TFR-016)
 *
 * 🛑 `status: { not: 'DRAFTED' }` คือหัวใจของกฎ "ร่างระหว่างทางถูกข้ามไป" —
 * msg1→ออเดอร์จริง · msg2→ตกร่าง · msg3→ออเดอร์จริง ⇒ ใบที่ 3 ต้องชี้ไปใบที่ 1
 * (ร่างไม่มีสต๊อกที่ถูกตัด ไม่มีอะไรให้ "ยกเลิก" ในความหมายของปุ่มบนการ์ด)
 */
async function findSupersededOrderId(conversationId: string, nowMs: number): Promise<string | null> {
  const prev = await prisma.order.findFirst({
    where: {
      conversationId,
      createdVia: 'CHAT_AUTO_ORDER',
      status: { not: 'DRAFTED' },
      createdAt: { gt: new Date(nowMs - SUPERSEDES_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return prev?.id ?? null
}

/**
 * ที่อยู่ที่แกะได้ → รูปที่ `createOrder` รับ · คืน `undefined` เมื่อไม่มีข้อมูลเลยสักช่อง
 * (ไม่ใช่อ็อบเจกต์ที่มีแต่ค่าว่าง ซึ่งจะทำให้ `shippingAddress` บนแถวเป็น `{}` แทนที่จะเป็น NULL)
 */
function toShippingAddress(parsed: ReturnType<typeof parseAutoOrderMessage>) {
  const address = {
    line1: parsed.addressLine ?? undefined,
    subdistrict: parsed.subdistrict ?? undefined,
    district: parsed.district ?? undefined,
    province: parsed.province ?? undefined,
    postcode: parsed.postcode ?? undefined,
  }
  return Object.values(address).some((v) => v !== undefined) ? address : undefined
}

/** ยอดที่ระบบคำนวณได้จากร่าง — ใช้ทั้งบนการ์ดและตอนเทียบยอด (ตัวเดียวกันเสมอ) */
export { computeItemsTotal }
