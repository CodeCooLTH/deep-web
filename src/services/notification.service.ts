import { prisma } from '@/lib/prisma'

// notification.service — web bell notification (buyer+seller, NextAuth session)
// อ่าน Notification table ตัวเดียวกับ mobile app (kind="chat_message"/"badge_earned")
// เขียนโดย chat.service + badge.service อยู่แล้ว — ไฟล์นี้แค่ "อ่าน" (list/count/mark-read)
// pattern cursor pagination ตาม getStockMovementHistory (inventory-stock.service.ts)

export type NotificationView = {
  id: string
  kind: string
  title: string
  body: string
  refId: string | null
  read: boolean
  createdAt: Date
}

// listNotifications — cursor pagination by createdAt desc, take+1 เพื่อรู้ nextCursor
// โดยไม่ต้อง COUNT แยก
export async function listNotifications(
  userId: string,
  opts: { cursor?: string; take?: number } = {},
): Promise<{ items: NotificationView[]; nextCursor: string | null }> {
  const take = opts.take ?? 20
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      ...(opts.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    select: {
      id: true, kind: true, title: true, body: true,
      refId: true, read: true, createdAt: true,
    },
  })
  const hasMore = rows.length > take
  const page = hasMore ? rows.slice(0, take) : rows
  return {
    items: page,
    nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
  }
}

// getUnreadNotificationCount — จำนวนแจ้งเตือนที่ยังไม่อ่านของ user (badge บนกระดิ่ง)
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } })
}

// markNotificationRead — updateMany + userId เงื่อนไข (ownership) กันแก้ของคนอื่น
export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<number> {
  const res = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true },
  })
  return res.count
}

// markAllNotificationsRead — mark ทั้งหมดของ user เป็นอ่านแล้ว (เช่นกดเปิด bell dropdown)
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const res = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  })
  return res.count
}
