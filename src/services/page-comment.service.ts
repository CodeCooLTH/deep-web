import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canAccessShop, assertShopsAccessible } from '@/lib/shop-context'
import { decryptToken } from '@/lib/token-crypto'
import { getChannelByExternalId } from '@/services/shop-channel.service'
import { createCommentReply, fetchPagePosts, fetchPostComments, fetchPostMeta } from '@/lib/facebook/graph'
import { getFileUrl } from '@/lib/storage'
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
 * null = ไม่ได้บันทึก (ไม่ใช่คอมเมนต์ / ไม่พบเพจ / เป็น verb=remove)
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

  try {
    return await prisma.facebookPost.create({
      data: {
        shopChannelId,
        externalPostId,
        message: meta?.message ?? null,
        permalink: meta?.permalink ?? null,
        thumbnailUrl: meta?.picture ?? null,
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
          try {
            const created = await prisma.facebookPost.create({
              data: {
                shopChannelId: ch.id,
                externalPostId: p.id,
                message: p.message,
                permalink: p.permalink,
                thumbnailUrl: p.picture,
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
}): Promise<CommentPostRow[]> {
  if (params.shopIds.length === 0) return []
  await assertShopsAccessible(params.shopIds, params.actorUserId)

  const channels = await prisma.shopChannel.findMany({
    where: {
      shopId: { in: params.shopIds },
      provider: 'MESSENGER',
      ...(params.shopChannelId ? { id: params.shopChannelId } : {}),
    },
    select: { id: true },
  })
  if (channels.length === 0) return []
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
          externalCommentId: true,
          parentExternalId: true,
          isFromPage: true,
          isDeleted: true,
          fromName: true,
          message: true,
          attachmentUrl: true,
          createdTime: true,
        },
      },
    },
  })

  // ขอบเขตหน้าต่างทักแชทส่วนตัวของ Meta = 7 วัน — คอมเมนต์ที่เก่ากว่านี้ทักไม่ได้อีกแล้ว
  // คิดครั้งเดียวนอกลูป (ทุกแถวใช้เส้นเดียวกัน) — ค่าคงที่อยู่ที่ UI ด้วย (privateReplyWindow)
  const dmWindowStart = Date.now() - 7 * 24 * 60 * 60 * 1000

  return posts.map((p) => {
    const answered = new Set(
      p.comments.filter((c) => c.isFromPage && c.parentExternalId).map((c) => c.parentExternalId!),
    )
    const customerComments = p.comments.filter((c) => !c.isFromPage && !c.isDeleted)
    const unanswered = customerComments.filter((c) => !answered.has(c.externalCommentId))
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
      thumbnailUrl: p.thumbnailUrl,
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
    }
  })
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
    await prisma.facebookPost.update({
      where: { id: postId },
      data: {
        message: meta.message ?? post.message,
        permalink: meta.permalink ?? post.permalink,
        thumbnailUrl: meta.picture ?? post.thumbnailUrl,
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
      thumbnailUrl: post.thumbnailUrl,
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
   * นับ **จำนวนโพสต์** ที่ยังมีคอมเมนต์ค้าง ไม่ใช่จำนวนคอมเมนต์ (user ถาม 2026-08-04 "มันควรเป็น 8 ไหม"
   * ตอนแท็บขึ้น 26 แต่รายการมี 8 แถว)
   *
   * เหตุผลที่หน่วยต้องเป็น "โพสต์": badge ที่อยู่ข้างกันบนแถบเดียวกัน (`ข้อความ`) นับด้วย
   * countUnreadConversations = **จำนวนเธรด** ไม่ใช่จำนวนข้อความ — สองแท็บบนแถบเดียวกันต้องเป็น
   * หน่วยเดียวกัน คือ "มีกี่รายการในลิสต์ที่ต้องจัดการ" และตรงกับจำนวนแถวที่ผู้ใช้เห็นจริง
   * (รอบก่อนผมเปลี่ยนเป็นนับคอมเมนต์เพราะ user บอกว่าเลข 24/5/3,7,3,8,3 ดูขัดกัน — ตอนนั้นแถวยังมี
   *  วงกลมตัวเลขต่อโพสต์อยู่ พอถอดวงกลมออกตามที่สั่งทีหลัง เลขจำนวนคอมเมนต์ก็ไม่มีอะไรบนจอให้อ้างอิง)
   */
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(DISTINCT c."postId")::bigint AS count
    FROM "PageComment" c
    JOIN "ShopChannel" sc ON sc.id = c."shopChannelId"
    WHERE sc."shopId" IN (${Prisma.join(params.shopIds)})
      AND sc.provider = 'MESSENGER'
      AND c."isFromPage" = false
      AND c."isDeleted" = false
      AND NOT EXISTS (
        SELECT 1 FROM "PageComment" r
        WHERE r."parentExternalId" = c."externalCommentId"
          AND r."isFromPage" = true
      )
  `
  return Number(rows[0]?.count ?? 0)
}
