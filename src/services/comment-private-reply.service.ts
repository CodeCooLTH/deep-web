/**
 * comment-private-reply.service — จุดเดียวที่ระบบส่ง private reply ออก (feature 00038)
 *
 * ทั้งปุ่ม "ทักแชท" ที่คนกด และตัวยิงอัตโนมัติ เรียกฟังก์ชันเดียวกันที่นี่
 *
 * 🛑 ห้าม reuse sendOutboundMessage() ของ channel-chat.service — มันเช็ค
 * getWindowState(conversation.lastInboundAt) แล้ว throw WINDOW_CLOSED เมื่อเส้นทางไม่ใช่คนกด
 * (channel-chat.service.ts:1780) ซึ่งห้องที่เพิ่งเกิดจาก private reply มี lastInboundAt = null
 * เสมอ จึงตกทุกครั้ง — และ guard ตัวนั้นทำงานถูกอยู่แล้วสำหรับกรณีของมัน ห้ามไปแก้
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { resolveChannelToken } from '@/services/page-comment.service'
import { sendPrivateReplyToComment } from '@/lib/facebook/graph'

/** หน้าต่างทักส่วนตัวของ Meta นับจากเวลาที่ลูกค้าคอมเมนต์ */
export const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * ยังทักได้ไหม — แยกเป็น pure function เพื่อให้ UI กับ service ตัดสินด้วยเกณฑ์เดียวกัน
 * เวลาคอมเมนต์ที่อยู่ในอนาคต (นาฬิกาเครื่องเพี้ยน / timezone) ถือว่ายังทักได้ ไม่ใช่ error
 */
export function isWithinPrivateReplyWindow(commentCreatedTime: Date, now: Date = new Date()): boolean {
  return now.getTime() - commentCreatedTime.getTime() < PRIVATE_REPLY_WINDOW_MS
}

export type PrivateReplyResult =
  | { sent: true; conversationId: string; messageId: string }
  | { sent: false; reason: PrivateReplySkipReason; error?: string }

export type PrivateReplySkipReason =
  | 'COMMENT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'CHANNEL_INACTIVE'
  | 'WINDOW_EXPIRED'
  | 'ALREADY_SENT'
  | 'EMPTY_TEXT'
  | 'SEND_FAILED'

/**
 * จุดเดียวที่ระบบส่ง private reply ออก — ปุ่ม "ทักแชท" (MANUAL) และตัวยิงอัตโนมัติ (AUTO) เรียกที่นี่
 *
 * ลำดับการตรวจ (เป็นส่วนหนึ่งของความถูกต้อง — อย่าสลับ):
 *   1. หาคอมเมนต์ + โพสต์ + ช่องทาง → ไม่พบ = COMMENT_NOT_FOUND
 *   2. ข้อความว่าง = EMPTY_TEXT
 *   3. เคยส่งสำเร็จไปแล้ว = ALREADY_SENT (เช็คก่อนสิทธิ์ — Meta ให้ส่งได้ครั้งเดียวต่อคอมเมนต์
 *      ไม่ว่าใครเป็นคนกด ผลลัพธ์ปลายทางเหมือนกันไม่ว่าจะเช็คสิทธิ์ก่อนหรือหลัง)
 *   4. trigger==='MANUAL' → ต้องผ่าน canAccessShop ไม่งั้น FORBIDDEN (AUTO ข้าม — system actor,
 *      shopId มาจากแถวในฐานเท่านั้น ไม่รับจากพารามิเตอร์)
 *   5. เพจไม่ ACTIVE = CHANNEL_INACTIVE
 *   6. เกินหน้าต่าง 7 วัน = WINDOW_EXPIRED
 *   7. ถอดโทเคน → ยิง Graph (ล้มเหลว = SEND_FAILED บันทึก error ไม่ throw ซ้ำ)
 *   8. สำเร็จ: upsert contact/conversation/message + log ในทรานแซกชันเดียว (ห้ามตั้ง lastInboundAt)
 */
export async function sendPrivateReplyToCommentById(params: {
  commentId: string
  text: string
  trigger: 'AUTO' | 'MANUAL'
  actorUserId?: string | null
}): Promise<PrivateReplyResult> {
  const comment = await prisma.pageComment.findUnique({
    where: { id: params.commentId },
    include: {
      post: {
        include: {
          channel: { select: { id: true, shopId: true, externalId: true, status: true } },
        },
      },
    },
  })
  if (!comment) return { sent: false, reason: 'COMMENT_NOT_FOUND' }

  const text = params.text.trim()
  if (!text) return { sent: false, reason: 'EMPTY_TEXT' }

  const channel = comment.post.channel

  // ALREADY_SENT ก่อน FORBIDDEN โดยตั้งใจ: ทั้งสองผลลัพธ์คือ "ส่งไม่ได้" เหมือนกัน การเช็คว่า
  // "เคยส่งไปแล้วหรือยัง" ก่อนไม่ทำให้รั่วข้อมูลอะไรเพิ่มจากที่ endpoint ก็ตอบเหมือนกันอยู่แล้ว
  const alreadySent = await prisma.commentReplyLog.findFirst({
    where: { commentId: comment.id, privateReplyStatus: 'SENT' },
  })
  if (alreadySent) return { sent: false, reason: 'ALREADY_SENT' }

  if (params.trigger === 'MANUAL') {
    if (!params.actorUserId || !(await canAccessShop(channel.shopId, params.actorUserId))) {
      return { sent: false, reason: 'FORBIDDEN' }
    }
  }
  // trigger === 'AUTO': ข้าม (system actor) — shopId ใช้ channel.shopId จากแถวในฐานเสมอ ไม่รับจาก param

  if (channel.status !== 'ACTIVE') return { sent: false, reason: 'CHANNEL_INACTIVE' }

  if (!isWithinPrivateReplyWindow(comment.createdTime)) {
    return { sent: false, reason: 'WINDOW_EXPIRED' }
  }

  const resolved = await resolveChannelToken(channel.id)
  if (!resolved) return { sent: false, reason: 'CHANNEL_INACTIVE' }

  let sendResult: { recipientId: string; messageId: string }
  try {
    sendResult = await sendPrivateReplyToComment(resolved.token, comment.externalCommentId, text)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    // ห่อด้วย $transaction แม้เป็นการเขียนแถวเดียว เพื่อให้ type ของ tx ตรงกับ upsertReplyLog()
    // ทุก call site เดียวกัน (Prisma.TransactionClient) ไม่ต้องมีสอง signature
    await prisma.$transaction((tx) =>
      upsertReplyLog(tx, {
        shopChannelId: channel.id,
        postId: comment.postId,
        commentId: comment.id,
        fromExternalId: comment.fromExternalId,
        trigger: params.trigger,
        actorUserId: params.trigger === 'MANUAL' ? (params.actorUserId ?? null) : null,
        privateReplyStatus: 'FAILED',
        errorMessage,
      }),
    )
    return { sent: false, reason: 'SEND_FAILED', error: errorMessage }
  }

  const conversationId = await prisma.$transaction(async (tx) => {
    // เลียนแบบคีย์ upsert เดียวกับ ingestInboundMessage (channel-chat.service.ts) — 1 ห้องต่อ
    // (Page, PSID) ใช้ recipientId ที่ Graph ยืนยันกลับมาจริง (ไม่ใช้ comment.fromExternalId ที่
    // อาจไม่ตรง/ไม่มี เพราะ private reply เปิดห้องให้ "ผู้รับ" ของ Graph ไม่ใช่ "ผู้คอมเมนต์" เป๊ะ ๆ)
    const contact = await tx.externalContact.upsert({
      where: {
        shopChannelId_externalUserId: { shopChannelId: channel.id, externalUserId: sendResult.recipientId },
      },
      create: { shopChannelId: channel.id, externalUserId: sendResult.recipientId },
      update: {},
    })

    const conversationWhere = {
      shopChannelId_externalContactId: { shopChannelId: channel.id, externalContactId: contact.id },
    }
    let conversation = await tx.conversation.findUnique({ where: conversationWhere })
    if (!conversation) {
      conversation = await tx.conversation.create({
        data: {
          shopId: channel.shopId,
          channel: 'MESSENGER',
          shopChannelId: channel.id,
          externalContactId: contact.id,
        },
      })
    }

    await tx.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderUserId: null,
        senderRole: 'SHOP',
        type: 'TEXT',
        body: text,
        externalMessageId: sendResult.messageId,
        deliveryStatus: 'SENT',
      },
    })

    // 🛑 ห้ามตั้ง lastInboundAt — เราเป็นคนเริ่มห้องนี้ ไม่ใช่ลูกค้า ตั้งเองเท่ากับโกหกว่าลูกค้า
    // ตอบแล้ว (จะเปิดหน้าต่าง 24 ชม. ให้ส่งข้อความตามได้ทั้งที่ Meta จะปฏิเสธ) และห้องจะขึ้น
    // "ยังไม่อ่าน" ทั้งที่ไม่ควร (AC-CR-30)
    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: text.slice(0, 100),
        lastSenderRole: 'SHOP',
      },
    })

    await upsertReplyLog(tx, {
      shopChannelId: channel.id,
      postId: comment.postId,
      commentId: comment.id,
      fromExternalId: comment.fromExternalId,
      trigger: params.trigger,
      actorUserId: params.trigger === 'MANUAL' ? (params.actorUserId ?? null) : null,
      privateReplyStatus: 'SENT',
      conversationId: conversation.id,
    })

    return conversation.id
  })

  return { sent: true, conversationId, messageId: sendResult.messageId }
}

/**
 * upsert CommentReplyLog แบบ manual — unique index ของตารางนี้เป็น **partial** (สร้างด้วย SQL มือ
 * ใน migration) ไม่ใช่ @@unique ปกติของ Prisma จึงใช้ .upsert() ตรง ๆ ไม่ได้ (ไม่มีชื่อคีย์ผสมให้ระบุ
 * ใน `where`) ต้อง find แล้วแยก create/update เอง — คีย์ต่างกันตาม trigger ตามที่ประกาศไว้ใน schema:
 *   AUTO   → (shopChannelId, postId, fromExternalId) WHERE trigger='AUTO'
 *   MANUAL → (commentId)                             WHERE trigger='MANUAL'
 */
async function upsertReplyLog(
  db: Prisma.TransactionClient,
  args: {
    shopChannelId: string
    postId: string
    commentId: string
    fromExternalId: string | null
    trigger: 'AUTO' | 'MANUAL'
    actorUserId: string | null
    privateReplyStatus: 'SENT' | 'FAILED'
    errorMessage?: string | null
    conversationId?: string | null
  },
): Promise<void> {
  const where =
    args.trigger === 'MANUAL'
      ? { commentId: args.commentId, trigger: 'MANUAL' as const }
      : {
          shopChannelId: args.shopChannelId,
          postId: args.postId,
          fromExternalId: args.fromExternalId,
          trigger: 'AUTO' as const,
        }
  const existing = await db.commentReplyLog.findFirst({ where })
  const data = {
    privateReplyStatus: args.privateReplyStatus,
    errorMessage: args.errorMessage ?? null,
    conversationId: args.conversationId ?? null,
  }
  if (existing) {
    await db.commentReplyLog.update({ where: { id: existing.id }, data })
  } else {
    await db.commentReplyLog.create({
      data: {
        shopChannelId: args.shopChannelId,
        postId: args.postId,
        commentId: args.commentId,
        fromExternalId: args.fromExternalId,
        trigger: args.trigger,
        actorUserId: args.actorUserId,
        ...data,
      },
    })
  }
}
