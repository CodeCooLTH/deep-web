/**
 * Command Center — type definitions + static constants
 *
 * ทำไม: freeze types ก่อน T2-T8 เริ่ม เพื่อให้ทุก component อ้างอิง contract เดียวกัน
 * (shared-contract rule — planner §4 T1 note)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx
 */

// ─── ActivityItem ────────────────────────────────────────────────────────────
// NOTE: type นี้เป็น temporary single source ใน T1
// T6 จะสร้าง src/services/activity.service.ts และ re-home type ไปที่นั่น
// ตอนนั้นให้ import ActivityItem จาก activity.service แทน และลบออกจากที่นี่
export type ActivityItem = {
  type: 'ORDER_CREATED' | 'ORDER_CONFIRMED' | 'SMS_SENT' | 'REVIEW_RECEIVED' | 'TOPUP'
  label: string
  at: Date
  href?: string
}

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
export type CommandCenterData = {
  shopName: string
  avatarUrl: string | null
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
  { label: 'คำสั่งซื้อ', href: '/orders',   icon: 'shopping-cart', color: 'blue',   showBadge: true  },
  { label: 'สินค้า',     href: '/products',  icon: 'package',       color: 'indigo'                   },
  { label: 'รีวิว',      href: '/reviews',   icon: 'star',          color: 'yellow'                   },
  { label: 'เติมเงิน',  href: '/wallet',    icon: 'wallet',        color: 'emerald'                  },
  { label: 'เช็ก Blacklist', href: null,    icon: 'shield-x',      color: 'rose',   disabled: true    },
  { label: 'ความสำเร็จ', href: '/badges',   icon: 'trophy',        color: 'amber'                    },
  { label: 'ลูกค้า',    href: '/customers', icon: 'users',         color: 'sky'                      },
  { label: 'ตั้งค่า',   href: '/shop',      icon: 'settings',      color: 'gray'                     },
]

/**
 * PROMO_BANNER — default null (ซ่อน banner จนกว่า Phase 2 มี Promo model)
 * Phase 2: เปลี่ยนเป็น fetch จาก DB แทน hardcode
 */
export const PROMO_BANNER: PromoBanner | null = null
