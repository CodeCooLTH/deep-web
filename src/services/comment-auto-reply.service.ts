/**
 * comment-auto-reply.service — ด่านคัดกรอง 8 ข้อ + ตัวยิงอัตโนมัติของคอมเมนต์ (feature 00038)
 *
 * ผู้เรียกคือ webhook `feed` (item=comment) ผ่าน after() — ฟังก์ชัน orchestration ที่นี่ห้าม throw
 * ออกไปทุกกรณี ไม่งั้น Meta จะ retry ทั้ง batch แล้วปัญหาบานปลาย (ดู docstring processCommentAutoReply)
 */
import { prisma } from '@/lib/prisma'
import { replyToComment } from '@/services/page-comment.service'
import { sendPrivateReplyToCommentById } from '@/services/comment-private-reply.service'

export const COMMENT_SKIP_REASONS = [
  'FROM_PAGE', 'NOT_TOP_LEVEL', 'COMMENT_DELETED', 'NO_SENDER_ID',
  'CHANNEL_INACTIVE', 'DISABLED', 'ALREADY_HANDLED', 'HUMAN_ANSWERED',
] as const
export type CommentSkipReason = (typeof COMMENT_SKIP_REASONS)[number]

/** P2002 (unique constraint) ของ Prisma — pattern เดียวกับ comment-private-reply.service.ts */
function isUniqueConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('P2002') || msg.includes('Unique constraint')
}

/**
 * ด่านคัดกรองล้วน ๆ ไม่แตะ DB ไม่ยิงเน็ต — แยกออกมาเพื่อให้เทสครอบได้ทุกกิ่ง
 *
 * ลำดับสำคัญ: ด่านที่ "ถูกที่สุด" (ไม่ต้อง query อะไรเพิ่ม) อยู่บน เพื่อให้ caller ตัดจบได้เร็ว
 * และเพื่อให้ skipReason ที่บันทึกเป็นเหตุผล "ต้นทาง" ไม่ใช่เหตุผลปลายทาง
 */
export function evaluateCommentGate(input: {
  isFromPage: boolean
  parentExternalId: string | null
  isDeleted: boolean
  fromExternalId: string | null
  channelStatus: string
  publicEnabled: boolean
  publicText: string | null
  privateEnabled: boolean
  privateText: string | null
  hasAutoLogForPerson: boolean
  hasHumanReply: boolean
}): { pass: true } | { pass: false; reason: CommentSkipReason } {
  if (input.isFromPage) return { pass: false, reason: 'FROM_PAGE' }
  if (input.parentExternalId !== null) return { pass: false, reason: 'NOT_TOP_LEVEL' }
  if (input.isDeleted) return { pass: false, reason: 'COMMENT_DELETED' }
  // ไม่มีตัวตนผู้เขียน = partial unique index (shopChannelId, postId, fromExternalId) กันซ้ำไม่ได้
  // เพราะ Postgres ถือว่า NULL <> NULL แถวกลุ่มนี้จะลอดทุกครั้ง ต้องตัดตั้งแต่ตรงนี้
  if (!input.fromExternalId) return { pass: false, reason: 'NO_SENDER_ID' }
  if (input.channelStatus !== 'ACTIVE') return { pass: false, reason: 'CHANNEL_INACTIVE' }

  const publicOn = input.publicEnabled && !!input.publicText?.trim()
  const privateOn = input.privateEnabled && !!input.privateText?.trim()
  if (!publicOn && !privateOn) return { pass: false, reason: 'DISABLED' }

  if (input.hasAutoLogForPerson) return { pass: false, reason: 'ALREADY_HANDLED' }
  if (input.hasHumanReply) return { pass: false, reason: 'HUMAN_ANSWERED' }
  return { pass: true }
}

/**
 * ตัวยิงอัตโนมัติ — โหลดคอมเมนต์, ผ่านด่านคัดกรอง, จอง log แล้วยิง public/private reply
 *
 * ลำดับ:
 *  1. โหลด comment + post + channel (รวม 4 คอลัมน์ตั้งค่า) — ไม่พบ = return เงียบ
 *  2. query hasAutoLogForPerson (เคยตอบคนนี้บนโพสต์นี้อัตโนมัติไปแล้วไหม)
 *  3. query hasHumanReply (คนในทีมตอบคอมเมนต์นี้ไปแล้วไหม — บอทต้องหลีกทางให้คน)
 *  4. evaluateCommentGate — ไม่ผ่าน → บันทึก CommentReplyLog(trigger=AUTO, skipReason) แล้ว return
 *  5. จอง slot ด้วย CommentReplyLog.create (trigger=AUTO) **ก่อนยิงตัวส่งใด ๆ** — partial unique
 *     index (shopChannelId, postId, fromExternalId) WHERE trigger='AUTO' กันซ้ำข้ามเธรด/ข้าม request
 *     ซ้ำจาก Meta retry ของ webhook เดียวกัน ดัก P2002 = อีกเธรดชนะไปแล้ว ไม่ใช่ error
 *     (ฝั่ง private reply มี sendPrivateReplyToCommentById จัดการกันซ้ำของตัวเองอยู่แล้ว — แต่ฝั่ง
 *     public reply ไม่มีใครกัน แถวที่จองตรงนี้คือด่านกันซ้ำเดียวของ public reply)
 *  6. สวิตช์ public เปิด → replyToComment(actorUserId: null) — จับ error แยก อัปเดต publicReplyStatus
 *  7. สวิตช์ private เปิด → sendPrivateReplyToCommentById(trigger: 'AUTO') — อัปเดต privateReplyStatus
 *     + conversationId — ข้อ 6 ล้มเหลวไม่หยุดข้อ 7 (BR-CR-A5: สองอย่างนี้ไม่ผูกกันแบบ all-or-nothing)
 *
 * 🛑 ฟังก์ชันนี้ห้าม throw ออกไปทุกกรณี — ผู้เรียกคือ after() ของ webhook route ซึ่ง throw ไม่ได้
 * (Meta จะ retry ทั้ง batch)
 */
export async function processCommentAutoReply(commentId: string): Promise<void> {
  try {
    const comment = await prisma.pageComment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            channel: {
              select: {
                id: true,
                shopId: true,
                externalId: true,
                status: true,
                commentPublicReplyEnabled: true,
                commentPublicReplyText: true,
                commentPrivateReplyEnabled: true,
                commentPrivateReplyText: true,
              },
            },
          },
        },
      },
    })
    if (!comment) return

    const channel = comment.post.channel

    const [autoLog, humanReply] = await Promise.all([
      prisma.commentReplyLog.findFirst({
        where: {
          shopChannelId: channel.id,
          postId: comment.postId,
          fromExternalId: comment.fromExternalId,
          trigger: 'AUTO',
        },
      }),
      prisma.pageComment.findFirst({
        where: {
          parentExternalId: comment.externalCommentId,
          isFromPage: true,
          isAutoReply: false,
        },
      }),
    ])

    const gate = evaluateCommentGate({
      isFromPage: comment.isFromPage,
      parentExternalId: comment.parentExternalId,
      isDeleted: comment.isDeleted,
      fromExternalId: comment.fromExternalId,
      channelStatus: channel.status,
      publicEnabled: channel.commentPublicReplyEnabled,
      publicText: channel.commentPublicReplyText,
      privateEnabled: channel.commentPrivateReplyEnabled,
      privateText: channel.commentPrivateReplyText,
      hasAutoLogForPerson: !!autoLog,
      hasHumanReply: !!humanReply,
    })

    if (!gate.pass) {
      try {
        await prisma.commentReplyLog.create({
          data: {
            shopChannelId: channel.id,
            postId: comment.postId,
            commentId: comment.id,
            fromExternalId: comment.fromExternalId,
            trigger: 'AUTO',
            skipReason: gate.reason,
          },
        })
      } catch (err) {
        // อีกเธรดชนะจอง slot ไปแล้ว (P2002) — ไม่ใช่ error ต้องจัดการ
        if (!isUniqueConstraintError(err)) throw err
      }
      return
    }

    // จองแถว log ก่อนยิงตัวส่งใด ๆ — partial unique index กันซ้ำทั้งระบบของ public+private ฝั่ง AUTO
    let logId: string
    try {
      const created = await prisma.commentReplyLog.create({
        data: {
          shopChannelId: channel.id,
          postId: comment.postId,
          commentId: comment.id,
          fromExternalId: comment.fromExternalId,
          trigger: 'AUTO',
        },
      })
      logId = created.id
    } catch (err) {
      // ชนกับอีกเธรด/webhook retry ของคอมเมนต์เดียวกัน — อีกฝั่งกำลังจัดการอยู่แล้ว หยุดเงียบ
      if (isUniqueConstraintError(err)) return
      throw err
    }

    const publicOn = channel.commentPublicReplyEnabled && !!channel.commentPublicReplyText?.trim()
    const privateOn = channel.commentPrivateReplyEnabled && !!channel.commentPrivateReplyText?.trim()

    if (publicOn) {
      try {
        await replyToComment({
          commentId: comment.id,
          message: channel.commentPublicReplyText as string,
          actorUserId: null, // system actor — ไม่ใช่ user จริง (feature 00038)
        })
        await prisma.commentReplyLog.update({
          where: { id: logId },
          data: { publicReplyStatus: 'SENT' },
        })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        await prisma.commentReplyLog.update({
          where: { id: logId },
          data: { publicReplyStatus: 'FAILED', errorMessage },
        })
      }
    }

    // ข้อ public ล้มเหลวไม่หยุดตรงนี้ (BR-CR-A5) — สองช่องทางไม่ผูกกันแบบ all-or-nothing
    if (privateOn) {
      const result = await sendPrivateReplyToCommentById({
        commentId: comment.id,
        text: channel.commentPrivateReplyText as string,
        trigger: 'AUTO',
      })
      if (result.sent) {
        await prisma.commentReplyLog.update({
          where: { id: logId },
          data: { privateReplyStatus: 'SENT', conversationId: result.conversationId },
        })
      } else {
        await prisma.commentReplyLog.update({
          where: { id: logId },
          data: { privateReplyStatus: 'FAILED', errorMessage: result.error ?? result.reason },
        })
      }
    }
  } catch (err) {
    // ห้าม throw ออกจากฟังก์ชันนี้ทุกกรณี — ผู้เรียกคือ after() ของ webhook route
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[comment-auto-reply] unexpected error', errorMessage)
  }
}
