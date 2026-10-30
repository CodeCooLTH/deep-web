/**
 * notification-current-owner.db.test.ts — 00086 MINOR-3 (local 5434)
 *
 * แจ้งเตือนของร้าน (shopId ไม่ว่าง เช่น staff_expense) เห็นได้เฉพาะคนที่ "ยังเป็นเจ้าของร้านนั้นอยู่ตอนนี้"
 * - เจ้าของร่วมที่ถูกลดเป็น ADMIN แล้ว: กระดิ่ง seller (list + count) ไม่เห็นแถวของร้านนั้น · หน้า /notifications ร้าน = ว่าง
 * - แถวส่วนตัว (shopId null) ของเขายังเห็นปกติ
 * - เจ้าของปัจจุบัน (Shop.userId + ShopMember OWNER) ยังเห็นครบ
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
} from '@/services/notification.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const d = isLocal ? describe : describe.skip
const run = randomUUID().slice(0, 8)

const ids = { users: [] as string[], members: [] as string[] }
const f: Record<string, string> = {}
const titles = (items: { title: string }[]) => items.map((i) => i.title).sort()

d('00086 MINOR-3 แจ้งเตือนของร้านเห็นเฉพาะเจ้าของปัจจุบัน', () => {
  beforeAll(async () => {
    const mkUser = async (t: string) => {
      const u = await prisma.user.create({ data: { displayName: `nco-${run}-${t}`, username: `nco_${run}_${t}` }, select: { id: true } })
      ids.users.push(u.id)
      return u.id
    }
    f.owner = await mkUser('own')
    f.coOwner = await mkUser('co')
    const s = await prisma.shop.create({
      data: { userId: f.owner, shopName: `nco-${run}`, kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' } as never,
      select: { id: true },
    })
    f.shop = s.id
    for (const [k, userId] of [['ownerMember', f.owner], ['coMember', f.coOwner]] as const) {
      const m = await prisma.shopMember.create({ data: { shopId: f.shop, userId, role: 'OWNER', roles: [] }, select: { id: true } })
      ids.members.push(m.id)
      f[k] = m.id
    }
    // ทั้งสองคนได้ staff_expense ตอนที่ยังเป็นเจ้าของ + แจ้งเตือนส่วนตัวคนละแถว
    for (const userId of [f.owner, f.coOwner]) {
      await prisma.notification.create({ data: { userId, shopId: f.shop, kind: 'staff_expense', title: 'ของร้าน', body: 's' } as never })
      await prisma.notification.create({ data: { userId, kind: 'badge_earned', title: 'ส่วนตัว', body: 'p' } as never })
    }
  })

  afterAll(async () => {
    if (ids.users.length) await prisma.notification.deleteMany({ where: { userId: { in: ids.users } } })
    if (ids.members.length) await prisma.shopMember.deleteMany({ where: { id: { in: ids.members } } })
    if (f.shop) await prisma.shop.delete({ where: { id: f.shop } })
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
  })

  it('ก่อนลดสิทธิ์: เจ้าของร่วม (ShopMember OWNER) เห็นแถวของร้าน', async () => {
    expect(titles((await listNotifications(f.coOwner)).items)).toEqual(['ของร้าน', 'ส่วนตัว'])
    expect(await getUnreadNotificationCount(f.coOwner)).toBe(2)
    expect(titles(await listShopNotifications(f.coOwner, f.shop))).toEqual(['ของร้าน'])
  })

  it('ลดเป็น ADMIN แล้ว: ไม่เห็นแถวของร้านอีก (list/count/หน้าร้าน) · แถวส่วนตัวยังอยู่', async () => {
    await prisma.shopMember.update({ where: { id: f.coMember }, data: { role: 'ADMIN', roles: ['MANAGER'] } })
    expect(titles((await listNotifications(f.coOwner)).items)).toEqual(['ส่วนตัว'])
    expect(await getUnreadNotificationCount(f.coOwner)).toBe(1)
    expect(await listShopNotifications(f.coOwner, f.shop)).toEqual([])
    // แถวยังอยู่ใน DB (ไม่ลบ) — แค่ไม่แสดง
    expect(await prisma.notification.count({ where: { userId: f.coOwner, shopId: f.shop } })).toBe(1)
  })

  it('เจ้าของปัจจุบันยังเห็นครบ', async () => {
    expect(titles((await listNotifications(f.owner)).items)).toEqual(['ของร้าน', 'ส่วนตัว'])
    expect(await getUnreadNotificationCount(f.owner)).toBe(2)
    expect(titles(await listShopNotifications(f.owner, f.shop))).toEqual(['ของร้าน'])
  })
})
