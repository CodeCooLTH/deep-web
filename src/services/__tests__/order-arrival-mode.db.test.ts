/**
 * order-arrival-mode.db.test.ts — feature 00086 S-2/S-3 (Postgres จริง)
 * ลูกค้ามาแบบไหน: createOrder (สร้างบิล) + setOrRescheduleAppointment (ตั้งเวลา/เลื่อนนัด)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้างเท่านั้น
 *
 * Mutation (ทำแล้ว 2026-10-27):
 *   · ถอด `&& arrivalMode !== "WALK_IN"` ที่ reserveAutoNotifyIntent ใน createOrder → "WALK_IN ไม่จองแจ้งลูกค้า" แดง
 *     (ledger อย่างเดียวจับไม่ได้ — eligibility ตัด walk-in ด้วย APPOINTMENT_NOT_FUTURE อยู่แล้ว
 *      เทสจึงดูที่ "ถูกเรียกจองไหม" ด้วย spy บนตัวจองจริง)
 *   · ถอด `arrivalMode !== "WALK_IN" &&` ใน setOrRescheduleAppointment → "WALK_IN เริ่มอีก 3 นาที" แดง
 *   · firstScheduleArrivalMode คืน requested ตรง ๆ (ไม่ดูเวลา) → "WALK_IN แต่เวลาเป็นพรุ่งนี้" แดง (review P2 MINOR-2)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))
// ตัวส่งจริงไม่เกี่ยว — ตัวจอง (reserve) เป็นของจริงทั้งหมด แค่ห่อ spy ไว้นับว่าถูกเรียกไหม
const { reserveSpy } = vi.hoisted(() => ({ reserveSpy: vi.fn() }))
vi.mock('@/services/auto-notify.service', async (orig) => {
  const real = await orig<typeof import('@/services/auto-notify.service')>()
  return {
    ...real,
    reserveAutoNotifyIntent: reserveSpy,
    dispatchAutoNotify: vi.fn(async () => {}),
    dispatchAutoNotifyAfterCommit: vi.fn(),
  }
})

import { createOrder } from '@/services/order.service'
import { firstScheduleArrivalMode, setOrRescheduleAppointment, WALK_IN_START_TOLERANCE_MS } from '@/services/appointment.service'
import { ArrivalModeError } from '@/lib/appointments'
import { arrivalModeOf } from '@/lib/arrival-mode'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)

type ShopFx = { shop: string; resource: string; prod: string }
const F = { user: '', svc: {} as ShopFx, svcTime: {} as ShopFx, online: { shop: '', prod: '' } }
const ids = { orders: [] as string[], convs: [] as string[] }

const DAY = 86_400_000
/** ช่วง 1 ชม. มีเวลา ในอนาคต — เลื่อนวันละช่องทุกครั้งที่เรียก กันคิวเต็ม (capacity 5) ข้ามเคส */
let slot = 0
const tomorrowAt10 = () => {
  slot += 1
  const ymd = new Date(Date.now() + slot * DAY + 7 * 3600_000).toISOString().slice(0, 10)
  return { start: new Date(`${ymd}T10:00:00+07:00`), end: new Date(`${ymd}T11:00:00+07:00`) }
}
/**
 * ทั้งวัน (นัดแบบรายวัน) ของวันมะรืนตามเวลาไทย — ไม่ใช่พรุ่งนี้: งานหน้าร้าน "เริ่มตอนนี้" ยาว 45 นาที
 * ที่สร้างหลัง ~23:15 จะเลยเที่ยงคืนไปทับนัดทั้งวันของพรุ่งนี้ในคิวเดียวกัน → คิวเต็ม (เทสล้มเฉพาะช่วงดึก · พบ 2026-10-30 23:35)
 */
const tomorrowAllDay = () => {
  const ymd = new Date(Date.now() + 2 * DAY + 7 * 3600_000).toISOString().slice(0, 10)
  const start = new Date(`${ymd}T00:00:00+07:00`)
  return { start, end: new Date(start.getTime() + DAY) }
}

async function conv(shopId: string) {
  const c = await db.conversation.create({
    data: { shopId, channel: 'DEEP', alias: `am-${run}`, lastSenderRole: 'BUYER', lastInboundAt: new Date(), lastMessageAt: new Date() },
    select: { id: true },
  })
  ids.convs.push(c.id)
  return c.id
}

async function create(fx: { shop: string; prod: string }, extra: Record<string, unknown>) {
  const o = (await createOrder(fx.shop, {
    type: 'SERVICE',
    items: [{ productId: fx.prod, name: `ล้างแอร์-${run}`, qty: 1, price: 500 }],
    ...extra,
  } as never)) as { id: string; publicToken: string; arrivalMode?: string | null }
  ids.orders.push(o.id)
  return o
}

const rowOf = (id: string) =>
  db.order.findUniqueOrThrow({
    where: { id },
    select: { arrivalMode: true, serviceStart: true, serviceEnd: true, serviceResourceId: true, depositAmount: true, createdAt: true, appointmentStatus: true },
  })
const ledgerKinds = async (orderId: string) =>
  (await db.autoNotifyLedger.findMany({ where: { orderId }, select: { kind: true } })).map((r) => r.kind)
const reservedKinds = () => reserveSpy.mock.calls.map((c) => (c[1] as { kind: string }).kind)

/** ใบที่ยังไม่ระบุเวลา (สร้างตรง ๆ ไม่มีนัด) */
async function unscheduled(conversationId: string | null = null) {
  const o = await db.order.create({
    data: {
      shopId: F.svc.shop, conversationId, type: 'SERVICE', status: 'PENDING', totalAmount: 500,
      items: { create: { name: 'ล้างแอร์', qty: 1, price: 500 } },
    } as never,
    select: { id: true, publicToken: true },
  })
  ids.orders.push(o.id)
  return o
}

describe('firstScheduleArrivalMode (review P2 MINOR-2 · ไม่แตะ DB)', () => {
  const now = Date.parse('2026-10-27T06:00:00Z')
  it('WALK_IN รับเฉพาะเวลาเริ่ม <= ตอนนี้ + 5 นาที · เกินนั้นเก็บ BOOKED', () => {
    expect(firstScheduleArrivalMode('WALK_IN', new Date(now - 60_000), now)).toBe('WALK_IN')
    expect(firstScheduleArrivalMode('WALK_IN', new Date(now + WALK_IN_START_TOLERANCE_MS), now)).toBe('WALK_IN')
    expect(firstScheduleArrivalMode('WALK_IN', new Date(now + WALK_IN_START_TOLERANCE_MS + 1), now)).toBe('BOOKED')
    expect(firstScheduleArrivalMode('WALK_IN', new Date(now + DAY), now)).toBe('BOOKED')
  })
  it('ไม่ส่ง / BOOKED → BOOKED เสมอ (แม้เวลาเริ่มคือตอนนี้)', () => {
    expect(firstScheduleArrivalMode(undefined, new Date(now), now)).toBe('BOOKED')
    expect(firstScheduleArrivalMode('BOOKED', new Date(now), now)).toBe('BOOKED')
  })
})

describe.skipIf(!isLocal)('00086 arrivalMode — createOrder + ตั้งเวลา/เลื่อนนัด (DB จริง)', () => {
  beforeAll(async () => {
    const u = await db.user.create({ data: { displayName: `am-${run}`, username: `am_${run}` }, select: { id: true } })
    F.user = u.id
    const mkSvc = async (label: string, granularity: 'DAY' | 'TIME'): Promise<ShopFx> => {
      const s = await db.shop.create({
        data: { userId: u.id, shopName: `am-${label}-${run}`, kind: 'BUSINESS', vertical: 'SERVICE_QUEUE', appointmentGranularity: granularity } as never,
        select: { id: true },
      })
      // มัดจำ 20% — ให้เห็นว่า BOOKED คิดมัดจำ แต่ WALK_IN ไม่คิด
      const r = await db.serviceResource.create({
        data: { shopId: s.id, name: `ช่าง-${label}-${run}`, capacity: 5, durationMinutes: 45, depositMode: 'PERCENT', depositValue: 20 } as never,
        select: { id: true },
      })
      const p = await db.product.create({
        data: { shopId: s.id, name: `ล้างแอร์-${run}`, price: 500, cost: 0, fulfillmentMode: 'NO_SHIPPING' } as never,
        select: { id: true },
      })
      for (const kind of ['SERVICE_BOOKED', 'SERVICE_STARTED', 'SERVICE_CLOSED']) {
        await db.autoNotifySwitch.create({ data: { shopId: s.id, kind, enabled: true, enabledAt: new Date(Date.now() - 3600_000) } })
      }
      return { shop: s.id, resource: r.id, prod: p.id }
    }
    F.svc = await mkSvc('day', 'DAY')
    F.svcTime = await mkSvc('time', 'TIME')
    const on = await db.shop.create({
      data: { userId: u.id, shopName: `am-online-${run}`, kind: 'BUSINESS', vertical: 'ONLINE_SALES' } as never,
      select: { id: true },
    })
    const op = await db.product.create({
      data: { shopId: on.id, name: `สินค้า-${run}`, price: 500, cost: 0, fulfillmentMode: 'NO_SHIPPING' } as never,
      select: { id: true },
    })
    F.online = { shop: on.id, prod: op.id }
  })

  afterAll(async () => {
    const shops = [F.svc.shop, F.svcTime.shop, F.online.shop].filter(Boolean)
    await db.autoNotifyLedger.deleteMany({ where: { orderId: { in: ids.orders } } })
    await db.appointmentReschedule.deleteMany({ where: { orderId: { in: ids.orders } } })
    await db.orderEvent.deleteMany({ where: { orderId: { in: ids.orders } } })
    await db.orderItem.deleteMany({ where: { orderId: { in: ids.orders } } })
    await db.order.deleteMany({ where: { id: { in: ids.orders } } })
    await db.conversation.deleteMany({ where: { id: { in: ids.convs } } })
    await db.autoNotifySwitch.deleteMany({ where: { shopId: { in: shops } } })
    await db.product.deleteMany({ where: { shopId: { in: shops } } })
    await db.serviceResource.deleteMany({ where: { shopId: { in: shops } } })
    await db.shop.deleteMany({ where: { id: { in: shops } } })
    await db.user.deleteMany({ where: { id: F.user } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    // config ของโปรเจกต์ reset mock ทุกเคส — ผูกตัวจองจริงใหม่ทุกครั้ง
    const real = await vi.importActual<typeof import('@/services/auto-notify.service')>('@/services/auto-notify.service')
    reserveSpy.mockReset()
    reserveSpy.mockImplementation(real.reserveAutoNotifyIntent)
  })

  // ── createOrder ──────────────────────────────────────────────────────────

  it('[blocker] BOOKED: เก็บ BOOKED + เวลาตามที่เลือก + มัดจำ + จองแจ้ง SERVICE_BOOKED', async () => {
    const { start, end } = tomorrowAt10()
    const conversationId = await conv(F.svc.shop)
    const o = await create(F.svc, {
      conversationId, arrivalMode: 'BOOKED',
      appointment: { resourceId: F.svc.resource, start, end },
    })
    expect(o.arrivalMode).toBe('BOOKED')
    const row = await rowOf(o.id)
    expect(row.arrivalMode).toBe('BOOKED')
    expect(+row.serviceStart!).toBe(+start)
    expect(String(row.depositAmount)).toBe('100')
    expect(reservedKinds()).toEqual(['SERVICE_BOOKED'])
    expect(await ledgerKinds(o.id)).toEqual(['SERVICE_BOOKED'])
  })

  it('[blocker] WALK_IN: เวลาเริ่ม = ตอนนี้ (ปัดวินาที ≤ now) · ระยะ = durationMinutes ของคิว · ไม่มีมัดจำ · ไม่จองแจ้งลูกค้า', async () => {
    const conversationId = await conv(F.svc.shop)
    const before = Date.now()
    const o = await create(F.svc, {
      conversationId, arrivalMode: 'WALK_IN',
      walkIn: { resourceId: F.svc.resource },
      // เวลา/มัดจำที่ caller แนบมาต้องถูกละ
      appointment: { resourceId: F.svc.resource, ...tomorrowAt10(), depositAmount: '300.00' },
    })
    const after = Date.now()
    const row = await rowOf(o.id)
    expect(row.arrivalMode).toBe('WALK_IN')
    expect(o.arrivalMode).toBe('WALK_IN')
    expect(row.serviceResourceId).toBe(F.svc.resource)
    expect(+row.serviceStart!).toBeLessThanOrEqual(after)
    expect(+row.serviceStart!).toBeGreaterThan(before - 60_000)
    expect(row.serviceStart!.getSeconds()).toBe(0)
    expect(row.serviceStart!.getMilliseconds()).toBe(0)
    expect(+row.serviceEnd! - +row.serviceStart!).toBe(45 * 60_000)
    expect(row.depositAmount).toBeNull()
    expect(row.appointmentStatus).toBe('SCHEDULED')
    // 🛑 ไม่เรียกตัวจองเลย (ไม่ใช่แค่ "จองแล้วไม่ผ่านเกณฑ์")
    expect(reserveSpy).not.toHaveBeenCalled()
    expect(await ledgerKinds(o.id)).toEqual([])
    expect(arrivalModeOf(row)).toBe('WALK_IN')
  })

  it('WALK_IN: durationMin ที่ส่งมาชนะระยะมาตรฐานของคิว', async () => {
    const o = await create(F.svc, { arrivalMode: 'WALK_IN', walkIn: { resourceId: F.svc.resource, durationMin: 90 } })
    const row = await rowOf(o.id)
    expect(+row.serviceEnd! - +row.serviceStart!).toBe(90 * 60_000)
  })

  it('WALK_IN ไม่มีคิว → ARRIVAL_WALK_IN_NEEDS_QUEUE ไม่สร้างอะไร', async () => {
    const before = await db.order.count({ where: { shopId: F.svc.shop } })
    await expect(create(F.svc, { arrivalMode: 'WALK_IN' })).rejects.toMatchObject({ code: 'ARRIVAL_WALK_IN_NEEDS_QUEUE' })
    expect(await db.order.count({ where: { shopId: F.svc.shop } })).toBe(before)
  })

  it('BOOKED ไม่มีนัด → ARRIVAL_BOOKED_NEEDS_TIME', async () => {
    await expect(create(F.svc, { arrivalMode: 'BOOKED' })).rejects.toBeInstanceOf(ArrivalModeError)
    await expect(create(F.svc, { arrivalMode: 'BOOKED' })).rejects.toMatchObject({ code: 'ARRIVAL_BOOKED_NEEDS_TIME' })
  })

  it('ร้านแบบระบุเวลา: BOOKED ส่งนัดทั้งวัน (ไม่มีเวลา) → ARRIVAL_BOOKED_NEEDS_TIME · ร้านรายวันรับได้', async () => {
    await expect(
      create(F.svcTime, { arrivalMode: 'BOOKED', appointment: { resourceId: F.svcTime.resource, ...tomorrowAllDay() } }),
    ).rejects.toMatchObject({ code: 'ARRIVAL_BOOKED_NEEDS_TIME' })
    const ok = await create(F.svcTime, { arrivalMode: 'BOOKED', appointment: { resourceId: F.svcTime.resource, ...tomorrowAt10() } })
    expect((await rowOf(ok.id)).arrivalMode).toBe('BOOKED')
    const day = await create(F.svc, { arrivalMode: 'BOOKED', appointment: { resourceId: F.svc.resource, ...tomorrowAllDay() } })
    expect((await rowOf(day.id)).arrivalMode).toBe('BOOKED')
  })

  it('ร้านบริการส่งนัดแต่ไม่ระบุแบบการมา → ARRIVAL_MODE_REQUIRED · ไม่มีนัด = ใบยังไม่ระบุเวลา (null)', async () => {
    await expect(
      create(F.svc, { appointment: { resourceId: F.svc.resource, ...tomorrowAt10() } }),
    ).rejects.toMatchObject({ code: 'ARRIVAL_MODE_REQUIRED' })
    const o = await create(F.svc, {})
    const row = await rowOf(o.id)
    expect(row.arrivalMode).toBeNull()
    expect(row.serviceStart).toBeNull()
    expect(arrivalModeOf(row)).toBe('UNSCHEDULED')
  })

  it('[blocker] ร้านขายของ (ONLINE_SALES): arrivalMode/walkIn ถูกละ — เก็บ NULL ไม่มีเวลานัด', async () => {
    const o = (await createOrder(F.online.shop, {
      type: 'PHYSICAL', fulfillmentMode: 'PICKUP',
      items: [{ productId: F.online.prod, name: `สินค้า-${run}`, qty: 1, price: 500 }],
      arrivalMode: 'WALK_IN', walkIn: { resourceId: F.svc.resource },
    } as never)) as { id: string }
    ids.orders.push(o.id)
    const row = await rowOf(o.id)
    expect(row.arrivalMode).toBeNull()
    expect(row.serviceStart).toBeNull()
    expect(row.serviceResourceId).toBeNull()
  })

  // ── PATCH /appointment (setOrRescheduleAppointment) ─────────────────────

  const setAppt = (publicToken: string, input: Record<string, unknown>) =>
    setOrRescheduleAppointment({ shopId: F.svc.shop, orderToken: publicToken, actorUserId: F.user, input: input as never })

  it('[blocker] ใบยังไม่ระบุเวลา + WALK_IN เริ่มตอนนี้ → WALK_IN · ไม่จองแจ้ง "จองคิวแล้ว"', async () => {
    const o = await unscheduled(await conv(F.svc.shop))
    const start = new Date()
    const res = await setAppt(o.publicToken, { resourceId: F.svc.resource, start, end: new Date(+start + 45 * 60_000), arrivalMode: 'WALK_IN' })
    expect(res.arrivalMode).toBe('WALK_IN')
    expect((await rowOf(o.id)).arrivalMode).toBe('WALK_IN')
    expect(reserveSpy).not.toHaveBeenCalled()
  })

  it('[blocker] WALK_IN เริ่มอีก 3 นาที (ในช่วงผ่อน 5 นาที) → ยัง WALK_IN · ไม่จองแจ้ง', async () => {
    // เวลาอยู่ "ในอนาคต" — ถ้าไม่กั้นด้วยแบบการมา เกณฑ์ "นัดอยู่หลัง now" จะปล่อยให้จองแจ้ง (mutation guard เดิม)
    const o = await unscheduled(await conv(F.svc.shop))
    const start = new Date(Date.now() + 3 * 60_000)
    const res = await setAppt(o.publicToken, { resourceId: F.svc.resource, start, end: new Date(+start + 45 * 60_000), arrivalMode: 'WALK_IN' })
    expect(res.arrivalMode).toBe('WALK_IN')
    expect(reserveSpy).not.toHaveBeenCalled()
  })

  it('[MINOR-2] ใบยังไม่ระบุเวลา + WALK_IN แต่เวลาเป็นพรุ่งนี้ → เก็บ BOOKED + จองแจ้ง SERVICE_BOOKED (ไม่ตอบ error)', async () => {
    const o = await unscheduled(await conv(F.svc.shop))
    const res = await setAppt(o.publicToken, { resourceId: F.svc.resource, ...tomorrowAt10(), arrivalMode: 'WALK_IN' })
    expect(res.arrivalMode).toBe('BOOKED')
    expect((await rowOf(o.id)).arrivalMode).toBe('BOOKED')
    expect(reservedKinds()).toEqual(['SERVICE_BOOKED'])
  })

  it('[blocker] ใบยังไม่ระบุเวลา + ไม่ส่ง → BOOKED (+ จองแจ้งเมื่อเป็นเวลาในอนาคต ตามเดิม)', async () => {
    const o = await unscheduled(await conv(F.svc.shop))
    const res = await setAppt(o.publicToken, { resourceId: F.svc.resource, ...tomorrowAt10() })
    expect(res.arrivalMode).toBe('BOOKED')
    expect((await rowOf(o.id)).arrivalMode).toBe('BOOKED')
    expect(reservedKinds()).toEqual(['SERVICE_BOOKED'])
  })

  it('[blocker] เลื่อนนัด: ค่าเดิมคงอยู่ ค่าที่ส่งมาถูกละ (WALK_IN คง WALK_IN · BOOKED คง BOOKED)', async () => {
    const w = await create(F.svc, { arrivalMode: 'WALK_IN', walkIn: { resourceId: F.svc.resource } })
    await setAppt(w.publicToken, { resourceId: F.svc.resource, ...tomorrowAt10() })
    expect((await rowOf(w.id)).arrivalMode).toBe('WALK_IN')

    const b = await create(F.svc, { arrivalMode: 'BOOKED', appointment: { resourceId: F.svc.resource, ...tomorrowAt10() } })
    const { start, end } = tomorrowAt10()
    await setAppt(b.publicToken, { resourceId: F.svc.resource, start: new Date(+start + 2 * 3600_000), end: new Date(+end + 2 * 3600_000), arrivalMode: 'WALK_IN' })
    expect((await rowOf(b.id)).arrivalMode).toBe('BOOKED')
  })

  it('เลื่อนนัดใบเก่าที่มีเวลาแต่ไม่มีค่าเก็บ → ไม่เติมให้ (ปล่อย arrivalModeOf ใช้สูตรเดิม)', async () => {
    const legacy = await db.order.create({
      data: {
        shopId: F.svc.shop, type: 'SERVICE', status: 'PENDING', totalAmount: 500,
        serviceResourceId: F.svc.resource, serviceSeat: 1, appointmentStatus: 'SCHEDULED',
        serviceStart: new Date(Date.now() + 300 * DAY), serviceEnd: new Date(Date.now() + 300 * DAY + 3600_000),
        items: { create: { name: 'ล้างแอร์', qty: 1, price: 500 } },
      } as never,
      select: { id: true, publicToken: true },
    })
    ids.orders.push(legacy.id)
    await setAppt(legacy.publicToken, { resourceId: F.svc.resource, start: new Date(Date.now() + 301 * DAY), end: new Date(Date.now() + 301 * DAY + 3600_000) })
    const row = await rowOf(legacy.id)
    expect(row.arrivalMode).toBeNull()
    expect(arrivalModeOf(row)).toBe('BOOKED')
  })
})
