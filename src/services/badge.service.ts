/**
 * badge.service.ts — data-driven badge engine (Achievements Phase 4 Batch 1 Unit B)
 *
 * ทำไม rewrite:
 *   เวอร์ชันเก่า hardcode DEFAULT_BADGES + BADGE_CHECKS อยู่ที่นี่ → single source
 *   of truth แยกกัน 2 แห่ง (service + seed.ts). เวอร์ชันใหม่ดึง Badge ทุกแถวจาก DB
 *   แล้ว dispatch ตาม criteria.type ทำให้ seed.ts เป็น source เดียว.
 *
 * OMS redesign (done 2026-05-16): terminal order status = 'CONFIRMED' เป็น module const
 *   DEFAULT_TERMINAL_STATUSES — handler ใดที่ต้องนับ order สำเร็จใช้ค่านี้
 *   เป็น default, แต่ถ้า badge row มี criteria.statuses[] ก็ override ได้.
 *   ถ้า state machine เปลี่ยนอีกให้แก้ที่ const นี้ที่เดียว ไม่ต้องแตะ handler ทุกตัว.
 *
 * U1 hardening (retro 2026-05-16 #3):
 *   (1) resolveStatuses() — validate criteria.statuses ก่อนส่งเข้า Prisma
 *   (2) guard divide-by-zero ใน getBadgeProgress ratio ทุก case
 *   (3) findMany → aggregate/count สำหรับ rating/count queries (perf)
 *   (4) if(!earned) guard บน 5 case ที่ยังขาด (PERFECT_RATING, HIGH_RATING,
 *       ZERO_COMPLAINT, VETERAN, FAST_SHIPPING) เพื่อ skip DB เมื่อ earned=true
 */

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { recalculateTrustScore } from "@/services/trust-score.service"
import type {
  BadgeCriteria,
  BadgeProgress,
  CriteriaFastShipping,
  CriteriaHighRating,
  CriteriaOrderCount,
  CriteriaPerfectRating,
  CriteriaSignupYear,
  CriteriaUniqueReviewers,
  CriteriaVeteran,
  CriteriaZeroComplaint,
} from "@/types/badge"

// ─── Status-agnostic seam (Known Gap #5) ──────────────────────────────────────
/**
 * Status ที่นับเป็น "สำเร็จ" สำหรับ order handlers ทุกตัว
 * เปลี่ยนที่นี่ที่เดียวเมื่อ OMS redesign เพิ่ม status ใหม่
 */
const DEFAULT_TERMINAL_STATUSES = ['CONFIRMED']

// ─── Audience mapping ─────────────────────────────────────────────────────────

type AudienceArg = 'SELLER' | 'BUYER' | 'ANY' | 'seller'

/**
 * แปล audience argument เป็น DB audience values ที่ควร include
 * 'seller' (legacy string) → ['SELLER', 'ANY']
 * 'SELLER'                 → ['SELLER', 'ANY']
 * 'BUYER'                  → ['BUYER', 'ANY']
 * 'ANY'                    → ['ANY']
 */
function resolveAudienceFilter(audience: AudienceArg): string[] {
  if (audience === 'seller' || audience === 'SELLER') return ['SELLER', 'ANY']
  if (audience === 'BUYER') return ['BUYER', 'ANY']
  return ['ANY']
}

// ─── Statuses guard helper (U1 item 1) ────────────────────────────────────────

/**
 * ดึง statuses จาก criteria พร้อม validate ก่อนส่งให้ Prisma
 * ทำไม: criteria มาจาก JSON column ใน DB — อาจมีค่า malformed ถ้า seed ผิดหรือถูก
 * แก้ไขโดยตรง → validate ที่จุดนี้จุดเดียว (DRY) ป้องกัน Prisma รับ type ผิด
 *
 * Valid: Array.isArray && every element string && length > 0
 * Invalid / missing → fall back to DEFAULT_TERMINAL_STATUSES
 */
function resolveStatuses(criteria: unknown): string[] {
  const raw = (criteria as { statuses?: unknown } | null)?.statuses
  if (raw === undefined || raw === null) return DEFAULT_TERMINAL_STATUSES
  if (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every((s) => typeof s === 'string')
  ) {
    return raw as string[]
  }
  // ทำไม warn: criteria.statuses มีค่าแต่ invalid → developer/seed ต้องแก้
  console.warn('[badge] criteria.statuses malformed — falling back to DEFAULT_TERMINAL_STATUSES', raw)
  return DEFAULT_TERMINAL_STATUSES
}

// ─── DB helper (shared by handlers + progress) ────────────────────────────────

async function getShopForUser(userId: string) {
  return prisma.shop.findUnique({ where: { userId } })
}

// ─── Pure-ish criterion handlers ──────────────────────────────────────────────
// แต่ละ fn รับ userId + criteria object → return { met: boolean; count?: number }
// แยกเป็น export เพื่อให้ Vitest test ได้ตรง (Batch 3 H1)

export async function checkFirstOrder(
  userId: string,
  statuses: string[] = DEFAULT_TERMINAL_STATUSES,
): Promise<{ met: boolean; count: number }> {
  const shop = await getShopForUser(userId)
  if (!shop) return { met: false, count: 0 }
  const count = await prisma.order.count({ where: { shopId: shop.id, status: { in: statuses } } })
  return { met: count >= 1, count }
}

export async function checkOrderCount(
  userId: string,
  criteria: CriteriaOrderCount,
  statuses: string[] = DEFAULT_TERMINAL_STATUSES,
): Promise<{ met: boolean; count: number }> {
  const shop = await getShopForUser(userId)
  if (!shop) return { met: false, count: 0 }
  const count = await prisma.order.count({ where: { shopId: shop.id, status: { in: statuses } } })
  return { met: count >= criteria.count, count }
}

/**
 * U1 item 3: เปลี่ยนจาก findMany+JS-avg → aggregate(_avg, _count) เพื่อลด payload
 * ทำไม: ไม่จำเป็นต้องโหลด row ทั้งหมดมา JS เพียงเพื่อ sum/count
 * Behavior เดิม: reviewCount < minReviews → met=false, avg=0
 *              reviewCount >= minReviews → met = avg === 5.0
 * Prisma aggregate _avg.rating คำนวณเหมือน sum/count ทุก row → ผลเหมือนกัน
 */
export async function checkPerfectRating(
  userId: string,
  criteria: CriteriaPerfectRating,
): Promise<{ met: boolean; reviewCount: number; avg: number }> {
  const shop = await getShopForUser(userId)
  if (!shop) return { met: false, reviewCount: 0, avg: 0 }
  const agg = await prisma.review.aggregate({
    _avg: { rating: true },
    _count: { rating: true },
    where: { order: { shopId: shop.id } },
  })
  const reviewCount = agg._count.rating
  if (reviewCount < criteria.minReviews) return { met: false, reviewCount, avg: 0 }
  const avg = agg._avg.rating ?? 0
  return { met: avg === 5.0, reviewCount, avg }
}

/**
 * U1 item 3: เปลี่ยนจาก findMany+JS-avg → aggregate เหมือน checkPerfectRating
 * ทำไม: ลด network payload, ผลลัพธ์เหมือนเดิม (avg คำนวณ server-side)
 */
export async function checkHighRating(
  userId: string,
  criteria: CriteriaHighRating,
): Promise<{ met: boolean; reviewCount: number; avg: number }> {
  const shop = await getShopForUser(userId)
  if (!shop) return { met: false, reviewCount: 0, avg: 0 }
  const agg = await prisma.review.aggregate({
    _avg: { rating: true },
    _count: { rating: true },
    where: { order: { shopId: shop.id } },
  })
  const reviewCount = agg._count.rating
  if (reviewCount < criteria.minReviews) return { met: false, reviewCount, avg: 0 }
  const avg = agg._avg.rating ?? 0
  return { met: avg >= criteria.minRating, reviewCount, avg }
}

export async function checkZeroComplaint(
  userId: string,
  criteria: CriteriaZeroComplaint,
  statuses: string[] = DEFAULT_TERMINAL_STATUSES,
): Promise<{ met: boolean; completed: number; cancelled: number }> {
  const shop = await getShopForUser(userId)
  if (!shop) return { met: false, completed: 0, cancelled: 0 }
  const completed = await prisma.order.count({ where: { shopId: shop.id, status: { in: statuses } } })
  if (completed < criteria.minOrders) return { met: false, completed, cancelled: 0 }
  // นับเฉพาะ seller-initiated cancel (spec Q3) — buyer-cancel / null ไม่นับ
  // cancelInitiator ยังไม่อยู่ใน generated client — cast ณ query boundary (เหมือน Task 2)
  const cancelledWhere = { shopId: shop.id, status: 'CANCELLED', cancelInitiator: 'seller' } as unknown as Prisma.OrderWhereInput
  const cancelled = await prisma.order.count({ where: cancelledWhere })
  return { met: cancelled === 0, completed, cancelled }
}

export async function checkVeteran(
  userId: string,
  criteria: CriteriaVeteran,
  statuses: string[] = DEFAULT_TERMINAL_STATUSES,
): Promise<{ met: boolean; daysOld: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { met: false, daysOld: 0 }
  const daysOld = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  if (daysOld < criteria.minDays) return { met: false, daysOld }

  // ต้องมีออเดอร์ใน 30 วันล่าสุดด้วย (active shop requirement)
  const shop = await getShopForUser(userId)
  if (!shop) return { met: false, daysOld }
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentOrder = await prisma.order.findFirst({
    where: { shopId: shop.id, status: { in: statuses }, updatedAt: { gte: thirtyDaysAgo } },
  })
  return { met: !!recentOrder, daysOld }
}

/**
 * U1 item 3: คง findMany ไว้เพราะต้องคำนวณ delta ต่อ row (shipmentTracking.createdAt - order.createdAt)
 * ทำไม: avg ของ delta ไม่ใช่ avg ของ column เดียว → Prisma aggregate ไม่รองรับ computed field
 * เพิ่ม select เฉพาะ field ที่ใช้จริง (createdAt ทั้งสองฝั่ง) + เพิ่ม take bound เพื่อ scale safety
 */
export async function checkFastShipping(
  userId: string,
  criteria: CriteriaFastShipping,
  statuses: string[] = DEFAULT_TERMINAL_STATUSES,
): Promise<{ met: boolean; orderCount: number; avgHours: number }> {
  const shop = await getShopForUser(userId)
  if (!shop) return { met: false, orderCount: 0, avgHours: 0 }

  const ordersWithShipment = await prisma.order.findMany({
    where: { shopId: shop.id, status: { in: statuses }, shipmentTracking: { isNot: null } },
    select: {
      createdAt: true,
      shipmentTracking: { select: { createdAt: true } },
    },
    // ทำไม take: ป้องกัน seller ที่มีออเดอร์หลักหมื่นทำให้ query ใหญ่เกิน
    // 10,000 แถวเพียงพอสำหรับ avg ที่มีนัยสำคัญ
    take: 10_000,
  })
  const orderCount = ordersWithShipment.length
  if (orderCount < criteria.minOrders) return { met: false, orderCount, avgHours: 0 }

  // คำนวณ avg เวลาตั้งแต่สร้าง order ถึง shipment create (proxy สำหรับ confirmed→shipped)
  let totalHours = 0
  for (const order of ordersWithShipment) {
    if (!order.shipmentTracking) continue
    const diffMs = order.shipmentTracking.createdAt.getTime() - order.createdAt.getTime()
    totalHours += diffMs / (1000 * 60 * 60)
  }
  const avgHours = totalHours / orderCount
  return { met: avgHours <= criteria.maxHours, orderCount, avgHours }
}

export async function checkFullVerification(
  userId: string,
): Promise<{ met: boolean; levels: Set<number> }> {
  const approved = await prisma.verificationRecord.findMany({
    where: { userId, status: 'APPROVED' },
    select: { level: true },
  })
  const levels = new Set(approved.map((v) => v.level))
  return { met: levels.has(1) && levels.has(2) && levels.has(3), levels }
}

/**
 * U1 item 3: เปลี่ยนจาก findMany({select:{reviewerUserId}}) + JS Set → findMany distinct
 * ทำไม: โหลดเฉพาะ 1 row ต่อ distinct reviewerUserId ลด payload
 * Behavior เดิม: นับจำนวน unique reviewerUserId (ไม่นับ null) → เหมือนกันทุกกรณี
 * ทำไม distinct ไม่ใช่ groupBy: distinct ส่ง 1 row ต่อ unique value เหมือน Set ใน JS
 * แต่ filter + distinct ทำที่ DB ทำให้ไม่ต้องโหลด duplicate rows มา JS
 */
export async function checkUniqueReviewers(
  userId: string,
  criteria: CriteriaUniqueReviewers,
): Promise<{ met: boolean; uniqueCount: number }> {
  const shop = await getShopForUser(userId)
  if (!shop) return { met: false, uniqueCount: 0 }
  const distinctRows = await prisma.review.findMany({
    where: { order: { shopId: shop.id }, reviewerUserId: { not: null } },
    distinct: ['reviewerUserId'],
    select: { reviewerUserId: true },
  })
  const uniqueCount = distinctRows.length
  return { met: uniqueCount >= criteria.count, uniqueCount }
}

export async function checkSignupYear(
  userId: string,
  criteria: CriteriaSignupYear,
): Promise<{ met: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } })
  if (!user) return { met: false }
  return { met: user.createdAt.getFullYear() === criteria.year }
}

// ─── Core award helper ────────────────────────────────────────────────────────

/**
 * Upsert UserBadge — idempotent ด้วย @@unique([userId, badgeId])
 * ถ้า Badge ไม่มีใน DB (criteria เปลี่ยนชื่อ?) → skip silently
 */
export async function awardBadge(userId: string, badgeId: string): Promise<void> {
  await prisma.userBadge.upsert({
    where: { userId_badgeId: { userId, badgeId } },
    update: {},
    create: { userId, badgeId },
  })
}

// ─── Criteria parser (unknown → BadgeCriteria | null) ────────────────────────

function parseCriteria(raw: unknown): BadgeCriteria | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj['type'] !== 'string') return null
  return obj as unknown as BadgeCriteria
}

// ─── Main evaluator ───────────────────────────────────────────────────────────

/**
 * evaluateBadges — ตรวจและ award badge ที่ user ผ่าน criteria
 *
 * @param userId   - user ที่ต้องการตรวจ
 * @param audience - 'SELLER'|'BUYER'|'ANY'|'seller' (default 'seller' = backward compat)
 *   'seller' (legacy 1-arg call from order/review/verification service) → SELLER+ANY
 *
 * Backward-compatible: callers ที่ส่งแค่ userId ยังใช้งานได้ → default = 'seller'
 */
export async function evaluateBadges(
  userId: string,
  audience: AudienceArg = 'seller',
): Promise<void> {
  const audienceValues = resolveAudienceFilter(audience)

  // ดึง badge ทั้งหมดที่ตรง audience จาก DB (single source = seed.ts)
  const badges = await prisma.badge.findMany({
    where: { audience: { in: audienceValues } },
  })

  // ดึง userBadge ที่ได้แล้วครั้งเดียว → ใช้ filter "skip already earned"
  const existing = await prisma.userBadge.findMany({
    where: { userId },
    select: { badgeId: true },
  })
  const earnedIds = new Set(existing.map((ub) => ub.badgeId))

  for (const badge of badges) {
    // DB @@unique ทำให้ awardBadge idempotent อยู่แล้ว แต่ skip เพื่อลด DB round-trips
    if (earnedIds.has(badge.id)) continue

    const criteria = parseCriteria(badge.criteria)
    if (!criteria) {
      console.warn('[badge] criteria parse ล้มเหลว', badge.nameEN, badge.criteria)
      continue
    }

    let met = false
    // U1 item 1: ใช้ resolveStatuses แทน cast โดยตรง — validate ก่อนส่งเข้า Prisma
    const statuses = resolveStatuses(criteria)

    try {
      switch (criteria.type) {
        case 'FIRST_ORDER': {
          const r = await checkFirstOrder(userId, statuses)
          met = r.met
          break
        }
        case 'ORDER_COUNT': {
          const r = await checkOrderCount(userId, criteria, statuses)
          met = r.met
          break
        }
        case 'PERFECT_RATING': {
          const r = await checkPerfectRating(userId, criteria)
          met = r.met
          break
        }
        case 'HIGH_RATING': {
          const r = await checkHighRating(userId, criteria)
          met = r.met
          break
        }
        case 'ZERO_COMPLAINT': {
          const r = await checkZeroComplaint(userId, criteria, statuses)
          met = r.met
          break
        }
        case 'VETERAN': {
          const r = await checkVeteran(userId, criteria, statuses)
          met = r.met
          break
        }
        case 'FAST_SHIPPING': {
          const r = await checkFastShipping(userId, criteria, statuses)
          met = r.met
          break
        }
        case 'FULL_VERIFICATION': {
          const r = await checkFullVerification(userId)
          met = r.met
          break
        }
        case 'UNIQUE_REVIEWERS': {
          const r = await checkUniqueReviewers(userId, criteria)
          met = r.met
          break
        }
        case 'SIGNUP_YEAR': {
          const r = await checkSignupYear(userId, criteria)
          met = r.met
          break
        }
        default: {
          // ทำไม warn ไม่ throw: badge ใหม่ที่ยังไม่มี handler ไม่ควรพัง flow หลัก
          console.warn('[badge] unknown criteria type', (criteria as { type: string }).type, badge.nameEN)
          continue
        }
      }
    } catch (err) {
      console.error('[badge] handler error for badge', badge.nameEN, err)
      continue
    }

    if (met) {
      await awardBadge(userId, badge.id)
    }
  }

  await recalculateTrustScore(userId)
}

// ─── evaluateSignupYearBadge (new export, Batch 2 / auth caller) ──────────────

/**
 * Award SIGNUP_YEAR badge ถ้า user สมัครปีที่ badge กำหนด
 *
 * ทำไม no date argument: security must-fix #2 — ป้องกัน caller inject year ปลอม
 * fetch createdAt จาก DB ตรงเสมอ. Batch-2 auth caller wrap ด้วย try/catch อีกชั้น.
 * Best-effort: error → warn + return (ไม่ throw ออก)
 */
export async function evaluateSignupYearBadge(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } })
    if (!user) {
      console.warn('[badge] evaluateSignupYearBadge: user not found', userId)
      return
    }
    const year = user.createdAt.getFullYear()

    // หา Badge ที่ criteria.type === 'SIGNUP_YEAR' && criteria.year === year
    const badges = await prisma.badge.findMany({
      where: { audience: { in: ['ANY', 'SELLER', 'BUYER'] } },
    })

    for (const badge of badges) {
      const criteria = parseCriteria(badge.criteria)
      if (!criteria || criteria.type !== 'SIGNUP_YEAR') continue
      const signupCriteria = criteria as CriteriaSignupYear
      if (signupCriteria.year !== year) continue

      // Idempotent upsert — ถ้าได้แล้วก็ skip ผ่าน @@unique
      await awardBadge(userId, badge.id)
    }
  } catch (err) {
    console.error('[badge] evaluateSignupYearBadge error', userId, err)
    // best-effort — ไม่ rethrow
  }
}

// ─── getBadgeProgress (new export, Batch 3 Badge Process pages) ───────────────

/**
 * คืน progress ของ badge ทุกใบที่ตรง audience สำหรับ user
 * ใช้ helper เดียวกับ evaluateBadges (DRY) เพื่อให้ผล consistent
 */
export async function getBadgeProgress(
  userId: string,
  audience: AudienceArg = 'seller',
): Promise<BadgeProgress[]> {
  const audienceValues = resolveAudienceFilter(audience)
  const badges = await prisma.badge.findMany({
    where: { audience: { in: audienceValues } },
  })
  const existing = await prisma.userBadge.findMany({
    where: { userId },
    select: { badgeId: true },
  })
  const earnedIds = new Set(existing.map((ub) => ub.badgeId))

  const results: BadgeProgress[] = []

  for (const badge of badges) {
    const earned = earnedIds.has(badge.id)
    const criteria = parseCriteria(badge.criteria)
    // U1 item 1: ใช้ resolveStatuses แทน cast โดยตรง
    const statuses = resolveStatuses(criteria)

    let progressLabel: string | null = null
    let progressRatio = earned ? 1 : 0

    if (!criteria) {
      results.push({ badge, earned, progressLabel: null, progressRatio })
      continue
    }

    try {
      switch (criteria.type) {
        case 'FIRST_ORDER': {
          if (!earned) {
            const { count } = await checkFirstOrder(userId, statuses)
            progressLabel = count >= 1 ? 'ปิดออเดอร์แรกแล้ว' : 'ยังไม่มีออเดอร์'
            progressRatio = count >= 1 ? 1 : 0
          }
          break
        }
        case 'ORDER_COUNT': {
          if (!earned) {
            const { count } = await checkOrderCount(userId, criteria, statuses)
            // U1 item 2: guard divide-by-zero เมื่อ criteria.count <= 0
            const threshold = criteria.count
            progressRatio = threshold > 0 ? Math.min(count / threshold, 1) : 0
            const remaining = criteria.count - count
            progressLabel = remaining > 0 ? `อีก ${remaining} ออเดอร์` : `ครบ ${criteria.count} ออเดอร์แล้ว`
          }
          break
        }
        case 'PERFECT_RATING': {
          // U1 item 4: wrap ทั้งหมดใน if(!earned) — earned badge ข้าม DB round-trip
          if (!earned) {
            const { reviewCount, avg } = await checkPerfectRating(userId, criteria)
            // U1 item 2: guard divide-by-zero เมื่อ criteria.minReviews <= 0
            const threshold = criteria.minReviews
            progressRatio = threshold > 0 ? Math.min(reviewCount / threshold, 1) : 0
            if (reviewCount < criteria.minReviews) {
              progressLabel = `อีก ${criteria.minReviews - reviewCount} รีวิว`
            } else {
              const avgFixed = avg.toFixed(2)
              progressLabel = `เรตติ้งปัจจุบัน ${avgFixed} (ต้องการ 5.0)`
            }
          }
          break
        }
        case 'HIGH_RATING': {
          // U1 item 4: wrap ทั้งหมดใน if(!earned) — earned badge ข้าม DB round-trip
          if (!earned) {
            const { reviewCount, avg } = await checkHighRating(userId, criteria)
            // U1 item 2: guard divide-by-zero เมื่อ criteria.minReviews <= 0
            const threshold = criteria.minReviews
            progressRatio = threshold > 0 ? Math.min(reviewCount / threshold, 1) : 0
            if (reviewCount < criteria.minReviews) {
              progressLabel = `อีก ${criteria.minReviews - reviewCount} รีวิว`
            } else {
              progressLabel = `เรตติ้งปัจจุบัน ${avg.toFixed(2)} (ต้องการ ≥${criteria.minRating})`
            }
          }
          break
        }
        case 'ZERO_COMPLAINT': {
          // U1 item 4: wrap ทั้งหมดใน if(!earned) — earned badge ข้าม DB round-trip
          if (!earned) {
            const { completed, cancelled } = await checkZeroComplaint(userId, criteria, statuses)
            // U1 item 2: guard divide-by-zero เมื่อ criteria.minOrders <= 0
            const threshold = criteria.minOrders
            progressRatio = threshold > 0 ? Math.min(completed / threshold, 1) : 0
            if (completed < criteria.minOrders) {
              progressLabel = `อีก ${criteria.minOrders - completed} ออเดอร์`
            } else if (cancelled > 0) {
              progressLabel = `มี ${cancelled} ออเดอร์ที่ยกเลิก`
            }
          }
          break
        }
        case 'VETERAN': {
          // U1 item 4: wrap ทั้งหมดใน if(!earned) — earned badge ข้าม DB round-trip
          if (!earned) {
            const { daysOld } = await checkVeteran(userId, criteria, statuses)
            // U1 item 2: guard divide-by-zero เมื่อ criteria.minDays <= 0
            const threshold = criteria.minDays
            progressRatio = threshold > 0 ? Math.min(daysOld / threshold, 1) : 0
            const remaining = Math.max(0, Math.ceil(criteria.minDays - daysOld))
            progressLabel = remaining > 0 ? `อีก ${remaining} วัน` : 'ครบวันแล้ว (ต้องมีออเดอร์ล่าสุด)'
          }
          break
        }
        case 'FAST_SHIPPING': {
          // U1 item 4: wrap ทั้งหมดใน if(!earned) — earned badge ข้าม DB round-trip
          if (!earned) {
            const { orderCount, avgHours } = await checkFastShipping(userId, criteria, statuses)
            // U1 item 2: guard divide-by-zero เมื่อ criteria.minOrders <= 0
            const threshold = criteria.minOrders
            progressRatio = threshold > 0 ? Math.min(orderCount / threshold, 1) : 0
            if (orderCount < criteria.minOrders) {
              progressLabel = `อีก ${criteria.minOrders - orderCount} ออเดอร์ที่มีการจัดส่ง`
            } else {
              progressLabel = `เฉลี่ย ${avgHours.toFixed(1)} ชม. (ต้องการ ≤${criteria.maxHours} ชม.)`
            }
          }
          break
        }
        case 'FULL_VERIFICATION': {
          if (!earned) {
            const { met } = await checkFullVerification(userId)
            progressRatio = met ? 1 : 0
            progressLabel = met ? 'ยืนยันตัวตนครบแล้ว' : 'ยังยืนยันตัวตนไม่ครบ'
          }
          break
        }
        case 'UNIQUE_REVIEWERS': {
          if (!earned) {
            const { uniqueCount } = await checkUniqueReviewers(userId, criteria)
            // U1 item 2: guard divide-by-zero เมื่อ criteria.count <= 0
            const threshold = criteria.count
            progressRatio = threshold > 0 ? Math.min(uniqueCount / threshold, 1) : 0
            const remaining = criteria.count - uniqueCount
            progressLabel = remaining > 0 ? `อีก ${remaining} คน` : `ครบ ${criteria.count} คนแล้ว`
          }
          break
        }
        case 'SIGNUP_YEAR': {
          if (!earned) {
            const { met } = await checkSignupYear(userId, criteria)
            progressRatio = met ? 1 : 0
            progressLabel = met ? `สมัครปี ${criteria.year} แล้ว` : `badge พิเศษปี ${criteria.year}`
          }
          break
        }
        default: {
          console.warn('[badge] getBadgeProgress: unknown criteria type', (criteria as { type: string }).type)
        }
      }
    } catch (err) {
      console.error('[badge] getBadgeProgress handler error', badge.nameEN, err)
    }

    results.push({ badge, earned, progressLabel, progressRatio })
  }

  return results
}

// ─── getBadgeRarity ────────────────────────────────────────────────────────────

export type RarityTier = 'COMMON' | 'UNCOMMON' | 'RARE' | 'LEGENDARY'

export interface BadgeRarity {
  pct: number
  tier: RarityTier
  earnedCount: number
  shopCount: number
}

/**
 * getBadgeRarity — คำนวณความหายากของ badge จากสัดส่วนร้านที่ได้รับ
 *
 * ทำไม shopCount (ไม่ใช่ userCount): badge ระบบนี้ออกแบบสำหรับ seller
 * threshold ตาม Controller decision:
 *   ≥50% COMMON / 20–49.9% UNCOMMON / 5–19.9% RARE / <5% LEGENDARY
 * ถ้า shopCount=0 → pct=0, tier=LEGENDARY (edge case ไม่มีร้านเลย)
 * คืน null ถ้า badgeId ไม่มีจริง — กัน fabricated LEGENDARY ให้ badge มั่ว (security MEDIUM)
 */
export async function getBadgeRarity(badgeId: string): Promise<BadgeRarity | null> {
  const exists = await prisma.badge.findUnique({ where: { id: badgeId }, select: { id: true } })
  if (!exists) return null
  const [earnedCount, shopCount] = await Promise.all([
    prisma.userBadge.count({ where: { badgeId } }),
    prisma.shop.count(),
  ])
  const pct = shopCount > 0 ? (earnedCount / shopCount) * 100 : 0
  let tier: RarityTier
  if (pct >= 50) tier = 'COMMON'
  else if (pct >= 20) tier = 'UNCOMMON'
  else if (pct >= 5) tier = 'RARE'
  else tier = 'LEGENDARY'
  return { pct, tier, earnedCount, shopCount }
}

// ─── getBadgePaceEstimate ──────────────────────────────────────────────────────

export type PaceReason = 'estimated' | 'no_data' | 'non_countable' | 'earned'

export interface BadgePaceEstimate {
  estimateDays: number | null
  ratePerDay: number | null
  reason: PaceReason
}

/**
 * getBadgePaceEstimate — ประเมิน "กี่วันถึงจะได้รับ" badge จากอัตราย้อนหลัง 30 วัน
 *
 * ทำไม window 30 วัน: สั้นพอที่จะ reflect พฤติกรรมล่าสุด ยาวพอมี data ในช่วง active
 *
 * countable types: ORDER_COUNT/FIRST_ORDER/ZERO_COMPLAINT (นับ order ใน shop) /
 *   UNIQUE_REVIEWERS (distinct reviewer)
 * non-countable types: VETERAN/HIGH_RATING/PERFECT_RATING/FAST_SHIPPING/
 *   FULL_VERIFICATION/SIGNUP_YEAR → reason=non_countable
 *
 * ถ้า badge.earned → reason='earned', nulls
 */
export async function getBadgePaceEstimate(
  userId: string,
  badge: BadgeProgress,
): Promise<BadgePaceEstimate> {
  if (badge.earned) return { estimateDays: null, ratePerDay: null, reason: 'earned' }

  const criteria = parseCriteria(badge.badge.criteria)
  if (!criteria) return { estimateDays: null, ratePerDay: null, reason: 'non_countable' }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  switch (criteria.type) {
    case 'FIRST_ORDER':
    case 'ORDER_COUNT':
    case 'ZERO_COMPLAINT': {
      const shop = await getShopForUser(userId)
      if (!shop) return { estimateDays: null, ratePerDay: null, reason: 'no_data' }
      const statuses = resolveStatuses(criteria)
      // นับ order CONFIRMED ใน 30 วันล่าสุด — ใช้ updatedAt เพราะ order complete เมื่อ status update
      const recentCount = await prisma.order.count({
        where: {
          shopId: shop.id,
          status: { in: statuses },
          updatedAt: { gte: thirtyDaysAgo },
        },
      })
      const ratePerDay = recentCount / 30

      // คำนวณ remaining จาก progressRatio
      let threshold = 1
      if (criteria.type === 'ORDER_COUNT') threshold = criteria.count
      else if (criteria.type === 'ZERO_COMPLAINT') threshold = criteria.minOrders

      const currentProgress = Math.round(badge.progressRatio * threshold)
      const remaining = Math.max(0, threshold - currentProgress)

      if (remaining === 0) return { estimateDays: null, ratePerDay, reason: 'no_data' }
      if (ratePerDay <= 0) return { estimateDays: null, ratePerDay: 0, reason: 'no_data' }

      const estimateDays = Math.ceil(remaining / ratePerDay)
      return { estimateDays, ratePerDay, reason: 'estimated' }
    }

    case 'UNIQUE_REVIEWERS': {
      const shop = await getShopForUser(userId)
      if (!shop) return { estimateDays: null, ratePerDay: null, reason: 'no_data' }
      // distinct reviewer ใน 30 วันล่าสุด
      const recentRows = await prisma.review.findMany({
        where: {
          order: { shopId: shop.id },
          reviewerUserId: { not: null },
          createdAt: { gte: thirtyDaysAgo },
        },
        distinct: ['reviewerUserId'],
        select: { reviewerUserId: true },
      })
      const recentCount = recentRows.length
      const ratePerDay = recentCount / 30

      const threshold = criteria.count
      const currentProgress = Math.round(badge.progressRatio * threshold)
      const remaining = Math.max(0, threshold - currentProgress)

      if (remaining === 0) return { estimateDays: null, ratePerDay, reason: 'no_data' }
      if (ratePerDay <= 0) return { estimateDays: null, ratePerDay: 0, reason: 'no_data' }

      const estimateDays = Math.ceil(remaining / ratePerDay)
      return { estimateDays, ratePerDay, reason: 'estimated' }
    }

    case 'VETERAN':
    case 'HIGH_RATING':
    case 'PERFECT_RATING':
    case 'FAST_SHIPPING':
    case 'FULL_VERIFICATION':
    case 'SIGNUP_YEAR':
      return { estimateDays: null, ratePerDay: null, reason: 'non_countable' }

    default:
      return { estimateDays: null, ratePerDay: null, reason: 'non_countable' }
  }
}
