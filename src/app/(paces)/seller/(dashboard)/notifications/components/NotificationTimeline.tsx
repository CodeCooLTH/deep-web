'use client'

/**
 * NotificationTimeline — STUB รอ T10 rewrite
 *
 * stub นี้สร้างโดย T9 เพื่อให้ tsc ผ่านก่อนที่ T10 จะ implement จริง
 * T10: rewrite file นี้ทั้งหมด — render list จาก notifications prop พร้อม
 *      group ตาม daysAgo, icon node, badge chip, unread indicator, link href
 *
 * Base: theme/paces/Admin/TS/src/layouts/components/TopBar/components/NotificationDropdownPeople.tsx
 *       (notification item row pattern — icon circle + text + timestamp)
 */

import type { Notification } from './notification-data'

type Props = {
  notifications: Notification[]
}

export default function NotificationTimeline({ notifications }: Props) {
  // placeholder — T10 จะ implement UI เต็มรูปแบบ
  return <div data-testid="notification-timeline-stub" className="hidden">{notifications.length}</div>
}
