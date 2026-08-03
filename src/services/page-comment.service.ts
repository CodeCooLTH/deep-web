import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { decryptToken } from '@/lib/token-crypto'
import { getChannelByExternalId } from '@/services/shop-channel.service'
import { createCommentReply, fetchPostComments, fetchPostMeta } from '@/lib/facebook/graph'
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

async function resolveChannelToken(shopChannelId: string): Promise<{ token: string; pageId: string } | null> {
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
 */
export async function ingestFeedComment(params: {
  pageExternalId: string
  change: FeedChange
  /** payload ดิบก่อน parse — เหตุผลเดียวกับ ChatMessage.rawMessage (บทเรียน 2026-08-03) */
  rawChange?: unknown
}): Promise<void> {
  const val = params.change.value
  if (!val || val.item !== 'comment' || !val.comment_id || !val.post_id) return

  const channel = await getChannelByExternalId('MESSENGER', params.pageExternalId)
  if (!channel) return

  // ลบคอมเมนต์ — ทำเครื่องหมาย ไม่ลบแถว (BR-CMT-04 เก็บเป็นหลักฐานว่าเคยมีคนถามอะไร)
  if (val.verb === 'remove') {
    await prisma.pageComment.updateMany({
      where: { externalCommentId: val.comment_id, shopChannelId: channel.id },
      data: { isDeleted: true },
    })
    return
  }

  const post = await ensurePost(channel.id, val.post_id)
  if (!post) return

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

  await prisma.pageComment.upsert({
    where: { externalCommentId: val.comment_id },
    create: data,
    // verb=edited/edit → ทับข้อความเดิม + ประทับเวลาที่แก้ (UI ขึ้นป้าย "แก้ไขแล้ว")
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

export interface CommentPostRow {
  id: string
  externalPostId: string
  /** เพจที่โพสต์นี้อยู่ — ร้านเชื่อมได้หลายเพจ ต้องบอกให้รู้ว่าคอมเมนต์มาจากเพจไหน (user 2026-08-03) */
  channel: { id: string; name: string; provider: string; avatarUrl: string | null }
  message: string | null
  thumbnailUrl: string | null
  permalink: string | null
  lastCommentAt: Date | null
  commentCount: number
  unansweredCount: number
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
  shopId: string
  actorUserId: string
  q?: string
  take?: number
  /** ข้ามกี่โพสต์ (โหลดเพิ่ม) — offset พอสำหรับสเกลนี้ ไม่ต้อง keyset เหมือนรายการแชท */
  skip?: number
  /** กรองเฉพาะเพจเดียว (ตัวกรองเหมือนแท็บข้อความ) — ไม่ส่ง = ทุกเพจของร้าน */
  shopChannelId?: string
}): Promise<CommentPostRow[]> {
  if (!(await canAccessShop(params.shopId, params.actorUserId))) throw new Error('FORBIDDEN')

  const channels = await prisma.shopChannel.findMany({
    where: {
      shopId: params.shopId,
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
      channel: { select: { id: true, name: true, provider: true, avatarUrl: true } },
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

  return posts.map((p) => {
    const answered = new Set(
      p.comments.filter((c) => c.isFromPage && c.parentExternalId).map((c) => c.parentExternalId!),
    )
    const customerComments = p.comments.filter((c) => !c.isFromPage && !c.isDeleted)
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
      message: p.message,
      thumbnailUrl: p.thumbnailUrl,
      permalink: p.permalink,
      lastCommentAt: p.lastCommentAt,
      commentCount: p.comments.filter((c) => !c.isDeleted).length,
      mediaType: p.mediaType,
      reactionCount: p.reactionCount,
      fbCommentCount: p.fbCommentCount,
      shareCount: p.shareCount,
      unansweredCount: customerComments.filter((c) => !answered.has(c.externalCommentId)).length,
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
  actorUserId: string
  /** รูปที่แนบไปกับคำตอบ (user สั่ง 2026-08-03) — fileId จาก /api/chat/upload ตัวเดียวกับแชท */
  fileId?: string | null
}): Promise<{ id: string }> {
  const target = await prisma.pageComment.findUnique({
    where: { id: params.commentId },
    include: { post: { include: { channel: { select: { id: true, shopId: true, externalId: true } } } } },
  })
  if (!target) throw new Error('COMMENT_NOT_FOUND')
  if (!(await canAccessShop(target.post.channel.shopId, params.actorUserId))) throw new Error('FORBIDDEN')
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
    },
    update: { message: params.message || null, repliedByUserId: params.actorUserId },
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
export async function countUnansweredForShop(params: {
  shopId: string
  actorUserId: string
}): Promise<number> {
  if (!(await canAccessShop(params.shopId, params.actorUserId))) throw new Error('FORBIDDEN')
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM "PageComment" c
    JOIN "ShopChannel" sc ON sc.id = c."shopChannelId"
    WHERE sc."shopId" = ${params.shopId}
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
