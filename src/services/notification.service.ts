import { prisma } from '@/lib/prisma'
import { SERVICE_JOB_NOTIFICATION_KINDS } from './service-job-notify.service'

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
  /** 00086: ร้านที่แจ้งเตือนนี้ผูกอยู่ (null = ระดับบัญชี) — กระดิ่งร้านใช้โชว์ชื่อร้าน/สลับร้านก่อนเปิด */
  shopId: string | null
  shopName: string | null
}

// select ร่วมของ NotificationView — ชื่อร้านอย่างเดียว ไม่ดึงข้อมูลร้านอื่นออกมา
const VIEW_SELECT = {
  id: true, kind: true, title: true, body: true,
  refId: true, read: true, createdAt: true, shopId: true,
  shop: { select: { shopName: true } },
} as const

type ViewRow = {
  id: string; kind: string; title: string; body: string; refId: string | null
  read: boolean; createdAt: Date; shopId: string | null; shop: { shopName: string } | null
}

function toView({ shop, ...r }: ViewRow): NotificationView {
  return { ...r, shopName: shop?.shopName ?? null }
}

// listNotifications — cursor pagination by createdAt desc, take+1 เพื่อรู้ nextCursor
// โดยไม่ต้อง COUNT แยก
// personalOnly (00086): กระดิ่งฝั่งผู้ซื้อ (โดเมนหลัก + /m) เห็นเฉพาะแจ้งเตือนส่วนตัว (shopId = null)
// — แจ้งเตือน "ของร้าน" (เช่น staff_expense) เป็นเรื่องงานร้าน ไม่ควรโผล่ในกระดิ่งตอนเจ้าของร้านใช้ฝั่งผู้ซื้อ

// ร้านที่ผู้ใช้ "เป็นเจ้าของอยู่ตอนนี้" (00086 MINOR-3) — Shop.userId (เจ้าของหลัก) หรือ ShopMember role OWNER
// แจ้งเตือนของร้าน (เช่น staff_expense) ส่งถึงเจ้าของ ณ ตอนนั้น · ถ้าภายหลังถูกลดเป็น ADMIN/ออกจากร้าน/โอนร้านไปแล้ว
// แถวเดิมยังอยู่ใน DB (userId ยังเป็นเขา) แต่ต้องไม่เห็นอีก — ข้อมูลเงินของร้านที่ตัวเองไม่ได้เป็นเจ้าของแล้ว
// เป็น relation filter ⇒ Postgres ทำเป็น EXISTS ในคำสั่งเดียวกัน (ไม่มี round-trip ดึงรายการร้านแยก)
const currentOwnerOf = (userId: string) => ({
  OR: [{ userId }, { members: { some: { userId, role: 'OWNER' } } }],
})

// แถวของร้านที่ผู้ใช้คนนี้ "มีสิทธิ์เห็นอยู่ตอนนี้" (00086 T11) — ผู้อ่านต้องตรงกับผู้รับตอนเขียนทุกตัว (read = write audience)
//  - ทุก kind: เจ้าของปัจจุบัน (currentOwnerOf)
//  - service_job_* เพิ่ม: ผู้ดูแลปัจจุบัน = ShopMember role ADMIN ที่ roles มี MANAGER — ตรงกับ serviceJobAudience
//    (service-job-notify.service) ตัวต่อตัว · ถูกถอด MANAGER/ออกจากร้านแล้ว = ไม่เห็นแถวเดิมอีก
//  - staff_expense (ข้อมูลเงิน) ยังเจ้าของเท่านั้น — ผู้ดูแลไม่ได้รับตอนเขียน จึงไม่ขยายตอนอ่าน
// relation filter ล้วน ⇒ EXISTS ในคำสั่งเดียว ไม่มี round-trip ดึงรายชื่อร้าน/บทบาทแยก
const visibleShopRow = (userId: string) => ({
  OR: [
    { shop: currentOwnerOf(userId) },
    {
      kind: { in: [...SERVICE_JOB_NOTIFICATION_KINDS] },
      shop: { members: { some: { userId, role: 'ADMIN', roles: { has: 'MANAGER' } } } },
    },
  ],
})

// ฝั่ง seller (ไม่ personalOnly): แถวส่วนตัว (shopId null) + แถวของร้านที่ยังมีสิทธิ์เห็นอยู่เท่านั้น
const bellScope = (userId: string, personalOnly?: boolean) =>
  personalOnly ? { shopId: null } : { OR: [{ shopId: null }, visibleShopRow(userId)] }

export async function listNotifications(
  userId: string,
  opts: { cursor?: string; take?: number; personalOnly?: boolean } = {},
): Promise<{ items: NotificationView[]; nextCursor: string | null }> {
  const take = opts.take ?? 20
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      kind: { notIn: [...BELL_HIDDEN_KINDS] },
      ...bellScope(userId, opts.personalOnly),
      ...(opts.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    select: VIEW_SELECT,
  })
  const hasMore = rows.length > take
  const page = (hasMore ? rows.slice(0, take) : rows).map(toView)
  return {
    items: page,
    nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
  }
}

// getUnreadNotificationCount — จำนวนแจ้งเตือนที่ยังไม่อ่านของ user (badge บนกระดิ่ง)
// ต้องกรอง BELL_HIDDEN_KINDS ให้ตรงกับ listNotifications เสมอ — ถ้ากรองแค่ list แต่ไม่กรอง count
// กระดิ่งจะขึ้น "849 ใหม่" ทั้งที่เปิดมาแล้วว่าง (สถานะที่ผู้ใช้เคลียร์ไม่ได้เลย)
export async function getUnreadNotificationCount(userId: string, opts: { personalOnly?: boolean } = {}): Promise<number> {
  return prisma.notification.count({
    where: { userId, read: false, kind: { notIn: [...BELL_HIDDEN_KINDS] }, ...bellScope(userId, opts.personalOnly) },
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

// listShopNotifications — แจ้งเตือน "ของร้าน" ของผู้ใช้คนนี้ในร้านเดียว (00086 FR-020 · หน้า /notifications ฝั่งร้าน)
// ไม่กรอง kind — แจ้งเตือนทุกชนิดที่ผูก shopId นี้ขึ้นหมด (service_job ของ FR-014 จะตามมาได้โดยไม่แก้ที่นี่)
// index (userId, shopId, createdAt) ตอบ query นี้ตรง
// ต้องเป็นเจ้าของร้านนี้อยู่ตอนนี้ (MINOR-3) — ถูกลดสิทธิ์แล้ว = ว่าง (กรองในคำสั่งเดียวผ่าน relation filter)
// ยกเว้น service_job_* ที่ผู้ดูแลปัจจุบันเห็นด้วย (visibleShopRow · 00086 T11)
export async function listShopNotifications(
  userId: string,
  shopId: string,
  take = 20,
): Promise<NotificationView[]> {
  const rows = await prisma.notification.findMany({
    where: { userId, shopId, kind: { notIn: [...BELL_HIDDEN_KINDS] }, ...visibleShopRow(userId) },
    orderBy: { createdAt: 'desc' },
    take,
    select: VIEW_SELECT,
  })
  return rows.map(toView)
}

// markAllNotificationsRead — mark ทั้งหมดของ user เป็นอ่านแล้ว (เช่นกดเปิด bell dropdown)
// กรอง BELL_HIDDEN_KINDS ด้วย 2 เหตุผล: (1) ผู้ใช้ไม่เคยเห็นแถวพวกนั้นบนกระดิ่ง การกด "อ่านทั้งหมด"
// จึงไม่ควรกินความหมายไปถึงมัน (2) เลี่ยง UPDATE ก้อนใหญ่โดยไม่จำเป็น — บาง user มี chat_message
// ค้าง unread หลักพันแถว กดครั้งเดียวจะเขียนทั้งหมดบน prod DB ที่ dev/prod ใช้ร่วมกัน
// opts.shopId (00086): จำกัดเฉพาะแจ้งเตือนของร้านนั้น — ปุ่ม "อ่านทั้งหมด" หน้า /notifications ของร้าน
// ต้องไม่ไปกินแจ้งเตือนของร้านอื่นที่เจ้าของหลายร้านยังไม่ได้เห็น
export async function markAllNotificationsRead(
  userId: string,
  opts: { shopId?: string; personalOnly?: boolean } = {},
): Promise<number> {
  const res = await prisma.notification.updateMany({
    where: {
      userId, read: false, kind: { notIn: [...BELL_HIDDEN_KINDS] },
      // ขอบเขตเดียวกับที่ผู้ใช้เห็นจริง (00086 T11) — "อ่านทั้งหมด" ไม่แตะแถวที่ซ่อนจากเขาอยู่
      // (เช่น staff_expense ของร้านที่ตอนนี้เป็นแค่ผู้ดูแล) ไม่งั้นได้สิทธิ์คืนวันหลังจะเจอว่าถูกอ่านไปแล้วทั้งที่ไม่เคยเห็น
      ...(opts.shopId ? { shopId: opts.shopId, ...visibleShopRow(userId) } : bellScope(userId, opts.personalOnly)),
    },
    data: { read: true },
  })
  return res.count
}
