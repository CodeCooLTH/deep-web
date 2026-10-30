/**
 * notification-personal-scope.db.test.ts — 00086 กระดิ่งฝั่งผู้ซื้อไม่ปนแจ้งเตือนของร้าน (local 5434)
 *
 * แจ้งเตือนของร้าน (shopId ไม่ว่าง เช่น staff_expense) อยู่ฝั่งร้านเท่านั้น:
 * - GET /api/notifications บนโดเมนผู้ซื้อ → เฉพาะแถว shopId = null · บนโดเมน seller → ทุกแถว
 * - /m (personalOnly) และ /api/app/notifications → เฉพาะแถวส่วนตัว
 * - "อ่านทั้งหมด" ฝั่งผู้ซื้อไม่กินแจ้งเตือนของร้าน
 *
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/app-auth', () => ({ requireAppUser: vi.fn() }))

import { getServerSession } from 'next-auth'
import { requireAppUser } from '@/lib/app-auth'
import { prisma } from '@/lib/prisma'
import { GET as webGet } from '@/app/api/notifications/route'
import { POST as webRead } from '@/app/api/notifications/read/route'
import { GET as appGet } from '@/app/api/app/notifications/route'
import { listNotifications, getUnreadNotificationCount } from '@/services/notification.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const d = isLocal ? describe : describe.skip
const run = randomUUID().slice(0, 8)
const f: Record<string, string> = {}

const get = (host: string) => new NextRequest(`http://${host}/api/notifications`, { headers: { host } })

d('00086 กระดิ่งผู้ซื้อเห็นเฉพาะแจ้งเตือนส่วนตัว', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `nps-${run}`, username: `nps_${run}` }, select: { id: true } })
    f.user = u.id
    const s = await prisma.shop.create({
      data: { userId: f.user, shopName: `nps-${run}`, kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' } as never,
      select: { id: true },
    })
    f.shop = s.id
    await prisma.notification.create({ data: { userId: f.user, kind: 'badge_earned', title: 'ส่วนตัว', body: 'p' } as never })
    await prisma.notification.create({ data: { userId: f.user, shopId: f.shop, kind: 'staff_expense', title: 'ของร้าน', body: 's' } as never })
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: f.user } } as never)
    vi.mocked(requireAppUser).mockResolvedValue({ user: { id: f.user } } as never)
  })
  afterAll(async () => {
    if (!f.user) return
    await prisma.notification.deleteMany({ where: { userId: f.user } })
    if (f.shop) await prisma.shop.delete({ where: { id: f.shop } })
    await prisma.user.delete({ where: { id: f.user } })
  })

  it('โดเมนผู้ซื้อ: เห็นแค่แถวส่วนตัว · นับยังไม่อ่านแค่แถวส่วนตัว', async () => {
    const body = await (await webGet(get('deepth.local'))).json()
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(['ส่วนตัว'])
    expect(body.unreadCount).toBe(1)
  })

  it('โดเมน seller: เห็นทั้งสองแถว (dropdown ร้านสลับร้านให้เอง)', async () => {
    const body = await (await webGet(get('seller.deepth.local'))).json()
    expect(body.items.map((i: { title: string }) => i.title).sort()).toEqual(['ของร้าน', 'ส่วนตัว'])
  })

  it('/m (personalOnly) และแอปผู้ซื้อ: ไม่มีแจ้งเตือนของร้าน', async () => {
    const { items } = await listNotifications(f.user, { personalOnly: true })
    expect(items.map((i) => i.title)).toEqual(['ส่วนตัว'])
    expect(await getUnreadNotificationCount(f.user, { personalOnly: true })).toBe(1)
    const app = await (await appGet(new NextRequest('http://deepth.local/api/app/notifications'))).json()
    expect(app.map((i: { title: string }) => i.title)).toEqual(['ส่วนตัว'])
  })

  it('"อ่านทั้งหมด" บนโดเมนผู้ซื้อไม่กินแจ้งเตือนของร้าน', async () => {
    await webRead(new NextRequest('http://deepth.local/api/notifications/read', {
      method: 'POST', body: '{}', headers: { host: 'deepth.local', 'content-type': 'application/json' },
    }))
    const rows = await prisma.notification.findMany({ where: { userId: f.user }, select: { title: true, read: true } })
    expect(rows.find((r) => r.title === 'ส่วนตัว')?.read).toBe(true)
    expect(rows.find((r) => r.title === 'ของร้าน')?.read).toBe(false)
  })
})
