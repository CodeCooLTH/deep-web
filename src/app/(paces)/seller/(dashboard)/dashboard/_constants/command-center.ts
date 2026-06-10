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
}

// ─── ShortcutTile ────────────────────────────────────────────────────────────
export type ShortcutTile = {
  label: string
  href: string | null
  icon: string
  color: string
  disabled?: boolean
  showBadge?: boolean
}

/**
 * SHORTCUT_TILES — 8 tiles v8 (grid-cols-4 = 2 แถวละ 4)
 * semantic color ตาม Paces token: warning/success/info/primary/default
 * ไม่มี Blacklist/disabled (OOS Phase 2) — ทุก tile เป็น link ปกติ
 * ไม่มี /seller prefix ตาม Paces routing convention (short path)
 * color: free string รับ semantic key → ShortcutGrid map เป็น Paces class
 */
export const SHORTCUT_TILES: ShortcutTile[] = [
  { label: 'รีวิว',       href: '/reviews',      icon: 'star',           color: 'warning' },
  { label: 'เติมเงิน',     href: '/wallet',       icon: 'wallet',         color: 'success' },
  { label: 'ลูกค้า',       href: '/customers',    icon: 'users',          color: 'info'    },
  { label: 'สินค้า',       href: '/products',     icon: 'box',            color: 'primary' },
  { label: 'ความสำเร็จ',   href: '/badges',       icon: 'trophy',         color: 'warning' },
  { label: 'หมวดหมู่',     href: '/categories',   icon: 'category',       color: 'info'    },
  { label: 'การยืนยัน',    href: '/verification', icon: 'shield-check',   color: 'primary' },
  { label: 'ตั้งค่าร้าน',  href: '/shop',         icon: 'building-store', color: 'default' },
]

/**
 * PROMO_BANNER — default null (ซ่อน banner จนกว่า Phase 2 มี Promo model)
 * Phase 2: เปลี่ยนเป็น fetch จาก DB แทน hardcode
 */
export const PROMO_BANNER: PromoBanner | null = null
