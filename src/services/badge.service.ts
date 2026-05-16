/**
 * badge.service.ts — data-driven badge engine (Achievements Phase 4 Batch 1 Unit B)
 *
 * ทำไม rewrite:
 *   เวอร์ชันเก่า hardcode DEFAULT_BADGES + BADGE_CHECKS อยู่ที่นี่ → single source
 *   of truth แยกกัน 2 แห่ง (service + seed.ts). เวอร์ชันใหม่ดึง Badge ทุกแถวจาก DB
 *   แล้ว dispatch ตาม criteria.type ทำให้ seed.ts เป็น source เดียว.
 *
 * Known Gap #5 (OMS redesign): order status 'COMPLETED' hardcode เป็น module const
 *   DEFAULT_TERMINAL_STATUSES — handler ใดที่ต้องนับ completed order ใช้ค่านี้
 *   เป็น default, แต่ถ้า badge row มี criteria.statuses[] ก็ override ได้.
 *   เมื่อ OMS ออกแบบใหม่ให้เปลี่ยนที่ const นี้ที่เดียว ไม่ต้องแตะ handler ทุกตัว.
 */

import { prisma } from "@/lib/prisma"
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
const DEFAULT_TERMINAL_STATUSES = ['COMPLETED']

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

export async function checkPerfectRating(
  userId: string,
  criteria: CriteriaPerfectRating,
): Promise<{ met: boolean; reviewCount: number; avg: number }> {
  const shop = await getShopForUser(userId)
  if (!shop) return { met: false, reviewCount: 0, avg: 0 }
  const reviews = await prisma.review.findMany({
    where: { order: { shopId: shop.id } },
    select: { rating: true },
  })
  const reviewCount = reviews.length
  if (reviewCount < criteria.minReviews) return { met: false, reviewCount, avg: 0 }
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
  return { met: avg === 5.0, reviewCount, avg }
}

export async function checkHighRating(
  userId: string,
  criteria: CriteriaHighRating,
): Promise<{ met: boolean; reviewCount: number; avg: number }> {
  const shop = await getShopForUser(userId)
  if (!shop) return { met: false, reviewCount: 0, avg: 0 }
  const reviews = await prisma.review.findMany({
    where: { order: { shopId: shop.id } },
    select: { rating: true },
  })
  const reviewCount = reviews.length
  if (reviewCount < criteria.minReviews) return { met: false, reviewCount, avg: 0 }
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
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
  const cancelled = await prisma.order.count({ where: { shopId: shop.id, status: 'CANCELLED' } })
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

export async function checkFastShipping(
  userId: string,
  criteria: CriteriaFastShipping,
  statuses: string[] = DEFAULT_TERMINAL_STATUSES,
): Promise<{ met: boolean; orderCount: number; avgHours: number }> {
  const shop = await getShopForUser(userId)
  if (!shop) return { met: false, orderCount: 0, avgHours: 0 }

  const ordersWithShipment = await prisma.order.findMany({
    where: { shopId: shop.id, status: { in: statuses }, shipmentTracking: { isNot: null } },
    include: { shipmentTracking: true },
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

export async function checkUniqueReviewers(
  userId: string,
  criteria: CriteriaUniqueReviewers,
): Promise<{ met: boolean; uniqueCount: number }> {
  const shop = await getShopForUser(userId)
  if (!shop) return { met: false, uniqueCount: 0 }
  const reviews = await prisma.review.findMany({
    where: { order: { shopId: shop.id }, reviewerUserId: { not: null } },
    select: { reviewerUserId: true },
  })
  const uniqueCount = new Set(reviews.map((r) => r.reviewerUserId)).size
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
    const statuses = (criteria as { statuses?: string[] }).statuses ?? DEFAULT_TERMINAL_STATUSES

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
    const statuses = (criteria as { statuses?: string[] } | null)?.statuses ?? DEFAULT_TERMINAL_STATUSES

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
          const { count } = await checkOrderCount(userId, criteria, statuses)
          progressRatio = Math.min(count / criteria.count, 1)
          if (!earned) {
            const remaining = criteria.count - count
            progressLabel = remaining > 0 ? `อีก ${remaining} ออเดอร์` : `ครบ ${criteria.count} ออเดอร์แล้ว`
          }
          break
        }
        case 'PERFECT_RATING': {
          const { reviewCount, avg } = await checkPerfectRating(userId, criteria)
          progressRatio = Math.min(reviewCount / criteria.minReviews, 1)
          if (!earned) {
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
          const { reviewCount, avg } = await checkHighRating(userId, criteria)
          progressRatio = Math.min(reviewCount / criteria.minReviews, 1)
          if (!earned) {
            if (reviewCount < criteria.minReviews) {
              progressLabel = `อีก ${criteria.minReviews - reviewCount} รีวิว`
            } else {
              progressLabel = `เรตติ้งปัจจุบัน ${avg.toFixed(2)} (ต้องการ ≥${criteria.minRating})`
            }
          }
          break
        }
        case 'ZERO_COMPLAINT': {
          const { completed, cancelled } = await checkZeroComplaint(userId, criteria, statuses)
          progressRatio = Math.min(completed / criteria.minOrders, 1)
          if (!earned) {
            if (completed < criteria.minOrders) {
              progressLabel = `อีก ${criteria.minOrders - completed} ออเดอร์`
            } else if (cancelled > 0) {
              progressLabel = `มี ${cancelled} ออเดอร์ที่ยกเลิก`
            }
          }
          break
        }
        case 'VETERAN': {
          const { daysOld } = await checkVeteran(userId, criteria, statuses)
          progressRatio = Math.min(daysOld / criteria.minDays, 1)
          if (!earned) {
            const remaining = Math.max(0, Math.ceil(criteria.minDays - daysOld))
            progressLabel = remaining > 0 ? `อีก ${remaining} วัน` : 'ครบวันแล้ว (ต้องมีออเดอร์ล่าสุด)'
          }
          break
        }
        case 'FAST_SHIPPING': {
          const { orderCount, avgHours } = await checkFastShipping(userId, criteria, statuses)
          progressRatio = Math.min(orderCount / criteria.minOrders, 1)
          if (!earned) {
            if (orderCount < criteria.minOrders) {
              progressLabel = `อีก ${criteria.minOrders - orderCount} ออเดอร์ที่มีการจัดส่ง`
            } else {
              progressLabel = `เฉลี่ย ${avgHours.toFixed(1)} ชม. (ต้องการ ≤${criteria.maxHours} ชม.)`
            }
          }
          break
        }
        case 'FULL_VERIFICATION': {
          const { met } = await checkFullVerification(userId)
          progressRatio = met ? 1 : 0
          if (!earned) {
            progressLabel = met ? 'ยืนยันตัวตนครบแล้ว' : 'ยังยืนยันตัวตนไม่ครบ'
          }
          break
        }
        case 'UNIQUE_REVIEWERS': {
          const { uniqueCount } = await checkUniqueReviewers(userId, criteria)
          progressRatio = Math.min(uniqueCount / criteria.count, 1)
          if (!earned) {
            const remaining = criteria.count - uniqueCount
            progressLabel = remaining > 0 ? `อีก ${remaining} คน` : `ครบ ${criteria.count} คนแล้ว`
          }
          break
        }
        case 'SIGNUP_YEAR': {
          const { met } = await checkSignupYear(userId, criteria)
          progressRatio = met ? 1 : 0
          if (!earned) {
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
