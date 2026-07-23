import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { Prisma } from '@prisma/client'
import { getProductById } from '@/services/product.service'
import { detectScamLink } from '@/lib/scam-link-detector'

export type SenderRole = 'BUYER' | 'SHOP'
export type ChatMessageType = 'TEXT' | 'IMAGE' | 'PRODUCT'

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
  flaggedScam: boolean // extension #3 Scam-link Detection (FR-SCAM-03) — WARN banner เท่านั้น ไม่ block
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
export async function listConversationsForShop(
  shopId: string,
  opts: { cursor?: string; take?: number; channel?: string; shopChannelId?: string; q?: string } = {},
): Promise<{ items: ConversationSummary[]; nextCursor: string | null }> {
  return listConversations(
    {
      shopId,
      ...(opts.channel ? { channel: opts.channel } : {}),
      ...(opts.shopChannelId ? { shopChannelId: opts.shopChannelId } : {}),
      // q: ค้นหาจาก lastMessagePreview หรือชื่อ externalContact — relation filter ปลอดภัยกับ
      // externalContact = null (เธรด DEEP) เพราะ Prisma ไม่ match แถวที่ relation ไม่มี ไม่ throw
      ...(opts.q
        ? {
            OR: [
              { lastMessagePreview: { contains: opts.q, mode: 'insensitive' as const } },
              { externalContact: { name: { contains: opts.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    },
    opts,
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
  const rows = await prisma.$queryRaw<{ conversationId: string; count: bigint }[]>`
    SELECT m."conversationId" AS "conversationId", COUNT(*) AS count
    FROM "ChatMessage" m
    JOIN "Conversation" c ON c.id = m."conversationId"
    WHERE m."conversationId" IN (${Prisma.join(conversationIds)})
      AND m."senderRole" = 'BUYER'
      AND (c."shopLastReadAt" IS NULL OR m."createdAt" > c."shopLastReadAt")
    GROUP BY m."conversationId"
  `
  return new Map(rows.map((r) => [r.conversationId, Number(r.count)]))
}

export async function listConversationsForBuyer(
  buyerUserId: string,
  opts: { cursor?: string; take?: number } = {},
): Promise<{ items: ConversationSummary[]; nextCursor: string | null }> {
  return listConversations({ buyerUserId }, opts)
}

async function listConversations(
  where: Prisma.ConversationWhereInput,
  opts: { cursor?: string; take?: number },
): Promise<{ items: ConversationSummary[]; nextCursor: string | null }> {
  const take = opts.take ?? 20
  const rows = await prisma.conversation.findMany({
    where: {
      ...where,
      ...(opts.cursor ? { lastMessageAt: { lt: new Date(opts.cursor) } } : {}),
    },
    orderBy: { lastMessageAt: 'desc' },
    take: take + 1, // +1 trick หา hasMore — ต้นแบบ getStockMovementHistory
  })
  const hasMore = rows.length > take
  const page = hasMore ? rows.slice(0, take) : rows
  return {
    items: page as ConversationSummary[],
    nextCursor: hasMore ? page[page.length - 1]!.lastMessageAt.toISOString() : null,
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

    const preview =
      params.type === 'IMAGE'
        ? '[รูปภาพ]'
        : params.type === 'PRODUCT'
          ? `[สินค้า] ${productName}`
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
        body: params.type === 'PRODUCT' ? null : (params.body ?? null),
        imageUrl: params.type === 'PRODUCT' ? null : (params.imageUrl ?? null),
        productRefId: params.type === 'PRODUCT' ? (params.productRefId ?? null) : null,
        flaggedScam: scamResult?.flagged ?? false,
        scamMatchedRules: scamResult?.flagged ? scamResult.matchedRules : undefined,
      },
    })

    await tx.conversation.update({
      where: { id: params.conversationId },
      data: { lastMessageAt: message.createdAt, lastMessagePreview: preview, lastSenderRole: params.senderRole },
    })

    // Notification เสมอ (ไม่เช็ค presence — ดู SRS TFR-CHAT-11 rationale) ผู้รับ = อีกฝ่าย
    // feature 00018: เธรดช่องทางนอก ผู้รับคือ ExternalContact ที่ไม่มี User ใน Deep →
    // ข้าม Notification (ลูกค้าได้รับผ่าน Messenger/IG เองอยู่แล้ว) ไม่ใช่ error
    const recipientUserId = isBuyerClaim ? shop.userId : conversation.buyerUserId
    if (recipientUserId) {
      const senderLabel = isBuyerClaim
        ? (await tx.user.findUnique({ where: { id: params.senderUserId }, select: { displayName: true } }))?.displayName ?? 'ผู้ซื้อ'
        : shop.shopName
      await tx.notification.create({
        data: {
          userId: recipientUserId,
          kind: 'chat_message',
          title: `ข้อความใหม่จาก ${senderLabel}`,
          body: preview,
          refId: params.conversationId,
        },
      })
    }

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

  await prisma.$transaction([
    prisma.conversation.update({ where: { id: conversationId }, data: { [field]: new Date() } }),
    prisma.notification.updateMany({
      where: { userId: actorUserId, kind: 'chat_message', refId: conversationId, read: false },
      data: { read: true },
    }),
  ])
  void conversation // ใช้แค่ยืนยัน ownership ผ่านแล้วเท่านั้น
}

// ---- getUnreadCountForShop ----
export async function getUnreadCountForShop(shopId: string): Promise<number> {
  const rows = await prisma.conversation.findMany({
    where: { shopId, lastSenderRole: 'BUYER' },
    select: { shopLastReadAt: true, lastMessageAt: true },
  })
  return rows.filter((r) => r.shopLastReadAt === null || r.lastMessageAt > r.shopLastReadAt).length
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
