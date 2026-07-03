/**
 * /notifications — หน้าการแจ้งเตือนทั้งหมด (seller)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/crm/activities/page.tsx
 *       (page shell: container-fluid + card wrapper)
 *       theme/paces/Admin/TS/src/layouts/components/TopBar/components/NotificationDropdownPeople.tsx
 *       (unread tint concept)
 *
 * T8 (S-9): เปลี่ยนจาก MOCK_NOTIFICATIONS + NotificationTimeline → real data จาก getRecentActivity
 *
 * NOTE: NotificationTimeline.tsx + notification-data.ts ยังคงไว้ (deprecate in-place)
 *       ลบ Phase 2 OOS-5 — ห้ามลบในงานนี้
 */

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { getRecentActivity } from '@/services/activity.service'
import type { ActivityItem } from '@/services/activity.service'
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
  let items: ActivityItem[] = []

  try {
    const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
    const shop = active?.shop ?? null

    if (shop?.id) {
      // ครอบ try/catch แยก — getRecentActivity มี try/catch ใน service อยู่แล้ว
      // แต่ wrap อีกชั้นเพื่อกัน crash ถ้า service throw ในอนาคต
      items = await getRecentActivity(shop.id, 20)
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
          <NotificationFeed items={items} />
        </div>
      </div>
    </div>
  )
}
