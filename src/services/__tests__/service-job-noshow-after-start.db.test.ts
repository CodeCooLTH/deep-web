/**
 * 00086 P3 (Controller 2026-10-29) — "ไม่มาตามนัด" กับงานที่เริ่มงานแล้ว = 409 (ร้านบริการ)
 * เริ่มงาน = ลูกค้ามาแล้ว ขัดกันเอง · จอซ่อนตัวเลือก · ด่านนี้กันทางที่จอไม่ได้ซ่อน (แชท/ข้อมูลค้าง/เรียก API ตรง)
 * ครอบทั้ง POST /close และ POST /appointment/outcome (ทั้งคู่เรียก closeServiceJob)
 *
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้างเอง
 * mutation ที่ต้องแดง: ลบบรรทัด `if (args.outcome === 'NO_SHOW' && order.serviceStartedAt != null) throw …`
 *   (+ เงื่อนไข serviceStartedAt: null ใน WHERE) → "เริ่มแล้ว → NoShowAfterStart" แดง (ปิดสำเร็จแทน)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))
vi.mock('@/services/auto-notify.service', async (orig) => ({
  ...(await orig<typeof import('@/services/auto-notify.service')>()),
  dispatchAutoNotify: vi.fn(async () => {}),
}))
vi.mock('@/services/service-job-notify.service', async (orig) => ({
  ...(await orig<typeof import('@/services/service-job-notify.service')>()),
  notifyServiceJob: vi.fn(async () => {}),
}))
vi.mock('@/services/app-push.service', () => ({ pushToUsers: vi.fn(async () => {}) }))

import { closeServiceJob } from '@/services/service-job.service'
import { ServiceJobNoShowAfterStartError } from '@/lib/service-job'
import { serviceJobErrorResponse } from '@/lib/service-job-api'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const ids = { user: '', shop: '', member: '', resource: '', orders: [] as string[] }
let seat = 0

async function mkJob(started: boolean) {
  const t0 = new Date(Date.now() - 2 * 3600_000)
  const o = await db.order.create({
    data: {
      shopId: ids.shop, type: 'SERVICE', status: 'PENDING', totalAmount: 500, buyerContact: `08${run}`, buyerName: 'คุณสมชาย',
      // CHECK Order_service_fields_all_or_none: นัดต้องมีทรัพยากร+ที่นั่ง · ที่นั่งไม่ซ้ำกัน (EXCLUDE ช่วงเวลาซ้อน)
      serviceResourceId: ids.resource, serviceSeat: ++seat,
      serviceStart: t0, serviceEnd: new Date(+t0 + 3600_000), appointmentStatus: 'SCHEDULED',
      serviceStartedAt: started ? new Date(+t0 + 60_000) : null,
      items: { create: { name: 'ล้างแอร์', qty: 1, price: 500 } },
    } as never,
    select: { id: true, publicToken: true },
  })
  ids.orders.push(o.id)
  return o
}
const close = (token: string, outcome: 'SERVED' | 'NO_SHOW') =>
  closeServiceJob({ shopId: ids.shop, orderToken: token, actorUserId: ids.user, actorRoles: ['OWNER'], outcome, deposit: 'KEEP' })

describe.skipIf(!isLocal)('00086 — ไม่มาตามนัดหลังเริ่มงาน (DB จริง)', () => {
  beforeAll(async () => {
    ids.user = (await db.user.create({ data: { displayName: `เจ้าของ-${run}`, username: `nsas_${run}` }, select: { id: true } })).id
    ids.shop = (
      await db.shop.create({
        data: { userId: ids.user, shopName: `nsas-${run}`, kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' } as never,
        select: { id: true },
      })
    ).id
    ids.resource = (
      await db.serviceResource.create({ data: { shopId: ids.shop, name: `ช่อง-${run}`, capacity: 10 } as never, select: { id: true } })
    ).id
    ids.member = (await db.shopMember.create({ data: { shopId: ids.shop, userId: ids.user, role: 'OWNER', roles: [] }, select: { id: true } })).id
  })
  afterAll(async () => {
    await db.autoNotifyLedger.deleteMany({ where: { orderId: { in: ids.orders } } })
    await db.order.deleteMany({ where: { id: { in: ids.orders } } }) // Cascade: OrderEvent · OrderItem
    if (ids.resource) await db.serviceResource.deleteMany({ where: { id: ids.resource } })
    if (ids.member) await db.shopMember.deleteMany({ where: { id: ids.member } })
    if (ids.shop) await db.shop.deleteMany({ where: { id: ids.shop } })
    if (ids.user) await db.user.deleteMany({ where: { id: ids.user } })
    await db.$disconnect()
  })

  it('[blocker] เริ่มงานแล้ว → NO_SHOW ถูกปฏิเสธ (NoShowAfterStart) · งานยังไม่ปิด · ไม่มี event ปิดงาน', async () => {
    const j = await mkJob(true)
    await expect(close(j.publicToken, 'NO_SHOW')).rejects.toBeInstanceOf(ServiceJobNoShowAfterStartError)
    const r = await db.order.findUniqueOrThrow({ where: { id: j.id }, select: { serviceClosedAt: true, appointmentStatus: true } })
    expect(r.serviceClosedAt).toBeNull()
    expect(r.appointmentStatus).toBe('SCHEDULED')
    expect(await db.orderEvent.count({ where: { orderId: j.id, type: 'SERVICE_CLOSED' } })).toBe(0)
  })

  it('เริ่มงานแล้ว → SERVED ปิดได้ตามเดิม', async () => {
    const j = await mkJob(true)
    await expect(close(j.publicToken, 'SERVED')).resolves.toMatchObject({ appointmentStatus: 'COMPLETED' })
  })

  it('ยังไม่เริ่มงาน → NO_SHOW ปิดได้ตามเดิม (FR-010)', async () => {
    const j = await mkJob(false)
    await expect(close(j.publicToken, 'NO_SHOW')).resolves.toMatchObject({ appointmentStatus: 'NO_SHOW' })
  })
})

describe('serviceJobErrorResponse — NO_SHOW_AFTER_START', () => {
  it('→ 409 + ข้อความไทย (route close/outcome ใช้ตัวนี้)', async () => {
    const res = serviceJobErrorResponse(new ServiceJobNoShowAfterStartError())!
    expect(res.status).toBe(409)
    const j = (await res.json()) as { error: string; message: string }
    expect(j.error).toBe('SERVICE_JOB_NO_SHOW_AFTER_START')
    expect(j.message).toContain('ไม่มาตามนัดไม่ได้')
  })
})
