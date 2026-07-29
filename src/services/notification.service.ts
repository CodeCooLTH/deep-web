import { prisma } from '@/lib/prisma'

// notification.service — web bell notification (buyer+seller, NextAuth session)
// อ่าน Notification table ตัวเดียวกับ mobile app (kind="chat_message"/"badge_earned")
// เขียนโดย chat.service + badge.service อยู่แล้ว — ไฟล์นี้แค่ "อ่าน" (list/count/mark-read)
// pattern cursor pagination ตาม getStockMovementHistory (inventory-stock.service.ts)
//
// kind ที่ซ่อนจากกระดิ่งเว็บ (user สั่ง 2026-07-29): "chat_message" ท่วมกระดิ่งจนใช้ไม่ได้
// (วัดจริงบน prod: 2,162 แถวในระบบเป็น chat_message 97.6% — ร้านหนึ่งมี unread 1,070 จาก 1,072)
// และ**ซ้ำซ้อน**อยู่แล้วกับตัวนับแชทที่มีแยกต่างหาก (seller: unreadChatCount → bottom nav/inbox,
// buyer: unread indicator ในหน้า /messages)
//
// เลือก "ซ่อนตอนอ่าน" ไม่ใช่ "หยุดเขียน"/"ลบทิ้ง" ตามที่ user ตัดสิน — DB ยังบันทึกครบเหมือนเดิม
// (กู้คืน/เปลี่ยนใจได้ทันทีแค่แก้ค่าคงที่ตัวนี้) และ **ไม่แตะ `/api/app/notifications`** (แอปมือถือ
// ผู้ซื้อ) ซึ่งอ่านตารางเดียวกันแต่ไม่มี surface แชทอื่นทดแทน — ถ้ากรองที่ service ชั้นล่างสุด
// แอปมือถือจะเงียบไปด้วยโดยไม่ตั้งใจ จึงกรองที่ฟังก์ชันของ "เว็บ" เท่านั้น
export const BELL_HIDDEN_KINDS = ['chat_message'] as const

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
      kind: { notIn: [...BELL_HIDDEN_KINDS] },
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
// ต้องกรอง BELL_HIDDEN_KINDS ให้ตรงกับ listNotifications เสมอ — ถ้ากรองแค่ list แต่ไม่กรอง count
// กระดิ่งจะขึ้น "849 ใหม่" ทั้งที่เปิดมาแล้วว่าง (สถานะที่ผู้ใช้เคลียร์ไม่ได้เลย)
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, read: false, kind: { notIn: [...BELL_HIDDEN_KINDS] } },
  })
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
// กรอง BELL_HIDDEN_KINDS ด้วย 2 เหตุผล: (1) ผู้ใช้ไม่เคยเห็นแถวพวกนั้นบนกระดิ่ง การกด "อ่านทั้งหมด"
// จึงไม่ควรกินความหมายไปถึงมัน (2) เลี่ยง UPDATE ก้อนใหญ่โดยไม่จำเป็น — บาง user มี chat_message
// ค้าง unread หลักพันแถว กดครั้งเดียวจะเขียนทั้งหมดบน prod DB ที่ dev/prod ใช้ร่วมกัน
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const res = await prisma.notification.updateMany({
    where: { userId, read: false, kind: { notIn: [...BELL_HIDDEN_KINDS] } },
    data: { read: true },
  })
  return res.count
}
