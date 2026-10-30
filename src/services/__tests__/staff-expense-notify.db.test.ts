/**
 * staff-expense-notify.db.test.ts — 00086 FR-020 บน Postgres จริง (local 5434)
 *
 * - พนักงาน POST /api/expenses/mine (route ตัวจริง · mock แค่ session + after + push) → เจ้าของได้ Notification 1 แถว
 *   ผูก shopId ของร้านนั้น · พนักงาน/ผู้ดูแลคนอื่นไม่ได้ · DELETE ส่งยอด/หมวดของแถวที่ลบ
 * - getSellerNotificationFeed คืนแจ้งเตือนของ "ร้านที่ active" เท่านั้น (เจ้าของสองร้านไม่ปนกัน)
 * - markAllNotificationsRead({shopId}) แตะเฉพาะร้านนั้น
 *
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'

const pending = vi.hoisted(() => [] as Promise<unknown>[])
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
// เก็บงานใน after() ไว้รอ — เทสต้องรอให้แจ้งเตือนเขียนเสร็จก่อนตรวจ
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => {
    pending.push(Promise.resolve().then(fn))
  },
}))
vi.mock('@/services/app-push.service', () => ({ pushToUsers: vi.fn().mockResolvedValue(undefined) }))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { POST as minePost } from '@/app/api/expenses/mine/route'
import { DELETE as mineDelete } from '@/app/api/expenses/mine/[id]/route'
import { getSellerNotificationFeed } from '@/services/seller-notification-feed.service'
import { markAllNotificationsRead } from '@/services/notification.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const d = isLocal ? describe : describe.skip
const run = randomUUID().slice(0, 8)

const ids = { users: [] as string[], shops: [] as string[], members: [] as string[] }
const f: Record<string, string> = {}

const as = (userId: string, shopId: string) =>
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: userId, activeShopId: shopId } } as never)
const req = (path: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? 'GET',
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body), headers: { 'content-type': 'application/json' } } : {}),
  })
const flush = async () => {
  await Promise.all(pending.splice(0))
}

d('00086 FR-020 แจ้งเจ้าของเมื่อพนักงานบันทึกค่าใช้จ่าย (DB local)', () => {
  beforeAll(async () => {
    const mkUser = async (t: string) => {
      const u = await prisma.user.create({ data: { displayName: `sen-${run}-${t}`, username: `sen_${run}_${t}` }, select: { id: true } })
      ids.users.push(u.id)
      return u.id
    }
    f.owner = await mkUser('own')
    // เจ้าของคนเดียวถือสองร้าน — ตัวทดสอบ "ไม่ปนร้าน"
    for (const t of ['a', 'b']) {
      const s = await prisma.shop.create({
        data: { userId: f.owner, shopName: `sen-${run}-${t}`, kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' } as never,
        select: { id: true },
      })
      ids.shops.push(s.id)
      f[`shop_${t}`] = s.id
      const o = await prisma.shopMember.create({ data: { shopId: s.id, userId: f.owner, role: 'OWNER', roles: [] }, select: { id: true } })
      ids.members.push(o.id)
    }
    const add = async (key: string, roles: string[], canRecordExpense: boolean) => {
      f[key] = await mkUser(key)
      const x = await prisma.shopMember.create({
        data: { shopId: f.shop_a, userId: f[key], role: 'ADMIN', roles, canRecordExpense },
        select: { id: true },
      })
      ids.members.push(x.id)
    }
    await add('staff', ['TECHNICIAN'], true)
    await add('manager', ['MANAGER'], false)
  })

  afterAll(async () => {
    if (ids.shops.length) {
      await prisma.notification.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.expense.deleteMany({ where: { shopId: { in: ids.shops } } })
    }
    if (ids.members.length) await prisma.shopMember.deleteMany({ where: { id: { in: ids.members } } })
    if (ids.shops.length) await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  it('พนักงาน POST → เจ้าของได้ Notification 1 แถวผูก shopId · ผู้ดูแล/ตัวพนักงานไม่ได้', async () => {
    as(f.staff, f.shop_a)
    const res = await minePost(req('/api/expenses/mine', { method: 'POST', body: { category: 'SHIPPING', amount: 320, expenseDate: '2026-03-15' } }))
    expect(res.status).toBe(201)
    const exp = (await res.json()) as { id: string }
    f.expense = exp.id
    await flush()

    const rows = await prisma.notification.findMany({ where: { shopId: { in: ids.shops } } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: f.owner,
      shopId: f.shop_a,
      kind: 'staff_expense',
      refId: exp.id,
      title: `sen-${run}-staff บันทึกค่าใช้จ่าย`,
      body: '฿320 · ค่าขนส่ง',
      read: false,
    })
  })

  it('DELETE แจ้งด้วยยอด/หมวดของแถวที่ลบ', async () => {
    as(f.staff, f.shop_a)
    const res = await mineDelete(req(`/api/expenses/mine/${f.expense}`, { method: 'DELETE' }), { params: Promise.resolve({ id: f.expense }) })
    expect(res.status).toBe(200)
    await flush()
    const del = await prisma.notification.findFirst({ where: { shopId: f.shop_a, title: { contains: 'ลบค่าใช้จ่าย' } } })
    expect(del).toMatchObject({ userId: f.owner, body: '฿320 · ค่าขนส่ง', refId: f.expense })
  })

  it('ฟีดหน้า /notifications คืนแจ้งเตือนของร้านที่ active เท่านั้น', async () => {
    // แจ้งเตือนของร้าน b ของเจ้าของคนเดียวกัน — ต้องไม่โผล่ในฟีดร้าน a
    await prisma.notification.create({
      data: { userId: f.owner, shopId: f.shop_b, kind: 'staff_expense', title: 'ร้านบี', body: '฿1 · อื่นๆ' },
    })
    const feedA = await getSellerNotificationFeed({ userId: f.owner, shopId: f.shop_a, includeTopups: false, vertical: 'SERVICE_QUEUE' })
    const notifA = feedA.filter((i) => i.source === 'notification')
    expect(notifA).toHaveLength(2)
    expect(notifA.every((i) => i.source === 'notification' && i.kind === 'staff_expense' && i.href === '/expenses')).toBe(true)
    expect(notifA.some((i) => i.label.includes('ร้านบี'))).toBe(false)
    // เรียงใหม่ → เก่า: ลบ (ทีหลัง) มาก่อนบันทึก
    expect(notifA[0].label).toContain('ลบค่าใช้จ่าย')

    const feedB = await getSellerNotificationFeed({ userId: f.owner, shopId: f.shop_b, includeTopups: false })
    expect(feedB.filter((i) => i.source === 'notification').map((i) => i.label)).toEqual(['ร้านบี ฿1 · อื่นๆ'])

    // พนักงานเปิดฟีดร้าน a ไม่เห็นแจ้งเตือนของเจ้าของ (กรอง userId)
    const feedStaff = await getSellerNotificationFeed({ userId: f.staff, shopId: f.shop_a, includeTopups: false })
    expect(feedStaff.filter((i) => i.source === 'notification')).toHaveLength(0)
  })

  it('อ่านทั้งหมด {shopId} แตะเฉพาะร้านนั้น', async () => {
    const n = await markAllNotificationsRead(f.owner, { shopId: f.shop_a })
    expect(n).toBe(2)
    const unreadB = await prisma.notification.count({ where: { userId: f.owner, shopId: f.shop_b, read: false } })
    expect(unreadB).toBe(1)
  })
})
