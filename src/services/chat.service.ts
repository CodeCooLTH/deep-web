import { prisma } from '@/lib/prisma'
import { PROBLEM_CARRIER_STATUSES } from '@/lib/iship/status'
import { canAccessShop, listAccessibleShopIds } from '@/lib/shop-context'
import { Prisma } from '@prisma/client'
import { getProductById } from '@/services/product.service'
import { APPOINTMENT_CARD_PREVIEW } from '@/lib/appointment-summary'
import { detectScamLink } from '@/lib/scam-link-detector'
import { pauseForHumanTakeover, clearTakeoverOnResolve } from '@/services/auto-reply-takeover.service'

export type SenderRole = 'BUYER' | 'SHOP'
// CALL = เหตุการณ์การโทรที่ Meta แจ้งมา (icon-template) — ไม่ใช่ข้อความที่ใครพิมพ์ ไม่มีใครส่งได้เอง
export type ChatMessageType = 'TEXT' | 'IMAGE' | 'PRODUCT' | 'VIDEO' | 'AUDIO' | 'FILE' | 'ORDER' | 'CALL'

export interface ConversationSummary {
  id: string
  buyerUserId: string | null
  shopId: string
  lastMessageAt: Date
  lastMessagePreview: string | null
  lastSenderRole: SenderRole | null
  buyerLastReadAt: Date | null
  shopLastReadAt: Date | null
  createdAt: Date
  channel: string // "DEEP" | "MESSENGER" | "INSTAGRAM" — feature 00018
  shopChannelId: string | null
  externalContactId: string | null
  lastInboundAt: Date | null
  // S-7 (ตัวกรอง/จัดการเธรด) — findMany ไม่มี select จึงคืนทุกคอลัมน์จริงตอน runtime (cast ปลอดภัย);
  // ประกาศเพิ่มเพื่อให้ UI ใช้ทำ pin indicator + badge "ปิดงานแล้ว" (route spread ...i ส่งต่อเอง)
  isPinned: boolean
  resolvedAt: Date | null
  // feature 00018 CRM — alias (ชื่อในแชท) findMany คืนคอลัมน์นี้ runtime อยู่แล้ว
  alias: string | null
  // feature 00018 — กลุ่ม/แท็บที่ร้านจัดเธรดนี้ไว้ (null = แท็บ "ทั้งหมด"); findMany คืน runtime อยู่แล้ว
  chatGroupId: string | null
  // feature 00018 — สแปม (user สั่ง 2026-07-24); findMany คืน runtime อยู่แล้ว
  isSpam: boolean
  // feature 00018 E5 — รหัสโฆษณาที่พาลูกค้าเข้ามา (ชิป `ad_id.…` ในรายการแชท แบบ Business Suite,
  // user request 2026-07-26); findMany คืน runtime อยู่แล้วเช่นกัน
  referralAdId: string | null
}

/**
 * feature 00023 — เหตุผลเบื้องหลังคำตอบอัตโนมัติ 1 ครั้ง (แสดงตอนชี้ที่ป้าย "ระบบตอบ")
 *
 * ชื่อเพจ/โฆษณา/สินค้าเป็น **ชื่อปัจจุบัน** ที่ resolve จากรหัสที่บันทึกไว้ — ต่างจากฟิลด์อื่น
 * ในนี้ที่เป็น snapshot แท้ ๆ ยอมรับความไม่ตรงจุดนี้เพราะทางเลือกคือแสดงรหัสดิบ (uuid/ad id)
 * ซึ่งร้านอ่านไม่รู้เรื่องเลย; null = ตอนนั้นไม่ได้ใช้เงื่อนไขนั้น หรือของถูกลบไปแล้ว
 */
/** ต้องตรงกับที่ ai-enhance.service.ts เขียนลง AutoReplyLog.aiContext */
export interface AiAnswerContext {
  mode?: 'KNOWLEDGE' | 'FREE'
  knowledgeCount?: number
  productCount?: number
  historyCount?: number
  webSearch?: boolean
  shopOnly?: boolean
  guardrailBlock?: number
  guardrailAvoid?: number
  hasExtraPrompt?: boolean
  hasImages?: boolean
  usedKnowledgeIds?: string[]
}

export interface AutoReplyTrace {
  /**
   * ที่มาของคำตอบ: "KEYWORD"/"QNA" = คำตอบสำเร็จรูปที่ร้านเขียนไว้ · "CHATBOT" = AI แต่งเอง
   * จากคลังความรู้ · null = แถวเก่าก่อนมีคอลัมน์นี้ ให้อ่านว่า KEYWORD (ดู DATABASE.md §3.8)
   *
   * ชั้น UI ใช้ค่านี้เลือกชื่อป้าย — คนละชื่อเพราะเป็นคนละอย่างจริง ๆ: อันหนึ่งร้านเขียนเอง
   * อีกอันเครื่องแต่งขึ้น ร้านต้องแยกออกตั้งแต่แรกเห็นว่าอันไหนต้องตรวจ
   */
  matchedVia: string | null
  /** ข้อมูลที่ AI ใช้ประกอบการตอบครั้งนั้น (feature 00023) — null = ไม่ใช่คำตอบจาก AI */
  aiContext: AiAnswerContext | null
  /**
   * บริบทของคำตอบที่มาจาก "ลูกค้าแตะปุ่มบนเมนูลัดใน LINE" (feature 00045 FR-RM-09)
   * null = ไม่ได้มาจากเมนูลัด · 🛑 `buttonLabel` คือคำจริงที่ร้านตั้งไว้ ไม่ใช่ค่าคงที่
   */
  richMenuContext: { buttonLabel: string; orderNo: string | null } | null
  keywordName: string | null
  matchedPhrase: string | null
  matchType: string | null // "EXACT" | "CONTAINS" | "STARTS_WITH" — แปลเป็นไทยที่ชั้น UI
  channelName: string | null
  adLabel: string | null
  productName: string | null
}

export interface ChatMessageView {
  id: string
  conversationId: string
  senderUserId: string | null
  senderRole: SenderRole
  type: ChatMessageType
  body: string | null
  imageUrl: string | null
  // ไฟล์แนบ (2026-08-02 multi-attachment) — ชื่อเดิม/ขนาด ณ ตอนส่ง; null = ข้อความเก่าหรือไฟล์ที่
  // mirror มาจาก Messenger/IG (Meta ไม่ส่งชื่อมา) → UI fallback ผ่าน attachmentDisplayName()
  // findMany ไม่มี select จึงคืนคอลัมน์นี้มาอยู่แล้ว — ประกาศ type เพิ่มเท่านั้น
  attachmentName?: string | null
  attachmentSize?: number | null
  productRefId: string | null // extension #1 Chat Product Context Card (FR-CTX-05) — เฉพาะ type='PRODUCT'
  // การ์ดสินค้าหลายชิ้นในข้อความเดียว (ส่วนขยาย 2026-08-11) — ว่าง = ใบเดียว (ใช้ productRefId เดิม)
  // findMany ไม่มี select จึงคืนคอลัมน์นี้มาอยู่แล้ว — ประกาศ type เพิ่มเท่านั้น
  productRefIds?: string[]
  orderRefToken: string | null // การ์ดออเดอร์ในแชท (user 2026-07-24) — เฉพาะ type='ORDER' (Order.publicToken)
  flaggedScam: boolean // extension #3 Scam-link Detection (FR-SCAM-03) — WARN banner เท่านั้น ไม่ block
  // feature 00023 — null = คนส่ง | 'AUTO' = ระบบตอบ | 'AUTO_TEST' = ระบบตอบขณะโหมดทดสอบ
  // ใช้ติดป้ายบนบับเบิลให้ร้านแยกออกว่าข้อความไหนบอทตอบ (AC-012-02, AC-021-05)
  // findMany ด้านล่างไม่มี select จึงคืนคอลัมน์นี้มาอยู่แล้วตั้งแต่ migration — แค่ประกาศ type เพิ่ม
  autoReplyKind: string | null
  // seq — ลำดับที่แถวถูกบันทึกจริง ใช้ตัดสินเมื่อ createdAt เท่ากัน (ดูเหตุผลใน schema.prisma)
  // findMany ไม่มี select จึงคืนคอลัมน์นี้มาอยู่แล้ว — ประกาศ type เพิ่มให้ฝั่ง client ใช้เรียงได้
  // optional เพราะข้อความ optimistic ที่ client สร้างเองยังไม่มี seq จนกว่าจะบันทึกจริง
  seq?: number
  // feature 00023 — "ทำไมบอทตอบข้อความนี้" ทั้งชุด สำหรับ popover ใต้ป้าย "ระบบตอบ" ในเธรด
  //
  // ทุกค่าเป็น snapshot ที่ AutoReplyLog บันทึกไว้ **ตอนตัดสินใจตอบ** ไม่ใช่การคำนวณย้อนหลัง —
  // ถ้าร้านแก้กฎทีหลัง ข้อความเก่ายังบอกความจริง ณ ตอนนั้นได้ถูกต้อง
  // ไม่ใช่คอลัมน์ใน ChatMessage — getMessages join มาเติมให้ (null = คนพิมพ์เอง หรือหาบันทึกไม่เจอ)
  autoReply: AutoReplyTrace | null
  createdAt: Date
}

// ---- getOrCreateConversation ----
// buyerUserId ต้อง = session.user.id เสมอ (caller/route รับผิดชอบ ไม่รับจาก client body)
export async function getOrCreateConversation(
  buyerUserId: string,
  shopId: string,
): Promise<ConversationSummary> {
  const existing = await prisma.conversation.findUnique({
    where: { buyerUserId_shopId: { buyerUserId, shopId } },
  })
  if (existing) return existing as ConversationSummary

  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { id: true } })
  if (!shop) throw new Error('SHOP_NOT_FOUND')

  try {
    return (await prisma.conversation.create({ data: { buyerUserId, shopId } })) as ConversationSummary
  } catch (e) {
    // race: อีก request สร้างไปพร้อมกัน — P2002 unique violation → หาแถวที่ชนะแทน
    const isUnique = (e as { code?: string })?.code === 'P2002'
    if (isUnique) {
      const winner = await prisma.conversation.findUnique({
        where: { buyerUserId_shopId: { buyerUserId, shopId } },
      })
      if (winner) return winner as ConversationSummary
    }
    throw e
  }
}

// ---- listConversationsForShop / listConversationsForBuyer ----
// shopId/buyerUserId ต้อง derive จาก session ที่ route แล้ว (ownership ผ่านมาจากผู้เรียก ไม่ verify ซ้ำในนี้
// — เหมือน pattern getStockMovementHistory(shop.id, ...) ของ 00009)
//
// T1 (feature 00018): เพิ่ม filter สำหรับ Chat Rail ฝั่ง seller — channel/shopChannelId/q ทั้งหมด optional
// shopId ยังคง filter เสมอผ่าน `where` object ด้านล่าง (ANDed กับทุก filter อื่น) — ห้าม caller ข้ามได้
// S-7: filter ผูก Customer — เธรด DEEP ผูกผ่าน User.customer (back-relation ของ Customer.userId),
// เธรดช่องทางนอกผูกผ่าน ExternalContact.customerId โดยตรง — ทุกแถว Conversation เป็นได้แค่แบบใดแบบ
// หนึ่ง (buyerUserId ไม่ null = DEEP, externalContactId ไม่ null = ช่องทางนอก บังคับโดย schema
// unique constraint คนละคู่) จึงเช็คแค่ 2 branch นี้ครบถ้วนแล้ว ไม่มีเคสที่ 3
function customerLinkedWhere(mode: 'linked' | 'unlinked'): Prisma.ConversationWhereInput {
  if (mode === 'linked') {
    return {
      OR: [
        { buyerUserId: { not: null }, buyer: { customer: { isNot: null } } },
        { externalContactId: { not: null }, externalContact: { customerId: { not: null } } },
      ],
    }
  }
  return {
    OR: [
      { buyerUserId: { not: null }, buyer: { customer: null } },
      { externalContactId: { not: null }, externalContact: { customerId: null } },
    ],
  }
}

/** สถานะพัสดุของ "ออเดอร์ล่าสุด" ของลูกค้าในเธรดนั้น (feature 00018 — user สั่ง 2026-07-31) */
export type ShipmentFilter = 'none' | 'unprinted' | 'printed' | 'problem'

/**
 * conversationIdsByShipmentState — id ของเธรดที่ออเดอร์ล่าสุดของลูกค้าอยู่ในสถานะพัสดุที่ระบุ
 *
 * ทำไม raw SQL: เกณฑ์คือ "ออเดอร์ล่าสุดต่อลูกค้า" ซึ่ง Prisma แสดงใน `where` ตรง ๆ ไม่ได้
 * (relation filter ของ Prisma ตอบได้แค่ "มีออเดอร์สักใบที่ตรงเงื่อนไข" ซึ่งคนละความหมาย —
 * ร้านที่เพิ่งพิมพ์ใบใหม่จะยังติดตัวกรอง "ยังไม่พิมพ์" เพราะมีใบเก่าที่ไม่เคยพิมพ์อยู่)
 * DISTINCT ON เอาใบล่าสุดต่อลูกค้าก่อน แล้วค่อยตัดสิน — ตรรกะเดียวกับ enrichWithOrderStage
 * ที่ชิปสถานะในแถวใช้ จึงไม่ขัดกับสิ่งที่ผู้ใช้เห็นตรงหน้า
 *
 * เชื่อม conversation → ลูกค้า 2 ทาง: ช่องทางนอกผ่าน ExternalContact.customerId,
 * เธรด DEEP ผ่าน Customer.userId (เหมือน enrichWithOrderStage)
 *
 * คืน id ให้ caller เอาไปกรองด้วย `id: { in: [...] }` — pattern เดียวกับ readState
 */
export async function conversationIdsByShipmentState(
  // feature 00037 — รับหลายร้าน (กล่องแชทรวม); โหมดร้านเดียวส่ง array ความยาว 1 ผลลัพธ์เท่าเดิม
  shopIds: string[],
  state: ShipmentFilter,
): Promise<string[]> {
  if (shopIds.length === 0) return []
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH latest AS (
      -- คีย์ต้องมี shopId ด้วย (feature 00037) — Customer เป็นตารางระดับทั้งระบบ ลูกค้าคนเดียว
      -- มีออเดอร์หลายร้านได้ ถ้า DISTINCT ON แค่ customerId ตัวกรองพัสดุของร้าน B จะตัดสินจาก
      -- ออเดอร์ล่าสุดของร้าน A (ผลลัพธ์ดูสมเหตุสมผลแต่ผิดร้าน = หาสาเหตุยากมาก)
      SELECT DISTINCT ON (o."shopId", o."customerId")
        o."shopId"     AS "shopId",
        o."customerId" AS "customerId",
        s."id"             AS "shipmentId",
        s."labelPrintedAt" AS "labelPrintedAt",
        s."carrierStatus"  AS "carrierStatus"
      FROM "Order" o
      LEFT JOIN LATERAL (
        SELECT sh."id", sh."labelPrintedAt", sh."carrierStatus"
        FROM "OrderShipment" sh
        WHERE sh."orderId" = o."id" AND sh."status" <> 'CANCELLED'
        ORDER BY sh."createdAt" DESC
        LIMIT 1
      ) s ON true
      WHERE o."shopId" IN (${Prisma.join(shopIds)}) AND o."customerId" IS NOT NULL
      ORDER BY o."shopId", o."customerId", o."createdAt" DESC
    )
    SELECT c."id" AS id
    FROM "Conversation" c
    LEFT JOIN "ExternalContact" ec ON ec."id" = c."externalContactId"
    LEFT JOIN "Customer" cu ON cu."userId" = c."buyerUserId"
    -- จับคู่ทั้ง shopId และ customerId — เธรดของร้านไหนต้องดูออเดอร์ของร้านนั้นเท่านั้น
    JOIN latest l ON l."customerId" = COALESCE(ec."customerId", cu."id") AND l."shopId" = c."shopId"
    WHERE c."shopId" IN (${Prisma.join(shopIds)})
      AND ${
        state === 'none'
          ? Prisma.sql`l."shipmentId" IS NULL`
          : state === 'unprinted'
            ? Prisma.sql`l."shipmentId" IS NOT NULL AND l."labelPrintedAt" IS NULL`
            : // ใช้รายชื่อสถานะชุดเดียวกับป้ายในแถว — ถ้านิยาม "มีปัญหา" สองที่ไม่ตรงกัน
              // ตัวกรองจะกรองแล้วได้ผลไม่ตรงกับที่ตาเห็น ซึ่งเป็นบั๊กที่หาสาเหตุยากมาก
              state === 'problem'
              ? Prisma.sql`l."carrierStatus" = ANY(${[...PROBLEM_CARRIER_STATUSES]}::text[])`
              : Prisma.sql`l."labelPrintedAt" IS NOT NULL`
      }
  `
  return rows.map((r) => r.id)
}

export async function listConversationsForShops(
  /**
   * shopIds (feature 00037) — ร้านที่รายการครอบคลุม มาจาก resolveChatScope() เท่านั้น
   * 🛑 ห้ามรับค่านี้จาก query string ของ client โดยตรง (BR-UNI-01) — ตัวกรองร้านที่ผู้ใช้เลือก
   *    ต้องผ่าน intersectScopedShopIds() ให้อยู่ในขอบเขตก่อนเสมอ
   * ความยาว 1 = โหมดร้านเดียว ซึ่งให้ผลลัพธ์เท่าเดิมทุกประการกับก่อนมีฟีเจอร์นี้
   */
  shopIds: string[],
  opts: {
    cursor?: string
    take?: number
    channel?: string
    shopChannelId?: string
    q?: string
    // S-7 (ตัวกรองแชท): status default 'open' — ต้องระบุ 'all' ชัดเจนถึงจะเห็นที่ปิดงานแล้วด้วย
    status?: 'open' | 'resolved' | 'all'
    // hidden default false — ไม่โชว์เธรดที่ซ่อนในรายการปกติ, true = ดูเฉพาะที่ซ่อน (เมนู "ซ่อนอยู่")
    hidden?: boolean
    customerLinked?: 'all' | 'linked' | 'unlinked'
    // chatGroupId: กรองแท็บกลุ่ม (feature 00018) — undefined = ทุกกลุ่ม (แท็บ "ทั้งหมด"), string = เฉพาะกลุ่มนั้น
    chatGroupId?: string
    // readState: กรองอ่านแล้ว/ยังไม่อ่าน (feature 00018) — undefined = ทั้งหมด (default ไม่กรอง)
    readState?: 'unread' | 'read'
    // spam (feature 00018): false/undefined = รายการปกติ (ตัดสแปมออก), true = ดูเฉพาะสแปม
    spam?: boolean
    // tags (user สั่ง 2026-07-31): กรองด้วยแท็กของผู้ติดต่อ — "ติดอันใดก็ได้" (OR) ไม่ใช่ต้องครบทุกอัน
    tags?: string[]
    // shipment (user สั่ง 2026-07-31): สถานะพัสดุของออเดอร์ล่าสุด — เฉพาะร้านที่เชื่อม iShip
    shipment?: ShipmentFilter
  } = {},
): Promise<{ items: ConversationSummary[]; nextCursor: string | null }> {
  const status = opts.status ?? 'open'
  const hidden = opts.hidden ?? false
  // ขอบเขตว่าง (ตัวกรองร้านชี้ไปนอกสิทธิ์ — ดู intersectScopedShopIds) = ไม่มีอะไรให้แสดง
  // ต้องตัดจบที่นี่ ไม่ใช่ปล่อยให้ `IN ()` ลง SQL
  if (shopIds.length === 0) return { items: [], nextCursor: null }

  // ส่วนที่มี OR ของตัวเอง (q, customerLinked) เก็บแยกเป็น AND-array — กัน key `OR` ชนกันเองถ้า
  // ทั้งคู่ active พร้อมกัน (assign ที่ top-level object เดียวกันจะทับกันเงียบ ๆ แล้วฟิลเตอร์นึงหาย)
  const orParts: Prisma.ConversationWhereInput[] = []
  if (opts.q) {
    // ค้นหาจาก lastMessagePreview หรือชื่อ externalContact — relation filter ปลอดภัยกับ
    // externalContact = null (เธรด DEEP) เพราะ Prisma ไม่ match แถวที่ relation ไม่มี ไม่ throw
    orParts.push({
      OR: [
        { lastMessagePreview: { contains: opts.q, mode: 'insensitive' as const } },
        { externalContact: { name: { contains: opts.q, mode: 'insensitive' as const } } },
      ],
    })
  }
  if (opts.customerLinked && opts.customerLinked !== 'all') {
    orParts.push(customerLinkedWhere(opts.customerLinked))
  }
  // แท็ก: hasSome = "ติดอันใดก็ได้" ตามที่ user เลือก (ไม่ใช่ hasEvery ที่ต้องครบทุกอัน)
  // เธรด DEEP ไม่มี externalContact → relation filter ไม่ match เอง ไม่ throw (เหมือนเคส q)
  if (opts.tags && opts.tags.length > 0) {
    orParts.push({ externalContact: { tags: { hasSome: opts.tags } } })
  }

  // อ่านแล้ว/ยังไม่อ่าน — เทียบ column-vs-column ทำใน where ตรง ๆ ไม่ได้ จึงดึง id ที่ยังไม่อ่านมาก่อน
  // แล้วกรองด้วย id in/notIn (unread=in, read=notIn). ทำเฉพาะเมื่อมีตัวกรอง (default ไม่ query เพิ่ม)
  let readIdFilter: Prisma.ConversationWhereInput | null = null
  if (opts.readState) {
    const unreadIds = await unreadConversationIdsForShops(shopIds)
    readIdFilter = opts.readState === 'unread' ? { id: { in: unreadIds } } : { id: { notIn: unreadIds } }
  }

  // พัสดุ iShip — เกณฑ์อ้าง "ออเดอร์ล่าสุดต่อลูกค้า" ทำใน where ของ Prisma ไม่ได้
  // (ดู comment ที่ conversationIdsByShipmentState) จึงดึง id ที่ผ่านเกณฑ์มาก่อนแล้วกรองด้วย id
  // ใส่ใน AND-array ไม่ใช่ top-level เพราะ readIdFilter ก็ใช้คีย์ `id` เหมือนกัน — assign ทับกันเงียบ ๆ
  if (opts.shipment) {
    const ids = await conversationIdsByShipmentState(shopIds, opts.shipment)
    orParts.push({ id: { in: ids } })
  }

  return listConversations(
    {
      // ร้านเดียวยังใช้ equality เหมือนเดิม — planner ของ Postgres เลือก index ต่างกันเล็กน้อย
      // ระหว่าง `= $1` กับ `IN ($1)` และโหมดร้านเดียวคือเส้นทางของผู้ใช้ส่วนใหญ่ของระบบ
      ...(shopIds.length === 1 ? { shopId: shopIds[0] } : { shopId: { in: shopIds } }),
      ...(opts.channel ? { channel: opts.channel } : {}),
      ...(opts.shopChannelId ? { shopChannelId: opts.shopChannelId } : {}),
      ...(opts.chatGroupId ? { chatGroupId: opts.chatGroupId } : {}),
      ...(readIdFilter ?? {}),
      ...(status === 'open' ? { resolvedAt: null } : status === 'resolved' ? { resolvedAt: { not: null } } : {}),
      // สแปม (feature 00018): "ดูสแปม" โชว์เฉพาะสแปม และไม่กรอง isHidden (สแปมเป็นถังแยก —
      // ดูทั้งหมดในนั้น) เพื่อไม่ให้เธรดสแปมหายไปด้วย 2 เงื่อนไข
      // แท็บ "ทั้งหมด" รวมเธรดที่ปิดงานแล้ว (status 'all') แต่ยังตัดสแปมออกเสมอ —
      // user ลองรวมสแปมแล้วขอถอยกลับ 2026-07-31: ถังสแปมต้องเป็นถังแยกจริง ๆ
      ...(opts.spam ? { isSpam: true } : { isSpam: false, isHidden: hidden }),
      ...(orParts.length > 0 ? { AND: orParts } : {}),
    },
    { ...opts, pinnedFirst: true },
  )
}

/**
 * countUnreadByConversation — จำนวนข้อความ "ที่ฝั่งร้านยังไม่ได้อ่าน" ต่อบทสนทนา
 *
 * data model นี้เก็บ read-state ระดับ "ห้อง" (shopLastReadAt) ไม่ได้เก็บ read ต่อข้อความ
 * (BR-CHAT-09) — จำนวนที่ยังไม่อ่านจึงต้องนับสด: ข้อความจากลูกค้า (senderRole='BUYER') ที่ใหม่กว่า
 * shopLastReadAt ของห้องนั้น (ยังไม่เคยเปิดอ่านเลย = นับทั้งหมด)
 *
 * ทำไม raw SQL: เกณฑ์ cutoff (shopLastReadAt) ต่างกันรายบทสนทนา — `groupBy` ของ Prisma ใส่
 * เงื่อนไขที่อ้าง column ของอีกตารางต่อแถวไม่ได้ ต้อง JOIN เอง. query เดียวจบ ไม่ N+1 และวิ่งบน
 * index ที่มีอยู่แล้ว `ChatMessage(conversationId, createdAt)`
 *
 * ไม่ได้แก้ ConversationSummary (FROZEN CONTRACT, SDS §5) — เป็น enrichment แยกเหมือน
 * counterparty (ดู comment หัว api/chat/conversations/route.ts) caller ประกอบเองที่ชั้น route/page
 *
 * COUNT(*) ของ Postgres คืน bigint → แปลงเป็น number ก่อนส่งออก (JSON.stringify ตาย bigint)
 */
export async function countUnreadByConversation(conversationIds: string[]): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map()
  // user request 2026-07-25: ข้อความ *ล่าสุด* เป็นฝั่งเรา (SHOP — ตอบจาก Deep/admin คนอื่น/echo จาก
  // เพจโดยตรง) = ถือว่าอ่านหมดแล้ว (การตอบ = ได้อ่านสิ่งที่ลูกค้าส่งก่อนหน้าแล้ว) → ไม่นับ unread.
  // ต้องใส่เงื่อนไข lastSenderRole ที่ "ทั้ง badge และ filter" (unreadConversationIdsForShop) เหมือนกัน
  // เป๊ะ — ครั้งก่อนใส่ข้างเดียวทำให้ 2 ตัวไม่ตรงกัน (บั๊ก 2026-07-24). IS DISTINCT FROM กัน NULL
  const rows = await prisma.$queryRaw<{ conversationId: string; count: bigint }[]>`
    SELECT m."conversationId" AS "conversationId", COUNT(*) AS count
    FROM "ChatMessage" m
    JOIN "Conversation" c ON c.id = m."conversationId"
    WHERE m."conversationId" IN (${Prisma.join(conversationIds)})
      AND m."senderRole" = 'BUYER'
      AND c."lastSenderRole" IS DISTINCT FROM 'SHOP'
      AND (c."shopLastReadAt" IS NULL OR m."createdAt" > c."shopLastReadAt")
    GROUP BY m."conversationId"
  `
  return new Map(rows.map((r) => [r.conversationId, Number(r.count)]))
}

/**
 * unreadConversationIdsForShop — id ของเธรดที่ "ฝั่งร้านยังไม่ได้อ่าน" (feature 00018 ตัวกรอง unread/read)
 *
 * ต้องใช้เกณฑ์ "เดียวกันเป๊ะ" กับ badge unread (countUnreadByConversation): มีข้อความจากลูกค้า
 * (senderRole='BUYER') ที่ใหม่กว่า shopLastReadAt (ห้องยังไม่เคยอ่าน = นับทั้งหมด) + ข้อความล่าสุด
 * ต้องไม่ใช่ฝั่งเรา (lastSenderRole IS DISTINCT FROM 'SHOP'). ต้อง JOIN ChatMessage เหมือนกัน
 *
 * ประวัติ:
 *  - 2026-07-24: เดิม filter เช็ค c."lastSenderRole"='BUYER' ข้างเดียว แต่ badge ไม่เช็ค → 2 ตัวไม่ตรงกัน
 *    (badge นับ unread แต่ filter ตัดทิ้ง) จึงถอดเงื่อนไข lastSenderRole ออกจาก filter ให้ตรง badge
 *  - 2026-07-25 (user request): ข้อความล่าสุดเป็นฝั่งเรา (ตอบจาก Deep/admin คนอื่น/echo จากเพจตรง) =
 *    ถือว่าอ่านแล้ว → ใส่เงื่อนไข lastSenderRole กลับเข้ามา แต่คราวนี้ใส่ "ทั้ง badge และ filter"
 *    (countUnreadByConversation ด้วย) ให้ตรงกันเป๊ะ — บทเรียนเดิมคือต้อง sync ไม่ใช่ห้ามใช้เงื่อนไขนี้
 *
 * DISTINCT — เธรดหนึ่งมีได้หลายข้อความลูกค้าที่ยังไม่อ่าน คืน id เดียว. วิ่งบน index
 * ChatMessage(conversationId, createdAt) ที่มีอยู่แล้ว (เหมือน countUnreadByConversation)
 */
export async function unreadConversationIdsForShops(shopIds: string[]): Promise<string[]> {
  if (shopIds.length === 0) return []
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT c.id AS id
    FROM "Conversation" c
    JOIN "ChatMessage" m ON m."conversationId" = c.id
    WHERE c."shopId" IN (${Prisma.join(shopIds)})
      AND m."senderRole" = 'BUYER'
      AND c."lastSenderRole" IS DISTINCT FROM 'SHOP'
      AND (c."shopLastReadAt" IS NULL OR m."createdAt" > c."shopLastReadAt")
  `
  return rows.map((r) => r.id)
}

/**
 * countUnreadSpamConversations — จำนวนเธรด "สแปมที่ยังไม่อ่าน" สำหรับ badge บนแท็บสแปม
 * (user สั่ง 2026-07-31: นับเฉพาะที่ยังไม่อ่าน เกิน 99 แสดง 99+)
 *
 * นิยาม "ยังไม่อ่าน" ยกมาจาก unreadConversationIdsForShop ตัวเดียวกันเป๊ะ (SSOT) เพิ่มแค่
 * isSpam = true — ถ้าแก้เงื่อนไขที่นั่นต้องแก้ที่นี่ด้วย ไม่งั้นตัวเลขบนแท็บกับรายการจะไม่ตรงกัน
 *
 * performance: หยุดนับที่ 100 แถว (LIMIT ใน subquery) — UI แสดงแค่ "99+" อยู่แล้ว จึงไม่มี
 * เหตุผลให้ scan สแปมทั้งกอง ร้านที่โดนสแปมถล่มคือเคสที่ต้องระวังที่สุดพอดี. วิ่งบน index
 * ChatMessage(conversationId, createdAt) ที่มีอยู่แล้ว เหมือน unreadConversationIdsForShop
 */
export async function countUnreadSpamConversations(shopIds: string[]): Promise<number> {
  if (shopIds.length === 0) return 0
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM (
      SELECT DISTINCT c.id
      FROM "Conversation" c
      JOIN "ChatMessage" m ON m."conversationId" = c.id
      WHERE c."shopId" IN (${Prisma.join(shopIds)})
        AND c."isSpam" = true
        AND m."senderRole" = 'BUYER'
        AND c."lastSenderRole" IS DISTINCT FROM 'SHOP'
        AND (c."shopLastReadAt" IS NULL OR m."createdAt" > c."shopLastReadAt")
      LIMIT 100
    ) t
  `
  return Number(rows[0]?.n ?? 0)
}

/**
 * countUnreadConversations — จำนวนเธรด "ยังไม่อ่าน" ของร้าน สำหรับ badge บนแท็บ "ข้อความ"
 * (user สั่ง 2026-08-04: แท็บความคิดเห็นมีตัวเลขแล้ว แท็บข้อความต้องมีด้วย)
 *
 * เกณฑ์ต้องตรงกับ countUnreadSpamConversations เป๊ะ ต่างแค่ฝั่ง isSpam — ไม่งั้นเลข 2 ตัวบนจอ
 * เดียวกันจะนับคนละนิยามแล้วดูเหมือนระบบพัง (บทเรียนเดิม: "ยังไม่ตอบ" เคยโชว์ 7 กับ 8 พร้อมกัน)
 *
 * นับ "จำนวนเธรด" ไม่ใช่ "จำนวนข้อความ" — badge บนแท็บตอบคำถามว่า "มีกี่คนรอเราอยู่" ส่วนจำนวน
 * ข้อความต่อเธรดมีอยู่แล้วที่ badge ในแถว (countUnreadByConversation)
 *
 * ไม่รวมสแปม เพราะแท็บนั้นมี badge ของตัวเองอยู่แล้ว (นับซ้ำ = ตัวเลขบนสุดไม่ตรงกับผลรวมข้างล่าง)
 * LIMIT 100 เหมือนกัน — UI แสดงแค่ 99+ อยู่แล้ว ไม่ต้องนับต่อให้เปลืองฐาน
 */
export async function countUnreadConversations(shopIds: string[]): Promise<number> {
  if (shopIds.length === 0) return 0
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM (
      SELECT DISTINCT c.id
      FROM "Conversation" c
      JOIN "ChatMessage" m ON m."conversationId" = c.id
      WHERE c."shopId" IN (${Prisma.join(shopIds)})
        AND c."isSpam" = false
        AND m."senderRole" = 'BUYER'
        AND c."lastSenderRole" IS DISTINCT FROM 'SHOP'
        AND (c."shopLastReadAt" IS NULL OR m."createdAt" > c."shopLastReadAt")
      LIMIT 100
    ) t
  `
  return Number(rows[0]?.n ?? 0)
}

export async function listConversationsForBuyer(
  buyerUserId: string,
  opts: { cursor?: string; take?: number } = {},
): Promise<{ items: ConversationSummary[]; nextCursor: string | null }> {
  return listConversations({ buyerUserId }, opts)
}

async function listConversations(
  where: Prisma.ConversationWhereInput,
  opts: { cursor?: string; take?: number; pinnedFirst?: boolean },
): Promise<{ items: ConversationSummary[]; nextCursor: string | null }> {
  const take = opts.take ?? 20
  const pinnedFirst = opts.pinnedFirst ?? false

  // cursorCond spread ตรงกับ where ของ caller ได้อย่างปลอดภัย เพราะ caller (listConversationsForShop)
  // ไม่เคยเซ็ต top-level `OR` เอง (OR ของ q/customerLinked ถูกห่อใน `AND` ของ caller ไปแล้ว) — ที่นี่
  // จึงใช้ `OR` slot ได้เต็มที่โดยไม่ชนกัน (Prisma AND สิ่งที่เป็น sibling key ทุกตัวอยู่แล้วไม่ว่าจะเป็น
  // field ธรรมดาหรือ AND/OR พิเศษ)
  let cursorCond: Prisma.ConversationWhereInput = {}
  if (opts.cursor) {
    if (pinnedFirst) {
      // S-7: orderBy หลักคือ [isPinned desc, lastMessageAt desc] — cursor แบบเดิม (แค่ lastMessageAt)
      // จะพัง: ถ้าเธรดปักหมุดมีมากกว่า 1 หน้า หน้าแรกอาจโชว์แต่ปักหมุด แล้ว cursor = lastMessageAt
      // ของปักหมุดตัวสุดท้าย (อาจเก่ามาก) → เธรดไม่ปักหมุดที่ใหม่กว่า cursor นั้นจะหายไปถาวร (ไม่มี
      // `lastMessageAt < cursor` เป็นจริง) ต้องเข้ารหัส isPinned ของแถวสุดท้ายไปด้วย แล้วใช้ composite
      // keyset: ถ้าแถวสุดท้ายที่เห็นปักหมุดอยู่ → หน้าถัดไปยังต้องเห็นเธรดไม่ปักหมุดทั้งหมด (เวลาไหนก็ได้)
      // บวกเธรดปักหมุดที่เหลือที่เก่ากว่า; ถ้าแถวสุดท้ายไม่ปักหมุด → กรองแค่ไม่ปักหมุด+เก่ากว่าปกติ
      // (เธรดปักหมุดทั้งหมดต้องโชว์ไปหมดแล้วก่อนหน้านี้ เพราะ orderBy ให้ปักหมุดมาก่อนเสมอ)
      //
      // ตัวคั่น '|' ไม่ใช่ ':' — ISO datetime มี ':' อยู่ในตัวเองอยู่แล้ว (เช่น "10:00:00.000Z")
      // ถ้าใช้ ':' เป็นตัวคั่น indexOf จะเจอ ':' ตัวแรกในเวลาแทนตัวคั่นจริงเมื่อ cursor ไม่ได้เข้ารหัส
      // prefix (เช่น cursor เก่าที่เป็น ISO ล้วน) ทำให้ตัด string ผิดตำแหน่งจนได้ Invalid Date
      const sepIdx = opts.cursor.indexOf('|')
      const cursorPinned = sepIdx >= 0 ? opts.cursor.slice(0, sepIdx) === '1' : false
      const cursorTime = new Date(sepIdx >= 0 ? opts.cursor.slice(sepIdx + 1) : opts.cursor)
      cursorCond = cursorPinned
        ? { OR: [{ isPinned: false }, { isPinned: true, lastMessageAt: { lt: cursorTime } }] }
        : { isPinned: false, lastMessageAt: { lt: cursorTime } }
    } else {
      cursorCond = { lastMessageAt: { lt: new Date(opts.cursor) } }
    }
  }

  const rows = await prisma.conversation.findMany({
    where: { ...where, ...cursorCond },
    orderBy: pinnedFirst ? [{ isPinned: 'desc' }, { lastMessageAt: 'desc' }] : { lastMessageAt: 'desc' },
    take: take + 1, // +1 trick หา hasMore — ต้นแบบ getStockMovementHistory
  })
  const hasMore = rows.length > take
  const page = hasMore ? rows.slice(0, take) : rows
  const last = page[page.length - 1] as (ConversationSummary & { isPinned?: boolean }) | undefined
  const nextCursor = hasMore
    ? pinnedFirst
      ? `${last!.isPinned ? '1' : '0'}|${last!.lastMessageAt.toISOString()}`
      : last!.lastMessageAt.toISOString()
    : null
  return {
    items: page as ConversationSummary[],
    nextCursor,
  }
}

/**
 * cursor ของหน้าเธรด — รูปแบบ "<iso>|<seq>" (composite keyset)
 *
 * เดิมเป็น ISO ล้วนแล้วกรองด้วย createdAt < cursor ซึ่งพลาดเมื่อมีหลายข้อความเวลาเดียวกันเป๊ะ:
 * แถวที่เสมอกับขอบหน้าจะถูกตัดทิ้งทั้งกลุ่มหรือซ้ำ (Meta ส่งเวลาข้อความระบบมาแค่ระดับวินาที
 * จึงเสมอกันบ่อยจริง) — seq เข้ามาเป็นตัวตัดสิน
 *
 * ยังรับรูปเก่าได้ (seq = null) เพราะ client ที่เปิดค้างอยู่ตอน deploy ยังถือ cursor รูปเดิม
 */
function parseMessageCursor(raw?: string): { createdAt: Date; seq: number | null } | null {
  if (!raw) return null
  const [iso, seqRaw] = raw.split('|')
  const createdAt = new Date(iso)
  if (Number.isNaN(createdAt.getTime())) return null
  const seq = Number(seqRaw)
  return { createdAt, seq: seqRaw !== undefined && Number.isFinite(seq) ? seq : null }
}

// ---- getMessages ----
// conversationId มาจาก client (path param) — ต้อง verify ownership จริงในนี้ (ต่างจาก listConversations*)
export async function getMessages(
  conversationId: string,
  actorUserId: string,
  opts: { cursor?: string; take?: number } = {},
): Promise<{ items: ChatMessageView[]; nextCursor: string | null }> {
  await assertParticipant(conversationId, actorUserId)

  const take = opts.take ?? 30
  const cursor = parseMessageCursor(opts.cursor)
  const rows = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      ...(cursor
        ? cursor.seq === null
          ? // cursor รูปเก่า (ISO ล้วน) ที่ client เดิมยังถืออยู่ — คงพฤติกรรมเดิมไว้
            { createdAt: { lt: cursor.createdAt } }
          : // keyset composite: เก่ากว่าจริง ๆ หรือเวลาเท่ากันแต่ seq น้อยกว่า
            {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, seq: { lt: cursor.seq } },
              ],
            }
        : {}),
    },
    // ใหม่→เก่า (pagination); client reverse ก่อน render
    // seq เป็นตัวตัดสินเมื่อ createdAt เท่ากัน — Meta ส่งเวลาข้อความระบบ/การ์ดมาแค่ระดับวินาที
    // ทำให้เสมอกันบ่อย ถ้าไม่มีตัวตัดสินลำดับจะไม่แน่นอนและกระโดดข้ามแถวตอนแบ่งหน้าได้
    orderBy: [{ createdAt: 'desc' }, { seq: 'desc' }],
    take: take + 1,
  })
  const hasMore = rows.length > take
  const page = hasMore ? rows.slice(0, take) : rows

  // feature 00023 — "ทำไมบอทตอบข้อความนี้" สำหรับ popover ใต้ป้าย "ระบบตอบ" ในเธรด
  //
  // join ผ่าน AutoReplyLog.outboundMessageId แทนการเพิ่มคอลัมน์ใน ChatMessage เพราะความสัมพันธ์นี้
  // ถูกบันทึกไว้แล้วตั้งแต่ตอนตัดสินใจตอบ — เพิ่มคอลัมน์ = ข้อมูลซ้ำที่ต้องคอยให้ตรงกันสองที่
  //
  // กรองด้วย conversationId ไม่ใช่ `outboundMessageId IN (...)` ตั้งใจ: outboundMessageId ไม่มี index
  // แต่ [conversationId, createdAt] มี และจำนวนแถวที่ได้ถูกจำกัดด้วย maxRepliesPerConversation
  // (ค่าเริ่มต้น 10) อยู่แล้ว จึงเป็น index scan สั้น ๆ ไม่ใช่ seq scan ทั้งตาราง
  const traceByMessageId = new Map<string, AutoReplyTrace>()
  if (page.some((m) => m.autoReplyKind)) {
    const logs = await prisma.autoReplyLog.findMany({
      where: { conversationId, decision: 'REPLIED', outboundMessageId: { not: null } },
      select: {
        outboundMessageId: true,
        matchedPhrase: true,
        matchType: true,
        shopChannelId: true,
        adId: true,
        productId: true,
        matchedVia: true,
        aiContext: true,
        richMenuContext: true,
        keyword: { select: { name: true } },
      },
    })

    // แปลงรหัสเป็นชื่อที่ร้านอ่านรู้เรื่อง — batch ทีเดียวทั้งเธรด ไม่ยิงต่อข้อความ
    // โฆษณาไม่ใช่ entity ในระบบเรา (ไม่มีตาราง Ad) จึงต้องหาชื่อจาก referral ที่เคยรับ webhook ไว้
    const ids = <T,>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x != null))]
    const [channels, ads, products] = await Promise.all([
      prisma.shopChannel.findMany({
        where: { id: { in: ids(logs.map((l) => l.shopChannelId)) } },
        select: { id: true, name: true },
      }),
      prisma.conversationAdReferral.findMany({
        where: { adId: { in: ids(logs.map((l) => l.adId)) } },
        select: { adId: true, adTitle: true, adBody: true },
        distinct: ['adId'],
      }),
      prisma.product.findMany({
        where: { id: { in: ids(logs.map((l) => l.productId)) } },
        select: { id: true, name: true },
      }),
    ])
    const channelName = new Map(channels.map((c) => [c.id, c.name]))
    const productName = new Map(products.map((p) => [p.id, p.name]))
    // adTitle (ชื่อใน Ads Manager) มักว่าง — ข้อความโฆษณาจริงเป็นสิ่งที่ร้านจำได้มากกว่า
    const adLabel = new Map(ads.map((a) => [a.adId as string, a.adTitle ?? a.adBody ?? null]))

    for (const l of logs) {
      if (!l.outboundMessageId) continue
      traceByMessageId.set(l.outboundMessageId, {
        matchedVia: l.matchedVia,
        aiContext: (l.aiContext as AiAnswerContext | null) ?? null,
        richMenuContext:
          (l.richMenuContext as { buttonLabel: string; orderNo: string | null } | null) ?? null,
        keywordName: l.keyword?.name ?? null,
        matchedPhrase: l.matchedPhrase,
        matchType: l.matchType,
        channelName: l.shopChannelId ? (channelName.get(l.shopChannelId) ?? null) : null,
        adLabel: l.adId ? (adLabel.get(l.adId) ?? null) : null,
        productName: l.productId ? (productName.get(l.productId) ?? null) : null,
      })
    }
  }

  return {
    items: page.map((m) => ({
      ...m,
      autoReply: traceByMessageId.get(m.id) ?? null,
    })) as ChatMessageView[],
    nextCursor: hasMore ? `${page[page.length - 1]!.createdAt.toISOString()}|${page[page.length - 1]!.seq}` : null,
  }
}

// ---- sendMessage (tx: insert + denorm update + Notification) ----
export async function sendMessage(params: {
  conversationId: string
  senderUserId: string
  senderRole: SenderRole // caller (route) รู้อยู่แล้วว่าเป็นฝั่งไหน — ฟังก์ชันนี้ verify ซ้ำ ไม่ trust เฉย ๆ
  type: ChatMessageType
  body?: string | null
  imageUrl?: string | null
  // ไฟล์แนบ (2026-08-02) — route ตรวจ/sanitize มาแล้ว service เก็บตรง ๆ
  attachmentName?: string | null
  attachmentSize?: number | null
  productRefId?: string | null // เฉพาะ type='PRODUCT' (extension #1 S-17)
  orderRefToken?: string | null // เฉพาะ type='ORDER' (การ์ดออเดอร์ในแชท, user 2026-07-24)
  /**
   * การ์ดใบนี้เป็น "สรุปนัดหมาย" ไม่ใช่ออเดอร์ (ส่วนขยาย 00024, 2026-08-12)
   *
   * ทั้งคู่เก็บเป็น `type='ORDER'` เหมือนกัน (ไม่มี enum ใหม่ ไม่มี migration) แต่ **คนละของ
   * ในสายตาผู้ขาย** — ผู้เรียกเป็นคนรู้ ฟังก์ชันนี้ไม่เดาเอง (ถ้าให้เดาจาก `serviceStart` จะต้อง
   * query เพิ่มและกลายเป็นการตัดสินซ้ำที่สองซึ่งมีวันเพี้ยนจาก route ได้)
   *
   * มีผล 2 อย่าง: คำใน preview และ **การเก็บ `body`** (ดูจุดใช้งานด้านล่าง)
   */
  isAppointmentCard?: boolean
  replyToMid?: string | null // reply/quote (user 2026-07-25) — DEEP เก็บ id ของข้อความที่ตอบทับ; enrich match id/externalMessageId
}): Promise<ChatMessageView> {
  const sent = await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({ where: { id: params.conversationId } })
    if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')

    const shop = await tx.shop.findUnique({ where: { id: conversation.shopId }, select: { userId: true, shopName: true } })
    if (!shop) throw new Error('SHOP_NOT_FOUND') // defense — ไม่ควรเกิดจริง (FK CASCADE)

    // verify role vs. truth — กัน client ปลอม senderRole (FR-CHAT-04-AC-03)
    // เธรดช่องทางนอก (feature 00018) ไม่มี buyerUserId → ไม่มีใครอ้าง BUYER ได้เลย
    const isBuyerClaim = params.senderRole === 'BUYER'
    const ownerMatch = isBuyerClaim
      ? conversation.buyerUserId !== null && conversation.buyerUserId === params.senderUserId
      : shop.userId === params.senderUserId
    if (!ownerMatch) throw new Error('FORBIDDEN')

    // ---- PRODUCT: verify cross-shop (FR-CTX-07) + idempotent-guard (BR-CTX-02) ----
    let productName: string | null = null
    if (params.type === 'PRODUCT') {
      if (!params.productRefId) throw new Error('PRODUCT_NOT_IN_SHOP') // defense — route กัน 400 แล้ว (S-18)
      const product = await getProductById(params.productRefId)
      if (!product || product.shopId !== conversation.shopId) {
        throw new Error('PRODUCT_NOT_IN_SHOP')
      }
      productName = product.name

      // idempotent-guard: ข้อความล่าสุดของ conversation เป็น PRODUCT + productRefId เดียวกัน → คืนแถวเดิม ไม่ insert ซ้ำ
      const lastMessage = await tx.chatMessage.findFirst({
        where: { conversationId: params.conversationId },
        orderBy: [{ createdAt: 'desc' }, { seq: 'desc' }],
      })
      if (lastMessage && lastMessage.type === 'PRODUCT' && lastMessage.productRefId === params.productRefId) {
        // autoReply: ข้อความที่ "คน" เพิ่งส่ง ไม่มีบันทึกการตัดสินใจของบอทอยู่แล้วโดยนิยาม
        return { ...lastMessage, autoReply: null } as ChatMessageView
      }
    }

    // ---- ORDER: การ์ดออเดอร์ในแชท (user 2026-07-24) — verify order เป็นของร้านนี้ (กัน cross-shop) ----
    if (params.type === 'ORDER') {
      if (!params.orderRefToken) throw new Error('ORDER_NOT_IN_SHOP') // defense — route กัน 400 แล้ว
      const order = await tx.order.findUnique({
        where: { publicToken: params.orderRefToken },
        select: { shopId: true },
      })
      if (!order || order.shopId !== conversation.shopId) throw new Error('ORDER_NOT_IN_SHOP')
    }

    // preview ที่โชว์ในกล่องขาเข้า — ไฟล์แนบบอกชนิดให้ตรง ไม่เหมารวมเป็น "[รูปภาพ]" ทั้งหมด
    // (2026-08-02: VIDEO/AUDIO/FILE ส่งออกจากฝั่งเราได้แล้ว ไม่ได้มีแต่ mirror ขาเข้าเหมือนเดิม)
    const preview =
      params.type === 'IMAGE'
        ? '[รูปภาพ]'
        : params.type === 'VIDEO'
          ? '[วิดีโอ]'
          : params.type === 'AUDIO'
            ? '[ข้อความเสียง]'
            : params.type === 'FILE'
              ? `[ไฟล์] ${params.attachmentName ?? ''}`.trim()
              : params.type === 'PRODUCT'
                ? `[สินค้า] ${productName}`
                : params.type === 'ORDER'
                  ? // การ์ดสรุปนัดใช้ `type='ORDER'` ร่วมกับการ์ดออเดอร์ แต่ผู้ขายอ่านคำนี้ในกล่อง
                    // ขาเข้า — "[ใบเสนอราคา]" กับใบยืนยันนัดของร้านคิวงานคือคำผิดเรื่อง
                    (params.isAppointmentCard ? APPOINTMENT_CARD_PREVIEW : '[ใบเสนอราคา]')
                  : (params.body ?? '').slice(0, 100)

    // extension #3 Scam-link Detection (FR-SCAM-03/BR-SCAM-04) — scan เฉพาะ type='TEXT' เท่านั้น
    // (ไม่ IMAGE/PRODUCT — url แปะไว้ที่ caption/body ของ type อื่นไม่ scan ตาม req doc)
    // WARN เท่านั้น (FR-SCAM-05) — ไม่ block, ไม่แตะ flow insert/denorm/Notification เดิม
    const scamResult = params.type === 'TEXT' ? detectScamLink(params.body) : null

    const message = await tx.chatMessage.create({
      data: {
        conversationId: params.conversationId,
        senderUserId: params.senderUserId,
        senderRole: params.senderRole,
        type: params.type,
        /**
         * PRODUCT/ORDER เก็บ `body=null` แล้ว live-join การ์ดตอนอ่าน — กันร้านเห็นทั้งการ์ดและ
         * ข้อความดิบซ้อนกันสองชั้น
         *
         * 🛑 **ยกเว้นการ์ดสรุปนัด** (2026-08-12): ตัวเรนเดอร์ทั้งฝั่งร้าน (`ChatThread`) และแอป
         * ผู้ซื้อแตกที่ `type === 'ORDER'` **ก่อนเสมอ** ⇒ `body` ไม่มีทางโผล่เป็นบับเบิลที่สอง
         * เหตุผลเดิมจึงไม่ครอบเคสนี้ ส่วนสิ่งที่ได้กลับมาคือ **ร้านค้นหาข้อความที่ตัวเองส่งเจอ**
         * (`lastMessagePreview` เป็นคำสั้น ๆ ค้นไม่ได้ และ `chat.service` ค้นจาก preview เท่านั้น)
         *
         * ค่าที่เก็บคือข้อความที่ **ส่งออกไปจริง รวมเบอร์ลูกค้าแบบไม่ปิดบัง** (user เคาะ 2026-08-12):
         * นี่คือบันทึกว่าร้านพูดอะไรออกไป ไม่ใช่การดึง PII มาแสดงเพิ่ม — ต่างจาก `CustomerPanel`
         * ที่ส่งลงมาแค่ `phoneMasked` เพราะที่นั่นเป็น *ข้อมูลลูกค้าที่เราไปดึงมาโชว์* คนละชนิดกัน
         * บันทึกที่ไม่ตรงกับสิ่งที่ส่งจริงเป็นปัญหาอีกแบบหนึ่ง
         */
        body:
          params.type === 'PRODUCT' || (params.type === 'ORDER' && !params.isAppointmentCard)
            ? null
            : (params.body ?? null),
        imageUrl: params.type === 'PRODUCT' || params.type === 'ORDER' ? null : (params.imageUrl ?? null),
        // เก็บเฉพาะเมื่อมีไฟล์แนบจริง — ข้อความ TEXT ที่ client เผลอส่งชื่อไฟล์ติดมาต้องไม่ค้างใน DB
        attachmentName: params.imageUrl ? (params.attachmentName ?? null) : null,
        attachmentSize: params.imageUrl ? (params.attachmentSize ?? null) : null,
        productRefId: params.type === 'PRODUCT' ? (params.productRefId ?? null) : null,
        orderRefToken: params.type === 'ORDER' ? (params.orderRefToken ?? null) : null,
        replyToMid: params.replyToMid ?? null,
        flaggedScam: scamResult?.flagged ?? false,
        scamMatchedRules: scamResult?.flagged ? scamResult.matchedRules : undefined,
      },
    })

    await tx.conversation.update({
      where: { id: params.conversationId },
      data: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: preview,
        lastSenderRole: params.senderRole,
        // BR-FBC-15/16 (S-7): ลูกค้าทักมาใหม่ในเธรดที่ร้านซ่อน/ปิดงานไว้ → เด้งกลับให้เห็นอัตโนมัติ
        // กันร้านพลาดข้อความ; เฉพาะฝั่ง BUYER เท่านั้น — ร้านตอบเอง (SHOP) ไม่ trigger
        ...(params.senderRole === 'BUYER' ? { isHidden: false, resolvedAt: null } : {}),
      },
    })

    // เลิกเขียน Notification kind="chat_message" (user สั่ง 2026-07-29)
    // เดิมเขียนทุกข้อความ → 97.6% ของทั้งตารางเป็น chat_message (2,162 แถว, ร้านหนึ่ง unread 1,070)
    // ทั้งที่ไม่มีผู้บริโภคจริง: ไม่มี push ที่อ่านตารางนี้, กระดิ่งเว็บกรองทิ้งแล้ว
    // (BELL_HIDDEN_KINDS ใน notification.service), /api/app/notifications ออกแบบไว้สำหรับ
    // outbid/won ตาม docstring ของมันเอง
    //
    // แชท unread ตัวจริงคำนวณจาก Conversation.shopLastReadAt/buyerLastReadAt + messages อยู่แล้ว
    // แถวพวกนี้เป็นสำเนาซ้ำที่ต้องจ่าย INSERT ในทรานแซกชันส่งข้อความ (path ร้อนสุดของระบบ —
    // ทุกข้อความขาเข้าจากในระบบ/Messenger/IG) แถมต้องจ่าย updateMany ซ้ำตอน markRead เพื่อ sync
    //
    // ถ้าจะกลับมาเปิดใหม่: ต้องมีผู้บริโภคจริงก่อน (push/inbox รวม) และต้องคิดเรื่องปริมาณ
    // + retention ไม่ใช่เขียนทุกข้อความแบบเดิม

    return { ...message, autoReply: null } as ChatMessageView
  })

  // feature 00023 — พนักงานตอบเอง = บอทต้องหลบ (BR-AR-22 / humanTakeoverPauseMode)
  //
  // เรียก **นอก** $transaction ตั้งใจ: การหยุดบอทไม่ใช่เงื่อนไขความถูกต้องของการส่งข้อความ
  // ถ้าล้มก็ไม่ควรพา rollback ข้อความที่ส่งถึงลูกค้าไปแล้ว (ตัวฟังก์ชันเองก็กลืน error อยู่แล้ว)
  if (params.senderRole === 'SHOP') {
    await pauseForHumanTakeover(params.conversationId)
  }
  return sent
}

// ---- markRead ----
export async function markRead(
  conversationId: string,
  actorUserId: string,
  role: SenderRole,
): Promise<void> {
  const conversation = await assertParticipant(conversationId, actorUserId)
  const field = role === 'BUYER' ? 'buyerLastReadAt' : 'shopLastReadAt'

  // เดิมมี notification.updateMany sync แถว kind="chat_message" ให้เป็น read คู่กันด้วย —
  // ตัดออกพร้อมกับการเลิกเขียนแถวนั้น (2026-07-29) ไม่มีแถวใหม่ให้ sync แล้ว และแถวเก่าที่ค้าง
  // ก็ถูกกรองออกจากกระดิ่งอยู่แล้ว (BELL_HIDDEN_KINDS) — ประหยัด UPDATE ทุกครั้งที่เปิดอ่านแชท
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { [field]: new Date() },
  })
  void conversation // ใช้แค่ยืนยัน ownership ผ่านแล้วเท่านั้น
}

// ---- updateConversationState (S-7: ปักหมุด/ซ่อน/ปิดงาน + spam feature 00018) ----
export type ConversationPatchAction =
  | 'pin'
  | 'unpin'
  | 'hide'
  | 'unhide'
  | 'resolve'
  | 'reopen'
  | 'spam'
  | 'unspam'

// ownership guard แบบ atomic เดียวกับ disconnectChannel (shop-channel.service.ts) —
// updateMany({where:{id, shopId}}) กันร้านหนึ่งแก้ state เธรดของอีกร้าน (IDOR) โดยไม่ query
// แยกก่อน (กัน TOCTOU); count===0 = ไม่ใช่เธรดของร้านนี้ หรือไม่มีเธรดนี้เลย ไม่แยกแยะ (route ตอบ 404)
export async function updateConversationState(
  conversationId: string,
  shopId: string,
  action: ConversationPatchAction,
): Promise<void> {
  const data: Prisma.ConversationUpdateManyMutationInput =
    action === 'pin'
      ? { isPinned: true }
      : action === 'unpin'
        ? { isPinned: false }
        : action === 'hide'
          ? { isHidden: true }
          : action === 'unhide'
            ? { isHidden: false }
            : action === 'resolve'
              ? { resolvedAt: new Date() }
              : action === 'reopen'
                ? { resolvedAt: null }
                : action === 'spam'
                  ? // ย้ายเข้าสแปม + เลิกปักหมุด (สแปมกรองด้วย isSpam อยู่แล้ว — เธรดที่มี chatGroupId
                    // ก็ไม่โผล่ในแท็บกลุ่ม เพราะ query กลุ่มกรอง isSpam:false อยู่แล้ว ไม่ต้องล้างกลุ่มซ้ำ
                    // ซึ่ง updateMany เขียน FK scalar ตรง ๆ ไม่ได้)
                    { isSpam: true, isPinned: false }
                  : { isSpam: false } // unspam — กลับเข้ารายการหลัก

  const result = await prisma.conversation.updateMany({
    where: { id: conversationId, shopId },
    data,
  })
  if (result.count === 0) throw new Error('CONVERSATION_NOT_FOUND_OR_FORBIDDEN')

  // feature 00023 — โหมด UNTIL_RESOLVED: ปิดงานเธรด = คืนให้ระบบดูแลต่อ
  // (ตัวฟังก์ชันกรอง handoffReason เองแล้ว เธรดที่ล็อกด้วยเหตุอื่นจะไม่ถูกปลด)
  if (action === 'resolve') await clearTakeoverOnResolve(conversationId, shopId)
}

// ---- getUnreadCountForShop ----
// นับ "จำนวนเธรดที่ยังไม่อ่าน" ให้ตรงกับ per-row badge + ตัวกรอง unread (user report 2026-07-24)
// เดิมใช้ lastSenderRole='BUYER' ระดับห้อง → under-count เคส IG/Messenger ที่ร้านตอบนอก Deep
// (ดู comment เต็มที่ unreadConversationIdsForShop). reuse ฟังก์ชันเดียวกันเป็น SSOT ของนิยาม "unread"
export async function getUnreadCountForShop(shopId: string): Promise<number> {
  const ids = await unreadConversationIdsForShops([shopId])
  return ids.length
}

/**
 * getConversationToastPreview — ข้อมูลเท่าที่ toast "มีข้อความใหม่" ต้องใช้ (feature 00018)
 *
 * ทำไมต้องมีฟังก์ชันแยก ไม่ยัดเนื้อหาลง realtime broadcast: payload ของ channel
 * `chat:shop:{shopId}` เป็น **signal-only โดยตั้งใจ** (มีแค่ conversationId — ดู
 * prisma/migrations/20260703000400_chat_realtime_broadcast/migration.sql ที่ระบุห้าม body/imageUrl
 * หลุดผ่าน broadcast เพราะ Supabase Realtime กระจายให้ทุก client ที่ subscribe channel นั้นได้)
 * toast แบบมีชื่อ+ข้อความจึงต้อง "ได้สัญญาณก่อน แล้วค่อยดึงเนื้อหาผ่าน API ที่ตรวจสิทธิ์" เสมอ
 *
 * ownership อยู่ใน WHERE ({ id, shopId }) ตามแบบเดียวกับ updateConversationState — ไม่ findUnique
 * แล้วค่อยเทียบทีหลัง (กัน TOCTOU/IDOR) ไม่พบ/ไม่ใช่ของร้านนี้ → null เฉย ๆ ไม่แยกสองความหมาย
 *
 * allow-list ที่ระดับ select: คืนเฉพาะฟิลด์ที่ toast วาดจริง — ห้ามเพิ่ม phone/email/ที่อยู่
 * (บทเรียน PII หลุดผ่าน RSC flight ของโปรเจกต์นี้: "ดึงมาแล้วค่อยตัดตอนแสดงผล" ไม่ปลอดภัยพอ)
 */
export interface ConversationToastPreview {
  conversationId: string
  senderName: string
  senderAvatarUrl: string | null
  preview: string | null
  channel: string
  /** ชื่อเพจ/บัญชีที่ลูกค้าทักเข้ามา — null เมื่อเป็นแชทในเว็บ Deep (ไม่มี ShopChannel) */
  channelName: string | null
  lastMessageAt: Date
}

export async function getConversationToastPreview(
  conversationId: string,
  shopId: string,
): Promise<ConversationToastPreview | null> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, shopId },
    select: {
      id: true,
      channel: true,
      lastMessagePreview: true,
      lastMessageAt: true,
      alias: true,
      buyerUserId: true,
      externalContactId: true,
      shopChannelId: true,
    },
  })
  if (!conversation) return null

  // ชื่อที่แสดง: alias (ชื่อที่ร้านตั้งเองในแชท) ชนะชื่อจริงเสมอ — ตรงกับที่ InboxList แสดง
  // ไม่งั้น toast กับรายการแชทจะเรียกคนคนเดียวกันคนละชื่อ
  let senderName = conversation.alias ?? null
  let senderAvatarUrl: string | null = null

  if (conversation.externalContactId) {
    const contact = await prisma.externalContact.findUnique({
      where: { id: conversation.externalContactId },
      select: { name: true, avatarUrl: true },
    })
    senderName = senderName ?? contact?.name ?? null
    // Messenger ไม่คืนรูปโปรไฟล์ (ดู getContactProfile ใน lib/facebook/graph.ts) → null เป็นเรื่องปกติ
    // ไม่ใช่ข้อผิดพลาด UI ต้อง fallback เป็นตัวอักษรแรกของชื่อเหมือน InboxList
    senderAvatarUrl = contact?.avatarUrl ?? null
  } else if (conversation.buyerUserId) {
    const buyer = await prisma.user.findUnique({
      where: { id: conversation.buyerUserId },
      select: { displayName: true, avatar: true },
    })
    senderName = senderName ?? buyer?.displayName ?? null
    senderAvatarUrl = buyer?.avatar ?? null
  }

  let channelName: string | null = null
  if (conversation.shopChannelId) {
    const channel = await prisma.shopChannel.findUnique({
      where: { id: conversation.shopChannelId },
      select: { name: true },
    })
    channelName = channel?.name ?? null
  }

  return {
    conversationId: conversation.id,
    senderName: senderName ?? 'ผู้ติดต่อ',
    senderAvatarUrl,
    preview: conversation.lastMessagePreview,
    channel: conversation.channel,
    channelName,
    lastMessageAt: conversation.lastMessageAt,
  }
}

// ---- internal: ownership guard ----
async function assertParticipant(conversationId: string, actorUserId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } })
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')
  if (conversation.buyerUserId === actorUserId) return conversation
  // ฝั่งร้าน: ต้องเช็ค "เจ้าของ หรือ สมาชิก" (canAccessShop) ไม่ใช่แค่ shop.userId === actorUserId
  // เดิมเช็คแค่เจ้าของ → BUSINESS admin (ไม่ใช่ owner) เปิดแชทของร้านตัวเองไม่ได้ ขึ้น 'ไม่พบบทสนทนา'
  // (bug จริงบน prod หลังเพจถูกย้ายไปร้าน BUSINESS)
  if (await canAccessShop(conversation.shopId, actorUserId)) return conversation
  throw new Error('FORBIDDEN')
}

/**
 * findConversationShopForUser — เธรดนี้เป็นของร้านไหน "ในบรรดาร้านที่ user เข้าถึงได้"
 *
 * ทำไมต้องมี (bug จริง หัวหน้ารายงาน 2026-08-06): ผู้ขายที่ถือ 2 ร้าน และผูก Facebook Page
 * คนละเพจไว้คนละร้าน จะได้ push ของ "ทั้งสองร้าน" ลงเครื่องเดียวกัน (shopAudience ใน
 * seller-push.service ส่งให้เจ้าของ+สมาชิกของร้านนั้น ซึ่งเป็นคนเดียวกัน) แต่ payload มีแค่
 * `url: /inbox/{conversationId}` ไม่มี shopId — พอกด noti ของร้าน B ขณะที่ active อยู่ร้าน A
 * ownership guard ของหน้าเธรด (WHERE {id, shopId: activeShopId}) จะไม่เจอ แล้วขึ้น
 * "ไม่พบบทสนทนานี้" ทั้งที่เธรดมีอยู่จริงและผู้ใช้มีสิทธิ์เต็ม
 *
 * ตัวนี้ตอบว่า "ถ้าไม่ใช่ร้านที่ active อยู่ แล้วมันเป็นของร้านไหนที่คุณเข้าถึงได้" เพื่อให้หน้า
 * สลับร้านให้อัตโนมัติแทนที่จะโยนหน้า error ใส่ผู้ใช้
 *
 * 🛑 scope สิทธิ์อยู่ใน WHERE ตั้งแต่ query แรก (`shopId: { in: accessibleShopIds }`) ไม่ใช่
 * ดึงมาแล้วค่อยเช็ค — เธรดของร้านที่ไม่มีสิทธิ์จะไม่ถูกอ่านขึ้นมาเลย (feedback_rsc_dal_authz)
 * คืน null ทั้งกรณี "ไม่มีเธรดนี้" และ "มีแต่ไม่มีสิทธิ์" เหมือนกันทุกประการ — กัน enumeration
 *
 * ทำไมไม่แก้ด้วยการใส่ shopId ลง push payload แทน: payload อยู่ในความรับผิดชอบของ "แอป"
 * ซึ่งต้อง build + ส่ง App Store ใหม่ทุกครั้งที่แก้ ส่วนวิธีนี้แก้ที่เว็บล้วน — แอปที่ติดตั้ง
 * ไปแล้ว (รวมตัวที่อยู่ระหว่างรีวิวของ Apple) ได้ผลทันทีที่ deploy โดยไม่ต้องอัปเดต
 */
export async function findConversationShopForUser(
  conversationId: string,
  userId: string,
): Promise<{ shopId: string; shopName: string; logo: string | null; kind: string } | null> {
  const accessibleShopIds = await listAccessibleShopIds(userId)
  if (accessibleShopIds.length === 0) return null

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, shopId: { in: accessibleShopIds } },
    select: {
      shopId: true,
      shop: { select: { shopName: true, logo: true, kind: true } },
    },
  })
  if (!conversation) return null

  return {
    shopId: conversation.shopId,
    shopName: conversation.shop.shopName,
    logo: conversation.shop.logo,
    kind: conversation.shop.kind,
  }
}
