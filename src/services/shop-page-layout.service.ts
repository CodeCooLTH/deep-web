import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { mirrorRemoteImage } from '@/services/channel-chat.service'
import { getFileUrl } from '@/lib/storage'
import { PROFILE_TAB_KEYS } from '@/lib/profile-tab-keys'

/**
 * shop-page-layout.service — ตัวจัดหน้าร้าน (feature 00035)
 *
 * ทุก DB access ของฟีเจอร์นี้อยู่ในไฟล์นี้ไฟล์เดียว (SDS §3) — API route ห้ามคุย Prisma ตรง ๆ
 *
 * สองฟังก์ชันแรก (`getShopPageLayout`, `listShopPageBlocks`) เป็น public read — ไม่มี actorUserId/
 * guard เพราะถูกเรียกจากหน้า `/u`,`/b` ที่ผู้ซื้อทั่วไปก็ต้องอ่านได้ (ข้อมูลที่คืนคือสิ่งที่ตั้งใจ
 * เผยแพร่อยู่แล้ว) ที่เหลือทุกฟังก์ชันเป็น mutation/ของ builder เท่านั้น — เริ่มด้วย `canAccessShop`
 * guard เสมอ (NFR Security, SRS §6 — reviewer grep ยืนยันบรรทัดแรกของทุกฟังก์ชัน)
 */

// ── ประเภทข้อมูลที่คืนออก ────────────────────────────────────────────────

export type ShopPageLayoutView = {
  isPublished: boolean
  tabOrder: string[]
}

export type ShopPageBadgeHighlightBlock = {
  id: string
  type: 'BADGE_HIGHLIGHT'
  sortOrder: number
  badges: Array<{
    /** UserBadge.id — ไม่ใช่ Badge.id (ดู DATABASE.md §3.2) */
    id: string
    badgeId: string
    name: string
    nameEN: string
    icon: string | null
    imageUrl: string | null
  }>
}

export type ShopPageFacebookPostBlock = {
  id: string
  type: 'FACEBOOK_POST'
  sortOrder: number
  post: {
    id: string
    message: string | null
    /** resolve แล้ว: mirroredFileId ? getFileUrl(...) : thumbnailUrl (TFR-006) */
    imageUrl: string | null
    mediaType: string | null
    reactionCount: number | null
    fbCommentCount: number | null
    shareCount: number | null
    permalink: string | null
  }
}

export type ShopPageBlockView = ShopPageBadgeHighlightBlock | ShopPageFacebookPostBlock

export type BuilderLibraryBadge = {
  id: string
  badgeId: string
  name: string
  nameEN: string
  icon: string | null
}

export type BuilderLibraryFacebookPost = {
  id: string
  message: string | null
  thumbnailUrl: string | null
  mirroredFileId: string | null
  imageUrl: string | null
  mediaType: string | null
  reactionCount: number | null
  fbCommentCount: number | null
  shareCount: number | null
  permalink: string | null
}

export type BuilderLibrary = {
  badges: BuilderLibraryBadge[]
  facebookChannelConnected: boolean
  facebookPosts: BuilderLibraryFacebookPost[]
  facebookPostsHasMore: boolean
}

export type MirrorFacebookPostResult = {
  facebookPostId: string
  mirroredFileId: string | null
  mirrored: boolean
  imageUrl: string | null
}

export type SaveShopPageBlockInput =
  | { type: 'BADGE_HIGHLIGHT'; badgeIds: string[] }
  | { type: 'FACEBOOK_POST'; facebookPostId: string }

export type SaveShopPageLayoutInput = {
  tabOrder: string[]
  blocks: SaveShopPageBlockInput[]
}

export type SavedShopPageBlock =
  | { id: string; type: 'BADGE_HIGHLIGHT'; sortOrder: number; badgeIds: string[] }
  | { id: string; type: 'FACEBOOK_POST'; sortOrder: number; facebookPostId: string }

export type SavedShopPageLayout = {
  tabOrder: string[]
  blocks: SavedShopPageBlock[]
}

// ── helper ภายใน ─────────────────────────────────────────────────────────

/**
 * เงื่อนไข "เหรียญนี้เป็นของร้าน/ผู้ใช้นี้จริง" — ใช้ร่วมทั้งฝั่งอ่าน (listShopPageBlocks/
 * getBuilderLibrary) และฝั่งเขียน (saveShopPageLayout) กันตรรกะแยกกันเดินคนละทาง
 *
 * badgeIds เก็บ UserBadge.id ไม่ใช่ Badge.id (DATABASE.md §3.2) ต้องทำงานถูกทั้ง 2 กรณี:
 * - PERSONAL shop: UserBadge.shopId เป็น NULL เสมอ (personal/buyer badge) ผูกกับ userId ของเจ้าของ
 * - BUSINESS shop: UserBadge.shopId = shop นี้โดยตรง (business achievement ผูกกับ shop ไม่ใช่ user)
 *
 * คืน null เมื่อไม่พบ shop (ไม่ควรเกิดในทางปฏิบัติ — caller ทุกตัวมี shopId ที่ผ่านการ resolve
 * แล้วมาก่อน แต่กันไว้ไม่ throw เพื่อให้ caller ตัดสินใจเอง)
 */
async function resolveBadgeOwnershipWhere(shopId: string): Promise<Prisma.UserBadgeWhereInput | null> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { userId: true, kind: true } })
  if (!shop) return null
  return shop.kind === 'PERSONAL' ? { userId: shop.userId, shopId: null } : { shopId }
}

// ── public read (ไม่มี guard — ใช้ที่ /u,/b ที่ผู้ซื้อทั่วไปเปิดได้) ──────

/**
 * getShopPageLayout — สวิตช์เผยแพร่ + ลำดับแท็บของร้าน (TFR-004, TFR-003)
 *
 * [สำคัญ] ร้านที่ยังไม่เคยกดบันทึกตัวจัดหน้าร้านเลยไม่มีแถวนี้อยู่ — "ไม่มีแถว" ไม่เท่ากับ
 * "ไม่เผยแพร่" ต้อง fallback เป็น isPublished:true/tabOrder:[] ที่นี่เสมอ ห้ามพึ่ง DB default
 * อย่างเดียว (DATABASE.md §3.1 เตือนไว้ตรง ๆ — zero-regression ของร้านเดิมทุกร้าน)
 */
export async function getShopPageLayout(shopId: string): Promise<ShopPageLayoutView> {
  const row = await prisma.shopPageLayout.findUnique({
    where: { shopId },
    select: { isPublished: true, tabOrder: true },
  })
  if (!row) return { isPublished: true, tabOrder: [] }
  return { isPublished: row.isPublished, tabOrder: row.tabOrder }
}

/**
 * listShopPageBlocks — บล็อกเหนือแถบแท็บของร้าน เรียงตาม sortOrder พร้อม hydrate เนื้อหาจริง
 * (TFR-005) ใช้ทั้งตอน render หน้า /u,/b จริง และตอน SSR initial state ของ builder
 *
 * ต้อง fail-safe เสมอ — ข้อมูลอ้างอิงที่หายไป (เหรียญถูกถอด/โพสต์ต้นทางถูกลบ) หลุดออกจาก
 * ผลลัพธ์เงียบ ๆ ไม่ throw (หน้าร้านสาธารณะพังไม่ได้จากข้อมูล page block ที่ผิดปกติ)
 */
export async function listShopPageBlocks(shopId: string): Promise<ShopPageBlockView[]> {
  const blocks = await prisma.shopPageBlock.findMany({
    where: { shopId },
    orderBy: { sortOrder: 'asc' },
  })
  if (blocks.length === 0) return []

  const badgeOwnerWhere = await resolveBadgeOwnershipWhere(shopId)

  // เหรียญ: ดึงทีเดียวทุก id ที่ต้องใช้ (ไม่ query ต่อบล็อก) — กรอง 2 ชั้นเสมอ: เป็นของร้าน/ผู้ใช้นี้
  // จริง + เป็น ACHIEVEMENT (VERIFICATION ต้องห้ามเลือกได้แม้ id จะหลุดเข้ามา, D-10)
  const allBadgeIds = blocks.filter((b) => b.type === 'BADGE_HIGHLIGHT').flatMap((b) => b.badgeIds)
  const ownedBadges =
    badgeOwnerWhere && allBadgeIds.length > 0
      ? await prisma.userBadge.findMany({
          where: { id: { in: allBadgeIds }, ...badgeOwnerWhere, badge: { type: 'ACHIEVEMENT' } },
          include: { badge: true },
        })
      : []
  const badgeById = new Map(ownedBadges.map((ub) => [ub.id, ub] as const))

  // โพสต์: ดึงทีเดียวทุก facebookPostId ที่ต้องใช้เช่นกัน
  const fbBlocks = blocks.filter((b) => b.type === 'FACEBOOK_POST' && b.facebookPostId)
  const posts =
    fbBlocks.length > 0
      ? await prisma.facebookPost.findMany({
          where: { id: { in: fbBlocks.map((b) => b.facebookPostId as string) } },
        })
      : []
  const postById = new Map(posts.map((p) => [p.id, p] as const))

  const views: ShopPageBlockView[] = []
  for (const block of blocks) {
    if (block.type === 'BADGE_HIGHLIGHT') {
      // คง "ลำดับที่ผู้ขายจัดไว้" (badgeIds) ไม่ใช่ลำดับที่ query `in` คืนมา (ไม่รับประกันลำดับ)
      const badges = block.badgeIds
        .map((id) => badgeById.get(id))
        .filter((ub): ub is NonNullable<typeof ub> => ub !== undefined)
        .map((ub) => ({
          id: ub.id,
          badgeId: ub.badgeId,
          name: ub.badge.name,
          nameEN: ub.badge.nameEN,
          icon: ub.badge.icon,
          imageUrl: ub.badge.imageUrl,
        }))
      // เหรียญที่เคยเลือกถูกถอดออกจนหมด — ไม่มีอะไรให้โชว์ ไม่ error แค่ไม่ render บล็อกนี้เลย (TFR-005 edge case)
      if (badges.length === 0) continue
      views.push({ id: block.id, type: 'BADGE_HIGHLIGHT', sortOrder: block.sortOrder, badges })
      continue
    }
    if (block.type === 'FACEBOOK_POST') {
      const post = block.facebookPostId ? postById.get(block.facebookPostId) : undefined
      // FK เป็น Cascade — โพสต์ต้นทางหายไปแล้วแถวนี้ควรหายจาก DB เองอยู่แล้ว defensive เผื่อ race เท่านั้น
      if (!post) continue
      views.push({
        id: block.id,
        type: 'FACEBOOK_POST',
        sortOrder: block.sortOrder,
        post: {
          id: post.id,
          message: post.message,
          imageUrl: post.mirroredFileId ? await getFileUrl(post.mirroredFileId) : post.thumbnailUrl,
          mediaType: post.mediaType,
          reactionCount: post.reactionCount,
          fbCommentCount: post.fbCommentCount,
          shareCount: post.shareCount,
          permalink: post.permalink,
        },
      })
    }
  }
  return views
}

// ── builder mutation/read (ทุกตัวเริ่มด้วย canAccessShop guard) ─────────

/**
 * getBuilderLibrary — คลังบล็อกที่เพิ่มได้ (เหรียญ ACHIEVEMENT + โพสต์ Facebook, ค้นหา/แบ่งหน้าได้)
 * (API §4.1) — endpoint นี้ไม่รู้จัก draft state เลย "เพิ่มแล้ว/เลือกแล้ว" เป็น UI state ที่ client
 * คำนวณเองจาก draft ปัจจุบันเทียบกับผลลัพธ์นี้
 */
export async function getBuilderLibrary(params: {
  shopId: string
  actorUserId: string
  q?: string
  cursor?: string
  take?: number
}): Promise<BuilderLibrary> {
  if (!(await canAccessShop(params.shopId, params.actorUserId))) throw new Error('FORBIDDEN')

  const q = params.q?.trim() || undefined
  const skip = params.cursor ? Number(params.cursor) || 0 : 0
  const take = Math.min(params.take ?? 20, 50)

  const badgeOwnerWhere = await resolveBadgeOwnershipWhere(params.shopId)

  const [ownedBadges, activeChannel, posts] = await Promise.all([
    badgeOwnerWhere
      ? prisma.userBadge.findMany({
          where: {
            ...badgeOwnerWhere,
            badge: {
              type: 'ACHIEVEMENT',
              ...(q
                ? {
                    OR: [
                      { name: { contains: q, mode: 'insensitive' } },
                      { nameEN: { contains: q, mode: 'insensitive' } },
                    ],
                  }
                : {}),
            },
          },
          include: { badge: true },
          orderBy: { earnedAt: 'desc' },
        })
      : Promise.resolve([]),
    prisma.shopChannel.findFirst({
      where: { shopId: params.shopId, provider: 'MESSENGER', status: 'ACTIVE' },
      select: { id: true },
    }),
    prisma.facebookPost.findMany({
      where: {
        channel: { shopId: params.shopId, provider: 'MESSENGER' },
        ...(q ? { message: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdTime: 'desc' },
      skip,
      // ดึงเกินมา 1 แถวเพื่อรู้ว่ายังมีต่อไหม โดยไม่ต้อง count แยก (pattern offset-based เดิมของโปรเจกต์)
      take: take + 1,
    }),
  ])

  const hasMore = posts.length > take
  const pageItems = hasMore ? posts.slice(0, take) : posts

  return {
    badges: ownedBadges.map((ub) => ({
      id: ub.id,
      badgeId: ub.badgeId,
      name: ub.badge.name,
      nameEN: ub.badge.nameEN,
      icon: ub.badge.icon,
    })),
    facebookChannelConnected: activeChannel !== null,
    facebookPosts: await Promise.all(
      pageItems.map(async (p) => ({
        id: p.id,
        message: p.message,
        thumbnailUrl: p.thumbnailUrl,
        mirroredFileId: p.mirroredFileId,
        imageUrl: p.mirroredFileId ? await getFileUrl(p.mirroredFileId) : p.thumbnailUrl,
        mediaType: p.mediaType,
        reactionCount: p.reactionCount,
        fbCommentCount: p.fbCommentCount,
        shareCount: p.shareCount,
        permalink: p.permalink,
      })),
    ),
    facebookPostsHasMore: hasMore,
  }
}

/**
 * mirrorFacebookPostForBuilder — mirror รูปปกโพสต์ลง storage ของเรา ตอนกด "+" ในคลัง (TFR-006)
 * ก่อน Save เสมอ — ไม่ persist ShopPageBlock ใด ๆ เขียนแค่ FacebookPost.mirroredFileId/mirroredAt
 *
 * idempotent — เช็ค mirroredFileId ก่อนเรียก mirror ทุกครั้ง (เพิ่มโพสต์เดิมซ้ำไม่ mirror ซ้ำ)
 * mirror ล้มไม่ block การเพิ่มบล็อก (TD-004) — fallback ไปใช้ thumbnailUrl ของ Meta ชั่วคราว
 */
export async function mirrorFacebookPostForBuilder(
  shopId: string,
  actorUserId: string,
  facebookPostId: string,
): Promise<MirrorFacebookPostResult> {
  if (!(await canAccessShop(shopId, actorUserId))) throw new Error('FORBIDDEN')

  const post = await prisma.facebookPost.findUnique({
    where: { id: facebookPostId },
    include: { channel: { select: { shopId: true } } },
  })
  if (!post || post.channel.shopId !== shopId) throw new Error('POST_NOT_OWNED')

  // เคย mirror สำเร็จแล้ว (ครั้งนี้หรือครั้งก่อนหน้า) — คืนทันที ไม่เรียก mirror ซ้ำ
  if (post.mirroredFileId) {
    return {
      facebookPostId: post.id,
      mirroredFileId: post.mirroredFileId,
      mirrored: true,
      imageUrl: await getFileUrl(post.mirroredFileId),
    }
  }

  // โพสต์ข้อความล้วนไม่มีรูป — เพิ่มเป็นบล็อกได้ปกติ แค่ไม่มีรูปประกอบ ไม่ใช่ error
  if (!post.thumbnailUrl) {
    return { facebookPostId: post.id, mirroredFileId: null, mirrored: false, imageUrl: null }
  }

  // ต้องใช้ mirrorRemoteImage ตัวเดียวกับ feature 00018 (มี allow-list host ของ Meta CDN + SSRF guard
  // + streaming size cap พร้อมอยู่แล้ว) — ห้ามเขียน mirror logic ใหม่ซ้ำ (มติ user 2026-08-07 ข้อ 2)
  const fileId = await mirrorRemoteImage(post.thumbnailUrl, { shopId })
  if (!fileId) {
    // mirror ล้ม (host ไม่อยู่ allow-list/ไฟล์ใหญ่เกิน/network error) — ไม่ block ผู้ใช้ (TD-004) แต่ต้อง
    // มีร่องรอย debug เสมอ (NFR observability — บทเรียน iShip quote พังเงียบบน prod หลายเดือน 2026-08-06)
    console.error('[shop-page-layout] mirror รูปโพสต์ Facebook ไม่สำเร็จ', { facebookPostId: post.id, shopId })
    return { facebookPostId: post.id, mirroredFileId: null, mirrored: false, imageUrl: post.thumbnailUrl }
  }

  await prisma.facebookPost.update({
    where: { id: post.id },
    data: { mirroredFileId: fileId, mirroredAt: new Date() },
  })

  return { facebookPostId: post.id, mirroredFileId: fileId, mirrored: true, imageUrl: await getFileUrl(fileId) }
}

function isBadgeBlockInput(b: SaveShopPageBlockInput): b is Extract<SaveShopPageBlockInput, { type: 'BADGE_HIGHLIGHT' }> {
  return b.type === 'BADGE_HIGHLIGHT'
}

function isFacebookPostBlockInput(
  b: SaveShopPageBlockInput,
): b is Extract<SaveShopPageBlockInput, { type: 'FACEBOOK_POST' }> {
  return b.type === 'FACEBOOK_POST'
}

/**
 * saveShopPageLayout — บันทึกผัง แทนที่ tabOrder + ShopPageBlock ทั้งชุดของร้านในทรานแซกชันเดียว
 * (TFR-007) ไม่แตะ isPublished (คนละ endpoint — ดู setShopPagePublished)
 *
 * ตรวจความเป็นเจ้าของจริงฝั่ง server เสมอ — UI ที่ให้เลือกอย่างเดียวไม่ใช่การป้องกัน (pattern
 * เดียวกับ replaceShopVideos) เหรียญเกิน 4/บล็อกเหรียญเกิน 1 ใบถูกกันซ้ำที่ Valibot (v.maxLength)
 * + DB CHECK อยู่แล้ว ที่นี่เพิ่มเฉพาะเงื่อนไขที่ Valibot ตรวจไม่ได้ (ความเป็นเจ้าของ/ซ้ำ)
 *
 * P2002 จาก partial unique index (race ระหว่าง 2 session save พร้อมกัน) ไม่ถูก catch ที่นี่โดยตั้งใจ
 * — ปล่อยให้ throw ขึ้นไปให้ route ชั้นบนจับแล้วแปลเป็น DUPLICATE_FACEBOOK_POST เดียวกัน (SRS §4.2
 * แยก "DB-level race" ออกจาก "app-level validation" ไว้ชัดเจน — คนละจุดจับ)
 */
export async function saveShopPageLayout(
  shopId: string,
  actorUserId: string,
  input: SaveShopPageLayoutInput,
): Promise<SavedShopPageLayout> {
  if (!(await canAccessShop(shopId, actorUserId))) throw new Error('FORBIDDEN')

  const badgeBlocks = input.blocks.filter(isBadgeBlockInput)
  if (badgeBlocks.length > 1) throw new Error('TOO_MANY_BADGE_BLOCKS')

  const fbBlocks = input.blocks.filter(isFacebookPostBlockInput)
  const fbPostIds = fbBlocks.map((b) => b.facebookPostId)
  if (new Set(fbPostIds).size !== fbPostIds.length) throw new Error('DUPLICATE_FACEBOOK_POST')

  if (badgeBlocks.length === 1 && badgeBlocks[0].badgeIds.length > 0) {
    const badgeIds = badgeBlocks[0].badgeIds
    const badgeOwnerWhere = await resolveBadgeOwnershipWhere(shopId)
    const owned = badgeOwnerWhere
      ? await prisma.userBadge.findMany({
          where: { id: { in: badgeIds }, ...badgeOwnerWhere, badge: { type: 'ACHIEVEMENT' } },
          select: { id: true },
        })
      : []
    const ownedIds = new Set(owned.map((b) => b.id))
    if (badgeIds.some((id) => !ownedIds.has(id))) throw new Error('BADGE_NOT_OWNED')
  }

  if (fbPostIds.length > 0) {
    const owned = await prisma.facebookPost.findMany({
      where: { id: { in: fbPostIds }, channel: { shopId } },
      select: { id: true },
    })
    const ownedIds = new Set(owned.map((p) => p.id))
    if (fbPostIds.some((id) => !ownedIds.has(id))) throw new Error('POST_NOT_OWNED')
  }

  // defense-in-depth — Valibot กรองคีย์แปลกปลอมทิ้งมาก่อนหน้านี้แล้ว (API.md §4.3) แต่ service ไม่ควร
  // เชื่อ route ทั้งหมด เผื่อมีคนเรียกฟังก์ชันนี้ตรง ๆ ข้าม route ในอนาคต ไม่ใช่ allow-list (แค่ตัด
  // คีย์ที่ไม่รู้จักทิ้งเงียบ ๆ — applyTabOrder ฝั่งอ่านทนคีย์แปลกปลอมอยู่แล้วเช่นกัน)
  const safeTabOrder = input.tabOrder.filter((k) => (PROFILE_TAB_KEYS as readonly string[]).includes(k))

  await prisma.$transaction(async (tx) => {
    await tx.shopPageLayout.upsert({
      where: { shopId },
      create: { shopId, tabOrder: safeTabOrder },
      update: { tabOrder: safeTabOrder },
    })
    await tx.shopPageBlock.deleteMany({ where: { shopId } })
    if (input.blocks.length > 0) {
      await tx.shopPageBlock.createMany({
        data: input.blocks.map((b, i) => ({
          shopId,
          type: b.type,
          sortOrder: i,
          badgeIds: isBadgeBlockInput(b) ? b.badgeIds : [],
          facebookPostId: isFacebookPostBlockInput(b) ? b.facebookPostId : null,
        })),
      })
    }
  })

  // คืนสถานะที่บันทึกแล้ว — query กลับจาก DB จริง ไม่ echo request ดิบ (TFR-007 ข้อ 6)
  const [layout, blocks] = await Promise.all([
    prisma.shopPageLayout.findUniqueOrThrow({ where: { shopId }, select: { tabOrder: true } }),
    prisma.shopPageBlock.findMany({ where: { shopId }, orderBy: { sortOrder: 'asc' } }),
  ])

  return {
    tabOrder: layout.tabOrder,
    blocks: blocks.map((b) =>
      b.type === 'BADGE_HIGHLIGHT'
        ? { id: b.id, type: 'BADGE_HIGHLIGHT' as const, sortOrder: b.sortOrder, badgeIds: b.badgeIds }
        : { id: b.id, type: 'FACEBOOK_POST' as const, sortOrder: b.sortOrder, facebookPostId: b.facebookPostId as string },
    ),
  }
}

/**
 * setShopPagePublished — สลับสถานะเผยแพร่ทั้งหน้า (TFR-009) แยก endpoint จาก Save โดยตั้งใจ:
 * กัน session ที่เปิด builder ค้างไว้นานกด "บันทึก" แล้วเขียนทับ isPublished ด้วยค่าเก่าที่ค้างอยู่
 * ใน draft ของตัวเอง ทับค่าที่อีก session เพิ่งสลับไป — endpoint นี้เป็น atomic operation ที่ไม่ผูก
 * กับ draft lifecycle ของหน้าจอไหนเลย ใช้ร่วมกันได้ทั้ง builder toolbar และ /public-profile มือถือ
 */
export async function setShopPagePublished(
  shopId: string,
  actorUserId: string,
  isPublished: boolean,
): Promise<{ isPublished: boolean }> {
  if (!(await canAccessShop(shopId, actorUserId))) throw new Error('FORBIDDEN')

  const row = await prisma.shopPageLayout.upsert({
    where: { shopId },
    create: { shopId, isPublished },
    update: { isPublished },
    select: { isPublished: true },
  })
  return { isPublished: row.isPublished }
}
