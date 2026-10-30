/**
 * 00086 P3 T3 — งานของช่าง (service layer) บน Postgres จริง
 * เริ่ม/ทำเสร็จพร้อมรูป · ด่านช่างล้วน · รับงานพร้อมกัน · มอบงาน · ปิดงาน · ลบสมาชิก · createOrder · แจ้งลูกค้า SERVICE_FINISHED · แจ้งเจ้าของ/ผู้ดูแล
 *
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้างเอง
 *
 * Mutation (รายงานใน handback):
 *   M-claim   ลบ `assignedUserId: null` ใน where ของ claim            → "รับงานพร้อมกัน" แดง
 *   M-retry   ย้าย assertServiceJobPhotoInput ไปก่อนเช็ก alreadyStarted → "กดซ้ำหลังเริ่มแล้ว ไม่ 400" แดง
 *   M-close   ลบ assertTechnicianMayClose ใน closeServiceJob          → "ช่างล้วนปิดก่อนทำเสร็จ" แดง
 *   M-actor   ลบ assertActorOwnsJob ใน start                          → "ช่างล้วนเริ่มงานคนอื่น" แดง
 *   M-aud     ตัด `roles: { has: 'MANAGER' }` ออกจาก audience        → "ผู้รับแจ้งเตือน" แดง
 *   M-lock    ลบ lockMemberRow ใน resolveTechnicianAssignee            → 3 เทส "ถอดช่างแข่งกับ มอบ/รับ/สร้างงาน" แดง
 *   M-pin     ตัด `assignedUserId: current.assignedUserId` ใน assign  → "รับงานแทรกก่อนมอบ → previous ถูกคน" แดง
 *   M-del     ตัด unassignUserOpenJobsEverywhere ใน deleteAccount      → "ลบบัญชี → ปลดงาน" แดง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))
const h = vi.hoisted(() => ({
  dispatch: vi.fn(async (_id: string) => {}),
  notify: vi.fn(async (_p: unknown) => {}),
  push: vi.fn(async () => {}),
}))
vi.mock('@/services/auto-notify.service', async (orig) => ({
  ...(await orig<typeof import('@/services/auto-notify.service')>()),
  dispatchAutoNotify: h.dispatch,
}))
// เทสการไหลของงานจับแค่ "สั่งแจ้งใคร เหตุการณ์อะไร" · ตัวแจ้งจริงเทสแยกใน describe ท้ายไฟล์ (importActual)
vi.mock('@/services/service-job-notify.service', async (orig) => ({
  ...(await orig<typeof import('@/services/service-job-notify.service')>()),
  notifyServiceJob: h.notify,
}))
vi.mock('@/services/app-push.service', () => ({ pushToUsers: h.push }))
// storage: fileId ที่ขึ้นต้น missing- = ไม่มีไฟล์จริง (อัปไม่ครบ)
vi.mock('@/lib/storage', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage')>()),
  getFileMeta: vi.fn(async (id: string) => (id.startsWith('missing-') ? null : { size: 10, ext: 'jpg' })),
}))

import {
  assignServiceJob,
  claimServiceJob,
  closeServiceJob,
  finishServiceJob,
  listServiceStaff,
  startServiceJob,
  unassignServiceJob,
  updateServiceJobPhotoSettings,
} from '@/services/service-job.service'
import { removeShopMember } from '@/services/shop-member.service'
import { deleteAccount } from '@/services/account-deletion.service'
import { createOrder } from '@/services/order.service'
import { getServiceReportData } from '@/services/service-report.service'
import {
  AssigneeNotTechnicianError,
  ServiceJobAlreadyAssignedError,
  ServiceJobAlreadyClosedError,
  ServiceJobClaimTechnicianOnlyError,
  ServiceJobNotAssigneeError,
  ServiceJobNotFinishedError,
  ServiceJobNotStartedError,
  ServiceJobPhotoMissingError,
  ServiceJobPhotoRequiredError,
  ServiceJobPhotosDisabledError,
  ServiceJobUnassignedError,
} from '@/lib/service-job'
import { AppointmentFeatureUnavailableError } from '@/lib/appointments'
import type { ShopRole } from '@/lib/shop-permissions'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)

const U: Record<string, string> = {}
const S = { shop: '', online: '' }
const ids = { users: [] as string[], members: [] as string[], orders: [] as string[], convs: [] as string[], shops: [] as string[] }
const T: ShopRole[] = ['TECHNICIAN']
const OWN: ShopRole[] = ['OWNER']
const CH: ShopRole[] = ['CHAT']
const CHT: ShopRole[] = ['CHAT', 'TECHNICIAN']

async function mkJob(o: { assigned?: string | null; started?: boolean; finished?: boolean; closed?: boolean; status?: string; shopId?: string; linked?: boolean } = {}) {
  let conversationId: string | null = null
  if (o.linked) {
    const c = await db.conversation.create({
      data: { shopId: o.shopId ?? S.shop, channel: 'DEEP', alias: `sjt-${run}`, lastSenderRole: 'BUYER', lastInboundAt: new Date(), lastMessageAt: new Date() },
      select: { id: true },
    })
    ids.convs.push(c.id)
    conversationId = c.id
  }
  const t0 = new Date(Date.now() - 3600_000)
  const ord = await db.order.create({
    data: {
      shopId: o.shopId ?? S.shop, type: 'SERVICE', status: o.status ?? 'PENDING', totalAmount: 500, conversationId,
      buyerContact: `08${run}`, buyerName: 'คุณสมชาย', assignedUserId: o.assigned ?? null,
      serviceStartedAt: o.started || o.finished ? t0 : null,
      serviceFinishedAt: o.finished ? new Date(+t0 + 60_000) : null,
      serviceClosedAt: o.closed ? new Date() : null,
      items: { create: { name: 'ล้างแอร์', qty: 1, price: 500 } },
    } as never,
    select: { id: true, publicToken: true },
  })
  ids.orders.push(ord.id)
  return ord
}
const row = (id: string) =>
  db.order.findUniqueOrThrow({
    where: { id },
    select: { assignedUserId: true, serviceStartedAt: true, serviceFinishedAt: true, serviceClosedAt: true, status: true, totalAmount: true },
  })
const records = (orderId: string) => db.serviceJobRecord.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } })
const events = (orderId: string, type: string) => db.orderEvent.findMany({ where: { orderId, type } })
const setPhoto = (mode: string, visible: boolean) =>
  db.shop.update({ where: { id: S.shop }, data: { serviceJobPhotoMode: mode, serviceJobPhotosBuyerVisible: visible } })

const start = (token: string, actor: string, roles: ShopRole[], extra: object = {}) =>
  startServiceJob({ shopId: S.shop, orderToken: token, actorUserId: actor, actorRoles: roles, ...extra })
const finish = (token: string, actor: string, roles: ShopRole[], extra: object = {}) =>
  finishServiceJob({ shopId: S.shop, orderToken: token, actorUserId: actor, actorRoles: roles, ...extra })
const close = (token: string, actor: string, roles: ShopRole[]) =>
  closeServiceJob({ shopId: S.shop, orderToken: token, actorUserId: actor, actorRoles: roles, outcome: 'SERVED' })
const claim = (token: string, actor: string, roles: ShopRole[] = T) =>
  claimServiceJob({ shopId: S.shop, orderToken: token, actorUserId: actor, actorRoles: roles })

describe.skipIf(!isLocal)('00086 P3 งานของช่าง — service layer (DB จริง)', () => {
  beforeAll(async () => {
    const mkUser = async (k: string, name: string) => {
      const u = await db.user.create({ data: { displayName: name, username: `sjt_${run}_${k}` }, select: { id: true } })
      ids.users.push(u.id)
      U[k] = u.id
    }
    await mkUser('owner', `เจ้าของ-${run}`)
    await mkUser('manager', `ผู้จัดการ-${run}`)
    await mkUser('chat', `แชท-${run}`)
    await mkUser('tech1', `ช่างนิด-${run}`)
    await mkUser('tech2', `ช่างหน่อย-${run}`)
    await mkUser('chatTech', `แชทช่าง-${run}`)
    await mkUser('billing', `บิล-${run}`)
    await mkUser('demoted', `อดีตเจ้าของ-${run}`)
    const mkShop = (n: string, vertical: string) =>
      db.shop.create({ data: { userId: U.owner, shopName: `sjt-${n}-${run}`, kind: 'BUSINESS', vertical } as never, select: { id: true } })
    S.shop = (await mkShop('svc', 'SERVICE_QUEUE')).id
    S.online = (await mkShop('onl', 'ONLINE_SALES')).id
    const mem = async (shopId: string, userId: string, role: string, roles: string[]) => {
      const m = await db.shopMember.create({ data: { shopId, userId, role, roles }, select: { id: true } })
      ids.members.push(m.id)
      return m.id
    }
    await mem(S.shop, U.owner, 'OWNER', [])
    await mem(S.shop, U.manager, 'ADMIN', ['MANAGER'])
    await mem(S.shop, U.chat, 'ADMIN', ['CHAT'])
    U.tech1Member = await mem(S.shop, U.tech1, 'ADMIN', ['TECHNICIAN'])
    await mem(S.shop, U.tech2, 'ADMIN', ['TECHNICIAN'])
    await mem(S.shop, U.chatTech, 'ADMIN', ['CHAT', 'TECHNICIAN'])
    await mem(S.shop, U.billing, 'ADMIN', ['BILLING'])
    await mem(S.shop, U.demoted, 'ADMIN', ['CHAT'])
    await mem(S.online, U.owner, 'OWNER', [])
    await mem(S.online, U.tech1, 'ADMIN', ['TECHNICIAN'])
  })
  afterAll(async () => {
    if (ids.users.length) await db.notification.deleteMany({ where: { userId: { in: ids.users } } })
    await db.autoNotifyLedger.deleteMany({ where: { orderId: { in: ids.orders } } })
    await db.chatMessage.deleteMany({ where: { conversationId: { in: ids.convs } } })
    await db.order.deleteMany({ where: { id: { in: ids.orders } } }) // Cascade: ServiceJobRecord · OrderEvent · OrderItem
    await db.conversation.deleteMany({ where: { id: { in: ids.convs } } })
    await db.shopMember.deleteMany({ where: { id: { in: ids.members } } })
    await db.shop.deleteMany({ where: { id: { in: [S.shop, S.online, ...ids.shops] } } })
    await db.user.deleteMany({ where: { id: { in: ids.users } } })
    await db.$disconnect()
  })
  beforeEach(async () => {
    h.dispatch.mockClear()
    h.notify.mockClear()
    h.push.mockClear()
    await setPhoto('OPTIONAL', false)
  })

  // ─── เริ่มงาน ────────────────────────────────────────────────────────────────────────────────
  describe('startServiceJob', () => {
    it('REQUIRED + ไม่มีรูป → PhotoRequired และ serviceStartedAt ยัง null', async () => {
      await setPhoto('REQUIRED', false)
      const j = await mkJob({ assigned: U.tech1 })
      await expect(start(j.publicToken, U.tech1, T)).rejects.toBeInstanceOf(ServiceJobPhotoRequiredError)
      expect((await row(j.id)).serviceStartedAt).toBeNull()
    })
    it('NONE + ส่งรูป → PhotosDisabled', async () => {
      await setPhoto('NONE', false)
      const j = await mkJob({ assigned: U.tech1 })
      await expect(start(j.publicToken, U.tech1, T, { photoFileIds: ['a.jpg'] })).rejects.toBeInstanceOf(ServiceJobPhotosDisabledError)
    })
    it('fileId ไม่มีจริง → PhotoMissing · ไม่มี record · ไม่เริ่ม', async () => {
      const j = await mkJob({ assigned: U.tech1 })
      await expect(start(j.publicToken, U.tech1, T, { photoFileIds: ['ok.jpg', 'missing-1.jpg'] })).rejects.toBeInstanceOf(ServiceJobPhotoMissingError)
      expect(await records(j.id)).toHaveLength(0)
      expect((await row(j.id)).serviceStartedAt).toBeNull()
    })
    it('เริ่มพร้อมรูป + note → record BEFORE 1 แถว · event meta {photoCount, hasNote} ไม่มีตัว note · แจ้ง STARTED', async () => {
      const j = await mkJob({ assigned: U.tech1 })
      const r = await start(j.publicToken, U.tech1, T, { photoFileIds: ['b1.jpg', 'b2.jpg', 'b1.jpg'], note: '  ไฟหน้าซ้ายเหลือง  ' })
      expect(r.alreadyStarted).toBe(false)
      const recs = await records(j.id)
      expect(recs).toHaveLength(1)
      expect(recs[0]).toMatchObject({ phase: 'BEFORE', note: 'ไฟหน้าซ้ายเหลือง', fileIds: ['b1.jpg', 'b2.jpg'], createdByUserId: U.tech1, shopId: S.shop })
      const ev = await events(j.id, 'SERVICE_STARTED')
      expect(ev).toHaveLength(1)
      expect(ev[0].meta).toMatchObject({ photoCount: 2, hasNote: true })
      expect(JSON.stringify(ev[0].meta)).not.toContain('ไฟหน้า')
      expect(h.notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'STARTED', orderId: j.id, actorUserId: U.tech1 }))
    })
    it('ไม่มีรูป/บันทึก (OPTIONAL) → ไม่มี record · event ไม่มี meta รูป (พฤติกรรมเดิม)', async () => {
      const j = await mkJob({ assigned: U.tech1 })
      await start(j.publicToken, U.tech1, T)
      expect(await records(j.id)).toHaveLength(0)
      const ev = await events(j.id, 'SERVICE_STARTED')
      expect(ev[0].meta).not.toHaveProperty('photoCount')
    })
    it('กดซ้ำหลังเริ่มแล้ว (REQUIRED ไม่มีรูป) → alreadyStarted ไม่ 400 · ไม่แจ้งซ้ำ', async () => {
      const j = await mkJob({ assigned: U.tech1, started: true })
      await setPhoto('REQUIRED', false)
      const r = await start(j.publicToken, U.tech1, T)
      expect(r.alreadyStarted).toBe(true)
      expect(h.notify).not.toHaveBeenCalled()
    })
    it('เริ่มพร้อมกัน 2 คน → record 1 แถว · event 1 · แจ้ง 1 ครั้ง', async () => {
      const j = await mkJob({ assigned: null })
      const rs = await Promise.all([
        start(j.publicToken, U.owner, OWN, { photoFileIds: ['x1.jpg'] }),
        start(j.publicToken, U.chat, CH, { photoFileIds: ['x2.jpg'] }),
      ])
      expect(rs.filter((r) => !r.alreadyStarted)).toHaveLength(1)
      expect(await records(j.id)).toHaveLength(1)
      expect(await events(j.id, 'SERVICE_STARTED')).toHaveLength(1)
      expect(h.notify).toHaveBeenCalledTimes(1)
    })
    it('ช่างล้วน · งานของคนอื่น → NotAssignee(ชื่อ) · ไม่เริ่ม', async () => {
      const j = await mkJob({ assigned: U.tech2 })
      const e = await start(j.publicToken, U.tech1, T).catch((x) => x)
      expect(e).toBeInstanceOf(ServiceJobNotAssigneeError)
      expect((e as ServiceJobNotAssigneeError).assigneeName).toBe(`ช่างหน่อย-${run}`)
      expect((await row(j.id)).serviceStartedAt).toBeNull()
    })
    it('ช่างล้วน · ยังไม่มีคนรับ → Unassigned', async () => {
      const j = await mkJob({ assigned: null })
      await expect(start(j.publicToken, U.tech1, T)).rejects.toBeInstanceOf(ServiceJobUnassignedError)
    })
    it('CHAT / OWNER / CHAT+TECH ทำแทนได้ (งานของคนอื่น/ไม่มีคนรับ)', async () => {
      for (const [actor, roles] of [[U.chat, CH], [U.owner, OWN], [U.chatTech, CHT]] as const) {
        const j = await mkJob({ assigned: U.tech2 })
        expect((await start(j.publicToken, actor, roles)).alreadyStarted).toBe(false)
      }
    })
    it('ร้านไม่ใช่บริการ → FeatureNotAvailable', async () => {
      const j = await mkJob({ shopId: S.online })
      await expect(
        startServiceJob({ shopId: S.online, orderToken: j.publicToken, actorUserId: U.owner, actorRoles: OWN }),
      ).rejects.toBeInstanceOf(AppointmentFeatureUnavailableError)
    })
  })

  // ─── ทำเสร็จแล้ว ─────────────────────────────────────────────────────────────────────────────
  describe('finishServiceJob', () => {
    it('ก่อนเริ่ม → NotStarted', async () => {
      const j = await mkJob({ assigned: U.tech1 })
      await expect(finish(j.publicToken, U.tech1, T)).rejects.toBeInstanceOf(ServiceJobNotStartedError)
    })
    it('ทำเสร็จ → record AFTER + event · ไม่แตะ serviceClosedAt/สถานะ/ยอด/รายงานยอดขาย · แจ้ง FINISHED', async () => {
      const j = await mkJob({ assigned: U.tech1, started: true })
      const year = new Date().getFullYear()
      const before = await getServiceReportData(S.shop, 'SERVICE_QUEUE', 'monthly', { year })
      const pay0 = await db.orderPayment.count({ where: { orderId: j.id } })
      const r = await finish(j.publicToken, U.tech1, T, { photoFileIds: ['a1.jpg'], note: 'ล้างเสร็จ' })
      expect(r.alreadyFinished).toBe(false)
      const o = await row(j.id)
      expect(o.serviceFinishedAt).not.toBeNull()
      expect(o.serviceClosedAt).toBeNull()
      expect(o.status).toBe('PENDING')
      expect(Number(o.totalAmount)).toBe(500)
      expect(await db.orderPayment.count({ where: { orderId: j.id } })).toBe(pay0)
      expect(await getServiceReportData(S.shop, 'SERVICE_QUEUE', 'monthly', { year })).toEqual(before)
      expect((await records(j.id)).map((x) => x.phase)).toEqual(['AFTER'])
      expect(await events(j.id, 'SERVICE_FINISHED')).toHaveLength(1)
      expect(h.notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'FINISHED' }))
    })
    it('กดซ้ำ → alreadyFinished ไม่บันทึกซ้ำ', async () => {
      const j = await mkJob({ assigned: U.tech1, finished: true })
      expect((await finish(j.publicToken, U.tech1, T)).alreadyFinished).toBe(true)
      expect(await events(j.id, 'SERVICE_FINISHED')).toHaveLength(0)
    })
    it('ช่างล้วน · งานคนอื่น → NotAssignee', async () => {
      const j = await mkJob({ assigned: U.tech2, started: true })
      await expect(finish(j.publicToken, U.tech1, T)).rejects.toBeInstanceOf(ServiceJobNotAssigneeError)
    })
    it('ร้าน buyerVisible=false → ไม่มีแถว ledger SERVICE_FINISHED', async () => {
      await setPhoto('OPTIONAL', false)
      const j = await mkJob({ assigned: U.tech1, started: true, linked: true })
      await finish(j.publicToken, U.tech1, T)
      expect(await db.autoNotifyLedger.count({ where: { orderId: j.id, kind: 'SERVICE_FINISHED' } })).toBe(0)
    })
    it('ร้าน buyerVisible=true → INTENT SERVICE_FINISHED (ไม่มีแถวสวิตช์) + dispatch', async () => {
      await setPhoto('OPTIONAL', true)
      const j = await mkJob({ assigned: U.tech1, started: true, linked: true })
      await finish(j.publicToken, U.tech1, T)
      const l = await db.autoNotifyLedger.findMany({ where: { orderId: j.id, kind: 'SERVICE_FINISHED' } })
      expect(l).toHaveLength(1)
      expect(l[0].status).toBe('INTENT')
      expect(h.dispatch).toHaveBeenCalledWith(l[0].id)
    })
  })

  describe('auto-notify SERVICE_FINISHED (ตัวส่งจริง · revalidate)', () => {
    it('INTENT ที่จองตอนทำเสร็จ ส่งออกได้จริง (ไม่ตกเป็น SKIPPED NOT_ELIGIBLE_ANYMORE เพราะไม่มีแถวสวิตช์)', async () => {
      const real = await vi.importActual<typeof import('@/services/auto-notify.service')>('@/services/auto-notify.service')
      await setPhoto('OPTIONAL', true)
      const j = await mkJob({ assigned: U.tech1, started: true, linked: true })
      await finish(j.publicToken, U.tech1, T)
      const l = await db.autoNotifyLedger.findFirstOrThrow({ where: { orderId: j.id, kind: 'SERVICE_FINISHED' } })
      await real.dispatchAutoNotify(l.id)
      const after = await db.autoNotifyLedger.findUniqueOrThrow({ where: { id: l.id } })
      expect(after.reason).not.toBe('NOT_ELIGIBLE_ANYMORE')
      expect(after.status).toBe('SENT')
    })
    it('ร้านปิด "ลูกค้าเห็นรูป" ระหว่างรอส่ง → ไม่ส่ง', async () => {
      const real = await vi.importActual<typeof import('@/services/auto-notify.service')>('@/services/auto-notify.service')
      await setPhoto('OPTIONAL', true)
      const j = await mkJob({ assigned: U.tech1, started: true, linked: true })
      await finish(j.publicToken, U.tech1, T)
      const l = await db.autoNotifyLedger.findFirstOrThrow({ where: { orderId: j.id, kind: 'SERVICE_FINISHED' } })
      await setPhoto('OPTIONAL', false)
      await real.dispatchAutoNotify(l.id)
      const after = await db.autoNotifyLedger.findUniqueOrThrow({ where: { id: l.id } })
      expect(after.status).not.toBe('SENT')
    })
  })

  // ─── ปิดงาน ──────────────────────────────────────────────────────────────────────────────────
  describe('closeServiceJob (ด่านช่างล้วน)', () => {
    it('ช่างล้วน · งานของตัวเอง ยังไม่ทำเสร็จ → NotFinished · ยังไม่ปิด', async () => {
      const j = await mkJob({ assigned: U.tech1, started: true })
      await expect(close(j.publicToken, U.tech1, T)).rejects.toBeInstanceOf(ServiceJobNotFinishedError)
      expect((await row(j.id)).serviceClosedAt).toBeNull()
    })
    it('ช่างล้วน · งานของคนอื่น (ทำเสร็จแล้ว) → NotAssignee', async () => {
      const j = await mkJob({ assigned: U.tech2, finished: true })
      await expect(close(j.publicToken, U.tech1, T)).rejects.toBeInstanceOf(ServiceJobNotAssigneeError)
    })
    it('ช่างล้วน · ไม่มีคนรับ → Unassigned', async () => {
      const j = await mkJob({ assigned: null, finished: true })
      await expect(close(j.publicToken, U.tech1, T)).rejects.toBeInstanceOf(ServiceJobUnassignedError)
    })
    it('ช่างล้วน · งานของตัวเองที่ทำเสร็จแล้ว → ปิดได้ + แจ้ง CLOSED', async () => {
      const j = await mkJob({ assigned: U.tech1, finished: true })
      await close(j.publicToken, U.tech1, T)
      expect((await row(j.id)).serviceClosedAt).not.toBeNull()
      expect(h.notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'CLOSED', actorUserId: U.tech1 }))
    })
    it('เจ้าของ/ผู้ดูแล ปิดก่อนเริ่ม/ก่อนทำเสร็จได้เหมือนเดิม (FR-010)', async () => {
      const a = await mkJob({ assigned: U.tech2 })
      await close(a.publicToken, U.owner, OWN)
      expect((await row(a.id)).serviceClosedAt).not.toBeNull()
      const b = await mkJob({ assigned: null, started: true })
      await close(b.publicToken, U.manager, ['MANAGER'])
      expect((await row(b.id)).serviceClosedAt).not.toBeNull()
    })
  })

  // ─── รับงาน / มอบงาน ────────────────────────────────────────────────────────────────────────
  describe('claim / assign / unassign', () => {
    it('รับงานพร้อมกัน 2 คน → ผ่าน 1 · อีกคน AlreadyAssigned(ชื่อผู้ชนะ) · event 1', async () => {
      const j = await mkJob({ assigned: null })
      const rs = await Promise.allSettled([claim(j.publicToken, U.tech1), claim(j.publicToken, U.tech2)])
      const ok = rs.filter((r) => r.status === 'fulfilled')
      const bad = rs.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      expect(ok).toHaveLength(1)
      expect(bad).toHaveLength(1)
      expect(bad[0].reason).toBeInstanceOf(ServiceJobAlreadyAssignedError)
      const winner = (await row(j.id)).assignedUserId
      expect([U.tech1, U.tech2]).toContain(winner)
      expect((bad[0].reason as ServiceJobAlreadyAssignedError).assigneeName).toBe(winner === U.tech1 ? `ช่างนิด-${run}` : `ช่างหน่อย-${run}`)
      expect(await events(j.id, 'SERVICE_CLAIMED')).toHaveLength(1)
      expect(h.notify).toHaveBeenCalledTimes(1)
      expect(h.notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'CLAIMED', actorUserId: winner }))
    })
    it('รับซ้ำโดยคนเดิม → สำเร็จ ไม่บันทึก/แจ้งซ้ำ', async () => {
      const j = await mkJob({ assigned: U.tech1 })
      expect((await claim(j.publicToken, U.tech1)).assignedUserId).toBe(U.tech1)
      expect(await events(j.id, 'SERVICE_CLAIMED')).toHaveLength(0)
      expect(h.notify).not.toHaveBeenCalled()
    })
    it('ไม่ถือ TECHNICIAN (CHAT ล้วน) → ClaimTechnicianOnly · CHAT+TECH รับได้', async () => {
      const j = await mkJob({ assigned: null })
      await expect(claim(j.publicToken, U.chat, CH)).rejects.toBeInstanceOf(ServiceJobClaimTechnicianOnlyError)
      expect((await claim(j.publicToken, U.chatTech, CHT)).assignedUserId).toBe(U.chatTech)
    })
    it('รับงานที่ปิดแล้ว → AlreadyClosed', async () => {
      const j = await mkJob({ assigned: null, closed: true })
      await expect(claim(j.publicToken, U.tech1)).rejects.toBeInstanceOf(ServiceJobAlreadyClosedError)
    })
    it('มอบให้ช่าง → event พร้อมชื่อ · เปลี่ยนคน (เริ่มแล้วก็ได้) → previous · ค่าเดิม = no-op', async () => {
      const j = await mkJob({ assigned: null, started: true })
      const r = await assignServiceJob({ shopId: S.shop, orderToken: j.publicToken, actorUserId: U.billing, userId: U.tech1 })
      expect(r).toEqual({ assignedUserId: U.tech1, assigneeName: `ช่างนิด-${run}` })
      await assignServiceJob({ shopId: S.shop, orderToken: j.publicToken, actorUserId: U.owner, userId: U.tech2 })
      await assignServiceJob({ shopId: S.shop, orderToken: j.publicToken, actorUserId: U.owner, userId: U.tech2 })
      const ev = await db.orderEvent.findMany({ where: { orderId: j.id, type: 'SERVICE_ASSIGNED' }, orderBy: { occurredAt: 'asc' } })
      expect(ev).toHaveLength(2)
      expect(ev[1].meta).toMatchObject({ assigneeNameSnapshot: `ช่างหน่อย-${run}`, previousAssigneeNameSnapshot: `ช่างนิด-${run}` })
      expect((await row(j.id)).assignedUserId).toBe(U.tech2)
    })
    it('มอบให้ CHAT ล้วน / เจ้าของ / คนนอกร้าน → AssigneeNotTechnician', async () => {
      const j = await mkJob({ assigned: null })
      for (const u of [U.chat, U.owner, U.manager]) {
        await expect(
          assignServiceJob({ shopId: S.shop, orderToken: j.publicToken, actorUserId: U.owner, userId: u }),
        ).rejects.toBeInstanceOf(AssigneeNotTechnicianError)
      }
    })
    it('มอบงานที่ปิดแล้ว / ยกเลิก → AlreadyClosed', async () => {
      for (const o of [{ closed: true }, { status: 'CANCELLED' }]) {
        const j = await mkJob({ assigned: null, ...o })
        await expect(
          assignServiceJob({ shopId: S.shop, orderToken: j.publicToken, actorUserId: U.owner, userId: U.tech1 }),
        ).rejects.toBeInstanceOf(ServiceJobAlreadyClosedError)
      }
    })
    it('ยกเลิกผู้รับผิดชอบ → null + event MANUAL', async () => {
      const j = await mkJob({ assigned: U.tech1 })
      expect(await unassignServiceJob({ shopId: S.shop, orderToken: j.publicToken, actorUserId: U.owner })).toEqual({ assignedUserId: null })
      const ev = await events(j.id, 'SERVICE_UNASSIGNED')
      expect(ev[0].meta).toMatchObject({ reason: 'MANUAL', previousAssigneeNameSnapshot: `ช่างนิด-${run}` })
    })
    it('ร้านไม่ใช่บริการ → assign/claim FeatureNotAvailable', async () => {
      const j = await mkJob({ shopId: S.online })
      await expect(
        assignServiceJob({ shopId: S.online, orderToken: j.publicToken, actorUserId: U.owner, userId: U.tech1 }),
      ).rejects.toBeInstanceOf(AppointmentFeatureUnavailableError)
      await expect(
        claimServiceJob({ shopId: S.online, orderToken: j.publicToken, actorUserId: U.tech1, actorRoles: T }),
      ).rejects.toBeInstanceOf(AppointmentFeatureUnavailableError)
    })
  })

  // ─── แข่งกัน: บทบาท/ผู้รับผิดชอบเปลี่ยนระหว่างอ่านกับเขียน (MINOR-3 · NIT-3) ──────────────────────
  describe('race — ถอดช่างระหว่างมอบ/รับ/สร้างงาน · รับงานแทรกก่อนมอบ', () => {
    /** ช่างชั่วคราวของเทสนี้ (ไม่แตะ tech1/tech2 ที่เทสอื่นใช้) */
    async function tempTech(k: string) {
      const u = await db.user.create({ data: { displayName: `ช่างชั่วคราว-${k}-${run}`, username: `sjt_${run}_tmp_${k}` }, select: { id: true } })
      ids.users.push(u.id)
      const m = await db.shopMember.create({ data: { shopId: S.shop, userId: u.id, role: 'ADMIN', roles: ['TECHNICIAN'] }, select: { id: true } })
      ids.members.push(m.id)
      return { userId: u.id, memberId: m.id }
    }
    /**
     * เปิด tx ค้างไว้ที่ทำ `write` แล้วยังไม่ commit (ถือ row lock) → ยิง `act` → รอให้ act ไปติดล็อก → commit
     * = จำลองลำดับ "อีกฝั่งเขียนก่อน แต่ act อ่านค่าเดิมไปแล้ว" แบบกำหนดได้ (ไม่พึ่งดวงของ Promise.all)
     */
    async function whileHeld<T>(write: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<unknown>, act: () => Promise<T>) {
      let release!: () => void
      const gate = new Promise<void>((r) => (release = r))
      let held!: () => void
      const heldP = new Promise<void>((r) => (held = r))
      const holder = db.$transaction(async (tx) => {
        await write(tx)
        held()
        await gate
      }, { timeout: 20_000 })
      await heldP
      const p = act().then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e }))
      await new Promise((r) => setTimeout(r, 400))
      release()
      await holder
      return p
    }

    it('[MINOR-3] มอบงาน ขณะเจ้าของถอด "ช่าง" (ยังไม่ commit) → รอแล้วอ่านบทบาทใหม่ → AssigneeNotTechnician · งานไม่ถูกมอบ', async () => {
      const t = await tempTech('a')
      const j = await mkJob({ assigned: null })
      const r = await whileHeld(
        (tx) => tx.shopMember.update({ where: { id: t.memberId }, data: { roles: ['CHAT'] } }),
        () => assignServiceJob({ shopId: S.shop, orderToken: j.publicToken, actorUserId: U.owner, userId: t.userId }),
      )
      expect(r.ok).toBe(false)
      expect(!r.ok && r.e).toBeInstanceOf(AssigneeNotTechnicianError)
      expect((await row(j.id)).assignedUserId).toBeNull()
    })
    it('[MINOR-3] กดรับงาน ขณะถูกถอด "ช่าง" (ctx ยังเป็นช่าง) → ClaimTechnicianOnly (รหัสเดิม) · งานไม่ถูกรับ', async () => {
      const t = await tempTech('b')
      const j = await mkJob({ assigned: null })
      const r = await whileHeld(
        (tx) => tx.shopMember.update({ where: { id: t.memberId }, data: { roles: ['CHAT'] } }),
        () => claim(j.publicToken, t.userId, T),
      )
      expect(!r.ok && r.e).toBeInstanceOf(ServiceJobClaimTechnicianOnlyError)
      expect((await row(j.id)).assignedUserId).toBeNull()
      expect(await events(j.id, 'SERVICE_CLAIMED')).toHaveLength(0)
    })
    it('[MINOR-3] สร้างงานพร้อมผู้รับผิดชอบ ขณะสมาชิกถูกลบ → AssigneeNotTechnician · ไม่สร้างใบ', async () => {
      const t = await tempTech('c')
      const n0 = await db.order.count({ where: { shopId: S.shop } })
      const r = await whileHeld(
        (tx) => tx.shopMember.delete({ where: { id: t.memberId } }),
        () => createOrder(S.shop, { type: 'SERVICE', buyerContact: '0812345678', items: [{ name: 'ล้างแอร์', qty: 1, price: 500 }], assignedUserId: t.userId }),
      )
      ids.members = ids.members.filter((m) => m !== t.memberId)
      if (r.ok) ids.orders.push((r.v as { id: string }).id)
      expect(!r.ok && r.e).toBeInstanceOf(AssigneeNotTechnicianError)
      expect(await db.order.count({ where: { shopId: S.shop } })).toBe(n0)
    })
    it('[NIT-3] มอบงาน ขณะช่างอีกคนกดรับแทรก (ยังไม่ commit) → ลองใหม่ด้วยค่าล่าสุด · previous = คนที่ถูกแทนจริง', async () => {
      const j = await mkJob({ assigned: null })
      const r = await whileHeld(
        (tx) => tx.order.update({ where: { id: j.id }, data: { assignedUserId: U.tech1 } }),
        () => assignServiceJob({ shopId: S.shop, orderToken: j.publicToken, actorUserId: U.owner, userId: U.tech2 }),
      )
      expect(r.ok).toBe(true)
      expect((await row(j.id)).assignedUserId).toBe(U.tech2)
      const ev = await events(j.id, 'SERVICE_ASSIGNED')
      expect(ev).toHaveLength(1)
      expect(ev[0].meta).toMatchObject({ assigneeNameSnapshot: `ช่างหน่อย-${run}`, previousAssigneeNameSnapshot: `ช่างนิด-${run}` })
    })
    it('[NIT-3] มอบให้คนเดียวกับที่เพิ่งกดรับแทรก → no-op (ไม่มี event)', async () => {
      const j = await mkJob({ assigned: null })
      const r = await whileHeld(
        (tx) => tx.order.update({ where: { id: j.id }, data: { assignedUserId: U.tech2 } }),
        () => assignServiceJob({ shopId: S.shop, orderToken: j.publicToken, actorUserId: U.owner, userId: U.tech2 }),
      )
      expect(r.ok).toBe(true)
      expect(await events(j.id, 'SERVICE_ASSIGNED')).toHaveLength(0)
    })
    it('[NIT-3] ปิดงานแทรกก่อนมอบ → AlreadyClosed (รหัสเดิม)', async () => {
      const j = await mkJob({ assigned: null })
      const r = await whileHeld(
        (tx) => tx.order.update({ where: { id: j.id }, data: { serviceClosedAt: new Date() } }),
        () => assignServiceJob({ shopId: S.shop, orderToken: j.publicToken, actorUserId: U.owner, userId: U.tech2 }),
      )
      expect(!r.ok && r.e).toBeInstanceOf(ServiceJobAlreadyClosedError)
      expect((await row(j.id)).assignedUserId).toBeNull()
    })
  })

  // ─── ลบบัญชี (M2) ───────────────────────────────────────────────────────────────────────────
  describe('deleteAccount — งานเปิดที่มอบให้บัญชีนี้กลับเป็น "ยังไม่มีคนรับ"', () => {
    it('ร้านที่เป็นช่าง + ร้านบริการที่ตัวเองเป็นเจ้าของ: ปลด + MEMBER_REMOVED · ใบปิด/ยกเลิก/ร้านไม่ใช่บริการไม่แตะ', async () => {
      const u = await db.user.create({ data: { displayName: `ช่างลาออก-${run}`, username: `sjt_${run}_del` }, select: { id: true } })
      ids.users.push(u.id)
      const m = await db.shopMember.create({ data: { shopId: S.shop, userId: u.id, role: 'ADMIN', roles: ['TECHNICIAN'] }, select: { id: true } })
      ids.members.push(m.id)
      // ร้านบริการที่ผู้ใช้เป็นเจ้าของ (แถวค้างชื่อ — สถานะ CONFIRMED ไม่ขวางการลบบัญชี)
      const own = await db.shop.create({ data: { userId: u.id, shopName: `sjt-own-${run}`, kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' } as never, select: { id: true } })
      ids.shops.push(own.id)

      const open1 = await mkJob({ assigned: u.id })
      const started = await mkJob({ assigned: u.id, started: true })
      const closed = await mkJob({ assigned: u.id, closed: true })
      const cancelled = await mkJob({ assigned: u.id, status: 'CANCELLED' })
      const ownJob = await mkJob({ assigned: u.id, shopId: own.id, status: 'CONFIRMED' })
      const onlineJob = await mkJob({ assigned: u.id, shopId: S.online })
      const others = await mkJob({ assigned: U.tech2 })

      await deleteAccount(u.id, `ช่างลาออก-${run}`)

      for (const j of [open1, started, ownJob]) {
        expect((await row(j.id)).assignedUserId).toBeNull()
        const ev = await events(j.id, 'SERVICE_UNASSIGNED')
        expect(ev).toHaveLength(1)
        expect(ev[0].actorUserId).toBe(u.id)
        expect(ev[0].meta).toMatchObject({ reason: 'MEMBER_REMOVED', previousAssigneeNameSnapshot: `ช่างลาออก-${run}` })
      }
      expect((await row(started.id)).serviceStartedAt).not.toBeNull() // สิ่งที่ทำไปแล้วคงอยู่
      for (const j of [closed, cancelled, onlineJob]) {
        expect((await row(j.id)).assignedUserId).toBe(u.id)
        expect(await events(j.id, 'SERVICE_UNASSIGNED')).toHaveLength(0)
      }
      expect((await row(others.id)).assignedUserId).toBe(U.tech2)
      expect(await db.shopMember.count({ where: { userId: u.id } })).toBe(0)
      ids.members = ids.members.filter((x) => x !== m.id)
    })
  })

  // ─── รายชื่อช่าง · ตั้งค่ารูป ───────────────────────────────────────────────────────────────
  describe('listServiceStaff · updateServiceJobPhotoSettings', () => {
    it('รายชื่อ = สมาชิกที่ถือ TECHNICIAN เท่านั้น ไม่มีเบอร์/อีเมล · ร้านอื่น []', async () => {
      const staff = await listServiceStaff(S.shop)
      expect(staff.map((s) => s.userId).sort()).toEqual([U.tech1, U.tech2, U.chatTech].sort())
      for (const s of staff) expect(Object.keys(s).sort()).toEqual(['displayName', 'userId'])
      expect(await listServiceStaff(S.online)).toEqual([])
    })
    // มติ 2026-10-30 — ร้านช่างเยอะ: ป้าย "ว่าง/ติดงาน" + "วันนี้ N งาน" (ปี 2031 กันชนแถวของเทสอื่น)
    it('ส่งช่วงเวลา → load ต่อคน: นับงานวันเดียวกัน · ชนเฉพาะงานยังไม่จบ · ไม่นับงานที่กำลังมอบ/ยกเลิก/วันอื่น/ร้านอื่น', async () => {
      const at = (h: number) => new Date(Date.UTC(2031, 2, 5, h - 7))
      // CHECK all-or-none ⇒ ต้องมีคิว + ที่นั่ง · EXCLUDE ช่วงซ้อน ⇒ คนละที่นั่งทุกแถว (ลบตามร้านใน afterAll — Cascade)
      const res: Record<string, string> = {}
      for (const shopId of [S.shop, S.online]) {
        res[shopId] = (await db.serviceResource.create({ data: { shopId, name: `คิว-${run}`, capacity: 20 }, select: { id: true } })).id
      }
      let seat = 0
      const mk = async (who: string, s: number, e: number, x: { finished?: boolean; status?: string; shopId?: string } = {}) => {
        const shopId = x.shopId ?? S.shop
        const o = await db.order.create({
          data: {
            shopId, type: 'SERVICE', status: x.status ?? 'PENDING', totalAmount: 500,
            buyerContact: `08${run}`, buyerName: 'คุณสมชาย', assignedUserId: who,
            serviceResourceId: res[shopId], serviceSeat: ++seat,
            serviceStart: at(s), serviceEnd: at(e), serviceStartedAt: x.finished ? at(s) : null, serviceFinishedAt: x.finished ? at(e) : null,
            items: { create: { name: 'ล้างแอร์', qty: 1, price: 500 } },
          } as never,
          select: { id: true, publicToken: true },
        })
        ids.orders.push(o.id)
        return o
      }
      await mk(U.tech1, 13, 15) // ชน 14–16
      await mk(U.tech1, 9, 10) // วันเดียวกัน ไม่ชน
      await mk(U.tech2, 14, 15, { finished: true }) // ทำเสร็จแล้ว = นับ แต่ไม่ติดงาน
      await mk(U.tech2, 14, 15, { status: 'CANCELLED' }) // ยกเลิก = ไม่นับ
      await mk(U.tech2, 38, 39) // วันถัดไป = ไม่นับ
      await mk(U.tech2, 14, 15, { shopId: S.online }) // ร้านอื่น = ไม่นับ
      const self = await mk(U.chatTech, 14, 16) // งานที่กำลังมอบ
      const staff = await listServiceStaff(S.shop, { window: { from: at(14), to: at(16) }, excludeToken: self.publicToken })
      const by = Object.fromEntries(staff.map((s) => [s.userId, s.load]))
      expect(by[U.tech1]).toEqual({ dayJobs: 2, clash: { start: at(13).toISOString(), end: at(15).toISOString() } })
      expect(by[U.tech2]).toEqual({ dayJobs: 1, clash: null })
      expect(by[U.chatTech]).toEqual({ dayJobs: 0, clash: null })
      // load มีแค่ตัวเลข/เวลา — ไม่มีข้อมูลลูกค้า
      for (const s of staff) expect(Object.keys(s.load!).sort()).toEqual(['clash', 'dayJobs'])
    })
    it('NONE ⇒ buyerVisible ถูกบังคับ false · ส่งทีละฟิลด์ได้ · ร้านอื่น FeatureNotAvailable', async () => {
      expect(await updateServiceJobPhotoSettings(S.shop, { mode: 'REQUIRED', buyerVisible: true })).toEqual({ mode: 'REQUIRED', buyerVisible: true })
      expect(await updateServiceJobPhotoSettings(S.shop, { mode: 'NONE' })).toEqual({ mode: 'NONE', buyerVisible: false })
      expect(await updateServiceJobPhotoSettings(S.shop, { buyerVisible: true })).toEqual({ mode: 'NONE', buyerVisible: false })
      expect(await updateServiceJobPhotoSettings(S.shop, { mode: 'OPTIONAL' })).toEqual({ mode: 'OPTIONAL', buyerVisible: false })
      await expect(updateServiceJobPhotoSettings(S.online, { mode: 'NONE' })).rejects.toBeInstanceOf(AppointmentFeatureUnavailableError)
    })
  })

  // ─── createOrder ────────────────────────────────────────────────────────────────────────────
  describe('createOrder assignedUserId', () => {
    const body = { type: 'SERVICE', buyerContact: '0812345678', items: [{ name: 'ล้างแอร์', qty: 1, price: 500 }] }
    it('ร้านบริการ + ช่าง → assignedUserId + event SERVICE_ASSIGNED (ผู้กระทำ = คนสร้าง) · ไม่แจ้งเตือน', async () => {
      const o = await createOrder(S.shop, { ...body, assignedUserId: U.tech1, createdByUserId: U.chat })
      ids.orders.push(o.id)
      expect((await row(o.id)).assignedUserId).toBe(U.tech1)
      const ev = await events(o.id, 'SERVICE_ASSIGNED')
      expect(ev).toHaveLength(1)
      expect(ev[0].actorUserId).toBe(U.chat)
      expect(ev[0].meta).toMatchObject({ assigneeNameSnapshot: `ช่างนิด-${run}` })
      expect(h.notify).not.toHaveBeenCalled()
    })
    it('ร้านบริการ + ไม่ใช่ช่าง → AssigneeNotTechnician และไม่สร้างใบ', async () => {
      const n0 = await db.order.count({ where: { shopId: S.shop } })
      await expect(createOrder(S.shop, { ...body, assignedUserId: U.chat })).rejects.toBeInstanceOf(AssigneeNotTechnicianError)
      expect(await db.order.count({ where: { shopId: S.shop } })).toBe(n0)
    })
    it('ร้าน ONLINE_SALES ส่ง assignedUserId → ละทิ้ง (null · ไม่มี event)', async () => {
      const o = await createOrder(S.online, { ...body, assignedUserId: U.tech1 })
      ids.orders.push(o.id)
      expect((await row(o.id)).assignedUserId).toBeNull()
      expect(await events(o.id, 'SERVICE_ASSIGNED')).toHaveLength(0)
    })
  })

  // ─── ลบสมาชิก ───────────────────────────────────────────────────────────────────────────────
  describe('removeShopMember', () => {
    it('ล้างผู้รับผิดชอบของใบที่ยังเปิด + event MEMBER_REMOVED · ใบปิด/ยกเลิกคงชื่อ · ร้านอื่นไม่แตะ', async () => {
      const open1 = await mkJob({ assigned: U.tech1 })
      const open2 = await mkJob({ assigned: U.tech1, started: true })
      const closed = await mkJob({ assigned: U.tech1, closed: true })
      const cancelled = await mkJob({ assigned: U.tech1, status: 'CANCELLED' })
      const other = await mkJob({ assigned: U.tech2 })
      const onlineJob = await mkJob({ assigned: U.tech1, shopId: S.online })
      await removeShopMember(U.owner, S.shop, U.tech1Member)
      ids.members = ids.members.filter((m) => m !== U.tech1Member)
      expect((await row(open1.id)).assignedUserId).toBeNull()
      expect((await row(open2.id)).assignedUserId).toBeNull()
      expect((await row(closed.id)).assignedUserId).toBe(U.tech1)
      expect((await row(cancelled.id)).assignedUserId).toBe(U.tech1)
      expect((await row(other.id)).assignedUserId).toBe(U.tech2)
      expect((await row(onlineJob.id)).assignedUserId).toBe(U.tech1)
      const ev = await events(open1.id, 'SERVICE_UNASSIGNED')
      expect(ev).toHaveLength(1)
      expect(ev[0].actorUserId).toBe(U.owner)
      expect(ev[0].meta).toMatchObject({ reason: 'MEMBER_REMOVED', previousAssigneeNameSnapshot: `ช่างนิด-${run}` })
      expect(await events(closed.id, 'SERVICE_UNASSIGNED')).toHaveLength(0)
    })
  })

  // ─── แจ้งเจ้าของ/ผู้ดูแล (ตัวจริง) ─────────────────────────────────────────────────────────
  describe('notifyServiceJob (ตัวจริง)', () => {
    it('ผู้รับ = เจ้าของ + ผู้ดูแล − คนกด · ไม่ถึง CHAT/BILLING/ช่าง/อดีตเจ้าของ · ข้อความ FR-014 · push ไป /orders/{token}', async () => {
      const real = await vi.importActual<typeof import('@/services/service-job-notify.service')>('@/services/service-job-notify.service')
      const j = await mkJob({ assigned: U.tech2 })
      await real.notifyServiceJob({ shopId: S.shop, orderId: j.id, actorUserId: U.tech2, event: 'FINISHED' })
      const rows = await db.notification.findMany({ where: { refId: j.publicToken } })
      expect(rows.map((r) => r.userId).sort()).toEqual([U.owner, U.manager].sort())
      for (const r of rows) {
        expect(r).toMatchObject({
          shopId: S.shop, kind: 'service_job_finished',
          title: `ช่างหน่อย-${run} ทำเสร็จ · รอปิดงาน`, body: 'ล้างแอร์ · คุณสมชาย',
        })
      }
      expect(h.push).toHaveBeenCalledWith(
        expect.arrayContaining([U.owner, U.manager]),
        `sjt-svc-${run}`,
        expect.stringContaining('ทำเสร็จ'),
        { type: 'service-job', url: `/orders/${j.publicToken}`, shopId: S.shop },
      )
    })
    it('เจ้าของกดเอง → ตัดเจ้าของออก เหลือผู้ดูแล', async () => {
      const real = await vi.importActual<typeof import('@/services/service-job-notify.service')>('@/services/service-job-notify.service')
      const j = await mkJob({ assigned: U.tech2 })
      await real.notifyServiceJob({ shopId: S.shop, orderId: j.id, actorUserId: U.owner, event: 'CLOSED' })
      const rows = await db.notification.findMany({ where: { refId: j.publicToken } })
      expect(rows.map((r) => r.userId)).toEqual([U.manager])
      expect(rows[0].kind).toBe('service_job_closed')
    })
  })
})
