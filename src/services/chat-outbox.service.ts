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
import { pushChatSendFailed } from '@/services/seller-push.service'

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

/**
 * select ของขั้น "หาแถวที่ claim ค้าง" — เหมือน `CLAIM_SELECT` **ลบ `sendPayload` ออก**
 *
 * 🛑 ขั้นนั้นไม่เคยยิงข้อความ มันแค่ปิดแถวเป็น FAILED ⇒ ไม่ต้องใช้เจตนาการส่งเลยสักไบต์ ขณะที่
 * `sendPayload` คือ params ทั้งก้อน (Flex/Generic carousel ยาวได้หลาย KB ต่อแถว) และงานนี้รันทุกนาที
 */
const STALE_SELECT = {
  id: true,
  conversationId: true,
  createdAt: true,
  deliveryStatus: true,
  sendLockedAt: true,
} as const

/** เพดานแถวที่ดึงมาตรวจ "claim ค้าง" ต่อรอบ — ปกติเป็นศูนย์ ตัวเลขนี้มีไว้กันวันที่ปลายทางล่ม */
const STALE_SCAN_LIMIT = 200

/**
 * จำนวนกลุ่มเพจที่ระบายพร้อมกันได้สูงสุดต่อรอบ (เพดาน **รวม** — ดูเหตุผลเต็มที่จุดใช้งาน)
 *
 * 4 ไม่ใช่ตัวเลขสุ่ม: ปริมาณจริงบน prod คือ ~28 ข้อความ/นาทีทั้งระบบ (p99 = 13) ⇒ 4 กลุ่มขนาน
 * กว้างกว่าการใช้งานจริงหลายเท่า แต่ยังห่างจากเพดาน connection pool ของ Prisma มาก
 */
const MAX_CONCURRENT_CHANNELS = 4

/**
 * งบเวลาต่อการกวาดหนึ่งรอบ — ต้องต่ำกว่า `maxDuration` (60 วิ) ของ route ที่เรียก **อย่างมีระยะ**
 * เผื่อให้แถวที่กำลังยิงอยู่ปิดตัวเองทันก่อนแพลตฟอร์มตัดไฟ
 */
const SWEEP_TIME_BUDGET_MS = 45_000

/**
 * งบเวลาของการระบายคิวที่เกาะกับ webhook (ชั้น 2) — คิดจาก **ตอนเริ่ม invocation** ไม่ใช่ต่อห้อง
 *
 * 🛑 ทำไมต้องมี: `deliverRoom` ระบายได้ถึง `MAX_DELIVER_ROUNDS` = 20 รอบ **ต่อห้อง** และ batch
 * ของ webhook มีได้หลายห้อง ⇒ ก้อน `after()` ของ webhook เคยไม่มีเพดานเลย ทั้งที่ route ตั้ง
 * `maxDuration = 60`. ถูกตัดกลางทาง = แถวค้าง claim ⇒ อีก 3 นาทีถูกปิดเป็น "ไม่แน่ใจว่าส่งไป
 * หรือยัง" = แปลงปัญหา throughput ให้กลายเป็นความล้มเหลวที่ผู้ขายเห็นและแก้เองไม่ได้
 * (คลาสเดียวกับ R-E แต่เกิดบนชั้น 2 ซึ่งตอนนั้นยังไม่ได้ปิด)
 *
 * 45 วินาทีจาก `maxDuration = 60` ของทั้งสอง webhook route — เหลือ 15 วินาทีให้ ingest ที่ทำไป
 * ก่อนหน้าและให้ runtime เก็บงาน. ห้องที่เหลือไม่ได้หายไปไหน: cron รับช่วงต่อภายใน 1 นาที
 *
 * แยกค่าจาก `SWEEP_TIME_BUDGET_MS` โดยตั้งใจ แม้วันนี้ตัวเลขเท่ากัน — คนละคำถาม (งบของ cron
 * ที่กวาดทั้งระบบ vs งบของ webhook ที่ระบายเฉพาะห้องที่มี event) ผูกให้เท่ากันตลอดกาลไม่ได้
 */
export const WEBHOOK_DRAIN_BUDGET_MS = 45_000

/** เพดานผู้สมัครที่ดึงมาคัด "หัวคิวหยิบได้" — ดูเหตุผลที่จุดใช้งาน (R-A) */
const ROOM_CANDIDATE_MULTIPLIER = 3

/**
 * แถวที่ถูกปิดเพราะ claim ค้าง — คืนออกไป **รายแถว** เพื่อให้ผู้เรียกแจ้งผู้ขายได้
 * (เส้นทางนี้ไม่ผ่าน `deliverHead`/`closeRow` ⇒ ตัวแจ้งที่แขวนไว้ที่นั่นมองไม่เห็นเคสนี้เลย)
 */
export type StaleClosure = { id: string; conversationId: string; shopId: string | null }

export type SweepResult = {
  rooms: number
  sent: number
  failed: number
  /** = `staleRows.length` เสมอ (คงไว้เพื่อความสะดวกของตัวนับ/log) */
  stale: number
  staleRows: StaleClosure[]
  /**
   * งบเวลาหมดกลางทาง ⇒ ตัวเลขข้างบนคือ "ที่ทำไปจริง" ไม่ใช่ "ที่มีให้ทำ"
   *
   * 🛑 ค่านี้ที่เป็น true เรื่อย ๆ ในทุกนาที = ตัวกวาดตามงานไม่ทัน ซึ่งเป็นสัญญาณคนละตัวกับ
   * `stale` (ตัวนั้นบอกว่ามีคนตายกลางทาง อันนี้บอกว่าเราเองทำไม่ทัน) — ต้องแยกกันใน log
   */
  timedOut: boolean
  /**
   * แถวที่ถูกปิดเป็น FAILED สำเร็จแล้ว แต่ **ไม่ได้ส่ง noti** เพราะงบเวลาหมดก่อน
   *
   * 🛑 นี่คือของที่ **ตกหล่นถาวร ไม่ใช่เลื่อนไปรอบหน้า** — แถวไม่ใช่ `QUEUED` แล้ว รอบถัดไปจึง
   * มองไม่เห็นมันอีกเลย. ผู้ขายยังเห็นบับเบิลแดงในจอ (ไม่ได้เงียบสนิท) แต่ไม่ได้ noti เข้าแอป
   * ⇒ ค่านี้ต้องขึ้น log ทุกรอบ ไม่ใช่กลืนทิ้ง
   */
  staleUnnotified: number
}

/** map conversationId → shopId (ใช้ตอนต้องบอกว่าแถวที่ปิดไปเป็นของร้านไหน) */
async function shopIdByConversation(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await prisma.conversation.findMany({
    where: { id: { in: ids } },
    select: { id: true, shopId: true },
  })
  return new Map(rows.map((r) => [r.id, r.shopId]))
}

/**
 * แจ้งผู้ขายว่าข้อความใบหนึ่ง "ล้มถาวร" — **เรียกเมื่อแถวเปลี่ยน `QUEUED → FAILED` จริงเท่านั้น**
 *
 * 🛑 มี **2 เส้นทาง** ที่พาแถวไปเป็น FAILED และมันไม่เรียกหากันเลย ⇒ ต้องแขวนตัวนี้ทั้งคู่:
 *   (1) `deliverHead` — ปลายทางปฏิเสธ/ด่านล้ม (มีเหตุผลจริงติดมา)
 *   (2) stale-close ใน `sweepOutbox` — claim ค้างเกินเพดาน ปิดด้วย `UNCERTAIN_SEND_REASON`
 * แขวนแค่ (1) ซึ่งเป็นที่ที่ดูเป็นธรรมชาติที่สุด = เคส (2) ไม่มี noti สักใบ ทั้งที่มันคือ **เคสที่ต้อง
 * บอกผู้ขายที่สุดในทั้งฟีเจอร์**: เราไม่รู้ว่าข้อความออกไปหรือยัง ถ้าเขาไม่รู้ เขาจะพิมพ์ส่งใหม่
 * แล้วลูกค้าได้ข้อความซ้ำ — ความเสียหายเดียวที่ดีไซน์นี้ยอมไม่ได้ (E-1)
 *
 * `shopId` เป็น null ได้จริงในเส้นที่ล้ม **ก่อน** `resolveOutboundContext` (sendPayload เสีย /
 * เพจถูกถอด) ⇒ ต้องหาเองจากห้อง ไม่ใช่เงียบไปเพราะ "ไม่รู้ว่าร้านไหน" — ถ้าเงียบ เคสทั้งคลาสนี้
 * จะไม่มีใครได้รับแจ้งเลยโดยไม่มีอะไรฟ้อง
 *
 * best-effort: กลืน error เสมอ. ตัวแจ้งพังห้ามพาการระบายคิวล้มตาม (แถวถูกปิดไปแล้ว ณ จุดนี้ —
 * โยนต่อ = แถวถัดไปในห้องไม่ถูกระบาย เพราะเหตุผลที่ไม่เกี่ยวกับการส่งเลย)
 */
async function notifySendFailed(
  conversationId: string,
  shopId: string | null,
  failureReason: string | null,
): Promise<void> {
  try {
    const target = shopId ?? (await shopIdByConversation([conversationId])).get(conversationId) ?? null
    if (!target) return
    await pushChatSendFailed({ shopId: target, conversationId, failureReason })
  } catch (e) {
    console.error('[chat-outbox] แจ้งเตือนข้อความส่งไม่ออกไม่สำเร็จ', { conversationId, error: e })
  }
}

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

/**
 * ปิดแถวที่เรา claim ไว้ — **conditional เสมอ ห้ามเป็น `update` เปล่า**
 *
 * 🛑 (R-F) worker ที่จบช้ากว่า `STALE_CLAIM_MS` จะกลับมาเขียนผลของตัวเองทับแถวที่ตัวกวาดเพิ่งปิดเป็น
 * FAILED/"ไม่แน่ใจว่าส่งไปหรือยัง" ไปแล้ว — ถ้าเขียนทับเป็น `SENT` ได้ ผู้ขายจะเห็นบับเบิลแดงคาบหนึ่ง
 * (นานพอที่จะกดส่งซ้ำ) แล้วมันกลายเป็นเขียวทีหลัง ⇒ ลูกค้าได้ข้อความซ้ำ ซึ่งเป็นความเสียหายเดียวที่
 * ดีไซน์นี้ยอมไม่ได้ (D-6/E-1). `deliveryStatus: 'QUEUED'` ใน where คือด่านนั้น
 *
 * `count === 0` = แถวถูกปิดไปก่อนแล้ว (โดยตัวกวาด หรือโดย worker อื่น) — **ไม่ใช่ error** แต่ต้อง log
 * เพราะมันคือหลักฐานว่ามี worker วิ่งเกินเพดานเวลาจริง ซึ่งเป็นสัญญาณของบั๊กชั้นบนแบบเดียวกับ `stale`
 *
 * คืน `true` เมื่อ **แถวเปลี่ยนสถานะจริงในการเรียกครั้งนี้** — ผู้เรียกต้องใช้ค่านี้ตัดสินว่าจะแจ้ง
 * ผู้ขายไหม: `false` แปลว่าตัวกวาดปิดแถวไปก่อนแล้ว (และแจ้งไปแล้วด้วยเหตุผลของมันเอง) ⇒ แจ้งซ้ำ
 * = ผู้ขายได้ noti สองใบที่บอกคนละเรื่องสำหรับข้อความใบเดียว
 */
async function closeRow(id: string, data: Prisma.ChatMessageUpdateManyMutationInput): Promise<boolean> {
  try {
    const res = await prisma.chatMessage.updateMany({ where: { id, deliveryStatus: 'QUEUED' }, data })
    if (res.count === 0) {
      console.warn('[chat-outbox] ปิดแถวไม่ทัน — ถูกปิดไปก่อนแล้ว (worker วิ่งเกินเพดานเวลา)', { id })
    }
    return res.count > 0
  } catch (e) {
    /**
     * echo ของ Meta ชิงเขียน mid เดียวกันลง DB ไปก่อน (E-17) — ข้อความ **ส่งสำเร็จจริง** แล้ว
     * ถ้าปล่อยให้ throw แถวนี้จะค้าง QUEUED จนถูกกวาดเป็น "ไม่แน่ใจว่าส่งไปหรือยัง" ทั้งที่รู้แน่
     * ว่าส่งแล้ว = เชิญให้ผู้ขายกดส่งซ้ำ ซึ่งเป็นวิธีเดียวที่จะเกิดข้อความซ้ำในดีไซน์นี้
     * ⇒ เขียนสถานะซ้ำโดย **ไม่แตะ `externalMessageId`** (mid ตัวนั้นเป็นของแถว echo ไปแล้ว)
     */
    if (isUniqueViolationOn(e, 'externalMessageId')) {
      const { externalMessageId: _dropped, ...rest } = data
      // conditional เหมือนเส้นทางหลัก — เหตุผลเดียวกันทุกประการ (ห้ามเขียนทับแถวที่ถูกปิดไปแล้ว)
      const retry = await prisma.chatMessage.updateMany({
        where: { id, deliveryStatus: 'QUEUED' },
        data: rest,
      })
      return retry.count > 0
    }
    throw e
  }
}

/**
 * ปิดแถวเป็น FAILED **แล้วแจ้งผู้ขาย** — ทางเดียวที่ `deliverHead` ปิดแถวแบบล้มเหลว
 *
 * รวมสองอย่างไว้ที่เดียวโดยตั้งใจ: `deliverHead` มี 4 เส้นทางที่ล้ม (payload เสีย · ด่าน ownership ล้ม
 * หลัง claim · ตัวยิงโยน · ปลายทางตอบปฏิเสธ) — ถ้าให้แต่ละเส้นเรียกตัวแจ้งเอง วันหน้าที่มีเส้นที่ 5
 * คนเพิ่มจะลืมได้ง่ายมาก และความเงียบชนิดนี้ไม่มีอะไรฟ้อง (แถวถูกปิดถูกต้องทุกประการ ผู้ขายแค่ไม่รู้)
 */
async function failRow(
  id: string,
  conversationId: string,
  shopId: string | null,
  failureReason: string,
  extra: Prisma.ChatMessageUpdateManyMutationInput = {},
): Promise<DeliverOutcome> {
  const closed = await closeRow(id, {
    deliveryStatus: 'FAILED',
    failureReason,
    sendPayload: Prisma.DbNull,
    ...extra,
  })
  if (closed) await notifySendFailed(conversationId, shopId, failureReason)
  return 'FAILED'
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
    // 🛑 shopId เป็น null ตรงนี้ (ยังไม่ได้ resolve) — `failRow` หาให้เอง ห้ามเงียบเพราะไม่รู้ร้าน
    return await failRow(
      row.id,
      conversationId,
      null,
      'อ่านเจตนาการส่งของข้อความนี้ไม่ออก (sendPayload เสียหาย) — กดส่งใหม่อีกครั้ง',
    )
  }

  let conversation
  try {
    conversation = await resolveOutboundContext(params)
  } catch (e) {
    // เพจถูกถอด / เธรดหาย / สิทธิ์หาย ระหว่างอยู่ในคิว (E-5) — ปิดแถวพร้อมเหตุผลดิบ
    // ห้ามปล่อยค้าง: แถวที่ claim แล้วไม่มีใครมาปิดจะถูกกวาดเป็น "ไม่แน่ใจ" ทั้งที่รู้ว่าไม่เคยยิง
    return await failRow(row.id, conversationId, null, e instanceof Error ? e.message : String(e))
  }

  let result
  try {
    // 🛑 ยิง **ครั้งเดียว** — ไม่มี retry loop ไม่มี backoff ในไฟล์นี้ทั้งไฟล์ (D-2)
    result = await transmitOutbound(conversation, params)
  } catch (e) {
    return await failRow(
      row.id,
      conversationId,
      conversation.shopId,
      e instanceof Error ? e.message : String(e),
    )
  }

  const { externalMessageId: mid, outboundResponse, failureReason, sendMethod } = result

  if (failureReason) {
    return await failRow(row.id, conversationId, conversation.shopId, failureReason, {
      sendMethod,
      rawMessage: toRawMessage(conversation.channel, outboundResponse, 'outbound-response'),
    })
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
  deadline?: number,
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0
  for (let round = 0; round < MAX_DELIVER_ROUNDS; round += 1) {
    // 🛑 (R-E) หยุดเองอย่างสุภาพเมื่อหมดงบเวลา — เช็ค **ก่อน** claim ใบถัดไปเสมอ
    // การปล่อยให้ `maxDuration` ของแพลตฟอร์มเป็นตัวหยุด ไม่ใช่การกั้น: มันฆ่างานกลางคัน *หลัง*
    // claim ไปแล้ว ⇒ แถวนั้นค้าง claim ⇒ อีก 3 นาทีถูกปิดเป็น "ไม่แน่ใจว่าส่งไปหรือยัง"
    // = แปลงปัญหา throughput ให้กลายเป็นความล้มเหลวที่ผู้ขายเห็นและแก้เองไม่ได้
    if (deadline !== undefined && Date.now() >= deadline) break
    const outcome = await deliverHead(conversationId, owner)
    if (outcome === 'NONE') break
    if (outcome === 'SENT') sent += 1
    else failed += 1
  }
  return { sent, failed }
}

/** ระบายคิวของห้องหนึ่ง — คืนจำนวนแถวที่เปลี่ยนสถานะจริงในการเรียกครั้งนี้ */
export async function deliverRoom(
  conversationId: string,
  owner: ClaimOwner,
  deadline?: number,
): Promise<number> {
  const { sent, failed } = await drainRoom(conversationId, owner, deadline)
  return sent + failed
}

// ══════════════════════════════════════════════════════════════════════════
// sweepOutbox — กวาดทุกห้องที่มีแถวค้าง
// ══════════════════════════════════════════════════════════════════════════

export async function sweepOutbox(opts: {
  owner: ClaimOwner
  limit?: number
  /** งบเวลาของการกวาดรอบนี้ (ms) — ดู `SWEEP_TIME_BUDGET_MS` */
  budgetMs?: number
}): Promise<SweepResult> {
  const limit = opts.limit ?? 50
  const now = new Date()
  // 🛑 (R-E) งบเวลาต้องคิดจาก "ตอนเริ่มกวาด" ไม่ใช่ต่อห้อง — ตัวที่ต้องกั้นคืองานรวมต่อ invocation
  const deadline = Date.now() + (opts.budgetMs ?? SWEEP_TIME_BUDGET_MS)

  // ── 1) ปิดแถวที่ claim ค้างเกินเพดาน **ก่อน** ยิงอะไรทั้งสิ้น ──
  //
  // 🛑 ไม่กรองด้วย cutoff ใน SQL โดยตั้งใจ — เกณฑ์ "ค้างจริงไหม" มีนิยามเดียวที่ `isStaleClaim`
  // เขียน `sendLockedAt: { lt: cutoff }` ตรงนี้คือการสร้างนิยามที่สองที่ต้องตรงกันตลอดกาล (HR16)
  //
  // 🛑 (R-C) แต่ "ไม่กรองด้วย cutoff" ไม่ได้แปลว่า "ดึงทั้งตาราง": ต้องมี `take` และต้อง select
  // ให้แคบ — `CLAIM_SELECT` ลาก `sendPayload` (params ทั้งก้อน รวม Flex/Generic carousel) มาด้วย
  // ทั้งที่ `isStaleClaim` ใช้แค่ `deliveryStatus` + `sendLockedAt` และงานนี้รัน **ทุกนาที**
  // (รูปเดียวกับที่ F3 เพิ่งถอดออกจากขั้นที่ 2)
  //
  // `orderBy: sendLockedAt asc` = claim เก่าสุดก่อน ⇒ ตัวที่ค้างจริงถูกหยิบก่อนเสมอแม้ take ไม่พอ
  // (แถวที่เพิ่ง claim สด ๆ ไม่มีทางเป็น stale อยู่แล้ว จึงไม่มีอะไรเสียหายเมื่อถูกตัดออกจากหน้าต่าง)
  const locked = await prisma.chatMessage.findMany({
    where: { deliveryStatus: 'QUEUED', sendLockedAt: { not: null } },
    select: STALE_SELECT,
    orderBy: { sendLockedAt: 'asc' },
    take: STALE_SCAN_LIMIT,
  })

  /**
   * 🛑 (R-B) ปิด **ทีละแถว** ไม่ใช่ `updateMany` ก้อนเดียว — `updateMany` คืนแค่ `count` ⇒ ไม่มีทางรู้ว่า
   * แถวไหนถูกปิดจริง (บางแถวจบไปเองระหว่างทาง) และ **เคสนี้คือเคสที่ต้องบอกผู้ขายที่สุดในทั้งฟีเจอร์**:
   * ข้อความที่ *อาจ* ถึงลูกค้าไปแล้วและเขาต้องไปเปิดดูก่อนกดส่งซ้ำ. เส้นทางนี้ไม่ผ่าน `deliverHead`
   * ⇒ ตัวแจ้งเตือนที่แขวนไว้ที่นั่นจะไม่ทำงานให้เคสนี้เลย — คืน `staleRows` รายแถวไว้ให้ผู้เรียก
   * (Task 9) แขวนตัวแจ้งได้ ไม่ใช่คืนแค่ตัวเลขที่บอกไม่ได้ว่าเป็นของใคร
   *
   * จำนวนแถวถูกกั้นด้วย `STALE_SCAN_LIMIT` อยู่แล้ว และเส้นทางนี้เป็นเส้นทางข้อยกเว้น (ปกติเป็นศูนย์)
   */
  const staleRows: StaleClosure[] = []
  let timedOut = false
  const staleCandidates = locked.filter((r) => isStaleClaim(r, now))
  if (staleCandidates.length > 0) {
    const shopOf = await shopIdByConversation([...new Set(staleCandidates.map((r) => r.conversationId))])
    for (const row of staleCandidates) {
      /**
       * 🛑 (R-E ขั้นที่ 1) ด่านงบเวลาต้องมี **ที่นี่ด้วย** ไม่ใช่เฉพาะใน `drainRoom`
       *
       * `deadline` ถูกคิดตั้งแต่ต้นฟังก์ชัน แต่เดิมถูกใช้ครั้งแรกตอน `drainRoom` ⇒ ขั้นนี้ทำได้
       * ถึง `STALE_SCAN_LIMIT` = 200 แถว โดยแต่ละแถวเป็น `updateMany` + (ด้านล่าง) noti ที่ await
       * ทีละใบและมี HTTP ไป Expo อยู่ข้างใน
       *
       * 🛑 สถานการณ์ที่ทำให้ตัวเลขนี้โตคือ **"ปลายทางล่ม"** ซึ่งเป็นสถานการณ์เดียวกับที่ R-D/R-E
       * ถูกสร้างมารับมือพอดี ⇒ รอบนั้น cron อาจหมด 60 วินาทีไปกับการปิดแถวและยิง noti
       * **โดยยังไม่ได้ระบายอะไรเลยสักห้อง** = ตัวการันตีอ่อนลงในนาทีที่ต้องการมันที่สุด
       *
       * แถวที่ยังไม่ได้ปิดยังเป็น `QUEUED` + claim ค้างเหมือนเดิม ⇒ **รอบถัดไปเห็นมันอีกแน่นอน**
       * (ต่างจากลูป noti ด้านล่างซึ่งของที่ข้ามคือของที่ตกหล่นถาวร)
       */
      if (Date.now() >= deadline) {
        timedOut = true
        break
      }
      // เงื่อนไข `deliveryStatus: 'QUEUED'` กันเขียนทับแถวที่เพิ่งจบไปหมาด ๆ ระหว่างทาง
      const closed = await prisma.chatMessage.updateMany({
        where: { id: row.id, deliveryStatus: 'QUEUED' },
        data: {
          deliveryStatus: 'FAILED',
          // 🛑 ถ้อยคำต้องพูดความจริงว่าเราไม่รู้ผล — ข้อความกลาง ๆ อย่าง "ส่งไม่สำเร็จ" ชวนให้กดซ้ำ
          // ทันทีโดยไม่ตรวจ ซึ่งเป็นทางเดียวที่เหลืออยู่ที่จะทำให้ลูกค้าได้ข้อความซ้ำ (E-1)
          failureReason: UNCERTAIN_SEND_REASON,
          sendPayload: Prisma.DbNull,
        },
      })
      // count === 0 = worker เจ้าของ claim ปิดแถวเองทันพอดี ⇒ **ไม่ใช่ stale จริง ห้ามนับ ห้ามแจ้ง**
      if (closed.count === 0) continue
      staleRows.push({
        id: row.id,
        conversationId: row.conversationId,
        shopId: shopOf.get(row.conversationId) ?? null,
      })
    }
  }
  const stale = staleRows.length

  /**
   * 🛑 เส้นทางที่สองของตัวแจ้ง — **จำเป็นต้องมีแยกต่างหาก** ไม่ใช่ของซ้ำซ้อน
   *
   * แถวเหล่านี้ถูกปิดที่นี่ตรง ๆ ไม่เคยผ่าน `deliverHead`/`failRow` เลยสักบรรทัด ⇒ ตัวแจ้งที่แขวน
   * ไว้ที่นั่น (ซึ่งเป็นที่ที่ดูเป็นธรรมชาติที่สุด) มองไม่เห็นเคสนี้เลย — และนี่คือเคสที่ต้องบอก
   * ผู้ขายที่สุดในทั้งฟีเจอร์: `UNCERTAIN_SEND_REASON` แปลว่า *เราไม่รู้ว่าข้อความออกไปหรือยัง
   * ไปเปิดดูในแชทลูกค้าก่อนกดส่งใหม่*. ผู้ขายที่ไม่รู้จะพิมพ์ส่งใหม่ทันที = ลูกค้าได้ข้อความซ้ำ
   *
   * ยิงทีละแถว แต่ผู้ขายไม่ได้ noti ท่วม: throttle ต่อเธรดใน `pushChatSendFailed` รวบให้เหลือใบเดียว
   * ต่อห้องอยู่แล้ว — ให้ตัวที่รู้เรื่อง noti เป็นคนรวบ ดีกว่ามาเดา group เองที่นี่ (นิยามซ้ำ = HR16)
   *
   * ทำ **หลัง** ปิดครบทุกแถว: การปิดแถวคือสิ่งที่ปลดล็อกคิวของห้อง ห้ามให้ค้างรอ noti
   */
  let staleNotified = 0
  for (const closedRow of staleRows) {
    /**
     * 🛑 (R-E ขั้นที่ 1 ต่อ) ด่านนี้ **แยกจากด่านของลูปปิดแถว** และหยุดคนละอย่างกัน:
     * ลูปบนอาจจบครบทุกแถวภายในงบเวลา แล้วมาหมดเวลาตรงนี้แทน (noti มี HTTP ไป Expo ข้างใน
     * ส่วนการปิดแถวเป็น `updateMany` ล้วน) ⇒ ถอดด่านใดด่านหนึ่งออกต้องมีเทสคนละตัวจับ
     *
     * ⚠️ ของที่ข้ามตรงนี้ **ตกหล่นถาวร** — แถวถูกปิดเป็น FAILED ไปแล้ว รอบถัดไปจึงไม่เห็นมันอีก
     * ยอมได้เพราะผู้ขายยังเห็นบับเบิลแดงในจอ (noti เป็นชั้นเสริม ไม่ใช่ชั้นเดียว) แต่ **ต้องนับ
     * และ log** ไม่ใช่กลืนทิ้ง — ดู `staleUnnotified`
     */
    if (Date.now() >= deadline) {
      timedOut = true
      break
    }
    await notifySendFailed(closedRow.conversationId, closedRow.shopId, UNCERTAIN_SEND_REASON)
    staleNotified += 1
  }
  const staleUnnotified = staleRows.length - staleNotified

  /**
   * งบเวลาหมดไปแล้วตั้งแต่ขั้นที่ 1 ⇒ **จบรอบตรงนี้** ไม่เดินต่อไปขั้นที่ 2
   *
   * ไม่ใช่แค่ประหยัด 3 query: `drainRoom` เช็ค deadline เป็นสิ่งแรกอยู่แล้ว ⇒ เดินต่อไปจะได้
   * `rooms = N` ที่ไม่มีห้องไหนถูกระบายเลยสักห้อง = **ตัวเลขที่โกหกใน log** ซึ่งเป็นตัวเลขที่
   * §10 ใช้ตอบว่ากลไกทำงานอยู่ไหม
   */
  if (timedOut) return { rooms: 0, sent: 0, failed: 0, stale, staleRows, timedOut, staleUnnotified }

  // ── 2) ห้องที่ยังมีแถว "หยิบได้" เหลืออยู่ ──
  //
  // 🛑 ต้องเป็น `groupBy` ไม่ใช่ `findMany` + `distinct` (F3): Prisma ทำ `distinct` **ในหน่วยความจำ**
  // แล้ว **ตัด `LIMIT` ทิ้งทั้งดุ้น** — SQL ที่ออกจริงของรูปแบบเดิมคือ
  //   SELECT "conversationId", "createdAt" FROM "ChatMessage"
  //   WHERE "deliveryStatus" = $1 AND "sendLockedAt" IS NULL ORDER BY "createdAt" ASC OFFSET $2
  // (ไม่มี LIMIT เลย) ⇒ ทุกรอบของตัวกวาดดึงแถวที่หยิบได้ **ทั้งตาราง** มาก่อนแล้วค่อยตัดเหลือ 50 ห้อง
  // ปริมาณวันนี้ไม่เจ็บ แต่วันที่ปลายทางล่มแล้วคิวค้างหลักพัน จะโหลดทั้งกองทุกนาที
  //
  // `groupBy` บังคับ `LIMIT` ที่ระดับ SQL จริง (ยืนยันด้วย query log — ดู task-6-report.md §Fix round 1)
  // เรียงด้วย `_min.createdAt` = "ห้องที่มีของค้างเก่าสุดมาก่อน" ซึ่งเป็นเจตนาเดิมของ `orderBy` ตัวเก่า
  //
  // 🛑 (R-A) `take: limit` ตรง ๆ ไม่ได้: เกณฑ์ตรงนี้คือ "ห้องที่ **มีแถว** หยิบได้" แต่ `headOfRoom`
  // คืน `null` ถ้า **ใบเก่าสุด** ถูก claim อยู่ (D-3 — ห้ามข้ามลำดับ) ⇒ ห้องที่หัวคิวถูก claim ค้าง
  // แต่ยังไม่ถึงเพดาน 3 นาที จะถูกเลือกมาแล้ว `return 'NONE'` ทันที **กินสล็อตฟรี**
  // ตอนเกิดเหตุจริง (after() ตายเป็นแถบ) ห้องแบบนี้คือห้องส่วนใหญ่ ⇒ 50 สล็อตถูกกินหมดโดยห้องที่
  // ระบายไม่ได้ ส่วนห้องที่ระบายได้อดตายทุกนาที — เกณฑ์ที่ถูกคือ "**หัวคิว**หยิบได้"
  // ⚠️ ขอบของตัวคูณนี้: ถ้า `limit * ROOM_CANDIDATE_MULTIPLIER` ห้องแรก **หัวคิวถูก claim หมดทุกห้อง**
  // รอบนั้นจะได้ 0 ห้องทั้งที่ยังมีงานอยู่จริง — ยอมได้เพราะสถานการณ์นั้นแปลว่ามี worker กำลังทำงาน
  // อยู่จริงเป็นแถบ (หรือกำลังจะถูกปิดเป็น stale ในรอบถัดไป) และ cron มาใหม่ทุก 1 นาที
  const candidates = await prisma.chatMessage.groupBy({
    by: ['conversationId'],
    where: { deliveryStatus: 'QUEUED', sendLockedAt: null },
    _min: { createdAt: true },
    orderBy: { _min: { createdAt: 'asc' } },
    take: limit * ROOM_CANDIDATE_MULTIPLIER,
  })
  if (candidates.length === 0)
    return { rooms: 0, sent: 0, failed: 0, stale, staleRows, timedOut, staleUnnotified }

  // ใบเก่าสุดที่ยัง QUEUED ของห้องเดียวกัน (ไม่กรอง `sendLockedAt`) = "หัวคิว" ตามนิยามของ `headOfRoom`
  // เท่ากับใบเก่าสุดที่ *หยิบได้* เมื่อไหร่ ⇒ หัวคิวยังไม่ถูก claim ⇒ ห้องนี้ระบายได้จริง
  const headTimes = await prisma.chatMessage.groupBy({
    by: ['conversationId'],
    where: { conversationId: { in: candidates.map((c) => c.conversationId) }, deliveryStatus: 'QUEUED' },
    _min: { createdAt: true },
  })
  const headAt = new Map(headTimes.map((h) => [h.conversationId, h._min.createdAt?.getTime() ?? null]))
  const roomIds = candidates
    .filter((c) => {
      const claimableAt = c._min.createdAt?.getTime()
      // เทียบเวลาแทนการดึงแถวมาเทียบ id — ค่าเสมอกันสองแถวในห้องเดียวแทบเป็นไปไม่ได้ (timestamp
      // ระดับไมโครวินาที) และถ้าเสมอจริงผลที่ได้คือ "ลองระบายห้องนั้น" ซึ่งเป็นฝั่งที่ปลอดภัย:
      // `deliverHead` ยังเป็นคนตัดสินด้วย `headOfRoom` ตัวจริงอยู่ดี ตรงนี้เป็นแค่ตัวคัดผู้สมัคร
      return claimableAt !== undefined && claimableAt === headAt.get(c.conversationId)
    })
    .slice(0, limit)
    .map((c) => c.conversationId)
  if (roomIds.length === 0)
    return { rooms: 0, sent: 0, failed: 0, stale, staleRows, timedOut, staleUnnotified }

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

  /**
   * 🛑 (R-D) เพดาน **รวม** ไม่ใช่แค่ต่อเพจ — E-8 กันได้เฉพาะ rate limit ของ Meta (หน่วยเป็นเพจ)
   * แต่ `Promise.all` บนทุกกลุ่มแปลว่า 50 เพจ = 50 ห้องระบายพร้อมกัน แต่ละห้องยิง Prisma หลายคิว
   * + Graph หลายครั้ง ⇒ connection pool หมด/timeout ⇒ แถวค้าง claim ⇒ อีก 3 นาทีกลายเป็น
   * "ไม่แน่ใจว่าส่งไปหรือยัง" = **แปลงปัญหา throughput ให้เป็นความล้มเหลวที่ผู้ขายเห็นและแก้เองไม่ได้**
   * งานที่เกินเพดานไม่ได้หายไปไหน — รอบถัดไป (อีก 1 นาที) รับช่วงต่อ ซึ่งถูกกว่าการล้มทั้งกอง
   */
  const queue = [...groups.values()]
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT_CHANNELS, queue.length) }, async () => {
    for (;;) {
      const ids = queue.shift()
      if (!ids) break
      for (const conversationId of ids) {
        // 🛑 ไม่มีด่านงบเวลาซ้ำตรงนี้โดยตั้งใจ — `drainRoom` เช็คเป็นสิ่งแรกก่อน claim ใด ๆ อยู่แล้ว
        // ⇒ ห้องที่เหลือจะจบทันทีโดยไม่แตะ DB. ด่านที่สองที่ให้ผลเหมือนกันทุกกรณีคือด่านที่เขียน
        // กลับด้านแล้วไม่มีอะไรจับได้ (พิสูจน์ด้วย mutation: ถอดออกแล้วเทสยังเขียวทั้งชุด)
        try {
          // ระบายจนหมดห้อง ไม่ใช่ใบเดียวต่อรอบกวาด — ไม่งั้นห้องที่มี 3 ใบค้างต้องรอ 3 นาที
          const res = await drainRoom(conversationId, opts.owner, deadline)
          sent += res.sent
          failed += res.failed
        } catch (e) {
          // ห้องเดียวพังต้องไม่ฆ่าการกวาดของห้องที่เหลือ — แถวยังค้าง QUEUED + claim ไว้แล้ว
          // จึงจะถูกปิดเป็น "ไม่แน่ใจ" ในรอบถัดไปตามเพดานเวลา ไม่ถูกยิงซ้ำ
          console.error('[chat-outbox] กวาดห้องไม่สำเร็จ', { conversationId, error: e })
        }
      }
    }
  })
  await Promise.all(workers)

  // ห้องที่เหลือถูก `drainRoom` ตัดจบด้วย deadline เดียวกัน — สะท้อนออกมาเป็น timedOut ให้ log เห็น
  if (Date.now() >= deadline) timedOut = true
  return { rooms: roomIds.length, sent, failed, stale, staleRows, timedOut, staleUnnotified }
}
