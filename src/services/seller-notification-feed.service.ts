/**
 * seller-notification-feed.service — ข้อมูลหน้า /notifications ฝั่งร้าน (00086 FR-020)
 *
 * รวม 2 แหล่งเป็นไทม์ไลน์เดียวเรียงตามเวลา:
 *   1. getRecentActivity — เหตุการณ์ที่คำนวณจากตารางธุรกิจ (คำสั่งซื้อ/รีวิว/SMS ฯลฯ) ไม่มีสถานะอ่าน
 *   2. Notification ที่ผูก shopId = ร้านที่ active ของผู้ดูคนนี้ (เช่น staff_expense) มีสถานะอ่านจริง
 *
 * 🛑 แหล่งที่ 2 กรอง shopId = ร้านที่ active เสมอ — เจ้าของหลายร้านต้องไม่เห็นแจ้งเตือนของร้านอื่นปนในหน้านี้
 *   (แจ้งเตือนข้ามร้านเห็นได้ที่กระดิ่ง TopBar ซึ่งโชว์ชื่อร้าน + สลับร้านก่อนเปิด)
 */
import { prisma } from '@/lib/prisma'
import { getRecentActivity, type ActivityItem } from './activity.service'
import { listShopNotifications, type NotificationView } from './notification.service'
import { SERVICE_JOB_NOTIFICATION_KIND } from './service-job-notify.service'
import { shopNotificationHref, shopNotificationLabel } from '@/lib/shop-notification'

export type SellerFeedItem =
  | {
      source: 'activity'
      key: string
      type: ActivityItem['type']
      label: string
      at: Date
      href?: string
    }
  | {
      source: 'notification'
      key: string
      /** Notification.id — ใช้ mark-read */
      id: string
      kind: string
      label: string
      at: Date
      href?: string
      read: boolean
      /** 00086 T11: storage key รูปแรกของงาน (เริ่มงาน → ก่อนทำ · ทำเสร็จ → หลังทำ) — UI แปลงด้วย toFileUrl */
      thumbFileId?: string
    }

// แถวแจ้งเตือนงานบริการที่มีรูปย่อ → phase ของ ServiceJobRecord ที่ใช้
const THUMB_PHASE: Record<string, 'BEFORE' | 'AFTER'> = {
  [SERVICE_JOB_NOTIFICATION_KIND.STARTED]: 'BEFORE',
  [SERVICE_JOB_NOTIFICATION_KIND.FINISHED]: 'AFTER',
}

export type ServiceJobThumbRecord = { phase: string; fileIds: string[]; token: string }

/** id แจ้งเตือน → storage key รูปแรก (≤1 ต่อแถว) — ฟังก์ชันบริสุทธิ์ · ไม่มีรูป/ไม่มีบันทึก = ไม่มีคีย์ */
export function pickServiceJobThumbs(
  notifications: NotificationView[],
  records: ServiceJobThumbRecord[],
): Map<string, string> {
  const first = new Map<string, string>()
  for (const r of records) if (r.fileIds[0]) first.set(`${r.phase}:${r.token}`, r.fileIds[0])
  const out = new Map<string, string>()
  for (const n of notifications) {
    const phase = THUMB_PHASE[n.kind]
    const fileId = phase && n.refId ? first.get(`${phase}:${n.refId}`) : undefined
    if (fileId) out.set(n.id, fileId)
  }
  return out
}

/**
 * รวม + เรียงใหม่→เก่า + ตัดจำนวน — ฟังก์ชันบริสุทธิ์ (เทสได้โดยไม่ต้องมีฐาน)
 * 00086 T11 ตัดซ้ำ: activity "ปิดงาน" (SERVICE_CLOSED) ของงานที่มีแถว service_job_closed อยู่ในชุดแล้ว ⇒ เหลือแถวแจ้งเตือนตัวเดียว
 *   (แถวแจ้งเตือนบอกชื่อคนปิด + มีสถานะอ่านจริง) · คนที่ปิดงานเองไม่ได้รับแถว ⇒ activity ของเขายังอยู่ตามเดิม
 */
export function mergeSellerFeed(
  activity: ActivityItem[],
  notifications: NotificationView[],
  take: number,
  thumbs: ReadonlyMap<string, string> = new Map(),
): SellerFeedItem[] {
  const closedHrefs = new Set(
    notifications
      .filter((n) => n.kind === SERVICE_JOB_NOTIFICATION_KIND.CLOSED && n.refId)
      .map((n) => shopNotificationHref(n.kind, n.refId)),
  )
  const keptActivity = closedHrefs.size
    ? activity.filter((item) => !(item.type === 'SERVICE_CLOSED' && item.href && closedHrefs.has(item.href)))
    : activity
  const a: SellerFeedItem[] = keptActivity.map((item, i) => ({
    source: 'activity',
    key: `a-${item.type}-${item.at.getTime()}-${i}`,
    type: item.type,
    label: item.label,
    at: item.at,
    ...(item.href ? { href: item.href } : {}),
  }))
  const n: SellerFeedItem[] = notifications.map((row) => {
    const href = shopNotificationHref(row.kind, row.refId)
    const thumbFileId = thumbs.get(row.id)
    return {
      source: 'notification',
      key: `n-${row.id}`,
      id: row.id,
      kind: row.kind,
      label: shopNotificationLabel(row.kind, row.title, row.body),
      at: row.createdAt,
      read: row.read,
      ...(href ? { href } : {}),
      ...(thumbFileId ? { thumbFileId } : {}),
    }
  })
  return [...a, ...n].sort((x, y) => y.at.getTime() - x.at.getTime()).slice(0, take)
}

export async function getSellerNotificationFeed(params: {
  userId: string
  shopId: string
  take?: number
  includeTopups: boolean
  vertical?: string
}): Promise<SellerFeedItem[]> {
  const take = params.take ?? 20
  const [activity, notifications] = await Promise.all([
    getRecentActivity(params.shopId, take, { includeTopups: params.includeTopups, vertical: params.vertical }),
    // แจ้งเตือนพังต้องไม่ทำให้ไทม์ไลน์เดิมหาย — คืน [] แล้วแสดงส่วน activity ตามเดิม
    listShopNotifications(params.userId, params.shopId, take).catch((e) => {
      console.error('[seller-notification-feed] listShopNotifications failed', e)
      return [] as NotificationView[]
    }),
  ])
  const thumbs = await loadServiceJobThumbs(params.shopId, notifications)
  return mergeSellerFeed(activity, notifications, take, thumbs)
}

/**
 * รูปย่อของแถวงานบริการ — query เดียวบน ServiceJobRecord (ไม่มีแถวเริ่ม/ทำเสร็จในชุด = ไม่ยิงเลย ร้านอื่นไม่เสียอะไร)
 * กรอง shopId = ร้านที่เปิดอยู่ (ร้านเดียวกับแถวแจ้งเตือน) · แถวแจ้งเตือนผ่านด่านเจ้าของ/ผู้ดูแลปัจจุบันมาแล้ว (listShopNotifications)
 * ⇒ ผู้ดูมีสิทธิ์เห็นบันทึกงานของร้านนี้อยู่แล้ว · พัง = ไม่มีรูปย่อ ไม่ทำให้หน้าแจ้งเตือนหาย
 */
async function loadServiceJobThumbs(shopId: string, notifications: NotificationView[]): Promise<Map<string, string>> {
  const wanted = notifications.filter((n) => THUMB_PHASE[n.kind] && n.refId)
  if (wanted.length === 0) return new Map()
  try {
    const rows = await prisma.serviceJobRecord.findMany({
      where: {
        shopId,
        phase: { in: [...new Set(wanted.map((n) => THUMB_PHASE[n.kind]))] },
        order: { publicToken: { in: [...new Set(wanted.map((n) => n.refId as string))] } },
      },
      select: { phase: true, fileIds: true, order: { select: { publicToken: true } } },
    })
    return pickServiceJobThumbs(
      notifications,
      rows.map((r) => ({ phase: r.phase, fileIds: r.fileIds, token: r.order.publicToken })),
    )
  } catch (e) {
    console.error('[seller-notification-feed] service job thumbs failed', e)
    return new Map()
  }
}
