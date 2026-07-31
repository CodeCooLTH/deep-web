import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { Prisma } from '@prisma/client'
import { getProductById } from '@/services/product.service'
import { detectScamLink } from '@/lib/scam-link-detector'

export type SenderRole = 'BUYER' | 'SHOP'
export type ChatMessageType = 'TEXT' | 'IMAGE' | 'PRODUCT' | 'VIDEO' | 'AUDIO' | 'FILE' | 'ORDER'

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

export interface ChatMessageView {
  id: string
  conversationId: string
  senderUserId: string | null
  senderRole: SenderRole
  type: ChatMessageType
  body: string | null
  imageUrl: string | null
  productRefId: string | null // extension #1 Chat Product Context Card (FR-CTX-05) — เฉพาะ type='PRODUCT'
  orderRefToken: string | null // การ์ดออเดอร์ในแชท (user 2026-07-24) — เฉพาะ type='ORDER' (Order.publicToken)
  flaggedScam: boolean // extension #3 Scam-link Detection (FR-SCAM-03) — WARN banner เท่านั้น ไม่ block
  // feature 00023 — null = คนส่ง | 'AUTO' = ระบบตอบ | 'AUTO_TEST' = ระบบตอบขณะโหมดทดสอบ
  // ใช้ติดป้ายบนบับเบิลให้ร้านแยกออกว่าข้อความไหนบอทตอบ (AC-012-02, AC-021-05)
  // findMany ด้านล่างไม่มี select จึงคืนคอลัมน์นี้มาอยู่แล้วตั้งแต่ migration — แค่ประกาศ type เพิ่ม
  autoReplyKind: string | null
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
export type ShipmentFilter = 'none' | 'unprinted' | 'printed'

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
  shopId: string,
  state: ShipmentFilter,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH latest AS (
      SELECT DISTINCT ON (o."customerId")
        o."customerId" AS "customerId",
        s."id"             AS "shipmentId",
        s."labelPrintedAt" AS "labelPrintedAt"
      FROM "Order" o
      LEFT JOIN LATERAL (
        SELECT sh."id", sh."labelPrintedAt"
        FROM "OrderShipment" sh
        WHERE sh."orderId" = o."id" AND sh."status" <> 'CANCELLED'
        ORDER BY sh."createdAt" DESC
        LIMIT 1
      ) s ON true
      WHERE o."shopId" = ${shopId} AND o."customerId" IS NOT NULL
      ORDER BY o."customerId", o."createdAt" DESC
    )
    SELECT c."id" AS id
    FROM "Conversation" c
    LEFT JOIN "ExternalContact" ec ON ec."id" = c."externalContactId"
    LEFT JOIN "Customer" cu ON cu."userId" = c."buyerUserId"
    JOIN latest l ON l."customerId" = COALESCE(ec."customerId", cu."id")
    WHERE c."shopId" = ${shopId}
      AND ${
        state === 'none'
          ? Prisma.sql`l."shipmentId" IS NULL`
          : state === 'unprinted'
            ? Prisma.sql`l."shipmentId" IS NOT NULL AND l."labelPrintedAt" IS NULL`
            : Prisma.sql`l."labelPrintedAt" IS NOT NULL`
      }
  `
  return rows.map((r) => r.id)
}

export async function listConversationsForShop(
  shopId: string,
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
    const unreadIds = await unreadConversationIdsForShop(shopId)
    readIdFilter = opts.readState === 'unread' ? { id: { in: unreadIds } } : { id: { notIn: unreadIds } }
  }

  // พัสดุ iShip — เกณฑ์อ้าง "ออเดอร์ล่าสุดต่อลูกค้า" ทำใน where ของ Prisma ไม่ได้
  // (ดู comment ที่ conversationIdsByShipmentState) จึงดึง id ที่ผ่านเกณฑ์มาก่อนแล้วกรองด้วย id
  // ใส่ใน AND-array ไม่ใช่ top-level เพราะ readIdFilter ก็ใช้คีย์ `id` เหมือนกัน — assign ทับกันเงียบ ๆ
  if (opts.shipment) {
    const ids = await conversationIdsByShipmentState(shopId, opts.shipment)
    orParts.push({ id: { in: ids } })
  }

  return listConversations(
    {
      shopId,
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
export async function unreadConversationIdsForShop(shopId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT c.id AS id
    FROM "Conversation" c
    JOIN "ChatMessage" m ON m."conversationId" = c.id
    WHERE c."shopId" = ${shopId}
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
export async function countUnreadSpamConversations(shopId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM (
      SELECT DISTINCT c.id
      FROM "Conversation" c
      JOIN "ChatMessage" m ON m."conversationId" = c.id
      WHERE c."shopId" = ${shopId}
        AND c."isSpam" = true
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

// ---- getMessages ----
// conversationId มาจาก client (path param) — ต้อง verify ownership จริงในนี้ (ต่างจาก listConversations*)
export async function getMessages(
  conversationId: string,
  actorUserId: string,
  opts: { cursor?: string; take?: number } = {},
): Promise<{ items: ChatMessageView[]; nextCursor: string | null }> {
  await assertParticipant(conversationId, actorUserId)

  const take = opts.take ?? 30
  const rows = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      ...(opts.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' }, // ใหม่→เก่า (pagination); client reverse ก่อน render
    take: take + 1,
  })
  const hasMore = rows.length > take
  const page = hasMore ? rows.slice(0, take) : rows
  return {
    items: page as ChatMessageView[],
    nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
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
  productRefId?: string | null // เฉพาะ type='PRODUCT' (extension #1 S-17)
  orderRefToken?: string | null // เฉพาะ type='ORDER' (การ์ดออเดอร์ในแชท, user 2026-07-24)
  replyToMid?: string | null // reply/quote (user 2026-07-25) — DEEP เก็บ id ของข้อความที่ตอบทับ; enrich match id/externalMessageId
}): Promise<ChatMessageView> {
  return prisma.$transaction(async (tx) => {
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
        orderBy: { createdAt: 'desc' },
      })
      if (lastMessage && lastMessage.type === 'PRODUCT' && lastMessage.productRefId === params.productRefId) {
        return lastMessage as ChatMessageView
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

    const preview =
      params.type === 'IMAGE'
        ? '[รูปภาพ]'
        : params.type === 'PRODUCT'
          ? `[สินค้า] ${productName}`
          : params.type === 'ORDER'
            ? '[ใบเสนอราคา]'
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
        body: params.type === 'PRODUCT' || params.type === 'ORDER' ? null : (params.body ?? null),
        imageUrl: params.type === 'PRODUCT' || params.type === 'ORDER' ? null : (params.imageUrl ?? null),
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

    return message as ChatMessageView
  })
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
}

// ---- getUnreadCountForShop ----
// นับ "จำนวนเธรดที่ยังไม่อ่าน" ให้ตรงกับ per-row badge + ตัวกรอง unread (user report 2026-07-24)
// เดิมใช้ lastSenderRole='BUYER' ระดับห้อง → under-count เคส IG/Messenger ที่ร้านตอบนอก Deep
// (ดู comment เต็มที่ unreadConversationIdsForShop). reuse ฟังก์ชันเดียวกันเป็น SSOT ของนิยาม "unread"
export async function getUnreadCountForShop(shopId: string): Promise<number> {
  const ids = await unreadConversationIdsForShop(shopId)
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
