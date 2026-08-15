/**
 * comment-auto-reply.service — ด่านคัดกรอง 8 ข้อ + ตัวยิงอัตโนมัติของคอมเมนต์ (feature 00038)
 *
 * ผู้เรียกคือ webhook `feed` (item=comment) ผ่าน after() — ฟังก์ชัน orchestration ที่นี่ห้าม throw
 * ออกไปทุกกรณี ไม่งั้น Meta จะ retry ทั้ง batch แล้วปัญหาบานปลาย (ดู docstring processCommentAutoReply)
 */
import { prisma } from '@/lib/prisma'
import { replyToComment } from '@/services/page-comment.service'
import { sendPrivateReplyToCommentById } from '@/services/comment-private-reply.service'

/**
 * 🛑 `ALREADY_HANDLED` ถูกถอดออก 2026-08-15 — ไม่ใช่เพราะเลิกใช้กฎ แต่เพราะ **มันเขียนลงฐานไม่ได้
 * เลยแม้แต่แถวเดียวตั้งแต่วันแรก**: `recordSkip()` ใช้คีย์เดียวกับ partial unique index ที่แถวรอบ
 * ก่อนของคนเดียวกันบนโพสต์เดียวกันถือครองอยู่ -> ชน P2002 -> ถูกกลืนที่ catch ด้านล่าง
 * (ยืนยันกับ prod: skipReason ที่มีจริงมีแค่ FROM_PAGE / DISABLED / NOT_TOP_LEVEL) ตอนนี้กฎ
 * "ครั้งเดียวต่อคนต่อโพสต์" เหลือครอบเฉพาะฝั่งทักแชท และบันทึกที่ `privateReplyStatus='SKIPPED'`
 * + `privateErrorMessage='ALREADY_SENT'` ของแถวคอมเมนต์ใบนั้นเอง ซึ่งเป็นที่ที่ผู้ขายมองหาจริง
 */
export const COMMENT_SKIP_REASONS = [
  'FROM_PAGE', 'NOT_TOP_LEVEL', 'COMMENT_DELETED', 'NO_SENDER_ID',
  'CHANNEL_INACTIVE', 'DISABLED', 'HUMAN_ANSWERED',
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

  if (input.hasHumanReply) return { pass: false, reason: 'HUMAN_ANSWERED' }
  return { pass: true }
}

/**
 * ตัวยิงอัตโนมัติ — โหลดคอมเมนต์, ผ่านด่านคัดกรอง, จอง log แล้วยิง public/private reply
 *
 * ลำดับ:
 *  1. โหลด comment + post + channel (รวม 4 คอลัมน์ตั้งค่า) — ไม่พบ = return เงียบ
 *  2. เช็คด่านที่ตัดสินได้โดยไม่ต้องแตะ DB ก่อน (evaluateCommentGate โดยส่ง hasHumanReply = false
 *     ไปก่อน — ด่านอื่นทั้งหมดไม่ขึ้นกับค่านี้) ไม่ผ่าน → บันทึก skip แล้ว return ทันที
 *     **ไม่ query DB เพิ่มเลย** (I2 fix round 1: เดิม query ธงพวกนี้ก่อนด่านเสมอ แม้แต่คอมเมนต์
 *     ที่ไม่มี fromExternalId ซึ่งโดนตัดที่ NO_SENDER_ID อยู่แล้ว — เสีย round-trip เปล่า ๆ)
 *  3. ผ่านด่านที่ไม่ต้องแตะ DB แล้ว → query hasAutoLogForComment (คอมเมนต์ **ใบนี้** เคยถูก
 *     ประมวลผลไปแล้วไหม = Meta ส่ง webhook ซ้ำ) + hasHumanReply (คนในทีมตอบคอมเมนต์นี้ไปแล้วไหม
 *     — บอทต้องหลีกทางให้คน)
 *  4. hasAutoLogForComment → **return เงียบ ไม่เขียนแถวใหม่** แถวเดิมคือบันทึกของเหตุการณ์นี้อยู่แล้ว
 *     (เขียนซ้ำก็ชน unique index เปล่า ๆ) จากนั้น evaluateCommentGate อีกครั้งด้วย hasHumanReply
 *     ตัวจริง — ไม่ผ่าน → บันทึก skip แล้ว return
 *  5. จอง slot ด้วย CommentReplyLog.create (trigger=AUTO) **ก่อนยิงตัวส่งใด ๆ** — partial unique
 *     index (commentId) WHERE trigger='AUTO' กันซ้ำข้ามเธรด/ข้าม request จาก Meta retry ของ
 *     คอมเมนต์เดียวกัน ดัก P2002 = อีกเธรดชนะไปแล้ว ไม่ใช่ error
 *  6. สวิตช์ public เปิด → replyToComment(actorUserId: null) — จับ error แยก อัปเดต publicReplyStatus
 *     🛑 ฝั่งนี้ **ไม่มีเพดาน "ครั้งเดียวต่อคนต่อโพสต์"** แล้ว (BR-CR-A2a): ลูกค้าคนเดิมถามใหม่
 *     ใต้โพสต์เดิมต้องได้คำตอบใหม่ — Facebook ไม่ได้จำกัดการตอบสาธารณะ กฎเดิมเป็นของเราเอง
 *     และมันทำให้คอมเมนต์ที่ 2 เงียบสนิทโดยไม่มีร่องรอย (user ชี้เอง 2026-08-15)
 *  7. สวิตช์ private เปิด → **จองสิทธิ์ก่อนด้วย privateAttemptedAt** (BR-CR-A2b: ทักแชทอัตโนมัติ
 *     ครั้งเดียวต่อคนต่อโพสต์ — เพดานนี้ยังอยู่ เพราะ DM ซ้ำคือสแปมจริง ๆ และ Facebook เองก็ให้
 *     ทักได้ครั้งเดียวต่อคอมเมนต์) ชน P2002 = คอมเมนต์ใบก่อนของคนเดียวกันบนโพสต์เดียวกันถือสิทธิ์
 *     ไปแล้ว → บันทึก privateReplyStatus='SKIPPED' + privateErrorMessage='ALREADY_SENT' แล้วข้าม
 *     ผ่านด่านแล้วค่อย sendPrivateReplyToCommentById(trigger: 'AUTO', reservedLogId: logId) —
 *     **ต้องส่ง reservedLogId เป็นแถวเดียวกับที่จองไว้ในข้อ 5 เสมอ** ไม่งั้น sendPrivateReplyToCommentById
 *     จะ findFirst เจอแถวที่เพิ่งจองไปเอง แล้ว trigger==='AUTO' จะ trip ALREADY_SENT ทุกครั้ง = ไม่ยิง
 *     Graph เลยสักครั้ง (Fix round 1 — บั๊กจริงที่ reviewer จับได้ 2026-08-08) — อัปเดต
 *     privateReplyStatus + conversationId ต่อจากผลที่ callee เขียนไว้แล้ว (บาง early-return path
 *     ของ callee เช่น CHANNEL_INACTIVE/WINDOW_EXPIRED ไม่เคยแตะแถวนี้เลย โค้ดข้างล่างจึงยังต้องเขียน
 *     เอง — ดู docstring parameter reservedLogId ใน comment-private-reply.service.ts) ข้อ 6
 *     ล้มเหลวไม่หยุดข้อ 7 (BR-CR-A5: สองอย่างนี้ไม่ผูกกันแบบ all-or-nothing)
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

    const gateInputWithoutDbFlags = {
      isFromPage: comment.isFromPage,
      parentExternalId: comment.parentExternalId,
      isDeleted: comment.isDeleted,
      fromExternalId: comment.fromExternalId,
      channelStatus: channel.status,
      publicEnabled: channel.commentPublicReplyEnabled,
      publicText: channel.commentPublicReplyText,
      privateEnabled: channel.commentPrivateReplyEnabled,
      privateText: channel.commentPrivateReplyText,
    }

    const recordSkip = async (reason: CommentSkipReason) => {
      try {
        await prisma.commentReplyLog.create({
          data: {
            shopChannelId: channel.id,
            postId: comment.postId,
            commentId: comment.id,
            fromExternalId: comment.fromExternalId,
            trigger: 'AUTO',
            skipReason: reason,
          },
        })
      } catch (err) {
        // อีกเธรดชนะจอง slot ไปแล้ว (P2002) — ไม่ใช่ error ต้องจัดการ
        if (!isUniqueConstraintError(err)) throw err
      }
    }

    // ด่านที่ไม่ต้องแตะ DB ก่อน — ยังไม่รู้ hasHumanReply จริง ใส่ false ไปก่อน
    // (ด่านอื่นทั้งหมดไม่ขึ้นกับค่านี้ ผลจึงยังถูกต้องแม้จะยังไม่ query)
    const cheapGate = evaluateCommentGate({ ...gateInputWithoutDbFlags, hasHumanReply: false })
    if (!cheapGate.pass) {
      await recordSkip(cheapGate.reason)
      return
    }

    const [autoLogForComment, humanReply] = await Promise.all([
      // คอมเมนต์ **ใบนี้** เคยถูกประมวลผลไปแล้วไหม (ไม่ใช่ "คนนี้บนโพสต์นี้" อีกต่อไป — ดูข้อ 6/7
      // ของ docstring) ตรงกับ partial unique index CommentReplyLog_auto_once_per_comment
      prisma.commentReplyLog.findFirst({
        where: { commentId: comment.id, trigger: 'AUTO' },
      }),
      prisma.pageComment.findFirst({
        where: {
          parentExternalId: comment.externalCommentId,
          isFromPage: true,
          isAutoReply: false,
        },
      }),
    ])

    // Meta ส่ง webhook ของคอมเมนต์เดิมซ้ำ — แถวเดิมคือบันทึกของเหตุการณ์นี้อยู่แล้ว ไม่ต้องเขียนอะไร
    // (เขียนซ้ำมีแต่จะชน unique index แล้วถูกกลืน ซึ่งคือกับดักที่ทำให้ ALREADY_HANDLED
    // เขียนลงฐานไม่ได้เลยตั้งแต่วันแรก)
    if (autoLogForComment) return

    const gate = evaluateCommentGate({ ...gateInputWithoutDbFlags, hasHumanReply: !!humanReply })

    if (!gate.pass) {
      await recordSkip(gate.reason)
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
          data: { publicReplyStatus: 'FAILED', publicErrorMessage: errorMessage },
        })
      }
    }

    // ข้อ public ล้มเหลวไม่หยุดตรงนี้ (BR-CR-A5) — สองช่องทางไม่ผูกกันแบบ all-or-nothing
    if (privateOn) {
      // BR-CR-A2b — จองสิทธิ์ "ทักแชทอัตโนมัติ" ของ (channel, post, คนคนนี้) **ก่อนยิง Graph**
      // partial unique index บน privateAttemptedAt เป็นตัวบังคับ ไม่ใช่ if ข้างล่างนี้: สองคำขอ
      // ที่มาพร้อมกันจากคอมเมนต์คนละใบของคนเดียวกันจะเห็น "ยังไม่มีใครทัก" พร้อมกันได้เสมอ
      // ถ้าใช้ findFirst-แล้วค่อย-update (หลักเดียวกับ claimJob / atomic deduct ของ wallet)
      try {
        await prisma.commentReplyLog.update({
          where: { id: logId },
          data: { privateAttemptedAt: new Date() },
        })
      } catch (err) {
        if (!isUniqueConstraintError(err)) throw err
        // คอมเมนต์ใบก่อนของคนเดียวกันบนโพสต์เดียวกันทักไปแล้ว — ข้ามฝั่งนี้ แต่ **ต้องบันทึกให้เห็น**
        // (นี่คือช่องที่เคยเงียบสนิทจนผู้ขายแยกไม่ออกว่าเป็นกฎหรือของพัง) 'ALREADY_SENT' มีคำแปล
        // ไทยอยู่แล้วใน FAIL_REASON_TEXT — ห้ามพิมพ์คำใหม่ที่นี่ (HR16)
        await prisma.commentReplyLog.update({
          where: { id: logId },
          data: { privateReplyStatus: 'SKIPPED', privateErrorMessage: 'ALREADY_SENT' },
        })
        return
      }

      // 🛑 ต้องส่ง reservedLogId เป็นแถวเดียวกับที่จองไว้ข้างบนเสมอ — ไม่งั้น callee จะเห็นแถวนั้น
      // ผ่าน findFirst ของตัวเองแล้ว trip ALREADY_SENT ทันที (Fix round 1, ดู docstring บนฟังก์ชันนี้)
      const result = await sendPrivateReplyToCommentById({
        commentId: comment.id,
        text: channel.commentPrivateReplyText as string,
        trigger: 'AUTO',
        reservedLogId: logId,
      })
      if (result.sent) {
        await prisma.commentReplyLog.update({
          where: { id: logId },
          data: { privateReplyStatus: 'SENT', conversationId: result.conversationId },
        })
      } else {
        await prisma.commentReplyLog.update({
          where: { id: logId },
          data: { privateReplyStatus: 'FAILED', privateErrorMessage: result.error ?? result.reason },
        })
      }
    }
  } catch (err) {
    // ห้าม throw ออกจากฟังก์ชันนี้ทุกกรณี — ผู้เรียกคือ after() ของ webhook route
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[comment-auto-reply] unexpected error', errorMessage)
  }
}
