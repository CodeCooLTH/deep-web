/**
 * service-job-notify.service — แจ้งเจ้าของร้าน + ผู้ดูแล เมื่อพนักงาน รับงาน/เริ่มงาน/ทำเสร็จ/ปิดงาน (00086 · BRD FR-014 · §8.4)
 *
 * แบบเดียวกับ staff-expense-notify.service: Notification ผูก shopId (กระดิ่ง + หน้า /notifications ของร้าน) แล้ว push เข้าแอปผู้ขาย
 *
 * 🛑 ผู้รับ = เจ้าของ (Shop.userId ∪ ShopMember role=OWNER) ∪ ผู้ดูแล (ShopMember role=ADMIN ที่ roles มี MANAGER) − คนกด
 *   อ่านจากแถวสมาชิก "ตอนนี้" ทุกครั้ง — เจ้าของร่วมที่ถูกลดเป็นพนักงาน / พนักงานที่ไม่ใช่ผู้ดูแล ไม่ได้รับ
 *   (CHAT/BILLING/TECHNICIAN ล้วน ไม่ได้รับ — FR-014 สั่งแค่เจ้าของ + ผู้ดูแล)
 * 🛑 kind แยกตามเหตุการณ์ (`service_job_claimed|started|finished|closed`) — หน้า /notifications ใช้ตัด activity
 *   "ปิดงาน" ที่ซ้ำกับแถว service_job_closed (T11 · S-12 "ไม่ซ้ำซ้อน") · refId = publicToken (ลิงก์ /orders/{token})
 * 🛑 ห้าม throw — ผู้เรียกยิงใน runAfterResponse หลัง commit แล้ว แจ้งเตือนพังต้องไม่ทำให้งานหลักพัง
 * 🛑 แจ้งเฉพาะ "ทำเสร็จแล้ว" + "ปิดงาน" (มติ user 2026-10-30) — จังหวะที่เจ้าของต้องทำอะไรต่อ
 *   รับงาน/เริ่มงาน ไม่แจ้ง (งานละ 4 ครั้ง × วันละหลายสิบงาน = ถี่เกิน) · ยังเห็นในไทม์ไลน์ของงาน (OrderEvent) ตามเดิม
 */
import { prisma } from '@/lib/prisma'
import { pushToUsers } from './app-push.service'

export type ServiceJobNotifyEvent = 'CLAIMED' | 'STARTED' | 'FINISHED' | 'CLOSED'

export const SERVICE_JOB_NOTIFICATION_KIND: Record<ServiceJobNotifyEvent, string> = {
  CLAIMED: 'service_job_claimed',
  STARTED: 'service_job_started',
  FINISHED: 'service_job_finished',
  CLOSED: 'service_job_closed',
}

/** เหตุการณ์ที่ส่งแจ้งเตือนจริง — ตัวตัดสินเดียว (มติ user 2026-10-30: เฉพาะจังหวะที่เจ้าของต้องทำต่อ) */
export const SERVICE_JOB_NOTIFY_EVENTS: readonly ServiceJobNotifyEvent[] = ['FINISHED', 'CLOSED']

export function shouldNotifyServiceJob(event: ServiceJobNotifyEvent): boolean {
  return SERVICE_JOB_NOTIFY_EVENTS.includes(event)
}

/** kind ทั้งชุด — ผู้อ่าน (กระดิ่ง/หน้า /notifications) ใช้แยกแถวงานบริการออกจากชนิดอื่น (รวม kind ที่เลิกส่งแล้ว — แถวเก่ายังอ่านได้) */
export const SERVICE_JOB_NOTIFICATION_KINDS: readonly string[] = Object.values(SERVICE_JOB_NOTIFICATION_KIND)

const VERB_TH: Record<ServiceJobNotifyEvent, string> = {
  CLAIMED: 'รับงาน',
  STARTED: 'เริ่มงาน',
  FINISHED: 'ทำเสร็จ · รอปิดงาน',
  CLOSED: 'ปิดงาน',
}

/**
 * ข้อความแจ้งเตือน (FR-014) — ฟังก์ชันบริสุทธิ์ให้เทสถ้อยคำได้ตรง ๆ
 * headline = "{ชื่อพนักงาน} {รับงาน|เริ่มงาน|ทำเสร็จ · รอปิดงาน|ปิดงาน}" · detail = "{บริการแรก} · {ชื่อลูกค้า}"
 * ส่วนที่ไม่มีค่าถูกตัดออก (ไม่โชว์ " · " ห้อย)
 */
export function serviceJobMessage(params: {
  actorName: string
  event: ServiceJobNotifyEvent
  serviceName: string | null
  customerName: string | null
}): { headline: string; detail: string; sentence: string } {
  const headline = `${params.actorName} ${VERB_TH[params.event]}`
  const detail = [params.serviceName?.trim(), params.customerName?.trim()].filter(Boolean).join(' · ')
  return { headline, detail, sentence: detail ? `${headline} · ${detail}` : headline }
}

/** เจ้าของ + ผู้ดูแลของร้าน ณ ตอนนี้ (อ่านแถวสด) */
export async function serviceJobAudience(shopId: string): Promise<{ userIds: string[]; shopName: string } | null> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      userId: true,
      shopName: true,
      members: {
        where: { OR: [{ role: 'OWNER' }, { role: 'ADMIN', roles: { has: 'MANAGER' } }] },
        select: { userId: true },
      },
    },
  })
  if (!shop) return null
  const ids = new Set<string>([shop.userId, ...shop.members.map((m) => m.userId)])
  return { userIds: [...ids], shopName: shop.shopName }
}

export async function notifyServiceJob(params: {
  shopId: string
  orderId: string
  actorUserId: string
  event: ServiceJobNotifyEvent
}): Promise<void> {
  if (!shouldNotifyServiceJob(params.event)) return
  try {
    const [audience, actor, order] = await Promise.all([
      serviceJobAudience(params.shopId),
      prisma.user.findUnique({ where: { id: params.actorUserId }, select: { displayName: true } }),
      prisma.order.findFirst({
        where: { id: params.orderId, shopId: params.shopId },
        select: {
          publicToken: true,
          buyerName: true,
          items: { select: { name: true }, orderBy: { id: 'asc' }, take: 1 },
        },
      }),
    ])
    if (!audience || !order) return
    const recipients = audience.userIds.filter((id) => id !== params.actorUserId)
    if (recipients.length === 0) return

    const msg = serviceJobMessage({
      actorName: actor?.displayName || 'พนักงาน',
      event: params.event,
      serviceName: order.items[0]?.name ?? null,
      customerName: order.buyerName,
    })

    await prisma.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        shopId: params.shopId,
        kind: SERVICE_JOB_NOTIFICATION_KIND[params.event],
        title: msg.headline,
        body: msg.detail,
        refId: order.publicToken,
      })),
    })

    // push แยก try — แถวในกระดิ่งเขียนแล้ว push ล้มก็ยังเห็นในเว็บ
    try {
      await pushToUsers(
        recipients,
        // บรรทัดแรก = ชื่อร้าน — เจ้าของหลายร้านต้องรู้ว่าเป็นของร้านไหน (แบบเดียวกับ staff_expense)
        audience.shopName,
        msg.sentence,
        { type: 'service-job', url: `/orders/${order.publicToken}`, shopId: params.shopId },
      )
    } catch (e) {
      console.error('[service-job-notify] push failed', e)
    }
  } catch (e) {
    console.error('[service-job-notify] notify failed', e)
  }
}
