/**
 * /notifications — หน้าการแจ้งเตือนทั้งหมด (seller)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/crm/activities/page.tsx
 *       (page shell: container-fluid + card wrapper)
 *       theme/paces/Admin/TS/src/layouts/components/TopBar/components/NotificationDropdownPeople.tsx
 *       (unread tint concept)
 *
 * T8 (S-9): เปลี่ยนจาก MOCK_NOTIFICATIONS + NotificationTimeline → real data จาก getRecentActivity
 * 00086 FR-020: รวมแจ้งเตือน (Notification) ที่ผูกร้านที่ active ของผู้ดูเข้ามาด้วย — getSellerNotificationFeed
 *
 * NOTE: NotificationTimeline.tsx + notification-data.ts ยังคงไว้ (deprecate in-place)
 *       ลบ Phase 2 OOS-5 — ห้ามลบในงานนี้
 */

import { shouldShowMoneyStatus } from '@/lib/app-shell-server'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { moneyLevel, rolesFromMembership } from '@/lib/shop-permissions'
import { dashboardMoney } from '@/lib/dashboard-money'
import { getSellerNotificationFeed, type SellerFeedItem } from '@/services/seller-notification-feed.service'
import NotificationFeed from './components/NotificationFeed'

export const metadata: Metadata = { title: 'การแจ้งเตือน' }

// sticky SellerMobileHeader แสดง "การแจ้งเตือน" แล้ว (getSellerPageTitle EXTRA map)
// → ไม่ต้องมี PageBreadcrumb / card-header ซ้ำ (premium: หัวข้อเดียว)
export default async function NotificationsPage() {
  // ── auth guard ──────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions)
  const userId = (session as { user?: { id?: string } } | null)?.user?.id

  if (!userId) {
    redirect('/auth/sign-in')
  }

  // ── resolve active shop.id (Personal หรือ Business ตาม session.activeShopId) ─────
  let items: SellerFeedItem[] = []
  let shopId: string | null = null

  try {
    const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
    const shop = active?.shop ?? null

    if (shop?.id) {
      // ครอบ try/catch แยก — getRecentActivity มี try/catch ใน service อยู่แล้ว
      // แต่ wrap อีกชั้นเพื่อกัน crash ถ้า service throw ในอนาคต
      // 00071: รายการ "เติมเงิน ฿X" คือข้อมูลกระเป๋า ⇒ เจ้าของเท่านั้น (ซ้อนกับเงื่อนไขแอป Android เดิม)
      const canSeeTopups = dashboardMoney(active ? moneyLevel(rolesFromMembership(active.role, active.roles)) : 'NONE').topups
      shopId = shop.id
      items = await getSellerNotificationFeed({
        userId,
        shopId: shop.id,
        take: 20,
        includeTopups: canSeeTopups && (await shouldShowMoneyStatus()),
        vertical: shop.vertical,
      })
    }
    // ไม่มี shop → items = [] → NotificationFeed แสดง empty state
  } catch {
    // ไม่ crash page — empty state แสดงแทน
    items = []
  }

  return (
    <div className="container-fluid">
      <div className="card">
        <div className="card-body p-0">
          <NotificationFeed items={items} shopId={shopId} />
        </div>
      </div>
    </div>
  )
}
