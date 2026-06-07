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
// T5: ลบ shopName / avatarUrl / tierName ออก — ย้ายไปอยู่ใน layout (SellerMobileHeader) แล้ว
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
 * SHORTCUT_TILES — 8 tile ตาม design spec S-9
 * tile#5 Blacklist = href null + disabled (Phase 2 feature — 0 codebase ใน phase นี้)
 * tile#1 คำสั่งซื้อ = showBadge true (pending count badge)
 * short path ไม่มี /seller prefix ตาม Paces routing convention
 */
export const SHORTCUT_TILES: ShortcutTile[] = [
  // กลุ่มงานหลัก (core ops) = น้ำเงิน
  { label: 'คำสั่งซื้อ', href: '/orders',   icon: 'shopping-cart', color: 'blue',    showBadge: true  },
  { label: 'สินค้า',     href: '/products',  icon: 'package',       color: 'blue'                     },
  { label: 'รีวิว',      href: '/reviews',   icon: 'star',          color: 'amber'                    },
  // กลุ่มเงิน = เขียว
  { label: 'เติมเงิน',  href: '/wallet',    icon: 'wallet',        color: 'emerald'                  },
  // utility = เทา (disabled)
  { label: 'เช็ก Blacklist', href: null,    icon: 'shield-x',      color: 'slate',   disabled: true   },
  // กลุ่ม engagement = เหลืองอำพัน
  { label: 'ความสำเร็จ', href: '/badges',   icon: 'trophy',        color: 'amber'                    },
  // กลุ่มงานหลัก (core ops) = น้ำเงิน
  { label: 'ลูกค้า',    href: '/customers', icon: 'users',         color: 'blue'                     },
  // utility = เทา
  { label: 'ตั้งค่า',   href: '/shop',      icon: 'settings',      color: 'slate'                    },
]

/**
 * PROMO_BANNER — default null (ซ่อน banner จนกว่า Phase 2 มี Promo model)
 * Phase 2: เปลี่ยนเป็น fetch จาก DB แทน hardcode
 */
export const PROMO_BANNER: PromoBanner | null = null
