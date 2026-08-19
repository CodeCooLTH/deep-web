import { Prisma } from '@prisma/client'
import { COMMENT_LIST_PAGE_SIZE } from '@/lib/comment-list-page'
import { isWithinPrivateReplyWindow, privateReplyWindowCutoff } from '@/lib/private-reply-window'
import { prisma } from '@/lib/prisma'
import { canAccessShop, assertShopsAccessible } from '@/lib/shop-context'
import { decryptToken } from '@/lib/token-crypto'
import { getChannelByExternalId } from '@/services/shop-channel.service'
import { createCommentReply, fetchPagePosts, fetchPostComments, fetchPostMeta } from '@/lib/facebook/graph'
import { getFileUrl } from '@/lib/storage'
import { toFileUrl } from '@/lib/file-url'
import { mirrorRemoteImage } from '@/services/channel-chat.service'
import type { FeedChange } from '@/lib/facebook/webhook-types'

/**
 * page-comment.service — คอมเมนต์ใต้โพสต์ของเพจ (feature 00029)
 *
 * ทำไมแยกไฟล์จาก channel-chat.service: คอมเมนต์ไม่ใช่บทสนทนา — ไม่มีคู่สนทนา ไม่มีหน้าต่าง 24 ชม.
 * เป็นข้อความสาธารณะที่ผูกกับ "โพสต์" กติกาคนละชุดกันทั้งหมด (ดู PRD/BRD 00029)
 *
 * ที่เหมือนกันคือหลักการ: idempotent ด้วย external id, ตรวจสิทธิ์ที่ service ชั้นเดียว,
 * และเก็บ payload ดิบไว้สืบย้อนหลัง
 */

/** จำนวนคอมเมนต์ต่อหน้าเวลาเปิดโพสต์ (BRD Q-2) */
const COMMENTS_PAGE_SIZE = 30

/**
 * รูปปกโพสต์ที่ **หน้าจอต้องใช้** — สำเนาที่เราเก็บเองชนะ URL ของ Meta เสมอ
 *
 * 🛑 ห้ามอ่าน `thumbnailUrl` ตรง ๆ ไปแสดงผล ให้เรียกตัวนี้เสมอ
 *
 * ที่มา (user report 2026-08-09 พร้อมภาพหน้าจอ): รูปปกในรายการซ้ายของ `/inbox/comments` ทยอย
 * กลายเป็นกล่องขาวเปล่า โดยโพสต์อายุ 4 วันยังมีรูป ส่วนใบ 5 วันหายหมด — เพราะ `thumbnailUrl`
 * เก็บ URL ของ fbcdn ดิบ ซึ่ง **หมดอายุ ~4 วัน** (คลาสเดียวกับ `ShopVideo.mirroredFileId` และ
 * การ์ด carousel ในแชท ที่ปิดไปแล้วคนละรอบ — หน้านี้เป็นที่สุดท้ายที่ยังเก็บ URL ดิบอยู่)
 *
 * ทำไมไม่รีเฟรช URL แทนการ mirror: ตัวที่รีเฟรชได้ (`refreshPostStats`) ยิง Graph 1 ครั้งต่อโพสต์
 * และถูกเรียกจาก `getPostThread` ที่เดียว = เฉพาะโพสต์ที่ "มีคนกดเปิด" เท่านั้น. จะให้รายการซ้าย
 * สดตลอดต้องยิง Graph ทุกโพสต์ทุกครั้งที่โหลดรายการ ซึ่งหน้านี้ poll ทุก 60 วิ + realtime อีก
 *
 * กิ่ง fallback ยังต้องมี: โพสต์เก่าที่ยัง mirror ไม่ทันจะได้ลองใช้ URL เดิม (ยังไม่หมดอายุก็เห็น)
 */
export function resolvePostThumbnail(post: { mirroredFileId: string | null; thumbnailUrl: string | null }): string | null {
  return toFileUrl(post.mirroredFileId) ?? post.thumbnailUrl
}

/**
 * mirror รูปปกโพสต์เข้า storage ของเรา — คืน fileId หรือ null เมื่อทำไม่ได้
 *
 * best-effort เสมอ: รูปพังห้ามทำให้คอมเมนต์หายทั้งก้อน (หลักการเดียวกับ `mirrorRemoteImage`
 * ฝั่งแชทที่เขียนไว้ว่า "ห้ามทิ้งทั้งข้อความเพราะรูปพัง")
 *
 * ใช้คอลัมน์ `mirroredFileId`/`mirroredAt` **ตัวเดิมของ 00035** ไม่สร้างคอลัมน์ใหม่ — มันคือ
 * ของสิ่งเดียวกันเป๊ะ ("สำเนารูปปกโพสต์ที่เก็บเอง") การมีสองคอลัมน์เก็บของอย่างเดียวกันบนแถวเดียว
 * คือ Hard Rule 16 ตรงตัว. ผลข้างเคียงที่ตรวจแล้วว่าปลอดภัย: `mirrorFacebookPost()` ใน
 * shop-page-layout.service เช็ค `if (post.mirroredFileId)` เพื่อกัน mirror ซ้ำ แล้วคืนรูปนั้นไปใช้
 * — เจอของที่เรา mirror ไว้ก่อนก็คืนรูปที่ถูกต้อง (แค่ `mirrored: false` ซึ่งแปลว่า "ไม่ได้ mirror
 * รอบนี้" ไม่ใช่ "ไม่มีรูป")
 */
async function mirrorPostThumbnail(pictureUrl: string | null | undefined): Promise<string | null> {
  if (!pictureUrl) return null
  return mirrorRemoteImage(pictureUrl)
}

/**
 * export ให้ comment-private-reply.service.ts ใช้ร่วม (feature 00038) — พฤติกรรมเดิมทุกประการ
 * (คืน null เมื่อ status !== 'ACTIVE' หรือ decrypt token ไม่ผ่าน) ไม่ได้แก้ logic เพียงเปิด export
 */
export async function resolveChannelToken(shopChannelId: string): Promise<{ token: string; pageId: string } | null> {
  const channel = await prisma.shopChannel.findUnique({
    where: { id: shopChannelId },
    select: { accessTokenEnc: true, externalId: true, status: true },
  })
  if (!channel || channel.status !== 'ACTIVE') return null
  try {
    return { token: decryptToken(channel.accessTokenEnc), pageId: channel.externalId }
  } catch {
    return null
  }
}

/**
 * บันทึกคอมเมนต์จาก webhook `feed` (item=comment)
 *
 * ไม่ throw: webhook ต้องตอบ 200 ให้ Meta เสมอ (กติกาเดิมของ route) — ล้มเหลวก็แค่ไม่มีคอมเมนต์นั้น
 * ไม่ใช่ทั้ง batch พัง. คอมเมนต์ที่หายยังตามเก็บได้ทีหลังด้วย backfill ตอนเปิดโพสต์
 *
 * คืน id ของคอมเมนต์ที่บันทึก (feature 00038 — caller เอาไปสั่งตอบอัตโนมัติใน after())
 * null = ไม่ได้บันทึก หรือบันทึกแล้วแต่ไม่ควร trigger การตอบอัตโนมัติ — ได้แก่ ไม่ใช่คอมเมนต์ /
 * ไม่พบเพจ / เป็น verb=remove / เป็น verb=edited หรือ edit (หนี้ #3, ดูคอมเมนต์ก่อน return ท้ายฟังก์ชัน)
 *
 * 🛑 คืนเฉพาะกรณี **webhook สด** เท่านั้น — backfillPostComments() ต้องไม่เดินผ่านทางนี้
 * ไม่งั้นคอมเมนต์เก่าเป็นร้อยจะถูกยิงย้อนหลังพร้อมกัน (BR-CR-12 / AC-CR-14)
 */
export async function ingestFeedComment(params: {
  pageExternalId: string
  change: FeedChange
  /** payload ดิบก่อน parse — เหตุผลเดียวกับ ChatMessage.rawMessage (บทเรียน 2026-08-03) */
  rawChange?: unknown
}): Promise<string | null> {
  const val = params.change.value
  if (!val || val.item !== 'comment' || !val.comment_id || !val.post_id) return null

  const channel = await getChannelByExternalId('MESSENGER', params.pageExternalId)
  if (!channel) return null

  // ลบคอมเมนต์ — ทำเครื่องหมาย ไม่ลบแถว (BR-CMT-04 เก็บเป็นหลักฐานว่าเคยมีคนถามอะไร)
  if (val.verb === 'remove') {
    await prisma.pageComment.updateMany({
      where: { externalCommentId: val.comment_id, shopChannelId: channel.id },
      data: { isDeleted: true },
    })
    return null
  }

  const post = await ensurePost(channel.id, val.post_id)
  if (!post) return null

  const createdTime = val.created_time ? new Date(val.created_time * 1000) : new Date()
  // parent_id ที่เท่ากับ post_id = คอมเมนต์ระดับบน (ยืนยันจาก payload จริง: reply จะได้ comment id
  // ของตัวแม่ ส่วนคอมเมนต์ระดับบนได้ post id) — เก็บ null เพื่อให้ query "คอมเมนต์ระดับบน" ตรงไปตรงมา
  const parentExternalId = val.parent_id && val.parent_id !== val.post_id ? val.parent_id : null
  const isFromPage = !!val.from?.id && val.from.id === params.pageExternalId

  const data = {
    postId: post.id,
    shopChannelId: channel.id,
    externalCommentId: val.comment_id,
    parentExternalId,
    fromExternalId: val.from?.id ?? null,
    fromName: val.from?.name ?? null,
    isFromPage,
    message: val.message ?? null,
    attachmentUrl: val.photo ?? val.video ?? null,
    createdTime,
    rawPayload: toJson(params.rawChange ?? params.change),
  }

  const saved = await prisma.pageComment.upsert({
    where: { externalCommentId: val.comment_id },
    create: data,
    // verb=edited/edit → ทับข้อความเดิม + ประทับเวลาที่แก้ (UI ขึ้นป้าย "แก้ไขแล้ว")
    // 🛑 update block นี้ห้ามมี isAutoReply — Meta ส่ง echo ของคำตอบที่บอทเขียนกลับเข้ามา
    // ผ่านทางนี้ ถ้าเขียนทับด้วยค่า default ธงจะถูกรีเซ็ตแล้วป้าย "ตอบอัตโนมัติ" หายไปเอง
    // (คอลัมน์ที่มีผู้เขียน 2 ราย — docs/conventions/external-payload-schema.md)
    update: {
      message: data.message,
      attachmentUrl: data.attachmentUrl,
      fromName: data.fromName ?? undefined,
      ...(val.verb === 'edited' || val.verb === 'edit' ? { editedAt: new Date() } : {}),
      isDeleted: false,
      rawPayload: data.rawPayload,
    },
  })

  // เวลาคอมเมนต์ล่าสุดของโพสต์ = ตัวเรียงรายการซ้าย — เขียนเฉพาะเมื่อใหม่กว่าเดิม
  // (กัน event ที่มาสลับลำดับดันเวลาถอยหลัง — pattern เดียวกับ lastInboundAt ของแชท)
  await prisma.facebookPost.updateMany({
    where: { id: post.id, OR: [{ lastCommentAt: null }, { lastCommentAt: { lt: createdTime } }] },
    data: { lastCommentAt: createdTime },
  })

  // feature 00038 หนี้ #3 — คอมเมนต์ที่ถูกแก้ไข (ไม่ใช่คอมเมนต์ใหม่) ไม่ควร trigger การตอบอัตโนมัติซ้ำ
  // ข้อความก็ถูกบันทึก/อัปเดตไปแล้วด้านบนตามปกติ แค่ไม่ส่ง id กลับให้ caller เอาไปยิง
  // processCommentAutoReply — เดิมคืน id เสมอ ทำให้ลูกค้าแก้คอมเมนต์กี่ครั้งก็เรียกซ้ำทุกครั้ง
  // (ปลอดภัยเพราะ orchestration เช็ค "มี log ของคอมเมนต์ใบนี้แล้วไหม" กันไว้อีกชั้น + partial unique
  //  index `CommentReplyLog_auto_once_per_comment` เป็นด่านสุดท้าย แต่เสีย DB round-trip เปล่า ๆ)
  if (val.verb === 'edited' || val.verb === 'edit') return null

  return saved.id
}

function toJson(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return undefined
  }
}

/**
 * หาแถวโพสต์ (สร้างถ้ายังไม่มี) — ข้อมูลโพสต์จริงดึงจาก Graph ครั้งเดียวแล้ว cache
 * โพสต์ที่ดึงไม่ได้ (สิทธิ์ไม่พอ/ถูกลบ) ยังสร้างแถวเปล่าไว้ เพื่อไม่ให้คอมเมนต์หายทั้งก้อน
 */
async function ensurePost(shopChannelId: string, externalPostId: string) {
  const existing = await prisma.facebookPost.findUnique({ where: { externalPostId } })
  if (existing) return existing

  const auth = await resolveChannelToken(shopChannelId)
  const meta = auth ? await fetchPostMeta(externalPostId, auth.token) : null
  // mirror ทันทีตอนสร้างแถว — ตอนนี้คือ "นาทีที่ URL ของ fbcdn สดที่สุด" ถ้าปล่อยไว้แล้วค่อยมา
  // ตามเก็บทีหลัง จะต้องยิง Graph ขอ URL ใหม่ก่อนเสมอ (ดู resolvePostThumbnail)
  const mirroredFileId = await mirrorPostThumbnail(meta?.picture)

  try {
    return await prisma.facebookPost.create({
      data: {
        shopChannelId,
        externalPostId,
        message: meta?.message ?? null,
        permalink: meta?.permalink ?? null,
        thumbnailUrl: meta?.picture ?? null,
        mirroredFileId,
        mirroredAt: mirroredFileId ? new Date() : null,
        createdTime: meta?.createdTime ?? null,
        mediaType: meta?.mediaType ?? null,
        reactionCount: meta?.reactionCount ?? null,
        fbCommentCount: meta?.commentCount ?? null,
        shareCount: meta?.shareCount ?? null,
        statsSyncedAt: meta ? new Date() : null,
      },
    })
  } catch {
    // ชนกับ webhook อีกตัวที่สร้างพร้อมกัน (unique externalPostId) — อ่านของที่มีอยู่แล้วคืนไป
    return prisma.facebookPost.findUnique({ where: { externalPostId } })
  }
}

/** เว้นระยะก่อนดึงโพสต์ย้อนหลังของเพจเดิมซ้ำ — เปิดแท็บรัว ๆ ไม่ควรยิง Graph ทุกครั้ง */
const PAGE_POSTS_BACKFILL_TTL_MS = 10 * 60 * 1000
/** จำนวนโพสต์ที่ดึงมาดูต่อรอบ (คัดเฉพาะที่มีคอมเมนต์ก่อนจะไปดึงคอมเมนต์รายโพสต์) */
const PAGE_POSTS_LIMIT = 50
/** เพดานจำนวนโพสต์ที่จะไปดึงคอมเมนต์ต่อรอบ — กัน call พุ่งตอนเชื่อมเพจที่มีโพสต์เยอะครั้งแรก */
const PAGE_POSTS_COMMENTS_PER_RUN = 15

/**
 * ดึง "โพสต์ย้อนหลังของเพจ" เข้าฐาน แล้วตามเก็บคอมเมนต์ของโพสต์ที่มีคนคอมเมนต์
 * (user สั่ง 2026-08-04 หลังเทียบกับ Business Suite: "ทำไมไม่ครบตาม business suite")
 *
 * ปัญหาที่แก้: แถว FacebookPost เกิดขึ้นเฉพาะเมื่อมีคอมเมนต์ webhook เข้ามา **หลัง** เชื่อมเพจ
 * (ensurePost เรียกจาก ingestFeedComment ที่เดียว) โพสต์ที่คอมเมนต์เข้ามาก่อนนั้นไม่มีในฐานเลย
 *
 * กติกาที่ตั้งใจ:
 *  - **ไม่ throw เด็ดขาด** — นี่คือฟังก์ชันเสริมที่รันหลังส่ง response (after()) ถ้าพังต้องไม่มีผล
 *    ต่อการเปิดหน้า และครั้งหน้าก็ลองใหม่เองได้
 *  - throttle ต่อเพจ 10 นาที (in-memory เหมือน backfillPostComments) — เปิดแท็บซ้ำ ๆ ไม่ยิง Graph ซ้ำ
 *  - คัดด้วย comments.summary ก่อน แล้วดึงคอมเมนต์แค่ 15 โพสต์แรกที่มีคอมเมนต์ต่อรอบ: โพสต์เก่า
 *    ที่ไม่มีคอมเมนต์ไม่มีค่าอะไรกับหน้านี้ และการยิงคอมเมนต์ทุกโพสต์รอบเดียวคือทางตรงไป rate limit
 *  - ใช้ `upsert` ผ่าน ensurePost เดิม (มี unique externalPostId + กันชนกับ webhook อยู่แล้ว)
 *    แต่ **เติมค่า meta จากรายการที่ดึงมาแล้ว** ไม่ต้องยิง fetchPostMeta ต่อโพสต์อีกรอบ
 */
export async function backfillPagePosts(params: {
  shopId: string
  actorUserId: string
}): Promise<{ postsAdded: number; commentsAdded: number }> {
  const result = { postsAdded: 0, commentsAdded: 0 }
  try {
    if (!(await canAccessShop(params.shopId, params.actorUserId))) return result

    const channels = await prisma.shopChannel.findMany({
      where: { shopId: params.shopId, provider: 'MESSENGER', status: 'ACTIVE' },
      select: { id: true },
    })
    const store = ((globalThis as { __pagePostsBackfillAt?: Map<string, number> }).__pagePostsBackfillAt ??= new Map())

    for (const ch of channels) {
      const last = store.get(ch.id)
      if (last && Date.now() - last < PAGE_POSTS_BACKFILL_TTL_MS) continue
      store.set(ch.id, Date.now())

      const auth = await resolveChannelToken(ch.id)
      if (!auth) continue

      let posts: Awaited<ReturnType<typeof fetchPagePosts>> = []
      try {
        posts = await fetchPagePosts(auth.token, auth.pageId, PAGE_POSTS_LIMIT)
      } catch (e) {
        // สิทธิ์ไม่ครบ/โดน rate limit — ไม่ใช่เหตุให้หน้าพัง แค่ครั้งนี้ไม่ได้ของเพิ่ม
        console.warn('[fb-comments] ดึงโพสต์ย้อนหลังไม่สำเร็จ', e instanceof Error ? e.message : e)
        continue
      }

      const withComments = posts.filter((p) => p.commentCount > 0).slice(0, PAGE_POSTS_COMMENTS_PER_RUN)
      for (const p of withComments) {
        const existing = await prisma.facebookPost.findUnique({ where: { externalPostId: p.id } })
        let postRowId = existing?.id ?? null
        if (!existing) {
          // mirror ก่อนสร้างแถว ด้วยเหตุผลเดียวกับ ensurePost — `p.picture` เพิ่งได้มาจาก Graph
          // จึงยังไม่หมดอายุแน่นอน
          const mirroredFileId = await mirrorPostThumbnail(p.picture)
          try {
            const created = await prisma.facebookPost.create({
              data: {
                shopChannelId: ch.id,
                externalPostId: p.id,
                message: p.message,
                permalink: p.permalink,
                thumbnailUrl: p.picture,
                mirroredFileId,
                mirroredAt: mirroredFileId ? new Date() : null,
                createdTime: p.createdTime,
                mediaType: p.mediaType,
                reactionCount: p.reactionCount,
                fbCommentCount: p.commentCount,
                shareCount: p.shareCount,
                statsSyncedAt: new Date(),
              },
            })
            postRowId = created.id
            result.postsAdded += 1
          } catch {
            // ชนกับ webhook ที่สร้างพร้อมกัน — อ่านของที่มีอยู่แล้วไปต่อ
            postRowId = (await prisma.facebookPost.findUnique({ where: { externalPostId: p.id } }))?.id ?? null
          }
        }
        if (!postRowId) continue
        const { added } = await backfillPostComments(postRowId)
        result.commentsAdded += added
      }
    }
  } catch (e) {
    console.warn('[fb-comments] backfillPagePosts ล้ม', e instanceof Error ? e.message : e)
  }
  return result
}

/**
 * สถานะการตอบของคอมเมนต์/โพสต์ (feature 00038 BR-CR-S1/S2) — 3 ชั้น แทนที่ boolean คู่เดิม
 * ที่ overlap กันได้ (unanswered/done) ซึ่งเป็นต้นเหตุของบั๊ก "ตัวเลขไม่ตรงกัน" มาแล้วในหน้านี้
 */
export type CommentAnswerState = 'UNANSWERED' | 'BOT_ANSWERED' | 'HUMAN_ANSWERED'

/**
 * สถานะของคอมเมนต์ 1 อัน ตัดสินจากคำตอบของเพจที่อยู่ใต้มัน (feature 00038 BR-CR-S1)
 *
 * 🛑 ฟังก์ชันนี้ต้องเป็นทางเดียวที่ตัดสินสถานะ — ทั้งตัวนับบน badge, ตัวเลขบนชิป และตัวกรอง
 * ที่ใช้จริง ต้องผ่านตัวนี้ จอนี้เคยโชว์ "ยังไม่ตอบ 7 กับ 8" พร้อมกันมาแล้วเพราะคำนวณคนละที่
 * (docs/conventions/sibling-surface-parity.md)
 */
export function deriveCommentState(
  replies: Array<{ isFromPage: boolean; isAutoReply: boolean }>,
  /**
   * trigger ของ private reply ที่ **ส่งสำเร็จแล้ว** ของคอมเมนต์ใบนี้ (null = ยังไม่เคยทักแชท)
   * ต้องมาจาก `CommentReplyLog.privateReplyStatus = 'SENT'` เท่านั้น — 'SKIPPED'/'FAILED' ห้ามนับ
   * (มีแถวใน log ≠ ทักสำเร็จ)
   */
  privateReplyTrigger: 'AUTO' | 'MANUAL' | null = null,
): CommentAnswerState {
  const pageReplies = replies.filter((r) => r.isFromPage)
  if (pageReplies.length > 0) {
    return pageReplies.some((r) => !r.isAutoReply) ? 'HUMAN_ANSWERED' : 'BOT_ANSWERED'
  }
  /**
   * 🛑 ทักแชทส่วนตัวไปแล้ว = ไม่ใช่ "ยังไม่ตอบ" อีกต่อไป (user report 2026-08-09)
   *
   * เดิมสถานะนี้ดูแค่ "มีคำตอบสาธารณะใต้คอมเมนต์ไหม" — คอมเมนต์ที่บอททักแชทไปแล้ว ลูกค้าเข้าห้อง
   * แล้ว กำลังคุยกันอยู่ในกล่องข้อความ **ยังนั่งค้างในคิว "ยังไม่ตอบ" ตลอดไป** เพราะไม่มีใครไป
   * ตอบใต้คอมเมนต์สาธารณะด้วย คิวนี้จึงไม่มีวันลดลงเองแม้งานถูกทำจนจบในอีกหน้าจอหนึ่ง
   * (และป้าย "ทักแชทได้อีก N วัน" ก็เดินนับถอยหลังต่อบนแถวที่ทักไปแล้ว เพราะ `oldestUnansweredAt`
   * มาจากนิยามเดียวกันนี้)
   *
   * ไม่เพิ่มค่าที่ 4 ในเอนัม (user สั่ง 2026-08-09 "ไม่ต้องเพิ่มเยอะ") — ให้ตกเข้าสถานะที่มีอยู่แล้ว
   * ตามว่า **ใครเป็นคนทัก**: บอททัก → BOT_ANSWERED · คนกดทักเอง → HUMAN_ANSWERED ซึ่งตรงกับ
   * ความหมายเดิมของสองค่านั้นพอดี ("งานกลาง ยังไม่มีคนยืนยัน" vs "คนจัดการแล้ว")
   *
   * 🛑 คำตอบสาธารณะยังชนะเสมอ (เช็คก่อนบล็อกนี้) — คอมเมนต์ที่มีทั้งคำตอบใต้โพสต์และทักแชทแล้ว
   * ต้องอ่านจากคำตอบสาธารณะ ไม่ใช่จาก trigger ของ log
   */
  if (privateReplyTrigger) return privateReplyTrigger === 'MANUAL' ? 'HUMAN_ANSWERED' : 'BOT_ANSWERED'
  return 'UNANSWERED'
}

/**
 * สถานะของโพสต์ = ตัวที่แย่ที่สุดในบรรดาคอมเมนต์ของมัน (BR-CR-S2)
 *
 * ต้องเป็นแบบนี้เพื่อให้ 3 กลุ่มไม่ทับกันและรวมกันได้เท่ายอดทั้งหมด (AC-CR-27)
 * โพสต์ที่ไม่มีคอมเมนต์ของลูกค้าเลยถือว่าไม่มีอะไรค้าง จึงต้องไม่ไปโผล่ใน "ยังไม่ตอบ"
 */
export function derivePostState(commentStates: CommentAnswerState[]): CommentAnswerState {
  if (commentStates.includes('UNANSWERED')) return 'UNANSWERED'
  if (commentStates.includes('BOT_ANSWERED')) return 'BOT_ANSWERED'
  return 'HUMAN_ANSWERED'
}

export interface CommentPostRow {
  id: string
  externalPostId: string
  /** เพจที่โพสต์นี้อยู่ — ร้านเชื่อมได้หลายเพจ ต้องบอกให้รู้ว่าคอมเมนต์มาจากเพจไหน (user 2026-08-03) */
  channel: { id: string; name: string; provider: string; avatarUrl: string | null }
  /** ร้านเจ้าของเพจ (feature 00037) — กล่องแชทรวมหลายร้านต้องบอกได้ว่าโพสต์นี้ของร้านไหน */
  shop: { id: string; name: string }
  message: string | null
  thumbnailUrl: string | null
  permalink: string | null
  lastCommentAt: Date | null
  commentCount: number
  unansweredCount: number
  /**
   * สถานะรวมของโพสต์ (feature 00038 BR-CR-S2) — ตัวที่แย่ที่สุดในบรรดาคอมเมนต์ของโพสต์ชนะ
   * ตัดสินจาก derivePostState() ตัวเดียวกับที่ badge แถวโพสต์และตัวนับบนแท็บใช้ (BR-CR-S4)
   */
  postStatus: CommentAnswerState
  /**
   * เวลาของคอมเมนต์ลูกค้าที่ยังไม่ถูกตอบ **ที่เก่าที่สุดในกลุ่มที่ยังทักแชทได้** (null = ไม่มีอันไหน
   * ที่ยังทักได้ — ตอบครบแล้ว หรือของที่ค้างอยู่พ้น 7 วันไปหมดแล้ว)
   *
   * ใช้เดินนับถอยหลังหน้าต่าง "ทักแชทส่วนตัว 7 วัน" ของ Meta ในแถวรายการ (user สั่ง 2026-08-04)
   *
   * ทำไมต้อง "เก่าที่สุดในกลุ่มที่ยังไม่หมดเวลา" ไม่ใช่เก่าที่สุดเฉย ๆ (bug ที่ user เจอบน prod
   * 2026-08-04: ทุกแถวขึ้น "หมดเวลาทักแชท" ทั้งที่กดเข้าไปแล้วในเธรดยังเหลือ 6 วัน 22 ชั่วโมง):
   * โพสต์เก่าที่ยิงคอมเมนต์มาเรื่อย ๆ จะมีคอมเมนต์ค้างทั้งอันที่พ้น 7 วันแล้วและอันที่เพิ่งเข้ามา
   * ปนกัน — ถ้าเอาอันเก่าสุดทั้งกอง แถวจะประกาศว่า "หมดเวลา" ตลอดกาลทั้งที่ยังทักคนใหม่ได้อยู่
   * ตัวเลขที่ร้านต้องเห็นคือ "เส้นตายที่ใกล้ที่สุดในบรรดาอันที่ยังทำอะไรได้"
   */
  oldestUnansweredAt: Date | null
  lastCommenterName: string | null
  /** ข้อความคอมเมนต์ล่าสุด — แถวรายการต้องบอกว่า "ลูกค้าถามอะไร" ไม่ใช่แค่จำนวน (critique P1) */
  lastCommentText: string | null
  mediaType: string | null
  reactionCount: number | null
  fbCommentCount: number | null
  shareCount: number | null
}

/**
 * รายการโพสต์สำหรับคอลัมน์ซ้าย — เรียงตามเวลาคอมเมนต์ล่าสุด (BR-11)
 *
 * "ยังไม่ตอบ" = คอมเมนต์ของลูกค้าที่ยังไม่มีคอมเมนต์ของเพจตอบอยู่ข้างใต้ (user เคาะ 2026-08-03:
 * คอมเมนต์ของเพจเองไม่ถูกนับ เพราะเพจไม่ต้องตอบตัวเอง) — คำนวณสด ไม่ denormalize เพราะจำนวนโพสต์
 * ที่แสดงมีจำกัด (25) และตัวเลขที่ผิดเพราะลืมอัปเดต counter แย่กว่า query ที่ช้าขึ้นนิดเดียว
 */
/** จำนวนโพสต์ต่อสถานะ — **ทั้งร้าน ไม่ใช่แค่ batch ที่กำลังแสดงผล** (feature 00038 หนี้ #1)
 *
 * 🛑 ของเดิมคำนวณจากอาร์เรย์ post ของ batch เดียว (take:25) แล้ว client บวกสะสมตอน lazy-load —
 * ตัวเลขบนแท็บในหน้านี้จึงไม่ตรงกับ badge บนแท็บ "ความคิดเห็น" (`countUnansweredForShops`) ซึ่งนับ
 * ทั้งร้านมาตั้งแต่แรก ทั้งที่ตอบคำถามเดียวกัน — คำนวณผ่าน `countCommentPostStatesByShop()` ตัวเดียว
 * ที่ทั้งสองฝั่งเรียกร่วมกัน เพื่อให้ตรงกันโดยโครงสร้าง ไม่ใช่แค่ตั้งใจให้ตรง
 */
export interface CommentPostCounts {
  all: number
  unanswered: number
  botAnswered: number
  humanAnswered: number
  /**
   * ยังไม่ตอบ **และ** พ้นหน้าต่างทักแชทส่วนตัว 7 วันแล้ว (แท็บ "หมดอายุ" — user สั่ง 2026-08-19)
   *
   * 🛑 เป็น **สับเซตของ `unanswered`** ไม่ใช่กลุ่มที่ห้าที่แยกออกไป — `all` จึงยังเท่ากับ
   * `unanswered + botAnswered + humanAnswered` เหมือนเดิม. เหตุผลที่ไม่หักออกจาก `unanswered`:
   * หมดหน้าต่างแปลว่า *ทักแชทส่วนตัว* ไม่ได้แล้วเท่านั้น — **ตอบใต้คอมเมนต์แบบสาธารณะยังทำได้
   * ตลอดไป** มันจึงยังเป็นงานค้างจริง ๆ ที่ต้องอยู่ในคิว (และ `countUnansweredForShops` ที่ป้อน
   * badge บนแท็บ "ความคิดเห็น" ใช้นิยามเดียวกัน — หักที่นี่ที่เดียวจะทำให้สองตัวเลขนั้นหลุดกัน)
   */
  expired: number
}

/**
 * ค่าของพิลล์ช่องทางบนหัวคอลัมน์ซ้าย — ต้องเป็นชนิดเดียวกับที่ client ใช้ เพื่อให้ `tsc` บังคับ
 * ให้ทุกที่ที่เพิ่มค่าใหม่ (เช่นวันที่ LINE OA เข้ามา) ต้องแก้ครบทั้งสองฝั่ง
 */
export type CommentChannelFilter = 'ALL' | 'DEEP' | 'MESSENGER' | 'INSTAGRAM'

/**
 * แปลงพิลล์ช่องทาง → `ShopChannel.provider` ที่ใช้ query จริง
 *
 * 'ALL' → 'MESSENGER' เพราะโพสต์/คอมเมนต์ (`FacebookPost`) ผูกกับ ShopChannel ที่เป็น MESSENGER
 * เท่านั้นทั้งระบบ — วันนี้ "ทั้งหมด" กับ "Messenger" จึงเป็นชุดเดียวกันจริง ๆ ไม่ใช่การเดา
 * 'DEEP'/'INSTAGRAM' → คืนค่าตรงตัว ซึ่งจะไม่ match ShopChannel ที่มีโพสต์เลย = ได้ 0 ทั้งรายการ
 * และตัวนับ พร้อมกัน ซึ่งเป็นความจริงที่ถูกต้อง (ไม่ใช่การ hardcode ว่า "ช่องทางนี้ว่าง")
 */
function resolveCommentProvider(filter: CommentChannelFilter | undefined): string {
  return !filter || filter === 'ALL' ? 'MESSENGER' : filter
}

const EMPTY_COMMENT_POST_COUNTS: CommentPostCounts = {
  all: 0,
  unanswered: 0,
  botAnswered: 0,
  humanAnswered: 0,
  expired: 0,
}

/**
 * นับจำนวนโพสต์แยกตาม postStatus 3 กลุ่ม + ทั้งหมด แบบ **ทั้งร้าน** (ไม่ตัด take/skip) — ใช้นิยาม
 * เดียวกับ `deriveCommentState()`/`derivePostState()` เป๊ะ ไม่ใช่เกณฑ์ใหม่:
 *   - คอมเมนต์ลูกค้า "ยังไม่ตอบ" = ไม่มี PageComment ที่ parentExternalId ชี้กลับมาและ isFromPage=true
 *     เลย (เงื่อนไขเดียวกับที่ countUnansweredForShops ใช้แต่ไหนแต่ไรมา — ไม่แตะ)
 *   - "คนตอบแล้ว" = มีคำตอบที่ isAutoReply=false อย่างน้อย 1 อัน
 *   - ที่เหลือ (มีคำตอบแต่เป็นบอทล้วน) = "บอทตอบแล้ว"
 *   - โพสต์ = สถานะที่แย่ที่สุดในบรรดาคอมเมนต์ของมัน (BR-CR-S2); ไม่มีคอมเมนต์ลูกค้าเลย = "คนตอบแล้ว"
 *     (derivePostState([]) คืนค่านั้นเสมอ)
 *
 * 🛑 `countUnansweredForShops()` ด้านล่างเรียกฟังก์ชันนี้ตัวเดียวกัน (ไม่ได้เขียน SQL อีกชุดที่
 * "น่าจะตรงกัน") — badge บนแท็บ "ความคิดเห็น" (นับทั้งร้าน) กับ `counts.unanswered` ของหน้านี้จึง
 * ตรงกันเสมอโดยโครงสร้าง (จอนี้เคยโชว์ "ยังไม่ตอบ 7 กับ 8" มาแล้วเพราะคำนวณคนละที่ —
 * docs/conventions/sibling-surface-parity.md) ดูเทสพิสูจน์ที่ comment-post-counts.test.ts
 */
export async function countCommentPostStatesByShop(params: {
  shopIds: string[]
  /** กรองเฉพาะเพจเดียว (ตัวกรองเดียวกับ listCommentPosts) — ไม่ส่ง = ทุกเพจของร้าน */
  shopChannelId?: string
  /** ค้นหาเดียวกับ listCommentPosts — ต้อง trim แล้วก่อนส่งเข้ามา (caller รับผิดชอบ) */
  q?: string
  /** พิลล์ช่องทางเดียวกับ listCommentPosts — ต้องส่งค่าเดียวกันเสมอ ไม่งั้นตัวเลขกับรายการหลุดกัน */
  provider?: CommentChannelFilter
}): Promise<CommentPostCounts> {
  if (params.shopIds.length === 0) return EMPTY_COMMENT_POST_COUNTS

  const channelFilter = params.shopChannelId ? Prisma.sql`AND sc.id = ${params.shopChannelId}` : Prisma.empty
  const searchFilter = params.q
    ? Prisma.sql`AND (
        p.message ILIKE ${'%' + params.q + '%'}
        OR EXISTS (SELECT 1 FROM "PageComment" qc WHERE qc."postId" = p.id AND qc.message ILIKE ${'%' + params.q + '%'})
        OR EXISTS (SELECT 1 FROM "PageComment" qc WHERE qc."postId" = p.id AND qc."fromName" ILIKE ${'%' + params.q + '%'})
      )`
    : Prisma.empty

  const rows = await prisma.$queryRaw<
    Array<{ all: bigint; unanswered: bigint; botAnswered: bigint; humanAnswered: bigint }>
  >`
    WITH scoped_channels AS (
      SELECT sc.id FROM "ShopChannel" sc
      WHERE sc."shopId" IN (${Prisma.join(params.shopIds)})
        AND sc.provider = ${resolveCommentProvider(params.provider)}
        ${channelFilter}
    ),
    customer_comments AS (
      SELECT
        c."postId",
        -- WARNING: ลำดับ WHEN ต้องตรงกับ deriveCommentState() ใน TS บรรทัดต่อบรรทัด — สองอันนี้ตอบคำถาม
        -- เดียวกันคนละภาษา ถ้าเรียงต่างกันเมื่อไหร่ "ตัวเลขบนแท็บ" กับ "รายการใต้มัน" จะหลุดกันทันที
        -- โดยไม่มีอะไรฟ้อง (จอนี้เคยโชว์ "ยังไม่ตอบ 7 กับ 8" มาแล้ว)
        CASE
          -- 1) คำตอบสาธารณะชนะเสมอ และคำตอบของคนชนะคำตอบของบอท
          WHEN EXISTS (
            SELECT 1 FROM "PageComment" r
            WHERE r."parentExternalId" = c."externalCommentId" AND r."isFromPage" = true AND r."isAutoReply" = false
          ) THEN 'HUMAN_ANSWERED'
          WHEN EXISTS (
            SELECT 1 FROM "PageComment" r
            WHERE r."parentExternalId" = c."externalCommentId" AND r."isFromPage" = true
          ) THEN 'BOT_ANSWERED'
          -- 2) ไม่มีคำตอบสาธารณะ แต่ทักแชทส่วนตัวสำเร็จแล้ว → ไม่ใช่ "ยังไม่ตอบ" (user 2026-08-09)
          --    เกาะ trigger ว่าใครเป็นคนทัก และต้อง privateReplyStatus='SENT' เป๊ะ
          --    ('SKIPPED'/'FAILED' คือมีแถวแต่ไม่ได้ทัก ห้ามนับ)
          WHEN EXISTS (
            SELECT 1 FROM "CommentReplyLog" l
            WHERE l."commentId" = c."id" AND l."privateReplyStatus" = 'SENT' AND l."trigger" = 'MANUAL'
          ) THEN 'HUMAN_ANSWERED'
          WHEN EXISTS (
            SELECT 1 FROM "CommentReplyLog" l
            WHERE l."commentId" = c."id" AND l."privateReplyStatus" = 'SENT'
          ) THEN 'BOT_ANSWERED'
          ELSE 'UNANSWERED'
        END AS state
      FROM "PageComment" c
      WHERE c."shopChannelId" IN (SELECT id FROM scoped_channels)
        AND c."isFromPage" = false
        AND c."isDeleted" = false
    ),
    post_states AS (
      SELECT
        p.id AS "postId",
        COALESCE(
          (
            SELECT CASE
              WHEN bool_or(cs.state = 'UNANSWERED') THEN 'UNANSWERED'
              WHEN bool_or(cs.state = 'BOT_ANSWERED') THEN 'BOT_ANSWERED'
              ELSE 'HUMAN_ANSWERED'
            END
            FROM customer_comments cs WHERE cs."postId" = p."id"
          ),
          'HUMAN_ANSWERED'
        ) AS state
      FROM "FacebookPost" p
      WHERE p."shopChannelId" IN (SELECT id FROM scoped_channels)
        ${searchFilter}
    )
    SELECT
      count(*)::bigint AS "all",
      count(*) FILTER (WHERE state = 'UNANSWERED')::bigint AS "unanswered",
      count(*) FILTER (WHERE state = 'BOT_ANSWERED')::bigint AS "botAnswered",
      count(*) FILTER (WHERE state = 'HUMAN_ANSWERED')::bigint AS "humanAnswered"
    FROM post_states
  `
  const row = rows[0]
  return {
    all: Number(row?.all ?? 0),
    unanswered: Number(row?.unanswered ?? 0),
    botAnswered: Number(row?.botAnswered ?? 0),
    humanAnswered: Number(row?.humanAnswered ?? 0),
    // ตัวนับระดับ**โพสต์**ไม่มีแท็บไหนใช้แล้ว (คอลัมน์ซ้าย = 1 แถว/คอมเมนต์ ตั้งแต่ 2026-08-15)
    // ⇒ ไม่คำนวณ `expired` ที่นี่ให้เปลืองงานฐาน แต่ต้องมีคีย์ให้ครบชนิด. ถ้าวันหน้ามีจอไหนกลับมา
    // ใช้ตัวนับระดับโพสต์พร้อมแท็บ "หมดอายุ" ต้องคำนวณจริงตรงนี้ ห้ามปล่อย 0 ไว้เฉย ๆ
    expired: 0,
  }
}

/**
 * ตัวนับ **ระดับคอมเมนต์** ทั้งร้าน (feature 00029 ส่วนขยาย 2026-08-15)
 *
 * 🛑 ทำไมต้องมีตัวนี้ทั้งที่มี `countCommentPostStatesByShop` อยู่แล้ว
 * คอลัมน์ซ้ายเปลี่ยนจาก "1 แถว = 1 โพสต์" เป็น "1 แถว = 1 คอมเมนต์" (ผู้ใช้เคาะ 2026-08-15)
 * ⇒ หน่วยของแถวเปลี่ยน ตัวนับบนแท็บต้องเปลี่ยนตาม ไม่งั้นจะได้จอที่เขียนว่า "ยังไม่ตอบ 7"
 * นั่งอยู่เหนือรายการ 12 แถว ซึ่งไฟล์นี้ถือเป็นบาปมหันต์ของตัวเองมาตลอด
 * (`sibling-surface-parity.md` — จอนี้เคยโชว์ "ยังไม่ตอบ 7 กับ 8" พร้อมกันมาแล้ว)
 *
 * 🛑 CASE ข้างในต้องเรียง WHEN ตรงกับ `deriveCommentState()` บรรทัดต่อบรรทัด เหมือนที่
 * `countCommentPostStatesByShop` ทำ — คัดลอก CTE `customer_comments` มาทั้งก้อนโดยตั้งใจ
 * แล้วต่างกันแค่ชั้นสุดท้าย (อันนั้นยุบเป็นโพสต์ อันนี้นับคอมเมนต์ตรง ๆ)
 */
export async function countCommentStatesByShop(params: {
  shopIds: string[]
  shopChannelId?: string
  /** ต้อง trim แล้วก่อนส่งเข้ามา (caller รับผิดชอบ) — ต้องส่งค่าเดียวกับ `listComments` เสมอ */
  q?: string
  provider?: CommentChannelFilter
}): Promise<CommentPostCounts> {
  if (params.shopIds.length === 0) return EMPTY_COMMENT_POST_COUNTS

  const channelFilter = params.shopChannelId ? Prisma.sql`AND sc.id = ${params.shopChannelId}` : Prisma.empty
  /**
   * ค้นหา: ตรงกับตัวคอมเมนต์เอง (ข้อความ/ชื่อคนคอมเมนต์) หรือข้อความของโพสต์ที่มันอยู่ใต้
   *
   * ต่างจากตัวนับระดับโพสต์โดยตั้งใจ — ที่นั่นถามว่า "โพสต์นี้เข้าเกณฑ์ไหม" ที่นี่ถามว่า
   * "คอมเมนต์ใบนี้เข้าเกณฑ์ไหม" ⇒ ต้องเทียบกับ `listComments` ให้ตรง ไม่ใช่กับของเดิม
   */
  const searchFilter = params.q
    ? Prisma.sql`AND (
        c.message ILIKE ${'%' + params.q + '%'}
        OR c."fromName" ILIKE ${'%' + params.q + '%'}
        OR EXISTS (SELECT 1 FROM "FacebookPost" qp WHERE qp.id = c."postId" AND qp.message ILIKE ${'%' + params.q + '%'})
      )`
    : Prisma.empty

  const cutoff = privateReplyWindowCutoff()
  const rows = await prisma.$queryRaw<
    Array<{ all: bigint; unanswered: bigint; botAnswered: bigint; humanAnswered: bigint; expired: bigint }>
  >`
    WITH scoped_channels AS (
      SELECT sc.id FROM "ShopChannel" sc
      WHERE sc."shopId" IN (${Prisma.join(params.shopIds)})
        AND sc.provider = ${resolveCommentProvider(params.provider)}
        ${channelFilter}
    ),
    customer_comments AS (
      SELECT
        -- เส้นแบ่ง 7 วันมาเป็น "พารามิเตอร์" ไม่ใช่ literal ใน SQL — ค่าเดียวกับที่ TS ใช้ตัดสิน
        -- (privateReplyWindowCutoff) ไม่งั้นตัวเลขบนแท็บกับรายการใต้มันจะหลุดกันเงียบ ๆ
        c."createdTime" < ${cutoff} AS expired,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM "PageComment" r
            WHERE r."parentExternalId" = c."externalCommentId" AND r."isFromPage" = true AND r."isAutoReply" = false
          ) THEN 'HUMAN_ANSWERED'
          WHEN EXISTS (
            SELECT 1 FROM "PageComment" r
            WHERE r."parentExternalId" = c."externalCommentId" AND r."isFromPage" = true
          ) THEN 'BOT_ANSWERED'
          WHEN EXISTS (
            SELECT 1 FROM "CommentReplyLog" l
            WHERE l."commentId" = c."id" AND l."privateReplyStatus" = 'SENT' AND l."trigger" = 'MANUAL'
          ) THEN 'HUMAN_ANSWERED'
          WHEN EXISTS (
            SELECT 1 FROM "CommentReplyLog" l
            WHERE l."commentId" = c."id" AND l."privateReplyStatus" = 'SENT'
          ) THEN 'BOT_ANSWERED'
          ELSE 'UNANSWERED'
        END AS state
      FROM "PageComment" c
      WHERE c."shopChannelId" IN (SELECT id FROM scoped_channels)
        AND c."isFromPage" = false
        AND c."isDeleted" = false
        ${searchFilter}
    )
    SELECT
      count(*)::bigint AS "all",
      count(*) FILTER (WHERE state = 'UNANSWERED')::bigint AS "unanswered",
      count(*) FILTER (WHERE state = 'BOT_ANSWERED')::bigint AS "botAnswered",
      count(*) FILTER (WHERE state = 'HUMAN_ANSWERED')::bigint AS "humanAnswered",
      -- สับเซตของ unanswered (ไม่ใช่กลุ่มที่ห้า) — ดูเหตุผลที่ field expired ของ CommentPostCounts
      count(*) FILTER (WHERE state = 'UNANSWERED' AND expired)::bigint AS "expired"
    FROM customer_comments
  `
  const row = rows[0]
  return {
    all: Number(row?.all ?? 0),
    unanswered: Number(row?.unanswered ?? 0),
    botAnswered: Number(row?.botAnswered ?? 0),
    humanAnswered: Number(row?.humanAnswered ?? 0),
    expired: Number(row?.expired ?? 0),
  }
}

/**
 * 1 แถว = 1 คอมเมนต์ของลูกค้า (feature 00029 ส่วนขยาย 2026-08-15)
 *
 * แทนที่ `listCommentPosts` ในการป้อนคอลัมน์ซ้าย — คอลัมน์กลาง/ขวายังทำงานเป็น "ระดับโพสต์"
 * เหมือนเดิม (ผู้ใช้เคาะให้คง 3 คอลัมน์) แถวจึงพกบริบทของโพสต์ติดมาด้วยเพื่อให้ client
 * resolve ได้ว่ากดแล้วต้องโหลดเธรดของโพสต์ไหน และไฮไลต์คอมเมนต์ใบไหน
 *
 * 🛑 คำตอบใต้คอมเมนต์อื่น (reply ของลูกค้า) **มีแถวของตัวเอง** (ผู้ใช้เคาะ) — ลูกค้าที่ตอบกลับ
 * มาใต้คอมเมนต์ตัวเองก็คืองานที่ต้องตอบ ไม่ควรหายจากคิว. คอมเมนต์ของ **เพจเอง** ไม่มีแถว
 * (`isFromPage = false`) ด้วยเหตุผลเดิม: เพจไม่ต้องตอบตัวเอง
 */
export interface CommentListRow {
  /** `PageComment.id` — คีย์ที่ `CommentReplyLog.commentId` อ้าง ใช้เป็น id ของแถว */
  id: string
  externalCommentId: string
  /** true = เป็นคำตอบใต้คอมเมนต์อื่น — ใช้เยื้องแถวให้เห็นลำดับชั้น */
  isReply: boolean
  fromName: string | null
  message: string | null
  attachmentUrl: string | null
  createdTime: Date
  state: CommentAnswerState
  privateReplySentAt: Date | null
  privateReplyConversationId: string | null
  /** โพสต์ที่คอมเมนต์นี้อยู่ใต้ — คอลัมน์กลางยังแสดงเป็นระดับโพสต์ */
  post: {
    id: string
    externalPostId: string
    message: string | null
    thumbnailUrl: string | null
    permalink: string | null
    mediaType: string | null
    /** ยอด engagement ของโพสต์ — คอลัมน์กลางยังแสดงหัวโพสต์แบบเดิม (layout ไม่เปลี่ยน) */
    reactionCount: number | null
    fbCommentCount: number | null
    shareCount: number | null
  }
  channel: { id: string; name: string; provider: string; avatarUrl: string | null }
  shop: { id: string; name: string }
}

/**
 * ค่าที่แท็บสถานะบนคอลัมน์ซ้ายส่งมา — `tsc` บังคับให้ทุกที่ที่เพิ่มค่าใหม่ต้องแก้ครบทั้งสองฝั่ง
 * (route allow-list · matcher ข้างล่าง · แท็บใน CommentsClient · ตัวเลือกใน CommentsFilterPanel)
 */
export type CommentListStateFilter = 'ALL' | 'UNANSWERED' | 'BOT' | 'HUMAN' | 'EXPIRED'

/**
 * แถวนี้เข้าเกณฑ์ของแท็บที่เลือกอยู่ไหม — ฟังก์ชันบริสุทธิ์ เพื่อให้เทสจับได้ตรง ๆ
 *
 * 🛑 ต้องให้คำตอบเดียวกับ `count(*) FILTER (...)` ใน `countCommentStatesByShop()` ทุกกิ่ง —
 * สองอันนี้ตอบคำถามเดียวกันคนละภาษา หลุดกันเมื่อไหร่จะได้จอที่เขียนว่า "หมดอายุ 7" นั่งอยู่เหนือ
 * รายการ 12 แถว ซึ่งไฟล์นี้ถือเป็นบาปมหันต์ของตัวเองมาตลอด (เคยโชว์ "ยังไม่ตอบ 7 กับ 8" มาแล้ว)
 *
 * 🛑 'EXPIRED' ตรวจ **สองอย่างพร้อมกัน** (ยังไม่ตอบ ∧ พ้น 7 วัน) — เช็คแค่เวลาอย่างเดียวจะลาก
 * คอมเมนต์เก่าที่ตอบไปแล้วทั้งกองเข้ามาด้วย ซึ่งไม่ใช่งานค้างของใครเลย
 */
export function matchesCommentStateFilter(
  comment: { state: CommentAnswerState; createdTime: Date },
  filter: CommentListStateFilter,
  now: Date = new Date(),
): boolean {
  if (filter === 'ALL') return true
  if (filter === 'UNANSWERED') return comment.state === 'UNANSWERED'
  if (filter === 'BOT') return comment.state === 'BOT_ANSWERED'
  if (filter === 'HUMAN') return comment.state === 'HUMAN_ANSWERED'
  return comment.state === 'UNANSWERED' && !isWithinPrivateReplyWindow(comment.createdTime, now)
}

export async function listComments(params: {
  shopIds: string[]
  actorUserId: string
  q?: string
  take?: number
  skip?: number
  shopChannelId?: string
  state?: CommentListStateFilter
  provider?: CommentChannelFilter
}): Promise<{
  comments: CommentListRow[]
  /** ทั้งร้าน — มาจาก `countCommentStatesByShop()` ไม่ใช่ batch นี้ (เหตุผลเดียวกับของเดิม) */
  counts: CommentPostCounts
  /** จำนวนแถวดิบที่ query ได้ (ก่อนกรองด้วย `state`) — ใช้คำนวณ skip/hasMore เท่านั้น ห้ามแสดง */
  rawCount: number
}> {
  if (params.shopIds.length === 0) return { comments: [], counts: EMPTY_COMMENT_POST_COUNTS, rawCount: 0 }
  await assertShopsAccessible(params.shopIds, params.actorUserId)

  const channels = await prisma.shopChannel.findMany({
    where: {
      shopId: { in: params.shopIds },
      provider: resolveCommentProvider(params.provider),
      ...(params.shopChannelId ? { id: params.shopChannelId } : {}),
    },
    select: { id: true },
  })
  const channelIds = channels.map((c) => c.id)
  if (channelIds.length === 0) return { comments: [], counts: EMPTY_COMMENT_POST_COUNTS, rawCount: 0 }

  const q = params.q?.trim()
  const rows = await prisma.pageComment.findMany({
    where: {
      shopChannelId: { in: channelIds },
      isFromPage: false,
      isDeleted: false,
      ...(q
        ? {
            OR: [
              { message: { contains: q, mode: 'insensitive' as const } },
              { fromName: { contains: q, mode: 'insensitive' as const } },
              { post: { message: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    },
    orderBy: { createdTime: 'desc' },
    take: params.take ?? COMMENT_LIST_PAGE_SIZE,
    skip: params.skip ?? 0,
    include: {
      // ช่องทางมาทาง post.channel — `PageComment` มีแต่ `shopChannelId` เป็นคอลัมน์ ไม่มี relation ตรง
      post: {
        select: {
          id: true,
          externalPostId: true,
          message: true,
          mirroredFileId: true,
          thumbnailUrl: true,
          permalink: true,
          mediaType: true,
          reactionCount: true,
          fbCommentCount: true,
          shareCount: true,
          channel: {
            select: {
              id: true,
              name: true,
              provider: true,
              avatarUrl: true,
              shop: { select: { id: true, shopName: true } },
            },
          },
        },
      },
    },
  })

  /**
   * สถานะรายคอมเมนต์ — batch 2 query ครอบทั้งหน้า กัน N+1
   * ต้องผ่าน `deriveCommentState()` ตัวเดียวกับที่เธรดและตัวนับใช้ (BR-CR-S4)
   */
  const externalIds = rows.map((c) => c.externalCommentId)
  const commentIds = rows.map((c) => c.id)
  const [replies, sentPrivateReplies] = await Promise.all([
    externalIds.length > 0
      ? prisma.pageComment.findMany({
          where: { parentExternalId: { in: externalIds } },
          select: { parentExternalId: true, isFromPage: true, isAutoReply: true },
        })
      : Promise.resolve([]),
    commentIds.length > 0
      ? prisma.commentReplyLog.findMany({
          where: { commentId: { in: commentIds }, privateReplyStatus: 'SENT' },
          select: { commentId: true, trigger: true, createdAt: true, conversationId: true },
        })
      : Promise.resolve([]),
  ])

  const repliesByParent = new Map<string, Array<{ isFromPage: boolean; isAutoReply: boolean }>>()
  for (const r of replies) {
    if (!r.parentExternalId) continue
    const list = repliesByParent.get(r.parentExternalId) ?? []
    list.push({ isFromPage: r.isFromPage, isAutoReply: r.isAutoReply })
    repliesByParent.set(r.parentExternalId, list)
  }
  const logByCommentId = new Map(sentPrivateReplies.map((l) => [l.commentId, l]))

  const mapped: CommentListRow[] = rows.map((c) => {
    const log = logByCommentId.get(c.id) ?? null
    return {
      id: c.id,
      externalCommentId: c.externalCommentId,
      isReply: c.parentExternalId !== null,
      fromName: c.fromName,
      message: c.message,
      attachmentUrl: c.attachmentUrl,
      createdTime: c.createdTime,
      state: deriveCommentState(
        repliesByParent.get(c.externalCommentId) ?? [],
        log ? (log.trigger === 'MANUAL' ? 'MANUAL' : 'AUTO') : null,
      ),
      privateReplySentAt: log?.createdAt ?? null,
      privateReplyConversationId: log?.conversationId ?? null,
      post: {
        id: c.post.id,
        externalPostId: c.post.externalPostId,
        message: c.post.message,
        // สำเนาที่เราเก็บเองชนะ URL ของ Meta เสมอ (fbcdn หมดอายุ ~4 วัน) — เหตุผลเดียวกับ listCommentPosts
        thumbnailUrl: resolvePostThumbnail(c.post),
        permalink: c.post.permalink,
        mediaType: c.post.mediaType,
        reactionCount: c.post.reactionCount,
        fbCommentCount: c.post.fbCommentCount,
        shareCount: c.post.shareCount,
      },
      channel: {
        id: c.post.channel.id,
        name: c.post.channel.name,
        provider: c.post.channel.provider,
        avatarUrl: c.post.channel.avatarUrl,
      },
      shop: { id: c.post.channel.shop.id, name: c.post.channel.shop.shopName },
    }
  })

  const counts = await countCommentStatesByShop({
    shopIds: params.shopIds,
    shopChannelId: params.shopChannelId,
    q,
    provider: params.provider,
  })

  /**
   * กรองด้วย `state` **หลัง** คำนวณ เหมือน `listCommentPosts` — สถานะเป็นค่า derived ไม่ใช่คอลัมน์
   * `rawCount` คือจำนวนก่อนกรอง ใช้เป็น skip ของหน้าถัดไปเท่านั้น
   */
  const filtered =
    !params.state || params.state === 'ALL' ? mapped : mapped.filter((c) => matchesCommentStateFilter(c, params.state!))

  return { comments: filtered, counts, rawCount: rows.length }
}

/** จำนวนโพสต์ต่อรอบที่ยอมให้ไล่ mirror รูปย้อนหลัง — ดูเหตุผลที่ `backfillMissingPostThumbnails` */
const THUMBNAIL_BACKFILL_PER_RUN = 5

/**
 * ไล่เก็บรูปปกของโพสต์เก่าที่ยังไม่มีสำเนาในสตอเรจ — ทีละไม่กี่ใบต่อการเปิดหน้า
 *
 * ทำไมต้องมี: โค้ดที่ mirror ตอน ingest (2026-08-09) แก้ให้เฉพาะโพสต์ที่เข้ามา **หลังจากนั้น**
 * ส่วนโพสต์เก่าที่ URL ของ fbcdn หมดอายุไปแล้ว จะได้สำเนาก็ต่อเมื่อมีคนกดเปิดโพสต์นั้น
 * (`getPostThread` → `refreshPostStats`) โพสต์ที่ไม่มีใครกดเปิดจึงค้างเป็นกล่องเทาตลอดไป
 *
 * ทำไมทำที่นี่แทนสคริปต์: `scripts/backfill-post-thumbnails.ts` ต้องรันโดยชี้ฐาน prod จากเครื่อง
 * dev ซึ่งเครื่อง dev **ไม่มี prod DATABASE_URL อยู่แล้วโดยตั้งใจ** (แยก dev/prod หลังเหตุการณ์
 * ฐานถูกล้าง 2026-07-31) และ Hard Rule 15 ระบุว่าคำสั่งที่ชี้ prod จากเครื่อง dev คือความเสี่ยง
 * ล้วน ๆ ที่ไม่ได้แลกอะไรกลับมา — ให้แอปที่รันบน prod เป็นคนทำเองจึงถูกกว่าทุกทาง
 *
 * 🛑 ไม่เขียน logic mirror ใหม่ — เรียก `refreshPostStats()` ตัวเดิม เพราะมันทำครบอยู่แล้วทั้ง
 * ขอ URL สดจาก Graph, mirror, เช็ค `mirroredFileId` ก่อนกัน mirror ซ้ำ และมี throttle
 * `STATS_TTL_MS` ในตัว (โพสต์ที่ mirror ไม่สำเร็จจึงไม่ถูกยิงซ้ำรัว ๆ ทุกครั้งที่เปิดหน้า)
 *
 * best-effort ทั้งหมด: เรียกจาก `after()` และกลืน error เสมอ — งานนี้ห้ามมีสิทธิ์ทำให้หน้าพัง
 */
export async function backfillMissingPostThumbnails(params: {
  shopIds: string[]
  take?: number
}): Promise<void> {
  try {
    if (params.shopIds.length === 0) return
    const posts = await prisma.facebookPost.findMany({
      where: {
        mirroredFileId: null,
        channel: { shopId: { in: params.shopIds } },
      },
      // ใหม่สุดก่อน — โพสต์ที่มีคอมเมนต์ล่าสุดคือโพสต์ที่ผู้ขายกำลังมองอยู่จริง
      orderBy: { lastCommentAt: 'desc' },
      take: params.take ?? THUMBNAIL_BACKFILL_PER_RUN,
      select: { id: true },
    })
    for (const p of posts) await refreshPostStats(p.id)
  } catch {
    // เงียบโดยตั้งใจ — เป็นงานเก็บตกเบื้องหลัง ไม่ใช่ส่วนหนึ่งของการเปิดหน้า
  }
}

export async function listCommentPosts(params: {
  /** ร้านที่รายการครอบคลุม (feature 00037) — ความยาว 1 = โหมดเดิม; มาจาก resolveChatScope เท่านั้น */
  shopIds: string[]
  actorUserId: string
  q?: string
  take?: number
  /** ข้ามกี่โพสต์ (โหลดเพิ่ม) — offset พอสำหรับสเกลนี้ ไม่ต้อง keyset เหมือนรายการแชท */
  skip?: number
  /** กรองเฉพาะเพจเดียว (ตัวกรองเหมือนแท็บข้อความ) — ไม่ส่ง = ทุกเพจของร้าน */
  shopChannelId?: string
  /**
   * แท็บสถานะ (feature 00038 UX-Design-Spec §3.2) — 'ALL' = ไม่กรอง (ค่าตั้งต้น)
   * กรอง**หลัง**คำนวณ postStatus ของทุกโพสต์ในชุดที่ query มาแล้ว ไม่ใช่กรองที่ SQL WHERE
   * เพราะ postStatus เป็นค่า derived ไม่ใช่คอลัมน์ในฐาน (ตัดสินจาก derivePostState เท่านั้น)
   */
  state?: 'ALL' | 'UNANSWERED' | 'BOT' | 'HUMAN'
  /**
   * แท็บช่องทาง (พิลล์ ทั้งหมด/Deep/Messenger/Instagram) — 🛑 ต้องกรองที่ **server** เท่านั้น
   *
   * เดิมกรองฝั่ง client ด้วย `posts.filter(p => p.channel.provider === channelTab)` ขณะที่
   * `counts` มาจาก server ซึ่งนับ MESSENGER เสมอ → กดพิลล์ Instagram แล้วได้ "ยังไม่ตอบ 12"
   * นั่งอยู่เหนือ "ไม่พบความคิดเห็นตามตัวกรอง" (impeccable critique 2026-08-09 P1)
   *
   * นี่คือคลาสเดียวกับ "ซ้ายบอก 8 แต่ panel บอก 7" ที่ไฟล์นี้ถือเป็นบาปมหันต์ — และเป็นเหตุผล
   * เดียวกับที่ `state` ถูกย้ายมา server แล้วก่อนหน้านี้: ตัวเลขกับรายการต้องมาจาก scope เดียวกัน
   * **โดยโครงสร้าง** ไม่ใช่โดยความตั้งใจให้ตรง
   */
  provider?: CommentChannelFilter
}): Promise<{
  posts: CommentPostRow[]
  /** ทั้งร้าน (feature 00038 หนี้ #1) — มาจาก countCommentPostStatesByShop() ไม่ใช่ batch นี้ */
  counts: CommentPostCounts
  /**
   * จำนวนโพสต์ดิบที่ query ชุดนี้ดึงมาได้ (ก่อนกรองด้วย `state`) — ใช้คำนวณ `skip` ของหน้าถัดไป/
   * `hasMore` ที่ client เท่านั้น **ห้ามเอาไปแสดงเป็นตัวเลข** (นั่นคือหน้าที่ของ `counts.all` ซึ่งเป็น
   * global แล้ว) เดิมสองความหมายนี้ถูกยำรวมกันเป็น `counts.all` ตัวเดียว ทำให้แยกไม่ออกว่าใช้ทำอะไร
   */
  rawCount: number
}> {
  if (params.shopIds.length === 0) return { posts: [], counts: EMPTY_COMMENT_POST_COUNTS, rawCount: 0 }
  await assertShopsAccessible(params.shopIds, params.actorUserId)

  const channels = await prisma.shopChannel.findMany({
    where: {
      shopId: { in: params.shopIds },
      provider: resolveCommentProvider(params.provider),
      ...(params.shopChannelId ? { id: params.shopChannelId } : {}),
    },
    select: { id: true },
  })
  if (channels.length === 0) return { posts: [], counts: EMPTY_COMMENT_POST_COUNTS, rawCount: 0 }
  const channelIds = channels.map((c) => c.id)

  const q = params.q?.trim()
  const posts = await prisma.facebookPost.findMany({
    where: {
      shopChannelId: { in: channelIds },
      ...(q
        ? {
            // ค้นหา (BRD Q-3): ข้อความคอมเมนต์ / ชื่อผู้คอมเมนต์ / ข้อความโพสต์
            OR: [
              { message: { contains: q, mode: 'insensitive' } },
              { comments: { some: { message: { contains: q, mode: 'insensitive' } } } },
              { comments: { some: { fromName: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    },
    orderBy: { lastCommentAt: 'desc' },
    take: params.take ?? 25,
    skip: params.skip ?? 0,
    include: {
      // shop มาด้วยเสมอ (feature 00037) — badge ร้านบนการ์ดโพสต์ในโหมดรวม; โหมดร้านเดียว
      // ไม่ได้ใช้ค่านี้ แต่การ join เพิ่ม 1 ตารางที่ take 25 แถวไม่ใช่ต้นทุนที่ต้องไปทำ 2 ทาง
      channel: {
        select: {
          id: true,
          name: true,
          provider: true,
          avatarUrl: true,
          shop: { select: { id: true, shopName: true } },
        },
      },
      comments: {
        select: {
          // ต้องมี id เพราะ `CommentReplyLog.commentId` อ้าง `PageComment.id` ไม่ใช่ externalCommentId
          // (ใช้จับคู่ "คอมเมนต์ใบนี้ทักแชทไปแล้วหรือยัง" ด้านล่าง)
          id: true,
          externalCommentId: true,
          parentExternalId: true,
          isFromPage: true,
          isDeleted: true,
          fromName: true,
          message: true,
          attachmentUrl: true,
          createdTime: true,
          // feature 00038 — ต้องมีเพื่อแยก BOT_ANSWERED ออกจาก HUMAN_ANSWERED ใน deriveCommentState
          isAutoReply: true,
        },
      },
    },
  })

  // ขอบเขตหน้าต่างทักแชทส่วนตัวของ Meta = 7 วัน — คอมเมนต์ที่เก่ากว่านี้ทักไม่ได้อีกแล้ว
  // คิดครั้งเดียวนอกลูป (ทุกแถวใช้เส้นเดียวกัน) — ค่าคงที่มาจาก SSOT ตัวเดียวที่ UI ใช้ด้วย
  const dmWindowStart = privateReplyWindowCutoff().getTime()

  /**
   * "คอมเมนต์ใบไหนทักแชทสำเร็จแล้ว และใครเป็นคนทัก" — batch เดียวครอบทุกโพสต์ในหน้านี้ กัน N+1
   *
   * ต้องมีเพราะ `deriveCommentState()` ใช้ค่านี้ตัดสินว่ายังนับเป็น "ยังไม่ตอบ" อยู่ไหม
   * (user report 2026-08-09: คอมเมนต์ที่ถูกดึงเข้าห้องแชทแล้วยังค้างในคิว)
   * เงื่อนไข `privateReplyStatus='SENT'` ต้องเป๊ะ — มีแถวใน log ไม่ได้แปลว่าทักสำเร็จ
   */
  const commentIds = posts.flatMap((p) => p.comments.map((c) => c.id))
  const sentPrivateReplies =
    commentIds.length > 0
      ? await prisma.commentReplyLog.findMany({
          where: { commentId: { in: commentIds }, privateReplyStatus: 'SENT' },
          select: { commentId: true, trigger: true },
        })
      : []
  const privateReplyTriggerByCommentId = new Map(
    sentPrivateReplies.map((l) => [l.commentId, l.trigger === 'MANUAL' ? ('MANUAL' as const) : ('AUTO' as const)]),
  )

  const mapped: CommentPostRow[] = posts.map((p) => {
    const customerComments = p.comments.filter((c) => !c.isFromPage && !c.isDeleted)
    // สถานะต่อคอมเมนต์ — ตัดสินจาก deriveCommentState() ตัวเดียวกับที่เธรด/ตัวนับอื่นใช้ (BR-CR-S4)
    // ไม่ใช่เซตที่คำนวณเองแยกทาง (ของเดิมนับ "มี isFromPage reply ใด ๆ" = answered ซึ่งปน
    // คำตอบของบอทเข้ากับคำตอบของคนไว้ด้วยกัน — นี่คือบั๊กที่ทำให้ "ยังไม่ตอบ" หายไปเมื่อเปิดบอท)
    const commentStates = customerComments.map((c) =>
      deriveCommentState(
        p.comments
          .filter((r) => r.parentExternalId === c.externalCommentId)
          .map((r) => ({ isFromPage: r.isFromPage, isAutoReply: r.isAutoReply })),
        privateReplyTriggerByCommentId.get(c.id) ?? null,
      ),
    )
    const unanswered = customerComments.filter((_, i) => commentStates[i] === 'UNANSWERED')
    const last = [...p.comments]
      .filter((c) => !c.isFromPage)
      .sort((a, b) => b.createdTime.getTime() - a.createdTime.getTime())[0]
    return {
      id: p.id,
      externalPostId: p.externalPostId,
      channel: {
        id: p.channel.id,
        name: p.channel.name,
        provider: p.channel.provider,
        avatarUrl: p.channel.avatarUrl,
      },
      shop: { id: p.channel.shop.id, name: p.channel.shop.shopName },
      message: p.message,
      // สำเนาที่เราเก็บเองชนะ URL ของ Meta เสมอ — ห้ามส่ง p.thumbnailUrl ดิบออกไป (fbcdn หมดอายุ ~4 วัน)
      thumbnailUrl: resolvePostThumbnail(p),
      permalink: p.permalink,
      lastCommentAt: p.lastCommentAt,
      // นับเฉพาะคอมเมนต์ "ที่ลูกค้าเขียน" ไม่รวมคำตอบของเพจเอง (user สั่ง 2026-08-04: "เวลามันนับ
      // ความคิดเห็น มันนับใน posts นั้น ๆ ทั้งหมด ซึ่งต่างจาก business suite ... คอมเม้นที่เข้ามา
      // ต้องนับเฉพาะที่มาจาก user ด้วย") — ตัวเลขนี้คือ "มีคนถามเข้ามากี่อัน" ไม่ใช่ "มีข้อความ
      // ในโพสต์กี่อัน" ร้านที่ตอบทุกคอมเมนต์จะได้เลขเบิ้ลเป็น 2 เท่าถ้านับของตัวเองด้วย
      // (ยอดของ Facebook เองยังโชว์แยกที่หัวโพสต์ผ่าน fbCommentCount ไม่ได้หายไป)
      commentCount: p.comments.filter((c) => !c.isDeleted && !c.isFromPage).length,
      mediaType: p.mediaType,
      reactionCount: p.reactionCount,
      fbCommentCount: p.fbCommentCount,
      shareCount: p.shareCount,
      unansweredCount: unanswered.length,
      // เก่าสุด "ในกลุ่มที่ยังทักแชทได้" = เส้นตายที่ใกล้ที่สุดที่ยังทำอะไรได้ (ดู comment ที่ CommentPostRow)
      oldestUnansweredAt: unanswered
        .filter((c) => c.createdTime.getTime() > dmWindowStart)
        .reduce<Date | null>((oldest, c) => (oldest === null || c.createdTime < oldest ? c.createdTime : oldest), null),
      lastCommenterName: last?.fromName ?? null,
      lastCommentText: last ? (last.message ?? (last.attachmentUrl ? '[รูปภาพ]' : null)) : null,
      // feature 00038 BR-CR-S2 — ตัวที่แย่ที่สุดในบรรดาคอมเมนต์ของโพสต์ชนะ; ไม่มีคอมเมนต์ลูกค้าเลย
      // = HUMAN_ANSWERED (ไม่มีอะไรค้าง) เพราะ derivePostState([]) คืนค่านั้นเสมอ
      postStatus: derivePostState(commentStates),
    }
  })

  // ตัวนับ 4 กลุ่ม (feature 00038 หนี้ #1) — ทั้งร้าน ไม่ใช่แค่ batch นี้ (`mapped` คือแค่ 25 แถวที่
  // query รอบนี้ดึงมา) เรียกฟังก์ชันเดียวกับที่ countUnansweredForShops() ใช้ เพื่อให้ badge บนแท็บ
  // "ความคิดเห็น" กับตัวเลขบนแท็บในหน้านี้ตรงกันโดยโครงสร้าง (BR-CR-S4)
  const counts = await countCommentPostStatesByShop({
    shopIds: params.shopIds,
    shopChannelId: params.shopChannelId,
    q,
    // ต้องส่ง provider ตัวเดียวกับที่คัด `channels` ข้างบน — ถ้าลืม ตัวเลขจะกลับไปพูดคนละเรื่อง
    // กับรายการที่อยู่ใต้มันอีกครั้ง
    provider: params.provider,
  })

  const wantedState: CommentAnswerState | null =
    params.state === 'UNANSWERED'
      ? 'UNANSWERED'
      : params.state === 'BOT'
        ? 'BOT_ANSWERED'
        : params.state === 'HUMAN'
          ? 'HUMAN_ANSWERED'
          : null
  const filtered = wantedState ? mapped.filter((p) => p.postStatus === wantedState) : mapped

  return { posts: filtered, counts, rawCount: mapped.length }
}

/** ยอด engagement เก่าได้ — รีเฟรชตอนเปิดโพสต์ ไม่เกินทุก 5 นาทีต่อโพสต์ (เหมือน backfill) */
const STATS_TTL_MS = 5 * 60 * 1000

/** ดึงยอด like/comment/share + ชนิดสื่อใหม่จาก Graph — เงียบเสมอ ล้มเหลวก็ใช้ค่าเดิม */
export async function refreshPostStats(postId: string): Promise<void> {
  try {
    const post = await prisma.facebookPost.findUnique({ where: { id: postId } })
    if (!post) return
    if (post.statsSyncedAt && Date.now() - post.statsSyncedAt.getTime() < STATS_TTL_MS) return
    const auth = await resolveChannelToken(post.shopChannelId)
    if (!auth) return
    const meta = await fetchPostMeta(post.externalPostId, auth.token)
    if (!meta) return
    // เก็บตกโพสต์ที่ยังไม่มีสำเนา — `meta.picture` ที่เพิ่งได้มาคือ URL สดเสมอ แม้ค่าที่เก็บไว้ใน
    // แถวจะหมดอายุไปแล้วก็ตาม จึงเป็นจังหวะเดียวที่ mirror ย้อนหลังได้โดยไม่ต้องยิง Graph เพิ่ม
    // เช็ค `mirroredFileId` ก่อนเสมอ (idempotent — เปิดโพสต์เดิมซ้ำต้องไม่ mirror ซ้ำ)
    const mirroredFileId = post.mirroredFileId ?? (await mirrorPostThumbnail(meta.picture))
    await prisma.facebookPost.update({
      where: { id: postId },
      data: {
        message: meta.message ?? post.message,
        permalink: meta.permalink ?? post.permalink,
        thumbnailUrl: meta.picture ?? post.thumbnailUrl,
        mirroredFileId,
        mirroredAt: post.mirroredFileId ? post.mirroredAt : mirroredFileId ? new Date() : null,
        mediaType: meta.mediaType,
        reactionCount: meta.reactionCount,
        fbCommentCount: meta.commentCount,
        shareCount: meta.shareCount,
        statsSyncedAt: new Date(),
      },
    })
  } catch {
    // ยอด engagement เป็นข้อมูลประกอบ — ล้มเหลวต้องไม่ทำให้เปิดโพสต์ไม่ได้
  }
}

export interface CommentRow {
  id: string
  externalCommentId: string
  parentExternalId: string | null
  fromName: string | null
  isFromPage: boolean
  message: string | null
  attachmentUrl: string | null
  createdTime: Date
  editedAt: Date | null
  isDeleted: boolean
  repliedByUserId: string | null
  /**
   * feature 00038 Task 8 — ปุ่ม "ทักแชท" กดได้จริง: สถานะ "ทักแล้ว" ต้องมาจากแถว log ของ
   * commentId นี้เอง (ไม่ใช่คีย์คน+โพสต์ — คนละกฎกับ AUTO ดู CommentReplyLog_manual_once_per_comment)
   * null = ยังไม่เคยทักสำเร็จ ไม่ว่าจาก trigger AUTO หรือ MANUAL
   */
  privateReplySentAt: Date | null
  privateReplyConversationId: string | null
  /** feature 00038 Task 9 — ป้าย "ตอบอัตโนมัติ" บนบับเบิลของบอท (ตัดสินสถานะผ่าน deriveCommentState) */
  isAutoReply: boolean
}

/** คอมเมนต์ทั้งหมดของโพสต์ (เก่า→ใหม่) + เติมของเก่าจาก Graph ถ้ายังไม่เคยดึง */
export async function getPostComments(params: {
  postId: string
  actorUserId: string
  skipBackfill?: boolean
}): Promise<{
  post: {
    id: string
    message: string | null
    permalink: string | null
    thumbnailUrl: string | null
    mediaType: string | null
    reactionCount: number | null
    fbCommentCount: number | null
    shareCount: number | null
    createdTime: Date | null
  }
  /** เพจเจ้าของโพสต์ — UI ใช้แสดงชื่อ/รูปจริงแทนคำว่า "เพจ" ลอย ๆ (user report 2026-08-03) */
  channel: { name: string; avatarUrl: string | null; provider: string }
  comments: CommentRow[]
}> {
  const post = await prisma.facebookPost.findUnique({
    where: { id: params.postId },
    include: { channel: { select: { id: true, shopId: true, name: true, avatarUrl: true, provider: true } } },
  })
  if (!post) throw new Error('POST_NOT_FOUND')
  if (!(await canAccessShop(post.channel.shopId, params.actorUserId))) throw new Error('FORBIDDEN')

  if (!params.skipBackfill) {
    await backfillPostComments(post.id)
    await refreshPostStats(post.id)
  }

  const comments = await prisma.pageComment.findMany({
    where: { postId: post.id },
    orderBy: { createdTime: 'asc' },
  })

  /**
   * เติมชื่อคนคอมเมนต์ที่หายไป จากคอมเมนต์อื่นของ "คนเดียวกัน" ที่เรารู้ชื่อแล้ว
   *
   * ทำไมมีคอมเมนต์ที่ไม่มีชื่อ (user ถาม 2026-08-03 "ทำไมมันใช้คำว่า ผู้ใช้ Facebook"):
   * Meta ให้ตัวตนผู้คอมเมนต์มาทาง **webhook** เท่านั้น — คอมเมนต์เก่าที่เราไปดึงย้อนหลังผ่าน
   * Graph ไม่มี field `from` ติดมาเลย (ทดสอบยิงถามทีละคอมเมนต์ตรง ๆ แล้วก็ไม่มี)
   * แต่ถ้าคนคนนั้นเคยคอมเมนต์อีกครั้งหลังจากเราเชื่อมระบบ (มาทาง webhook) เราจะมีชื่อเขาแล้ว
   * → จับคู่ด้วย fromExternalId แล้วเติมให้แถวเก่า ดีกว่าปล่อยเป็น "ผู้ใช้ Facebook" ทั้งที่รู้ชื่อ
   */
  const nameByExternalId = new Map<string, string>()
  for (const c of comments) {
    if (c.fromExternalId && c.fromName) nameByExternalId.set(c.fromExternalId, c.fromName)
  }
  if (comments.some((c) => !c.fromName && c.fromExternalId)) {
    const missingIds = [...new Set(comments.filter((c) => !c.fromName && c.fromExternalId).map((c) => c.fromExternalId!))]
    const known = await prisma.pageComment.findMany({
      where: { fromExternalId: { in: missingIds }, fromName: { not: null } },
      select: { fromExternalId: true, fromName: true },
      distinct: ['fromExternalId'],
    })
    for (const k of known) {
      if (k.fromExternalId && k.fromName) nameByExternalId.set(k.fromExternalId, k.fromName)
    }
  }

  /**
   * feature 00038 Task 8 — join CommentReplyLog เพื่อรู้ว่าคอมเมนต์ไหน "ทักแชทสำเร็จแล้ว" โดยไม่ให้
   * client ยิง API เพิ่มต่อแถว (UX spec §2.2) partial unique index กันไว้แล้วว่า trigger='MANUAL'
   * ได้แค่ 1 แถวต่อ commentId และ service ชั้น sendPrivateReplyToComment เช็คว่ามี log สำเร็จของ
   * commentId นี้จาก trigger ใดก็ได้ก่อนเสมอ (API.md §4.4) — ต่อ commentId จึงมีได้อย่างมาก 1 แถวที่
   * privateReplyStatus='SENT' ไม่ต้องกังวลเรื่องเลือกแถวไหนตอนชนกัน
   */
  const privateReplyLogs = await prisma.commentReplyLog.findMany({
    where: { commentId: { in: comments.map((c) => c.id) }, privateReplyStatus: 'SENT' },
    select: { commentId: true, createdAt: true, conversationId: true },
  })
  const privateReplyByCommentId = new Map(privateReplyLogs.map((l) => [l.commentId, l]))

  return {
    post: {
      id: post.id,
      message: post.message,
      permalink: post.permalink,
      // เหตุผลเดียวกับ listPosts — หัวเธรดกับรูปใหญ่ในคอลัมน์ขวาต้องใช้สำเนาเดียวกัน
      thumbnailUrl: resolvePostThumbnail(post),
      mediaType: post.mediaType,
      reactionCount: post.reactionCount,
      fbCommentCount: post.fbCommentCount,
      shareCount: post.shareCount,
      createdTime: post.createdTime,
    },
    channel: {
      name: post.channel.name,
      avatarUrl: post.channel.avatarUrl,
      provider: post.channel.provider,
    },
    comments: comments.map((c) => ({
      id: c.id,
      externalCommentId: c.externalCommentId,
      parentExternalId: c.parentExternalId,
      fromName: c.fromName ?? (c.fromExternalId ? (nameByExternalId.get(c.fromExternalId) ?? null) : null),
      isFromPage: c.isFromPage,
      message: c.message,
      attachmentUrl: c.attachmentUrl,
      createdTime: c.createdTime,
      editedAt: c.editedAt,
      isDeleted: c.isDeleted,
      repliedByUserId: c.repliedByUserId,
      privateReplySentAt: privateReplyByCommentId.get(c.id)?.createdAt ?? null,
      privateReplyConversationId: privateReplyByCommentId.get(c.id)?.conversationId ?? null,
      isAutoReply: c.isAutoReply,
    })),
  }
}

/** เว้นระยะก่อน backfill โพสต์เดิมซ้ำ — เปิดโพสต์รัว ๆ ไม่ควรยิง Graph ทุกครั้ง */
const BACKFILL_THROTTLE_MS = 5 * 60 * 1000

/**
 * เติมคอมเมนต์เก่าของโพสต์จาก Graph (BRD flow §4.2) — ครั้งละ 30 อัน
 * idempotent ด้วย externalCommentId; ล้มเหลว = เห็นเท่าที่ webhook ให้มา ไม่ทำให้เปิดโพสต์ไม่ได้
 */
export async function backfillPostComments(postId: string): Promise<{ added: number }> {
  const store = ((globalThis as { __cmtBackfillAt?: Map<string, number> }).__cmtBackfillAt ??= new Map())
  const last = store.get(postId)
  if (last && Date.now() - last < BACKFILL_THROTTLE_MS) return { added: 0 }
  store.set(postId, Date.now())

  try {
    const post = await prisma.facebookPost.findUnique({ where: { id: postId } })
    if (!post) return { added: 0 }
    const auth = await resolveChannelToken(post.shopChannelId)
    if (!auth) return { added: 0 }

    const { items } = await fetchPostComments(post.externalPostId, auth.token, COMMENTS_PAGE_SIZE)
    if (items.length === 0) return { added: 0 }

    const known = new Set(
      (
        await prisma.pageComment.findMany({
          where: { postId, externalCommentId: { in: items.map((i) => i.id) } },
          select: { externalCommentId: true },
        })
      ).map((c) => c.externalCommentId),
    )
    const missing = items.filter((i) => !known.has(i.id))
    if (missing.length === 0) return { added: 0 }

    const result = await prisma.pageComment.createMany({
      data: missing.map((c) => ({
        postId,
        shopChannelId: post.shopChannelId,
        externalCommentId: c.id,
        parentExternalId: c.parentId && c.parentId !== post.externalPostId ? c.parentId : null,
        fromExternalId: c.fromId,
        fromName: c.fromName,
        isFromPage: c.fromId === auth.pageId,
        message: c.message,
        attachmentUrl: c.attachmentUrl,
        createdTime: c.createdTime,
        rawPayload: toJson(c),
      })),
      skipDuplicates: true,
    })

    const newest = missing.reduce((a, b) => (a.createdTime > b.createdTime ? a : b))
    await prisma.facebookPost.updateMany({
      where: { id: postId, OR: [{ lastCommentAt: null }, { lastCommentAt: { lt: newest.createdTime } }] },
      data: { lastCommentAt: newest.createdTime },
    })
    return { added: result.count }
  } catch {
    return { added: 0 }
  }
}

/**
 * ตอบคอมเมนต์แบบสาธารณะในนามเพจ
 *
 * บันทึกแถวคำตอบเองทันทีหลัง Meta ตอบ id กลับมา ไม่รอ webhook — เหตุผลเดียวกับรีแอ็กชันขาออก:
 * ผู้ใช้ต้องเห็นผลทันที และถ้า webhook ตามมาทีหลังก็ upsert ทับค่าเดิม (idempotent)
 */
export async function replyToComment(params: {
  commentId: string
  message: string
  /**
   * null = เส้นทางระบบ (feature 00038 ตอบอัตโนมัติ) — ไม่มี user จริงให้เช็ค canAccessShop
   *
   * WARNING: นี่ไม่ใช่ flag ข้าม authz แต่เป็นการ **ย้ายคำถาม** แบบเดียวกับ systemShopId ของ
   * sendOutboundMessage (00023 TD-005): shopId ที่ใช้ตัดสินมาจากแถวในฐาน
   * (PageComment → FacebookPost → ShopChannel) เท่านั้น ไม่เคยมาจาก caller
   * caller ที่ถือ commentId จากที่อื่นมาเดา ๆ จึงยิงข้ามร้านไม่ได้
   */
  actorUserId: string | null
  /** รูปที่แนบไปกับคำตอบ (user สั่ง 2026-08-03) — fileId จาก /api/chat/upload ตัวเดียวกับแชท */
  fileId?: string | null
}): Promise<{ id: string }> {
  const target = await prisma.pageComment.findUnique({
    where: { id: params.commentId },
    include: { post: { include: { channel: { select: { id: true, shopId: true, externalId: true } } } } },
  })
  if (!target) throw new Error('COMMENT_NOT_FOUND')
  if (params.actorUserId !== null) {
    if (!(await canAccessShop(target.post.channel.shopId, params.actorUserId))) throw new Error('FORBIDDEN')
  }
  if (target.isDeleted) throw new Error('COMMENT_DELETED')

  const auth = await resolveChannelToken(target.shopChannelId)
  if (!auth) throw new Error('CHANNEL_INACTIVE')

  // presigned URL อายุ 1 ชม. — Meta ต้องดึงรูปเองจาก URL สาธารณะ (/api/files ของเรา auth-gated
  // ใช้ไม่ได้) เหตุผลเดียวกับตอนส่งรูปเข้า Messenger ดู channel-chat.service
  const attachmentUrl = params.fileId
    ? await getFileUrl(params.fileId, { signed: true, expiresIn: 3600 })
    : null

  const replyId = await createCommentReply(
    target.externalCommentId,
    auth.token,
    params.message,
    attachmentUrl,
  )

  const created = await prisma.pageComment.upsert({
    where: { externalCommentId: replyId || `local-${target.externalCommentId}-${Date.now()}` },
    create: {
      postId: target.postId,
      shopChannelId: target.shopChannelId,
      externalCommentId: replyId,
      parentExternalId: target.externalCommentId,
      fromExternalId: auth.pageId,
      fromName: null,
      isFromPage: true,
      message: params.message || null,
      // เก็บ fileId ของเราเอง ไม่ใช่ presigned URL ที่หมดอายุใน 1 ชม. — UI เปิดผ่าน /api/files
      attachmentUrl: params.fileId ? `/api/files/${params.fileId}` : null,
      createdTime: new Date(),
      repliedByUserId: params.actorUserId,
      // ระบบเป็นผู้เขียน = ติดธงไว้ให้หน้าจอแยกสถานะที่ 3 ได้ (feature 00038)
      isAutoReply: params.actorUserId === null,
    },
    update: {
      message: params.message || null,
      repliedByUserId: params.actorUserId,
      // 🛑 ห้ามใส่ isAutoReply ใน update ของ ingestFeedComment — แต่ที่นี่ใส่ได้และต้องใส่
      // เพราะนี่คือ "เราเป็นคนเขียน" ไม่ใช่ echo ที่ Meta ส่งกลับมา
      isAutoReply: params.actorUserId === null,
    },
  })

  await prisma.facebookPost.update({
    where: { id: target.postId },
    data: { lastCommentAt: new Date() },
  })

  return { id: created.id }
}

/**
 * เขียนคอมเมนต์ระดับบนบนโพสต์ในนามเพจ (user สั่ง 2026-08-03: แถบล่างของหน้าควรเป็นช่องคอมเมนต์
 * ของโพสต์ ไม่ใช่ข้อความบอกวิธีใช้ — เหมือนแถบ "Comment as <เพจ>" ของ Business Suite)
 *
 * ใช้ endpoint เดียวกับการตอบคอมเมนต์ (`POST /{object-id}/comments`) ต่างกันแค่ object-id เป็น
 * post id แทน comment id — Graph รับทั้งสองแบบที่ edge เดียวกัน
 */
export async function commentOnPost(params: {
  postId: string
  message: string
  actorUserId: string
  fileId?: string | null
}): Promise<{ id: string }> {
  const post = await prisma.facebookPost.findUnique({
    where: { id: params.postId },
    include: { channel: { select: { shopId: true } } },
  })
  if (!post) throw new Error('POST_NOT_FOUND')
  if (!(await canAccessShop(post.channel.shopId, params.actorUserId))) throw new Error('FORBIDDEN')

  const auth = await resolveChannelToken(post.shopChannelId)
  if (!auth) throw new Error('CHANNEL_INACTIVE')

  const attachmentUrl = params.fileId
    ? await getFileUrl(params.fileId, { signed: true, expiresIn: 3600 })
    : null
  const newId = await createCommentReply(post.externalPostId, auth.token, params.message, attachmentUrl)

  const created = await prisma.pageComment.upsert({
    where: { externalCommentId: newId || `local-${post.externalPostId}-${Date.now()}` },
    create: {
      postId: post.id,
      shopChannelId: post.shopChannelId,
      externalCommentId: newId,
      parentExternalId: null, // คอมเมนต์ระดับบน ไม่ใช่คำตอบของใคร
      fromExternalId: auth.pageId,
      isFromPage: true,
      message: params.message || null,
      attachmentUrl: params.fileId ? `/api/files/${params.fileId}` : null,
      createdTime: new Date(),
      repliedByUserId: params.actorUserId,
    },
    update: { message: params.message || null, repliedByUserId: params.actorUserId },
  })

  await prisma.facebookPost.update({ where: { id: post.id }, data: { lastCommentAt: new Date() } })
  return { id: created.id }
}

/**
 * จำนวนคอมเมนต์ลูกค้าที่ยังไม่มีคำตอบของเพจ — **ทั้งร้าน ไม่ใช่เฉพาะโพสต์ที่โหลดมา**
 *
 * ป้ายบนแท็บเดิมบวกจาก 25 โพสต์แรกที่หน้าเว็บโหลด ซึ่งแปลว่าร้านที่มีโพสต์เยอะ (คนที่ต้องการ
 * ตัวเลขนี้มากที่สุด) ได้ตัวเลขต่ำกว่าจริงเสมอ — ต้องนับที่ฐาน ไม่ใช่ที่หน้าจอ
 *
 * ใช้ $queryRaw เพราะเงื่อนไข "ไม่มีคอมเมนต์ลูกของเพจอยู่ข้างใต้" เป็น NOT EXISTS ซึ่ง Prisma
 * client API เขียนตรง ๆ ไม่ได้ (ต้องดึงทั้งหมดมานับใน JS = สิ่งที่เรากำลังหนี)
 */
export async function countUnansweredForShops(params: {
  shopIds: string[]
  actorUserId: string
}): Promise<number> {
  if (params.shopIds.length === 0) return 0
  await assertShopsAccessible(params.shopIds, params.actorUserId)
  /**
   * นับ **จำนวนคอมเมนต์** ที่ยังไม่ถูกตอบ (เปลี่ยนหน่วยจาก "โพสต์" เมื่อ 2026-08-15)
   *
   * 🛑 หน่วยของ badge ต้องเท่ากับ "จำนวนแถวในลิสต์ที่ต้องจัดการ" เสมอ — นั่นคือกติกาเดิมที่
   * ตัวนับนี้ยึดมาตลอด ไม่ใช่กติกาใหม่. เดิมลิสต์เป็น 1 แถว = 1 โพสต์ หน่วยจึงเป็นโพสต์
   * (และเทียบกับ badge แท็บ "ข้อความ" ที่นับ *เธรด* ได้พอดี) พอผู้ใช้เคาะให้คอลัมน์ซ้ายเป็น
   * **1 แถว = 1 คอมเมนต์** หน่วยของ badge ต้องตามไปด้วย ไม่งั้นจะได้ badge "7" นั่งอยู่เหนือ
   * รายการ 12 แถว ซึ่งเป็นอาการเดียวกับที่จอนี้เคยโชว์ "ยังไม่ตอบ 7 กับ 8" พร้อมกันมาแล้ว
   * (`sibling-surface-parity.md` — ตัวเลขเดียวกันที่โผล่ >1 ที่ ต้องมาจาก symbol เดียว)
   *
   * feature 00038 Fix round 1 — ตั้งใจ "ไม่" แยกบอท/คนในนิยาม "ยังไม่ตอบ": AC-CR-25 เขียนตรง ๆ
   * ว่าบอทตอบครบแล้วต้องไม่ถูกนับ และ BR-CR-S1 นิยาม "ยังไม่ตอบ" = ไม่มีคำตอบของเพจเลย
   * (ไม่ว่าบอทหรือคน) — ตรรกะนั้นอยู่ใน CASE ของ `countCommentStatesByShop` ซึ่งเรียงตรงกับ
   * `deriveCommentState()` บรรทัดต่อบรรทัด
   *
   * ไม่มี shopChannelId/q filter — badge นี้ไม่รู้จักตัวกรองพวกนั้น จึงนับทั้งร้านเสมอ
   */
  const counts = await countCommentStatesByShop({ shopIds: params.shopIds })
  return counts.unanswered
}

