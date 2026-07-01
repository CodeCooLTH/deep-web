/**
 * badge.ts — discriminated union สำหรับ criteria JSON ที่ seed ไว้ใน DB
 *
 * ทำไม: badge engine เวอร์ชันเก่า hardcode check fn ไว้ใน badge.service.ts
 * ตอนนี้ย้ายมาใช้ dispatch-on-criteria.type แทน ต้องมี type-safe union ที่
 * match field ชื่อเดียวกับ seed.ts + criteriaToText() ใน dashboard/page.tsx
 * ทุก string literal ต้องตรง 100% — ห้ามเปลี่ยน
 */

// ─── Criteria discriminated union (ตรงกับ seed.ts ทุก field) ────────────────

export type CriteriaFirstOrder = { type: 'FIRST_ORDER' }

export type CriteriaOrderCount = { type: 'ORDER_COUNT'; count: number }

export type CriteriaPerfectRating = { type: 'PERFECT_RATING'; minReviews: number }

export type CriteriaHighRating = {
  type: 'HIGH_RATING'
  minRating: number
  minReviews: number
}

export type CriteriaZeroComplaint = { type: 'ZERO_COMPLAINT'; minOrders: number }

/** minDays ตั้งแต่ user.createdAt; optional statuses สำหรับ recent-order check */
export type CriteriaVeteran = {
  type: 'VETERAN'
  minDays: number
  statuses?: string[]
}

export type CriteriaFastShipping = {
  type: 'FAST_SHIPPING'
  maxHours: number
  minOrders: number
  statuses?: string[]
}

export type CriteriaFullVerification = { type: 'FULL_VERIFICATION' }

export type CriteriaUniqueReviewers = { type: 'UNIQUE_REVIEWERS'; count: number }

export type CriteriaSignupYear = { type: 'SIGNUP_YEAR'; year: number }

// ─── Auction achievement criteria (feature 00002 — Seller Auction, BRD §11) ──
// field ตรงกับ DATABASE.md §6.1 / SDS.md §5.1 — ห้ามเปลี่ยนชื่อ field

/** seller: จำนวน Auction ที่ host แล้ว (status NOT IN [draft,cancelled]) */
export type CriteriaAuctionHosted = { type: 'AUCTION_HOSTED'; count: number }

/** seller: จำนวน Auction ที่ขายได้ (status='ended') */
export type CriteriaAuctionSold = { type: 'AUCTION_SOLD'; count: number }

/** seller: มี Auction อย่างน้อย 1 ใบที่ bidCount >= minBidCount (Phase 2) */
export type CriteriaAuctionHighBidCount = { type: 'AUCTION_HIGH_BID_COUNT'; minBidCount: number }

/** buyer: จำนวน Bid ที่วางทั้งหมด (รวมที่แพ้) */
export type CriteriaAuctionBidCount = { type: 'AUCTION_BID_COUNT'; count: number }

/** buyer: จำนวน Order ที่ชนะประมูล (Order.auctionId ไม่เป็น null) */
export type CriteriaAuctionWon = { type: 'AUCTION_WON'; count: number }

/** buyer: จำนวน Order ที่ชนะประมูล + สถานะ terminal แล้ว (default CONFIRMED, override ได้ผ่าน statuses) — Phase 2 */
export type CriteriaAuctionWonCompleted = {
  type: 'AUCTION_WON_COMPLETED'
  count: number
  statuses?: string[]
}

/** Union ครอบทุก criteria type ที่ seed ไว้ใน DB */
export type BadgeCriteria =
  | CriteriaFirstOrder
  | CriteriaOrderCount
  | CriteriaPerfectRating
  | CriteriaHighRating
  | CriteriaZeroComplaint
  | CriteriaVeteran
  | CriteriaFastShipping
  | CriteriaFullVerification
  | CriteriaUniqueReviewers
  | CriteriaSignupYear
  | CriteriaAuctionHosted
  | CriteriaAuctionSold
  | CriteriaAuctionHighBidCount
  | CriteriaAuctionBidCount
  | CriteriaAuctionWon
  | CriteriaAuctionWonCompleted

// ─── Progress / result types ─────────────────────────────────────────────────

/**
 * ข้อมูล progress ของ badge หนึ่งใบสำหรับ user คนหนึ่ง
 * ใช้แสดงใน Badge Process pages (Batch 3)
 */
export interface BadgeProgress {
  /** Badge row จาก DB (criteria เป็น unknown; parse เองใน service) */
  badge: {
    id: string
    name: string
    nameEN: string
    icon: string | null
    /** URL รูป badge (bundled /badges/... หรือ /api/files/... ที่ admin อัปโหลด); null = ใช้ icon/lucide fallback */
    imageUrl: string | null
    type: string
    audience: string
    criteria: unknown
  }
  earned: boolean
  /**
   * ข้อความ Thai แสดง progress เช่น "อีก 47 ออเดอร์" หรือ "ยืนยันตัวตนครบแล้ว"
   * null ถ้า badge ประเภท boolean และยังไม่ได้รับ + ไม่มี progress ที่แสดงได้
   */
  progressLabel: string | null
  /**
   * 0–1 ratio สำหรับ progress bar; 0 = ยังไม่เริ่ม, 1 = ครบแล้ว
   * badge boolean (FULL_VERIFICATION, SIGNUP_YEAR) → 0 หรือ 1 เท่านั้น
   */
  progressRatio: number
}


