/**
 * notification-service-job-visibility.db.test.ts — 00086 T11 (local 5434)
 *
 * แจ้งเตือนงานบริการ (service_job_*) ส่งถึง เจ้าของ + ผู้ดูแล (ADMIN ถือ MANAGER) — ตอนอ่านต้องเห็นชุดเดียวกัน (read = write audience)
 * - เจ้าของ: เห็นทั้ง service_job_* และ staff_expense
 * - ผู้ดูแล: เห็น service_job_* แต่ไม่เห็น staff_expense (ข้อมูลเงิน เจ้าของเท่านั้น)
 * - ผู้ดูแลที่ถูกถอด MANAGER / ถูกนำออก · CHAT · TECHNICIAN: ไม่เห็นแถวของร้าน
 * - list / unread count / หน้าร้าน (listShopNotifications) / "อ่านทั้งหมด" ใช้ขอบเขตเดียวกัน
 * - personalOnly (ฝั่งผู้ซื้อ) ไม่เปลี่ยน: เห็นแค่แถวส่วนตัว
 *
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import {
  listNotifications,
  getUnreadNotificationCount,
  listShopNotifications,
  markAllNotificationsRead,
} from '@/services/notification.service'
import { serviceJobAudience } from '@/services/service-job-notify.service'
import { getSellerNotificationFeed } from '@/services/seller-notification-feed.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const d = isLocal ? describe : describe.skip
const run = randomUUID().slice(0, 8)

const ids = { users: [] as string[], members: [] as string[], notifications: [] as string[], orders: [] as string[] }
const f: Record<string, string> = {}
const kinds = (items: { kind: string }[]) => items.map((i) => i.kind).sort()

d('00086 T11 แจ้งเตือนงานบริการ: ผู้ดูแลเห็น · ข้อมูลเงินเจ้าของเท่านั้น', () => {
  beforeAll(async () => {
    const mkUser = async (t: string) => {
      const u = await prisma.user.create({ data: { displayName: `nsj-${run}-${t}`, username: `nsj_${run}_${t}` }, select: { id: true } })
      ids.users.push(u.id)
      return u.id
    }
    f.owner = await mkUser('own')
    f.manager = await mkUser('mgr')
    f.demoted = await mkUser('dem')
    f.removed = await mkUser('rem')
    f.chat = await mkUser('chat')
    f.tech = await mkUser('tech')
    const s = await prisma.shop.create({
      data: { userId: f.owner, shopName: `nsj-${run}`, kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' } as never,
      select: { id: true },
    })
    f.shop = s.id
    const members: [string, string, string, string[]][] = [
      ['ownerMember', f.owner, 'OWNER', []],
      ['managerMember', f.manager, 'ADMIN', ['MANAGER']],
      ['demotedMember', f.demoted, 'ADMIN', ['MANAGER']],
      ['removedMember', f.removed, 'ADMIN', ['MANAGER']],
      ['chatMember', f.chat, 'ADMIN', ['CHAT']],
      ['techMember', f.tech, 'ADMIN', ['TECHNICIAN']],
    ]
    for (const [k, userId, role, roles] of members) {
      const m = await prisma.shopMember.create({ data: { shopId: f.shop, userId, role, roles }, select: { id: true } })
      ids.members.push(m.id)
      f[k] = m.id
    }
    // ทุกคนมีแถว service_job_started + staff_expense ของร้าน + แถวส่วนตัว 1 แถว (จำลองแถวเก่าก่อนเปลี่ยนสิทธิ์)
    for (const userId of [f.owner, f.manager, f.demoted, f.removed, f.chat, f.tech]) {
      for (const data of [
        { userId, shopId: f.shop, kind: 'service_job_started', title: 'ก เริ่มงาน', body: 'ล้างแอร์ · คุณข', refId: `tok-${run}` },
        { userId, shopId: f.shop, kind: 'staff_expense', title: 'ก บันทึกค่าใช้จ่าย', body: '฿100' },
        { userId, kind: 'badge_earned', title: 'ส่วนตัว', body: 'p' },
      ]) {
        const n = await prisma.notification.create({ data: data as never, select: { id: true } })
        ids.notifications.push(n.id)
      }
    }
    // เปลี่ยนสิทธิ์หลังได้รับแถวแล้ว: ถอด MANAGER (เหลือ CHAT) · นำออกจากร้าน
    await prisma.shopMember.update({ where: { id: f.demotedMember }, data: { roles: ['CHAT'] } })
    await prisma.shopMember.delete({ where: { id: f.removedMember } })
    ids.members = ids.members.filter((id) => id !== f.removedMember)
  })

  afterAll(async () => {
    if (ids.notifications.length) await prisma.notification.deleteMany({ where: { id: { in: ids.notifications } } })
    if (ids.orders.length) await prisma.order.deleteMany({ where: { id: { in: ids.orders } } })
    if (ids.members.length) await prisma.shopMember.deleteMany({ where: { id: { in: ids.members } } })
    if (f.shop) await prisma.shop.delete({ where: { id: f.shop } })
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
  })

  it('อ่าน = เขียน: คนที่เห็นแถว service_job_* ตรงกับผู้รับของ serviceJobAudience', async () => {
    const audience = await serviceJobAudience(f.shop)
    const seers: string[] = []
    for (const userId of [f.owner, f.manager, f.demoted, f.removed, f.chat, f.tech]) {
      const items = (await listNotifications(userId)).items
      if (items.some((i) => i.kind === 'service_job_started')) seers.push(userId)
    }
    expect(seers.sort()).toEqual([...(audience?.userIds ?? [])].sort())
  })

  it('เจ้าของ: เห็นแถวของร้านครบ', async () => {
    expect(kinds((await listNotifications(f.owner)).items)).toEqual(['badge_earned', 'service_job_started', 'staff_expense'])
    expect(await getUnreadNotificationCount(f.owner)).toBe(3)
    expect(kinds(await listShopNotifications(f.owner, f.shop))).toEqual(['service_job_started', 'staff_expense'])
  })

  it('ผู้ดูแล (MANAGER): เห็น service_job_* แต่ไม่เห็น staff_expense', async () => {
    expect(kinds((await listNotifications(f.manager)).items)).toEqual(['badge_earned', 'service_job_started'])
    expect(await getUnreadNotificationCount(f.manager)).toBe(2)
    expect(kinds(await listShopNotifications(f.manager, f.shop))).toEqual(['service_job_started'])
  })

  it('ถูกถอด MANAGER / นำออก / CHAT / TECHNICIAN: ไม่เห็นแถวของร้าน (แถวส่วนตัวยังอยู่)', async () => {
    for (const userId of [f.demoted, f.removed, f.chat, f.tech]) {
      expect(kinds((await listNotifications(userId)).items)).toEqual(['badge_earned'])
      expect(await getUnreadNotificationCount(userId)).toBe(1)
      expect(await listShopNotifications(userId, f.shop)).toEqual([])
    }
  })

  it('personalOnly (ฝั่งผู้ซื้อ) ไม่เปลี่ยน: เจ้าของ/ผู้ดูแลเห็นเฉพาะแถวส่วนตัว', async () => {
    for (const userId of [f.owner, f.manager]) {
      expect(kinds((await listNotifications(userId, { personalOnly: true })).items)).toEqual(['badge_earned'])
      expect(await getUnreadNotificationCount(userId, { personalOnly: true })).toBe(1)
    }
  })

  it('"อ่านทั้งหมด" ของร้าน (ผู้ดูแล): แตะเฉพาะแถวที่เห็น — staff_expense ที่ซ่อนอยู่ไม่ถูกอ่านแทน', async () => {
    expect(await markAllNotificationsRead(f.manager, { shopId: f.shop })).toBe(1)
    const rows = await prisma.notification.findMany({ where: { userId: f.manager, shopId: f.shop }, select: { kind: true, read: true } })
    expect(rows.find((r) => r.kind === 'service_job_started')?.read).toBe(true)
    expect(rows.find((r) => r.kind === 'staff_expense')?.read).toBe(false)
  })

  it('"อ่านทั้งหมด" กระดิ่ง seller (CHAT): ไม่แตะแถวของร้านที่ซ่อน · แถวส่วนตัวถูกอ่าน', async () => {
    expect(await markAllNotificationsRead(f.chat)).toBe(1)
    expect(await prisma.notification.count({ where: { userId: f.chat, shopId: f.shop, read: false } })).toBe(2)
  })

  it('หน้า /notifications: แถวเริ่มงานได้รูปย่อจากบันทึก "ก่อนทำ" ของงานนั้น (query เดียว · ผู้ดูแลเห็นด้วย)', async () => {
    const o = await prisma.order.create({
      data: {
        shopId: f.shop, type: 'SERVICE', status: 'PENDING', totalAmount: 500,
        buyerContact: `09${run}`, buyerName: 'คุณข', items: { create: { name: 'ล้างแอร์', qty: 1, price: 500 } },
      } as never,
      select: { id: true, publicToken: true },
    })
    ids.orders.push(o.id)
    await prisma.serviceJobRecord.create({ data: { orderId: o.id, shopId: f.shop, phase: 'BEFORE', fileIds: ['k-before-1.jpg', 'k-before-2.jpg'] } })
    await prisma.serviceJobRecord.create({ data: { orderId: o.id, shopId: f.shop, phase: 'AFTER', fileIds: ['k-after.jpg'] } })
    for (const userId of [f.owner, f.manager]) {
      const n = await prisma.notification.create({
        data: { userId, shopId: f.shop, kind: 'service_job_started', title: 'ก เริ่มงาน', body: 'ล้างแอร์ · คุณข', refId: o.publicToken },
        select: { id: true },
      })
      ids.notifications.push(n.id)
      const feed = await getSellerNotificationFeed({ userId, shopId: f.shop, includeTopups: false, vertical: 'SERVICE_QUEUE' })
      const row = feed.find((i) => i.source === 'notification' && i.id === n.id)
      expect(row).toMatchObject({ href: `/orders/${o.publicToken}`, label: 'ก เริ่มงาน · ล้างแอร์ · คุณข', thumbFileId: 'k-before-1.jpg' })
    }
  })
})
