/**
 * /notifications — หน้าการแจ้งเตือนทั้งหมด (seller)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/notifications/page.tsx
 *       (page shell: PageBreadcrumb + container-fluid + card wrapper)
 *       item row pattern จาก:
 *       theme/paces/Admin/TS/src/layouts/components/TopBar/components/NotificationDropdownPeople.tsx
 *
 * route อยู่ใต้ (dashboard) layout — seller auth guard + bottom nav + topbar
 * ครอบ S-9 (T9): RSC route + mock data + type Notification frozen
 * ข้อมูล real Phase 2 (OOS-1)
 */

import type { Metadata } from 'next'
import { MOCK_NOTIFICATIONS } from './components/notification-data'
import NotificationTimeline from './components/NotificationTimeline'

export const metadata: Metadata = { title: 'การแจ้งเตือน' }

// sticky SellerMobileHeader แสดง "การแจ้งเตือน" แล้ว (getSellerPageTitle EXTRA map)
// → ไม่ต้องมี PageBreadcrumb / card-header ซ้ำ (premium: หัวข้อเดียว)
export default function NotificationsPage() {
  return (
    <div className="container-fluid">
      <div className="card">
        <div className="card-body p-0">
          <NotificationTimeline notifications={MOCK_NOTIFICATIONS} />
        </div>
      </div>
    </div>
  )
}
