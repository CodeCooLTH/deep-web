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
  bestSellers?: { id: string; name: string; price: number; image: string | null }[]
  // Sales Chart (feature Quick Create + Sales Chart) — ยอดขายรายวัน (เดือนปัจจุบัน) สำหรับการ์ด mini + full sheet
  // null/undefined = fetch ล้ม → SalesChartCard ซ่อนตัวเอง (honest-hide ไม่ใช่ error state บน command center)
  salesSeries?: SalesSeries | null
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
  /** ยอดรวมทั้งช่วง */
  total: number
  /** ยอดรวมช่วงก่อนหน้า (เดือนก่อน / ปีก่อน) — ใช้คำนวณ %เทียบ */
  prevTotal: number
  /** index ตั้งแต่นี้ไป = อนาคต (เกินวันนี้/เดือนนี้) → UI ทำแท่งจาง */
  futureFromIndex: number
}

// ─── ShortcutTile ────────────────────────────────────────────────────────────
export type ShortcutTile = {
  label: string
  href: string | null
  icon: string
  color: string
  disabled?: boolean
  showBadge?: boolean
  // D#13: จำนวนที่แสดงบน badge (เช่น live auction count) — undefined/0 = ไม่แสดง badge
  badgeCount?: number
}

/**
 * SHORTCUT_TILES — v10 carousel (4×2/หน้า = สูงสุด 8/หน้า; เกินขึ้นหน้าใหม่ + dots)
 * icon: **Solar Duotone name (ไม่มี prefix `solar:`)** — CarouselGrid เติม `solar:` เอง
 *   → render: <Icon icon={`solar:${tile.icon}`} /> from '@iconify/react'
 * D#13: tile ประมูลใช้ icon เต็ม prefix (`tabler:gavel`) — CarouselGrid เช็ค `.includes(':')`
 *   ก่อนเติม `solar:` (backward-compat กับ 7 tile เดิมที่ไม่มี prefix)
 * semantic color ตาม Paces token: warning/success/info/primary/default
 * ไม่มี /seller prefix (short path). คูปอง = route ยังไม่มี → disabled "เร็ว ๆ นี้" (honest, OOS coupons)
 */
export const SHORTCUT_TILES: ShortcutTile[] = [
  { label: 'รายงาน',     href: '/sales',     icon: 'chart-2-bold-duotone',               color: 'primary' },
  { label: 'รีวิว',       href: '/reviews',   icon: 'star-bold-duotone',                  color: 'warning' },
  { label: 'ความสำเร็จ',  href: '/badges',    icon: 'cup-star-bold-duotone',              color: 'success' },
  { label: 'สินค้า',      href: '/products',  icon: 'box-bold-duotone',                   color: 'info'    },
  { label: 'ลูกค้า',      href: '/customers', icon: 'users-group-rounded-bold-duotone',   color: 'primary' },
  { label: 'คูปอง',       href: null,         icon: 'ticket-bold-duotone',                color: 'default', disabled: true },
  { label: 'ตั้งค่า',     href: '/settings',  icon: 'settings-bold-duotone',              color: 'default' },
  // D#13: ประมูล — icon เต็ม prefix tabler (ไม่ใช่ solar) + badge จำนวน live auction
  { label: 'ประมูล',     href: '/auctions',  icon: 'tabler:gavel',                       color: 'warning', showBadge: true },
]

/**
 * PROMO_BANNER — default null (ซ่อน banner จนกว่า Phase 2 มี Promo model)
 * Phase 2: เปลี่ยนเป็น fetch จาก DB แทน hardcode
 */
export const PROMO_BANNER: PromoBanner | null = null
