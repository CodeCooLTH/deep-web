/**
 * Command Center — type definitions + static constants
 *
 * ทำไม: freeze types ก่อน T2-T8 เริ่ม เพื่อให้ทุก component อ้างอิง contract เดียวกัน
 * (shared-contract rule — planner §4 T1 note)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx
 */

// ─── ActivityItem ────────────────────────────────────────────────────────────
// T6 re-home: type ย้ายไปอยู่ที่ src/services/activity.service.ts แล้ว
// import มาใช้ใน CommandCenterData + re-export เพื่อ backward compat กับ component ที่ import จาก _constants
// ไม่ circular: _constants ไม่ถูก import โดย activity.service → OK
import type { ActivityItem } from '@/services/activity.service'
export type { ActivityItem }

// ─── Business Package (แถบแพ็กเกจร้านค้าบนมือถือ — Row 3 ของ CompactHero) ────
// import type จาก lib/business-package (pure module, client-safe) — ไม่ใช่ tierName (trust tier คนละเรื่อง)
import type { BusinessPackageStatusApp, BusinessPackageTier } from '@/lib/business-package'
export type { BusinessPackageStatusApp, BusinessPackageTier }

// ─── PromoBanner ─────────────────────────────────────────────────────────────
// Phase 2: Promo model + admin CRUD + dynamic banner ค่อยเพิ่ม
export type PromoBanner = {
  icon: string
  label: string
  body: string
  href?: string
}

// ─── CommandCenterData ───────────────────────────────────────────────────────
// contract ที่ page.tsx ส่งให้ CommandCenter RSC
// v8: เพิ่ม field optional สำหรับ header card + wallet
// optional (?) กัน downstream tsc break ก่อน component ใหม่รับ field ทัน
export type CommandCenterData = {
  pendingOrderCount: number
  orderStatusCounts: {
    PENDING: number
    SHIPPED: number
    CONFIRMED: number
    CANCELLED: number
  }

  /**
   * ตัวนับ "ของอยู่ไหน" — มีเฉพาะร้าน ONLINE_SALES (user สั่ง 2026-08-04); vertical อื่นเป็น
   * undefined แล้วการ์ดตกกลับไปใช้ orderStatusCounts ชุดเดิม (บ้านพัก/คิวงานไม่มีพัสดุให้ไล่)
   */
  shippingStageCounts?: {
    AWAITING_PARCEL: number
    AWAITING_PICKUP: number
    SHIPPING: number
    AWAITING_CLOSE: number
    PROBLEM: number
  }
  recentActivity: ActivityItem[]
  promoBanner: PromoBanner | null
  // v8: ข้อมูลเพิ่มสำหรับ header + wallet
  walletBalance?: number
  shopName?: string
  tierName?: string
  trustScore?: number
  avatarUrl?: string | null
  // v10: compact hero — shop link + stats row (orders/reviews/rating)
  // optional (?) กัน downstream tsc break ก่อน page.tsx (T7) wire field จริง
  shopSlug?: string | null
  orderCount?: number
  reviewCount?: number
  avgRating?: number
  // D#13: จำนวน auction ที่กำลัง live ของร้าน — map เป็น badgeCount ของ tile ประมูล
  // optional กัน tsc break ถ้า caller ยังไม่ wire (fallback undefined = ไม่แสดง badge)
  liveAuctionCount?: number
  // สินค้าขายดี (feature Quick Create) — strip บน command center จิ้ม→/orders/new?product=
  bestSellers?: { id: string; name: string; price: number; image: string | null; soldCount: number }[]
  // Sales Chart (feature Quick Create + Sales Chart) — ยอดขายรายวัน (เดือนปัจจุบัน) สำหรับการ์ด mini + full sheet
  // null/undefined = fetch ล้ม → SalesChartCard ซ่อนตัวเอง (honest-hide ไม่ใช่ error state บน command center)
  salesSeries?: SalesSeries | null
  // แถบแพ็กเกจร้านค้าบนมือถือ (Row 3 ของ CompactHero) — ตั้งชื่อ packageStatus/packageTier
  // (ไม่ใช่ tier/tierLabel เปล่า ๆ) กันชนกับ tierName (trust tier ด้านบน — คนละเรื่อง)
  // มิเรอร์ businessPackageStatus/businessPackageTier ใน (dashboard)/layout.tsx
  packageStatus?: BusinessPackageStatusApp
  packageTier?: BusinessPackageTier | null
  // canManage: เฉพาะ OWNER ที่กดไปหน้าจัดการแพ็กเกจได้ (คนอื่นเห็นข้อมูลแต่ไม่มีลิงก์)
  packageCanManage?: boolean
  // เมนูลัด (feature 00027) — ช่องที่ผู้ใช้คนนี้เลือกไว้จริง เรียงตามลำดับเมนู sidebar
  // undefined = ไม่ผ่าน gate ร้าน (ไม่มีร้าน/session หลุด) → CommandCenter ซ่อนการ์ดทั้งใบ
  shortcutTiles?: ShortcutCatalogItemDto[]
}

// ─── SalesSeries (Sales Chart) ───────────────────────────────────────────────
// ประกาศ type ซ้ำ local แทน import จาก src/services/dashboard.service.ts — กัน service code
// (prisma import ฯลฯ) หลุดเข้า client bundle (CommandCenter.tsx/SalesChartCard.tsx เป็น 'use client')
// shape ต้องตรงกับ SalesSeries ใน dashboard.service.ts เสมอ (SSOT ฝั่ง service — ที่นี่แค่ mirror)
export type SalesSeries = {
  /** label แกน x — daily: "1".."N"; monthly: "ม.ค.".."ธ.ค." */
  labels: string[]
  /** ยอดขายรวมต่อ bucket (บาท) — ยาวเท่า labels */
  values: number[]
  /** ยอดขายส่วนที่ buyer ยืนยันแล้ว (status CONFIRMED) ต่อ bucket — ใช้แท่งสี stacked */
  confirmedValues: number[]
  /** ยอดขายส่วนที่ยังไม่ยืนยัน (PENDING/SHIPPED) ต่อ bucket — ใช้แท่งสี stacked */
  unconfirmedValues: number[]
  /** ยอดรวมทั้งช่วง */
  total: number
  /** ยอดรวมช่วงก่อนหน้า (เดือนก่อน / ปีก่อน) — ใช้คำนวณ %เทียบ */
  prevTotal: number
  /** index ตั้งแต่นี้ไป = อนาคต (เกินวันนี้/เดือนนี้) → UI ทำแท่งจาง */
  futureFromIndex: number
  /* ค่าใช้จ่าย (feature 00016) — undefined = ร้านนี้ไม่ผ่าน gate สิทธิ์ค่าใช้จ่าย
     UI ต้องซ่อนทั้งบล็อก ไม่ใช่แสดง ฿0 ซึ่งจะโกหกว่า "ไม่มีค่าใช้จ่าย" */
  expenseValues?: number[]
  netProfitValues?: number[]
  totalExpense?: number
  netProfit?: number
}

// ─── Shortcut (feature 00027 — เมนูลัดที่ผู้ใช้ตั้งเอง) ──────────────────────
// mirror ของ type ใน src/services/shortcut.service.ts — ประกาศซ้ำที่นี่แทน import
// เพราะ CommandCenter/CarouselGrid/ShortcutEditSheet เป็น 'use client' การ import จาก service
// จะลาก prisma เข้า client bundle (pattern เดียวกับ SalesSeries ด้านบน)
// shape ต้องตรงกับฝั่ง service เสมอ — SSOT อยู่ที่ service ที่นี่แค่มิเรอร์

export type ShortcutCatalogItemDto = {
  slug: string
  label: string
  icon: string
  url: string
  pinned: boolean
}

export type ShortcutStateDto = {
  catalog: ShortcutCatalogItemDto[]
  pinnedSlugs: string[]
  unavailable: { slug: string; label: string }[]
  tiles: ShortcutCatalogItemDto[]
  isDefault: boolean
  max: number
}

/**
 * PROMO_BANNER — default null (ซ่อน banner จนกว่า Phase 2 มี Promo model)
 * Phase 2: เปลี่ยนเป็น fetch จาก DB แทน hardcode
 */
export const PROMO_BANNER: PromoBanner | null = null
