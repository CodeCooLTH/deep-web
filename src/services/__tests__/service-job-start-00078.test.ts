/**
 * 00078 T16 — เริ่มงาน + hook แจ้งลูกค้าอัตโนมัติ 3 จุดฝั่งบริการ (DB จริง)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้างเอง
 *
 * Mutation: ลบ `serviceStartedAt: null` ออกจาก where ของ updateMany → "เขียนครั้งเดียว" แดง
 *           เปลี่ยน `outcome === 'SERVED'` เป็น true → "NO_SHOW ไม่มี ledger" แดง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))
// ตัวส่งจริงไม่เกี่ยวกับเทสนี้ — เก็บแค่ว่า "ถูกสั่งส่งใบไหน" (reserve ยังเป็นของจริงทั้งหมด)
const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn(async (_id: string) => {}) }))
vi.mock('@/services/auto-notify.service', async (orig) => ({
  ...(await orig<typeof import('@/services/auto-notify.service')>()),
  dispatchAutoNotify: dispatch,
}))

import { closeServiceJob, startServiceJob } from '@/services/service-job.service'
import { setOrRescheduleAppointment } from '@/services/appointment.service'
import { ServiceJobAlreadyClosedError, ServiceJobNotFoundError, ServiceJobNotStartableError } from '@/lib/service-job'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const S = { user: '', shop: '', other: '', resource: '' }
const ids = { convs: [] as string[], orders: [] as string[] }
const KINDS = ['SERVICE_BOOKED', 'SERVICE_STARTED', 'SERVICE_CLOSED']

async function mk(o: { status?: string; linked?: boolean; serviceStart?: Date | null; shopId?: string } = {}) {
  let conversationId: string | null = null
  if (o.linked !== false) {
    const c = await db.conversation.create({
      data: { shopId: S.shop, channel: 'DEEP', alias: `sj-${run}`, lastSenderRole: 'BUYER', lastInboundAt: new Date(), lastMessageAt: new Date() },
      select: { id: true },
    })
    ids.convs.push(c.id)
    conversationId = c.id
  }
  const ord = await db.order.create({
    data: {
      shopId: o.shopId ?? S.shop, conversationId, type: 'SERVICE', status: o.status ?? 'PENDING', totalAmount: 500,
      buyerContact: `08${run}`, buyerName: 'คุณสมชาย', ...(o.serviceStart
        ? { serviceStart: o.serviceStart, serviceEnd: new Date(+o.serviceStart + 3600_000), serviceResourceId: S.resource, serviceSeat: 1, appointmentStatus: 'SCHEDULED' }
        : {}),
      items: { create: { name: 'ล้างแอร์', qty: 1, price: 500 } },
    } as never,
    select: { id: true, publicToken: true },
  })
  ids.orders.push(ord.id)
  return { ...ord, conversationId }
}
const ledger = (orderId: string) => db.autoNotifyLedger.findMany({ where: { orderId } })
const rowOf = (orderId: string) => db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, totalAmount: true, serviceStartedAt: true, appointmentStatus: true } })
const start = (publicToken: string, shopId = S.shop) => startServiceJob({ shopId, orderToken: publicToken, actorUserId: S.user })

describe.skipIf(!isLocal)('startServiceJob + hook แจ้งลูกค้า (DB จริง)', () => {
  beforeAll(async () => {
    const u = await db.user.create({ data: { displayName: `sj-${run}`, username: `sj_${run}` }, select: { id: true } })
    const mkShop = (n: string) => db.shop.create({ data: { userId: u.id, shopName: `sj-${n}-${run}`, kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' } as never, select: { id: true } })
    const [shop, other] = await Promise.all([mkShop('a'), mkShop('b')])
    const r = await db.serviceResource.create({ data: { shopId: shop.id, name: `ช่าง-${run}`, capacity: 1 }, select: { id: true } })
    Object.assign(S, { user: u.id, shop: shop.id, other: other.id, resource: r.id })
  })
  afterAll(async () => {
    await db.order.deleteMany({ where: { id: { in: ids.orders } } })
    await db.conversation.deleteMany({ where: { id: { in: ids.convs } } })
    await db.serviceResource.deleteMany({ where: { id: S.resource } })
    await db.shop.deleteMany({ where: { id: { in: [S.shop, S.other] } } })
    await db.user.deleteMany({ where: { id: S.user } })
    await db.$disconnect()
  })
  beforeEach(async () => {
    dispatch.mockClear()
    for (const kind of KINDS) {
      await db.autoNotifySwitch.upsert({
        where: { shopId_kind: { shopId: S.shop, kind } },
        create: { shopId: S.shop, kind, enabled: true, enabledAt: new Date(Date.now() - 3600_000) },
        update: { enabled: true, enabledAt: new Date(Date.now() - 3600_000) },
      })
    }
    await db.autoNotifyConfig.deleteMany({ where: { shopId: S.shop } })
  })

  it('เริ่มงาน: ตั้งเวลาครั้งเดียว · ไม่แตะสถานะ/เงิน · กดซ้ำคืนค่าเดิม ไม่จองซ้ำ', async () => {
    const o = await mk()
    const before = await rowOf(o.id)
    const a = await start(o.publicToken)
    expect(a.alreadyStarted).toBe(false)
    const b = await start(o.publicToken)
    expect(b).toMatchObject({ alreadyStarted: true })
    expect(+b.serviceStartedAt).toBe(+a.serviceStartedAt)
    const after = await rowOf(o.id)
    expect(after).toMatchObject({ status: before.status, appointmentStatus: before.appointmentStatus })
    expect(String(after.totalAmount)).toBe(String(before.totalAmount))
    expect(+after.serviceStartedAt!).toBe(+a.serviceStartedAt)
    expect(await db.orderEvent.count({ where: { orderId: o.id, type: 'SERVICE_STARTED' } })).toBe(1)
    expect(await db.orderPayment.count({ where: { orderId: o.id } })).toBe(0)
    const rows = await ledger(o.id)
    expect(rows.map((r) => r.kind)).toEqual(['SERVICE_STARTED'])
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(rows[0].id)
  })

  it('เริ่มงานไม่ได้: ยกเลิก/ร่าง/ปิดแล้ว/ไม่ใช่ร้านนี้ → error ที่ถูกชนิด และไม่เขียนอะไร', async () => {
    for (const status of ['CANCELLED', 'DRAFTED']) {
      const o = await mk({ status })
      await expect(start(o.publicToken)).rejects.toBeInstanceOf(ServiceJobNotStartableError)
      expect((await rowOf(o.id)).serviceStartedAt).toBeNull()
      expect(await ledger(o.id)).toHaveLength(0)
    }
    const closed = await mk()
    await closeServiceJob({ shopId: S.shop, orderToken: closed.publicToken, actorUserId: S.user, outcome: 'SERVED' })
    await expect(start(closed.publicToken)).rejects.toBeInstanceOf(ServiceJobAlreadyClosedError)
    const o = await mk()
    await expect(start(o.publicToken, S.other)).rejects.toBeInstanceOf(ServiceJobNotFoundError) // ข้ามร้าน = ไม่พบ
    expect((await rowOf(o.id)).serviceStartedAt).toBeNull()
  })

  it('ไม่ผูกห้องแชท → เริ่มงานได้ แต่ไม่มี ledger', async () => {
    const o = await mk({ linked: false })
    await start(o.publicToken)
    expect(await ledger(o.id)).toHaveLength(0)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ปิดงาน SERVED → SERVICE_CLOSED หนึ่งแถว · NO_SHOW → ไม่มี', async () => {
    const served = await mk()
    await closeServiceJob({ shopId: S.shop, orderToken: served.publicToken, actorUserId: S.user, outcome: 'SERVED' })
    expect((await ledger(served.id)).map((r) => r.kind)).toEqual(['SERVICE_CLOSED'])
    expect(dispatch).toHaveBeenCalledTimes(1)

    dispatch.mockClear()
    const noShow = await mk({ serviceStart: new Date(Date.now() - 5 * 3600_000) })
    await closeServiceJob({ shopId: S.shop, orderToken: noShow.publicToken, actorUserId: S.user, outcome: 'NO_SHOW' })
    expect(await ledger(noShow.id)).toHaveLength(0)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ตั้งนัดครั้งแรกในอนาคต → SERVICE_BOOKED · ย้ายนัดภายหลังไม่จองซ้ำ · นัดที่เริ่มแล้ว (walk-in) ไม่จอง', async () => {
    const o = await mk()
    const at = (h: number) => new Date(Date.now() + h * 3600_000)
    await setOrRescheduleAppointment({ shopId: S.shop, orderToken: o.publicToken, actorUserId: S.user, input: { resourceId: S.resource, start: at(48), end: at(49) } })
    expect((await ledger(o.id)).map((r) => r.kind)).toEqual(['SERVICE_BOOKED'])
    expect(dispatch).toHaveBeenCalledTimes(1)
    await setOrRescheduleAppointment({ shopId: S.shop, orderToken: o.publicToken, actorUserId: S.user, input: { resourceId: S.resource, start: at(72), end: at(73) } })
    expect(await ledger(o.id)).toHaveLength(1)

    const walkIn = await mk()
    await setOrRescheduleAppointment({ shopId: S.shop, orderToken: walkIn.publicToken, actorUserId: S.user, input: { resourceId: S.resource, start: at(-0.01), end: at(1) } })
    expect(await ledger(walkIn.id)).toHaveLength(0)
  })
})
