/**
 * 00086 P3 — service-job-notify (unit · mock prisma/push) — ถ้อยคำ FR-014 · ตัดคนกด · ห้าม throw
 * การกรองผู้รับระดับแถว (OWNER/MANAGER vs CHAT/BILLING/ช่าง/อดีตเจ้าของ) เทสบนฐานจริงใน service-job-tech.db.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  shop: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  order: { findFirst: vi.fn() },
  notification: { createMany: vi.fn() },
}))
const push = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/app-push.service', () => ({ pushToUsers: push }))

import {
  notifyServiceJob,
  serviceJobMessage,
  SERVICE_JOB_NOTIFICATION_KIND,
} from '@/services/service-job-notify.service'

beforeEach(() => {
  vi.clearAllMocks()
  db.shop.findUnique.mockResolvedValue({ userId: 'owner', shopName: 'ร้านแอร์ดี', members: [{ userId: 'owner' }, { userId: 'mgr' }] })
  db.user.findUnique.mockResolvedValue({ displayName: 'ช่างนิด' })
  db.order.findFirst.mockResolvedValue({ publicToken: 'tok9', buyerName: 'คุณสมชาย', items: [{ name: 'ล้างแอร์' }] })
  db.notification.createMany.mockResolvedValue({ count: 2 })
  push.mockResolvedValue(undefined)
})

describe('serviceJobMessage (FR-014 ตรงตัว)', () => {
  it.each([
    ['CLAIMED', 'ช่างนิด รับงาน'],
    ['STARTED', 'ช่างนิด เริ่มงาน'],
    ['FINISHED', 'ช่างนิด ทำเสร็จ · รอปิดงาน'],
    ['CLOSED', 'ช่างนิด ปิดงาน'],
  ] as const)('%s → "%s"', (event, headline) => {
    const m = serviceJobMessage({ actorName: 'ช่างนิด', event, serviceName: 'ล้างแอร์', customerName: 'คุณสมชาย' })
    expect(m.headline).toBe(headline)
    expect(m.detail).toBe('ล้างแอร์ · คุณสมชาย')
    expect(m.sentence).toBe(`${headline} · ล้างแอร์ · คุณสมชาย`)
  })
  it('ไม่มีชื่อลูกค้า → ไม่มี " · " ห้อย', () => {
    expect(serviceJobMessage({ actorName: 'ช่างนิด', event: 'STARTED', serviceName: 'ล้างแอร์', customerName: null }).detail).toBe('ล้างแอร์')
  })
  it('kind แยกตามเหตุการณ์ (T11 ใช้ dedupe ปิดงาน)', () => {
    expect(SERVICE_JOB_NOTIFICATION_KIND).toEqual({
      CLAIMED: 'service_job_claimed', STARTED: 'service_job_started', FINISHED: 'service_job_finished', CLOSED: 'service_job_closed',
    })
  })
})

describe('notifyServiceJob', () => {
  it('ผู้รับ = เจ้าของ + ผู้ดูแล − คนกด · refId = publicToken · push ชื่อร้าน + ลิงก์งาน', async () => {
    await notifyServiceJob({ shopId: 's1', orderId: 'o1', actorUserId: 'owner', event: 'CLOSED' })
    const data = db.notification.createMany.mock.calls[0][0].data
    expect(data).toEqual([{ userId: 'mgr', shopId: 's1', kind: 'service_job_closed', title: 'ช่างนิด ปิดงาน', body: 'ล้างแอร์ · คุณสมชาย', refId: 'tok9' }])
    expect(push).toHaveBeenCalledWith(['mgr'], 'ร้านแอร์ดี', 'ช่างนิด ปิดงาน · ล้างแอร์ · คุณสมชาย', { type: 'service-job', url: '/orders/tok9', shopId: 's1' })
  })
  it('query ผู้รับขอเฉพาะ OWNER + ADMIN ที่ถือ MANAGER', async () => {
    await notifyServiceJob({ shopId: 's1', orderId: 'o1', actorUserId: 'tech', event: 'FINISHED' })
    expect(db.shop.findUnique.mock.calls[0][0].select.members.where).toEqual({
      OR: [{ role: 'OWNER' }, { role: 'ADMIN', roles: { has: 'MANAGER' } }],
    })
  })
  it('ไม่เหลือผู้รับ → ไม่เขียน ไม่ push', async () => {
    db.shop.findUnique.mockResolvedValue({ userId: 'owner', shopName: 'x', members: [] })
    await notifyServiceJob({ shopId: 's1', orderId: 'o1', actorUserId: 'owner', event: 'CLOSED' })
    expect(db.notification.createMany).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
  it('push ล้ม → ไม่ throw (แถวกระดิ่งเขียนแล้ว)', async () => {
    push.mockRejectedValue(new Error('expo down'))
    await expect(notifyServiceJob({ shopId: 's1', orderId: 'o1', actorUserId: 'tech', event: 'FINISHED' })).resolves.toBeUndefined()
    expect(db.notification.createMany).toHaveBeenCalled()
  })
  it('createMany ล้ม → ไม่ throw', async () => {
    db.notification.createMany.mockRejectedValue(new Error('db'))
    await expect(notifyServiceJob({ shopId: 's1', orderId: 'o1', actorUserId: 'tech', event: 'FINISHED' })).resolves.toBeUndefined()
  })
  // มติ user 2026-10-30 — แจ้งเฉพาะจังหวะที่เจ้าของต้องทำต่อ (ทำเสร็จ → ปิดงาน · ปิดงาน → ดูยอด)
  it('[blocker] รับงาน / เริ่มงาน → ไม่แจ้ง (ไม่ query ไม่เขียน ไม่ push) · ทำเสร็จ / ปิดงาน → แจ้ง', async () => {
    for (const event of ['CLAIMED', 'STARTED'] as const) {
      await notifyServiceJob({ shopId: 's1', orderId: 'o1', actorUserId: 'tech', event })
    }
    expect(db.shop.findUnique).not.toHaveBeenCalled()
    expect(db.notification.createMany).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    for (const event of ['FINISHED', 'CLOSED'] as const) {
      await notifyServiceJob({ shopId: 's1', orderId: 'o1', actorUserId: 'tech', event })
    }
    expect(db.notification.createMany).toHaveBeenCalledTimes(2)
    expect(push).toHaveBeenCalledTimes(2)
  })
  it('ใบไม่อยู่ในร้านนี้ → ไม่แจ้ง', async () => {
    db.order.findFirst.mockResolvedValue(null)
    await notifyServiceJob({ shopId: 's1', orderId: 'o1', actorUserId: 'tech', event: 'FINISHED' })
    expect(db.notification.createMany).not.toHaveBeenCalled()
  })
})
