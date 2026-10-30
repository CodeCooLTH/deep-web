/**
 * 00086 P3 T5 + ส่วนเพิ่ม (user อนุมัติ 2026-10-29) บน Postgres จริง
 *  - T5: payload ที่จอใช้ — getOrderForShop (ผู้รับผิดชอบ + รูป/บันทึก เฉพาะร้านบริการ) · แถวนัดรายวัน · งานค้างจากวันก่อน
 *  - ปลดผู้รับผิดชอบเมื่อสมาชิกไม่ได้ถือ "ช่าง" แล้ว (แก้บทบาท · เลื่อนเป็นเจ้าของ · รับโอนร้าน)
 *
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้างเอง
 *
 * Mutation (รายงานใน handback):
 *   M-role    `mustUnassignOpenJobs` คืน false เสมอ                       → "ถอดช่าง → ปลด" แดง
 *   M-still   ตัด `!` หน้า effectiveRoles(...).includes('TECHNICIAN')     → "ยังถือช่าง → ไม่แตะ" แดง
 *   M-gate    ตัด canUseAppointments ใน getOrderForShop                   → "ร้านอื่นไม่มีคีย์ใหม่" แดง
 *   M-span    ตัด `serviceEnd: { lte: todayStart }` ใน listMyCarryOverJobs  → "คร่อมวันนี้ไม่ซ้ำ" แดง
 *   M-reason  ตรึง reason เป็น 'MEMBER_REMOVED' ใน unassignMemberOpenJobs  → 3 เทส ROLE_REMOVED แดง
 *   M-unsch   ตัด `serviceStart: null` / `serviceClosedAt: null` ใน listMyUnscheduledJobs → "ยังไม่ระบุเวลา" แดง
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
// โอนร้านคำนวณ trust ใหม่หลัง commit — ไม่ใช่เรื่องที่เทสนี้วัด
vi.mock('@/services/trust-score.service', async (orig) => ({
  ...(await orig<typeof import('@/services/trust-score.service')>()),
  recalculateShopTrustScore: vi.fn(async () => {}),
}))

import { getOrderForShop } from '@/services/order.service'
import { listAppointmentsForDay, listMyCarryOverJobs, listMyUnscheduledJobs } from '@/services/appointment.service'
import { changeMemberRole, removeShopMember, transferShopOwnership } from '@/services/shop-member.service'
import { AppointmentFeatureUnavailableError } from '@/lib/appointments'
import { appointmentDayBounds } from '@/lib/appointment-day'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const H = 3600_000

const U: Record<string, string> = {}
const M: Record<string, string> = {}
const S = { svc: '', svc2: '', online: '', xfer: '' }
const R: Record<string, string> = {}
const ids = { users: [] as string[], members: [] as string[], orders: [] as string[], resources: [] as string[], subs: [] as string[] }
let seat = 0

async function mkJob(o: {
  shop?: string; assigned?: string | null; started?: boolean; finished?: boolean; closed?: boolean; status?: string
  start?: Date; end?: Date
  /** 00086 M1 — งานไม่มีเวลานัด (serviceStart/End/คิว = null · ไม่มี appointmentStatus) */
  unscheduled?: boolean
} = {}) {
  const shopId = o.shop ?? S.svc
  const start = o.start ?? new Date(Date.now() - H)
  const ord = await db.order.create({
    data: {
      shopId, type: 'SERVICE', status: o.status ?? 'PENDING', totalAmount: 500, depositAmount: 100,
      buyerContact: `08${run}`, buyerName: 'คุณสมชาย', assignedUserId: o.assigned ?? null,
      ...(o.unscheduled
        ? { serviceResourceId: null, serviceSeat: null, serviceStart: null, serviceEnd: null, appointmentStatus: null }
        : { serviceResourceId: R[shopId], serviceSeat: ++seat, serviceStart: start, serviceEnd: o.end ?? new Date(+start + H), appointmentStatus: 'SCHEDULED' }),
      serviceStartedAt: o.started || o.finished ? new Date(+start + 60_000) : null,
      serviceFinishedAt: o.finished ? new Date(+start + 120_000) : null,
      serviceClosedAt: o.closed ? new Date() : null,
      items: { create: { name: 'ล้างแอร์', qty: 1, price: 500 } },
    } as never,
    select: { id: true, publicToken: true },
  })
  ids.orders.push(ord.id)
  return ord
}
const assigneeOf = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id }, select: { assignedUserId: true } })).assignedUserId
const unassignEvents = (orderId: string) => db.orderEvent.findMany({ where: { orderId, type: 'SERVICE_UNASSIGNED' } })
/** ใบเปิดที่มอบให้คนนี้ในร้านนี้ตอนนี้ — fixture ร่วมทั้งไฟล์ ⇒ จำนวนที่ service คืนต้องเท่ากับค่านี้ก่อนเรียก (ไม่ใช่เลขตายตัว) */
const openAssignedCount = (shopId: string, userId: string) =>
  db.order.count({ where: { shopId, assignedUserId: userId, serviceClosedAt: null, status: { notIn: ['CANCELLED', 'RETURNED'] } } })

describe.skipIf(!isLocal)('00086 P3 — payload ของจอ + ปลดงานเมื่อไม่ได้เป็นช่างแล้ว (DB จริง)', () => {
  beforeAll(async () => {
    const mkUser = async (k: string, name: string) => {
      const u = await db.user.create({ data: { displayName: name, username: `sjp_${run}_${k}` }, select: { id: true } })
      ids.users.push(u.id)
      U[k] = u.id
    }
    for (const [k, n] of [['owner', 'เจ้าของ'], ['tech1', 'ช่างนิด'], ['tech2', 'ช่างหน่อย'], ['tech3', 'ช่างต้น'], ['tech4', 'ช่างแดง'], ['tech5', 'ช่างขาว'], ['recipient', 'ผู้รับโอน']] as const) {
      await mkUser(k, `${n}-${run}`)
    }
    const mkShop = async (n: string, vertical: string) =>
      (await db.shop.create({ data: { userId: U.owner, shopName: `sjp-${n}-${run}`, kind: 'BUSINESS', vertical } as never, select: { id: true } })).id
    S.svc = await mkShop('svc', 'SERVICE_QUEUE')
    S.svc2 = await mkShop('svc2', 'SERVICE_QUEUE')
    S.online = await mkShop('onl', 'ONLINE_SALES')
    S.xfer = await mkShop('xfer', 'SERVICE_QUEUE')
    for (const s of [S.svc, S.svc2, S.online, S.xfer]) {
      const r = await db.serviceResource.create({ data: { shopId: s, name: `คิว-${run}`, capacity: 50 }, select: { id: true } })
      ids.resources.push(r.id)
      R[s] = r.id
    }
    const mem = async (shopId: string, userId: string, role: string, roles: string[]) => {
      const m = await db.shopMember.create({ data: { shopId, userId, role, roles }, select: { id: true } })
      ids.members.push(m.id)
      return m.id
    }
    for (const s of [S.svc, S.svc2, S.online, S.xfer]) await mem(s, U.owner, 'OWNER', [])
    M.tech1 = await mem(S.svc, U.tech1, 'ADMIN', ['TECHNICIAN'])
    M.tech2 = await mem(S.svc, U.tech2, 'ADMIN', ['TECHNICIAN'])
    M.tech3 = await mem(S.svc, U.tech3, 'ADMIN', ['TECHNICIAN'])
    M.tech4 = await mem(S.svc, U.tech4, 'ADMIN', ['TECHNICIAN'])
    M.tech5 = await mem(S.svc, U.tech5, 'ADMIN', ['TECHNICIAN'])
    M.tech1svc2 = await mem(S.svc2, U.tech1, 'ADMIN', ['TECHNICIAN'])
    M.tech1online = await mem(S.online, U.tech1, 'ADMIN', ['TECHNICIAN'])
    M.recipient = await mem(S.xfer, U.recipient, 'ADMIN', ['TECHNICIAN'])
  })
  afterAll(async () => {
    await db.order.deleteMany({ where: { id: { in: ids.orders } } }) // Cascade: ServiceJobRecord · OrderEvent · OrderItem
    await db.shopMember.deleteMany({ where: { id: { in: ids.members } } })
    await db.serviceResource.deleteMany({ where: { id: { in: ids.resources } } })
    await db.businessPackageSubscription.deleteMany({ where: { id: { in: ids.subs } } })
    await db.shop.deleteMany({ where: { id: { in: [S.svc, S.svc2, S.online, S.xfer] } } })
    await db.user.deleteMany({ where: { id: { in: ids.users } } })
    await db.$disconnect()
  })

  // ─── T5: getOrderForShop ───────────────────────────────────────────────────────────────────
  describe('getOrderForShop', () => {
    it('ร้านบริการ: assignedUser {id, displayName} เท่านั้น + serviceJobRecords เรียงตามเวลา (createdBy ชื่อเท่านั้น)', async () => {
      const j = await mkJob({ assigned: U.tech1, finished: true })
      await db.serviceJobRecord.create({ data: { orderId: j.id, shopId: S.svc, phase: 'AFTER', note: 'เสร็จ', fileIds: ['a.jpg'], createdByUserId: U.tech1, createdAt: new Date(Date.now() - 1000) } })
      await db.serviceJobRecord.create({ data: { orderId: j.id, shopId: S.svc, phase: 'BEFORE', note: null, fileIds: ['b.jpg'], createdByUserId: U.tech1, createdAt: new Date(Date.now() - 5000) } })
      const o = (await getOrderForShop(j.publicToken, S.svc))!
      expect(o.assignedUserId).toBe(U.tech1)
      expect(o.serviceFinishedAt).toBeInstanceOf(Date)
      expect(o.assignedUser).toEqual({ id: U.tech1, displayName: `ช่างนิด-${run}` })
      expect(o.serviceJobRecords!.map((r) => r.phase)).toEqual(['BEFORE', 'AFTER'])
      expect(o.serviceJobRecords![1]).toEqual({ phase: 'AFTER', note: 'เสร็จ', fileIds: ['a.jpg'], createdAt: expect.any(Date), createdBy: { displayName: `ช่างนิด-${run}` } })
      // ตั้งค่ารูปของร้านมากับแถวร้านที่ include อยู่แล้ว (หน้าใช้ได้โดยไม่ต้อง query เพิ่ม)
      expect(o.shop).toMatchObject({ serviceJobPhotoMode: 'OPTIONAL', serviceJobPhotosBuyerVisible: false })
    })
    it('ร้านบริการ ยังไม่มีคนรับ/ไม่มีบันทึก: assignedUser null · records []', async () => {
      const j = await mkJob()
      const o = (await getOrderForShop(j.publicToken, S.svc))!
      expect(o.assignedUser).toBeNull()
      expect(o.serviceJobRecords).toEqual([])
    })
    it('ร้านไม่ใช่บริการ: ไม่มีคีย์ assignedUser / serviceJobRecords เลย (payload เดิม)', async () => {
      const j = await mkJob({ shop: S.online, assigned: U.tech1 })
      const o = (await getOrderForShop(j.publicToken, S.online))!
      expect(o).not.toHaveProperty('assignedUser')
      expect(o).not.toHaveProperty('serviceJobRecords')
    })
    it('ใบของร้านอื่น → null (scope shopId คงเดิม)', async () => {
      const j = await mkJob()
      expect(await getOrderForShop(j.publicToken, S.svc2)).toBeNull()
    })
  })

  // ─── T5: แถวนัดรายวัน + งานค้างจากวันก่อน ─────────────────────────────────────────────────────
  describe('listAppointmentsForDay — คีย์ใหม่', () => {
    it('assignee {userId, displayName} + serviceStartedAt/FinishedAt/ClosedAt · ไม่มีคนรับ = null', async () => {
      const { from, to } = appointmentDayBounds('today')
      const s = new Date(+from + 2 * H)
      const mine = await mkJob({ assigned: U.tech2, finished: true, start: s })
      const none = await mkJob({ start: s })
      const items = await listAppointmentsForDay({ shopId: S.svc, from, to })
      const a = items.find((i) => i.orderToken === mine.publicToken)!
      const b = items.find((i) => i.orderToken === none.publicToken)!
      expect(a.assignee).toEqual({ userId: U.tech2, displayName: `ช่างหน่อย-${run}` })
      expect(a.serviceStartedAt).toBeInstanceOf(Date)
      expect(a.serviceFinishedAt).toBeInstanceOf(Date)
      expect(a.serviceClosedAt).toBeNull()
      expect(b).toMatchObject({ assignee: null, serviceStartedAt: null, serviceFinishedAt: null, serviceClosedAt: null })
    })
  })

  describe('listMyCarryOverJobs', () => {
    it('เฉพาะงานของฉันที่เริ่มแล้ว ยังไม่ทำเสร็จ/ไม่ปิด และนัดจบก่อนวันนี้ · ไม่ซ้ำกับรายการวันนี้', async () => {
      const { from, to } = appointmentDayBounds('today')
      const y = new Date(+from - 20 * H) // เมื่อวาน (เวลาไทย)
      const inc = await mkJob({ assigned: U.tech3, started: true, start: y })
      const older = await mkJob({ assigned: U.tech3, started: true, start: new Date(+from - 72 * H) })
      const finished = await mkJob({ assigned: U.tech3, finished: true, start: y })
      const closed = await mkJob({ assigned: U.tech3, started: true, closed: true, start: y })
      const others = await mkJob({ assigned: U.tech4, started: true, start: y })
      const notStarted = await mkJob({ assigned: U.tech3, start: y })
      const today = await mkJob({ assigned: U.tech3, started: true, start: new Date(+from + H) })
      const cancelled = await mkJob({ assigned: U.tech3, started: true, status: 'CANCELLED', start: y })
      const spanning = await mkJob({ assigned: U.tech3, started: true, start: new Date(+from - 2 * H), end: new Date(+from + 2 * H) })

      const got = await listMyCarryOverJobs({ shopId: S.svc, userId: U.tech3 })
      expect(got.map((g) => g.orderToken)).toEqual([older.publicToken, inc.publicToken]) // เรียงตามเวลานัด
      for (const t of [finished, closed, others, notStarted, today, cancelled, spanning]) {
        expect(got.map((g) => g.orderToken)).not.toContain(t.publicToken)
      }
      // ทรงเดียวกับแถวรายวัน (การ์ดเดียวกัน)
      expect(got[1]).toMatchObject({ assignee: { userId: U.tech3, displayName: `ช่างต้น-${run}` }, serviceFinishedAt: null, firstItemName: 'ล้างแอร์', totalAmount: '500' })
      // งานคร่อมเมื่อวาน→วันนี้ อยู่ในรายการ "วันนี้" แทน — ไม่หายจากหน้า และไม่ขึ้นสองที่
      const day = await listAppointmentsForDay({ shopId: S.svc, from, to })
      expect(day.map((d) => d.orderToken)).toContain(spanning.publicToken)
    })
    it('งานของฉันในร้านอื่น ไม่ปน (scope shopId)', async () => {
      const { from } = appointmentDayBounds('today')
      const elsewhere = await mkJob({ shop: S.svc2, assigned: U.tech1, started: true, start: new Date(+from - 20 * H) })
      const got = await listMyCarryOverJobs({ shopId: S.svc, userId: U.tech1 })
      expect(got.map((g) => g.orderToken)).not.toContain(elsewhere.publicToken)
      expect((await listMyCarryOverJobs({ shopId: S.svc2, userId: U.tech1 })).map((g) => g.orderToken)).toContain(elsewhere.publicToken)
    })
    it('ร้านไม่ใช่บริการ → AppointmentFeatureUnavailableError (เหมือนรายการรายวัน)', async () => {
      await expect(listMyCarryOverJobs({ shopId: S.online, userId: U.tech1 })).rejects.toBeInstanceOf(AppointmentFeatureUnavailableError)
    })
  })

  describe('listMyUnscheduledJobs (00086 M1)', () => {
    it('เฉพาะงานของฉันที่ไม่มีเวลา ∧ ยังไม่ปิด ∧ ไม่ใช่ร่าง/ยกเลิก/คืน · เริ่มแล้วก็ยังอยู่ · start/end = null · ทรงเดียวกับแถวรายวัน', async () => {
      const inc = await mkJob({ assigned: U.tech5, unscheduled: true })
      const startedU = await mkJob({ assigned: U.tech5, unscheduled: true, started: true })
      const closed = await mkJob({ assigned: U.tech5, unscheduled: true, closed: true })
      const others = await mkJob({ assigned: U.tech2, unscheduled: true })
      const nobody = await mkJob({ unscheduled: true })
      const timed = await mkJob({ assigned: U.tech5 })
      const drafted = await mkJob({ assigned: U.tech5, unscheduled: true, status: 'DRAFTED' })
      const cancelled = await mkJob({ assigned: U.tech5, unscheduled: true, status: 'CANCELLED' })
      const returned = await mkJob({ assigned: U.tech5, unscheduled: true, status: 'RETURNED' })
      const elsewhere = await mkJob({ shop: S.svc2, assigned: U.tech5, unscheduled: true })

      const got = await listMyUnscheduledJobs({ shopId: S.svc, userId: U.tech5 })
      expect(got.map((g) => g.orderToken)).toEqual([inc.publicToken, startedU.publicToken]) // เรียงตามเวลาเปิดบิล
      for (const t of [closed, others, nobody, timed, drafted, cancelled, returned, elsewhere]) {
        expect(got.map((g) => g.orderToken)).not.toContain(t.publicToken)
      }
      expect(got[0]).toMatchObject({
        start: null, end: null, resource: null,
        assignee: { userId: U.tech5, displayName: `ช่างขาว-${run}` }, firstItemName: 'ล้างแอร์', totalAmount: '500',
      })
      // ไม่ซ้อนกับ "ค้างจากวันก่อน" (นั่นต้องมีเวลา)
      expect((await listMyCarryOverJobs({ shopId: S.svc, userId: U.tech5 })).map((g) => g.orderToken)).not.toContain(startedU.publicToken)
    })
    it('ร้านไม่ใช่บริการ → AppointmentFeatureUnavailableError', async () => {
      await expect(listMyUnscheduledJobs({ shopId: S.online, userId: U.tech1 })).rejects.toBeInstanceOf(AppointmentFeatureUnavailableError)
    })
  })

  // ─── ปลดผู้รับผิดชอบเมื่อไม่ได้เป็นช่างแล้ว ─────────────────────────────────────────────────────
  describe('changeMemberRole / transferShopOwnership — ไม่ได้ถือช่างแล้ว ⇒ งานเปิดกลับเป็น "ยังไม่มีคนรับ"', () => {
    it('ถอด TECHNICIAN (→ CHAT): ปลดใบเปิด + event ROLE_REMOVED · เวลาเริ่ม/บันทึกคงเดิม · ใบปิด/ยกเลิก/ของคนอื่น/ร้านอื่นไม่แตะ', async () => {
      const open1 = await mkJob({ assigned: U.tech1 })
      const started = await mkJob({ assigned: U.tech1, started: true })
      await db.serviceJobRecord.create({ data: { orderId: started.id, shopId: S.svc, phase: 'BEFORE', fileIds: ['b.jpg'], createdByUserId: U.tech1 } })
      const startedAt0 = (await db.order.findUniqueOrThrow({ where: { id: started.id }, select: { serviceStartedAt: true } })).serviceStartedAt
      const closed = await mkJob({ assigned: U.tech1, closed: true })
      const cancelled = await mkJob({ assigned: U.tech1, status: 'CANCELLED' })
      const others = await mkJob({ assigned: U.tech2 })
      const svc2Job = await mkJob({ shop: S.svc2, assigned: U.tech1 })

      // จำนวนที่คืน = ใบที่ปลดจริง (≥ open1 + started) — toast ใช้ค่านี้
      const before = await openAssignedCount(S.svc, U.tech1)
      expect(before).toBeGreaterThanOrEqual(2)
      expect((await changeMemberRole(U.owner, S.svc, M.tech1, { roles: ['CHAT'] })).unassignedJobCount).toBe(before)

      expect(await assigneeOf(open1.id)).toBeNull()
      expect(await assigneeOf(started.id)).toBeNull()
      const after = await db.order.findUniqueOrThrow({ where: { id: started.id }, select: { serviceStartedAt: true } })
      expect(after.serviceStartedAt).toEqual(startedAt0)
      expect(await db.serviceJobRecord.count({ where: { orderId: started.id } })).toBe(1)
      expect(await assigneeOf(closed.id)).toBe(U.tech1)
      expect(await assigneeOf(cancelled.id)).toBe(U.tech1)
      expect(await assigneeOf(others.id)).toBe(U.tech2)
      expect(await assigneeOf(svc2Job.id)).toBe(U.tech1)

      const ev = await unassignEvents(open1.id)
      expect(ev).toHaveLength(1)
      expect(ev[0].actorUserId).toBe(U.owner)
      expect(ev[0].meta).toMatchObject({ reason: 'ROLE_REMOVED', previousAssigneeNameSnapshot: `ช่างนิด-${run}` })
      for (const j of [closed, cancelled, others, svc2Job]) expect(await unassignEvents(j.id)).toHaveLength(0)
    })

    it('ยังถือ TECHNICIAN (เพิ่ม CHAT · แก้ธง) → งานไม่เปลี่ยน ไม่มี event', async () => {
      const j = await mkJob({ assigned: U.tech2 })
      expect((await changeMemberRole(U.owner, S.svc, M.tech2, { roles: ['CHAT', 'TECHNICIAN'] })).unassignedJobCount).toBe(0)
      expect((await changeMemberRole(U.owner, S.svc, M.tech2, { canCloseJob: true })).unassignedJobCount).toBe(0)
      expect(await assigneeOf(j.id)).toBe(U.tech2)
      expect(await unassignEvents(j.id)).toHaveLength(0)
    })

    it('เลื่อนเป็นเจ้าของร่วม (role OWNER) → ปลด (เจ้าของถูกมอบงานไม่ได้)', async () => {
      const j = await mkJob({ assigned: U.tech5, started: true })
      const before = await openAssignedCount(S.svc, U.tech5)
      expect((await changeMemberRole(U.owner, S.svc, M.tech5, { role: 'OWNER' })).unassignedJobCount).toBe(before)
      expect(await assigneeOf(j.id)).toBeNull()
      expect((await unassignEvents(j.id))[0].meta).toMatchObject({ reason: 'ROLE_REMOVED' })
    })

    it('รับโอนร้าน (กลายเป็นเจ้าของหลัก) → งานเปิดของผู้รับโอนถูกปลด', async () => {
      const sub = await db.businessPackageSubscription.create({
        data: { ownerId: U.recipient, tier: 'BUSINESS', status: 'ACTIVE', activatedAt: new Date(), currentPeriodStart: new Date(), nextRenewalAt: new Date(Date.now() + 30 * 24 * H) },
        select: { id: true },
      })
      ids.subs.push(sub.id)
      const j = await mkJob({ shop: S.xfer, assigned: U.recipient })
      expect(await transferShopOwnership(U.owner, S.xfer, M.recipient)).toEqual({ transferred: true, unassignedJobCount: 1 })
      expect((await db.shop.findUniqueOrThrow({ where: { id: S.xfer }, select: { userId: true } })).userId).toBe(U.recipient)
      expect(await assigneeOf(j.id)).toBeNull()
      const ev = await unassignEvents(j.id)
      expect(ev).toHaveLength(1)
      expect(ev[0].meta).toMatchObject({ reason: 'ROLE_REMOVED', previousAssigneeNameSnapshot: `ผู้รับโอน-${run}` })
    })

    it('ร้านไม่ใช่บริการ → no-op (แม้มีแถวที่ค้างชื่อ)', async () => {
      const j = await mkJob({ shop: S.online, assigned: U.tech1 })
      expect((await changeMemberRole(U.owner, S.online, M.tech1online, { roles: ['CHAT'] })).unassignedJobCount).toBe(0)
      expect(await assigneeOf(j.id)).toBe(U.tech1)
      expect(await unassignEvents(j.id)).toHaveLength(0)
    })

    it('ลบสมาชิกยังเขียน MEMBER_REMOVED เหมือนเดิม (ไม่ปนกับ ROLE_REMOVED)', async () => {
      const j = await mkJob({ assigned: U.tech4 })
      const before = await openAssignedCount(S.svc, U.tech4)
      expect(await removeShopMember(U.owner, S.svc, M.tech4)).toEqual({ removed: true, unassignedJobCount: before })
      ids.members = ids.members.filter((m) => m !== M.tech4)
      expect(await assigneeOf(j.id)).toBeNull()
      expect((await unassignEvents(j.id))[0].meta).toMatchObject({ reason: 'MEMBER_REMOVED' })
    })
  })
})
