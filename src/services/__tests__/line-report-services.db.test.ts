/**
 * line-report-services.db.test.ts — integration ของ access/shop/group service กับ DB local (00070 U4)
 *
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 (นอกนั้น skip) · ข้อมูลสร้างด้วย prefix `lrs-<run>` และลบ scope ด้วย id
 * ที่เทสสร้างตามลำดับ Delivery → BindCode → GroupShop → Group → Shop → User (Restrict บังคับลำดับ) — ไม่มี deleteMany เปล่า
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { thaiTodayBounds } from '@/lib/date-range'
import {
  isOwnerPaidForReports, ownsAnyShop, resolveReportAccess, countUnackedAlerts,
} from '@/services/line-report-access.service'
import {
  listReportableShops, assertReportable, resolveSendableShops, replaceGroupShops,
} from '@/services/line-report-shop.service'
import {
  listGroups, getGroupDetail, updateSettings, removeGroup, raiseAlert, ackAlert, resolveAlert, markInactive,
} from '@/services/line-report-group.service'
import { deleteAccount } from '@/services/account-deletion.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)

const run = randomUUID().slice(0, 8)
const ids = { users: [] as string[], shops: [] as string[], groups: [] as string[] }

const mkUser = async (tag: string, displayName = `lrs-${run}-${tag}`) => {
  const u = await prisma.user.create({ data: { displayName, username: `lrs_${run}_${tag}` }, select: { id: true } })
  ids.users.push(u.id)
  return u.id
}
const mkShop = async (userId: string, tag: string, data: Record<string, unknown> = {}) => {
  const s = await prisma.shop.create({ data: { userId, shopName: `lrs-${run}-${tag}`, kind: 'BUSINESS', ...data } as never, select: { id: true } })
  ids.shops.push(s.id)
  return s.id
}
const mkGroup = async (ownerId: string, shopIds: string[] = [], data: Record<string, unknown> = {}) => {
  const g = await prisma.lineReportGroup.create({ data: { ownerId, ...data } as never, select: { id: true } })
  ids.groups.push(g.id)
  for (const shopId of shopIds) await prisma.lineReportGroupShop.create({ data: { groupId: g.id, shopId } })
  return g.id
}
const mkSub = (ownerId: string, tier: string, source: string, status: 'ACTIVE' | 'LOCKED_RENEWAL_FAILED' = 'ACTIVE') =>
  prisma.businessPackageSubscription.create({
    data: { ownerId, tier, source, status, activatedAt: new Date(), currentPeriodStart: new Date(), nextRenewalAt: new Date(Date.now() + 86_400_000) },
  })
const code = async (p: Promise<unknown>) => { try { await p; return null } catch (e) { return (e as { code?: string }).code ?? `RAW:${(e as Error).message}` } }

describe.skipIf(!isLocal)('00070 line-report services (DB)', () => {
  let A: string, B: string, ADM: string
  let A1: string, A2: string, A3: string, A4: string, B1: string

  beforeAll(async () => {
    A = await mkUser('a'); B = await mkUser('b'); ADM = await mkUser('adm')
    A1 = await mkShop(A, 'a1'); A2 = await mkShop(A, 'a2', { vertical: 'SERVICE_QUEUE' })
    A3 = await mkShop(A, 'a3', { packageLockedAt: new Date() })
    A4 = await mkShop(A, 'a4', { deletedAt: new Date() })
    B1 = await mkShop(B, 'b1')
    // ADM เป็น ADMIN ของ B1 และ A เป็น ADMIN ของ B1 — ต้องไม่ทำให้ B1 เป็นร้านที่ A รายงานได้
    await prisma.shopMember.create({ data: { shopId: B1, userId: ADM, role: 'ADMIN' } })
    await prisma.shopMember.create({ data: { shopId: B1, userId: A, role: 'ADMIN' } })
  })

  afterAll(async () => {
    const g = { in: ids.groups }
    await prisma.lineReportDelivery.deleteMany({ where: { groupId: g } })
    await prisma.lineReportBindCode.deleteMany({ where: { groupId: g } })
    await prisma.lineReportGroupShop.deleteMany({ where: { groupId: g } })
    await prisma.lineReportGroup.deleteMany({ where: { id: g } })
    await prisma.shopMember.deleteMany({ where: { shopId: { in: ids.shops } } })
    await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    await prisma.businessPackageSubscription.deleteMany({ where: { ownerId: { in: ids.users } } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  describe('access', () => {
    it('tier × source ที่ ACTIVE = จ่ายแล้วทุกชุด', async () => {
      for (const tier of ['GROWTH', 'PRO', 'BUSINESS']) {
        for (const source of ['WALLET', 'APPLE_IAP']) {
          const u = await mkUser(`t-${tier}-${source}`)
          await mkSub(u, tier, source)
          expect(await isOwnerPaidForReports(u), `${tier}/${source}`).toBe(true)
        }
      }
    })
    it('LOCKED_RENEWAL_FAILED / ไม่มีแถว = ไม่จ่าย', async () => {
      const u = await mkUser('locked')
      await mkSub(u, 'PRO', 'WALLET', 'LOCKED_RENEWAL_FAILED')
      expect(await isOwnerPaidForReports(u)).toBe(false)
      expect(await isOwnerPaidForReports(A)).toBe(false) // A ไม่มีแถว
    })
    it('ADMIN-only = NOT_OWNER ทั้งที่เป็นสมาชิกร้านคนอื่น · เจ้าของไม่มีแพ็กเกจ = LOCKED NEVER', async () => {
      expect(await ownsAnyShop(ADM)).toBe(false)
      expect(await resolveReportAccess({ user: { id: ADM } })).toEqual({ kind: 'NOT_OWNER', userId: ADM })
      expect(await resolveReportAccess({ user: { id: A } })).toEqual({ kind: 'LOCKED', userId: A, reason: 'NEVER' })
      expect(await resolveReportAccess(null)).toEqual({ kind: 'ANON' })
    })
    it('เจ้าของที่ร้านถูกลบหมด = NOT_OWNER', async () => {
      const u = await mkUser('allgone')
      await mkShop(u, 'gone', { deletedAt: new Date() })
      expect(await ownsAnyShop(u)).toBe(false)
    })
  })

  describe('shops', () => {
    // updateSettings/replaceGroupShops เช็คแพ็กเกจที่ชั้น service แล้ว (LOW-3) — ตั้งแพ็กเกจ A หลังเทส access ที่ต้องการ A ไม่จ่าย
    beforeAll(async () => { await mkSub(A, 'PRO', 'WALLET'); await mkSub(B, 'PRO', 'WALLET') })
    it('LOW-3: ไม่มีแพ็กเกจ ACTIVE = PACKAGE_REQUIRED ทั้ง replaceGroupShops/updateSettings (ไม่แตะข้อมูล)', async () => {
      const u = await mkUser('nopkg')
      const s = await mkShop(u, 'nopkg')
      const g = await mkGroup(u, [s])
      expect(await code(replaceGroupShops(u, g, [s]))).toBe('PACKAGE_REQUIRED')
      expect(await code(updateSettings(u, g, { showOrders: false }))).toBe('PACKAGE_REQUIRED')
      expect((await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: g } })).showOrders).toBe(true)
    })
    it('listReportableShops: เฉพาะร้านของตนที่ไม่ลบ/ไม่ล็อก — ร้านที่เป็น ADMIN ไม่นับ', async () => {
      const list = await listReportableShops(A)
      expect(list.map((s) => s.id).sort()).toEqual([A1, A2].sort())
      expect(list.find((s) => s.id === A2)?.vertical).toBe('SERVICE_QUEUE')
    })
    it('assertReportable ปฏิเสธ: ร้านที่ A เป็น ADMIN / ล็อก / ลบ / ไม่ซ้ำ-นับผิด', async () => {
      expect(await code(assertReportable(A, [B1]))).toBe('SHOP_NOT_ALLOWED')
      expect(await code(assertReportable(A, [A1, B1]))).toBe('SHOP_NOT_ALLOWED')
      expect(await code(assertReportable(A, [A3]))).toBe('SHOP_NOT_ALLOWED')
      expect(await code(assertReportable(A, [A4]))).toBe('SHOP_NOT_ALLOWED')
      expect(await code(assertReportable(A, []))).toBe('SHOP_COUNT_OUT_OF_RANGE')
      expect((await assertReportable(A, [A1, A2])).map((s) => s.id).sort()).toEqual([A1, A2].sort())
    })
    it('resolveSendableShops: ตัดร้านล็อก/ลบพร้อมเหตุ', async () => {
      const g = await mkGroup(A, [A1, A3, A4])
      const r = await resolveSendableShops({ id: g, ownerId: A })
      expect(r.sendable.map((s) => s.id)).toEqual([A1])
      expect(r.excluded.map((e) => [e.shop.id, e.reason]).sort()).toEqual([[A3, 'LOCKED'], [A4, 'DELETED']].sort())
    })
    it('replaceGroupShops: คงร้านล็อกเดิม · ตัดที่หลุดเซต · เพิ่มใหม่ต้อง reportable', async () => {
      const g = await mkGroup(A, [A1, A3])
      const out = await replaceGroupShops(A, g, [A3, A2])
      expect(out.map((s) => [s.shopId, s.state]).sort()).toEqual([[A2, 'OK'], [A3, 'LOCKED']].sort())
      // เพิ่มร้านที่ล็อก/ของคนอื่น = ปฏิเสธและไม่เปลี่ยนอะไร
      expect(await code(replaceGroupShops(A, g, [A3, A2, B1]))).toBe('SHOP_NOT_ALLOWED')
      expect(await code(replaceGroupShops(A, g, [A3, A2, A4]))).toBe('SHOP_NOT_ALLOWED')
      const still = await prisma.lineReportGroupShop.findMany({ where: { groupId: g }, select: { shopId: true } })
      expect(still.map((s) => s.shopId).sort()).toEqual([A2, A3].sort())
      expect(await code(replaceGroupShops(A, g, []))).toBe('SHOP_COUNT_OUT_OF_RANGE')
    })
    it('โอนร้านให้ B (Shop.userId เปลี่ยน): กลุ่มของ A เห็นร้านนั้นไม่ OK · ส่งแล้วตัดออก NOT_OWNED · เพิ่มกลับไม่ได้', async () => {
      const A9 = await mkShop(A, 'a9') // ร้านโอนทั้งก้อน ไม่แตะ A1/A2 ของเคสอื่น
      const g = await mkGroup(A, [A1, A9])
      await prisma.shop.update({ where: { id: A9 }, data: { userId: B } })
      // ผู้ส่งตัดออก
      const r = await resolveSendableShops({ id: g, ownerId: A })
      expect(r.sendable.map((s) => s.id)).toEqual([A1])
      expect(r.excluded.map((e) => [e.shop.id, e.reason])).toEqual([[A9, 'NOT_OWNED']])
      // ไม่นับเป็น reportable ของ A อีก และของ B ได้
      expect((await listReportableShops(A)).map((s) => s.id)).not.toContain(A9)
      expect((await listReportableShops(B)).map((s) => s.id)).toContain(A9)
      // หน้ารายละเอียดต้องไม่แสดงเป็น OK — ดูผลจริงจาก getGroupDetail
      const d = await getGroupDetail(A, g)
      expect(d.group.shops.find((s) => s.shopId === A9)?.state).toBe('DELETED')
      expect(d.group.shops.find((s) => s.shopId === A1)?.state).toBe('OK')
      // replace: คงร้านเดิมที่ถูกโอนไม่ได้ก็ไม่เป็นไร (ตัดทิ้งได้) แต่เพิ่มกลับต้องไม่ผ่านด่าน reportable
      const g2 = await mkGroup(A, [A1])
      expect(await code(replaceGroupShops(A, g2, [A1, A9]))).toBe('SHOP_NOT_ALLOWED')
    })
    it('replaceGroupShops ของกลุ่มคนอื่น/REMOVED = GROUP_NOT_FOUND', async () => {
      const g = await mkGroup(A, [A1])
      expect(await code(replaceGroupShops(B, g, [B1]))).toBe('GROUP_NOT_FOUND')
      const rm = await mkGroup(A, [A1], { status: 'REMOVED', removedAt: new Date() })
      expect(await code(replaceGroupShops(A, rm, [A1]))).toBe('GROUP_NOT_FOUND')
    })
  })

  describe('group: scope 404', () => {
    it('ทุกฟังก์ชันที่รับ id คืน GROUP_NOT_FOUND เมื่อเป็นของคนอื่น / REMOVED / ไม่มีจริง', async () => {
      const g = await mkGroup(A, [A1])
      const rm = await mkGroup(A, [A1], { status: 'REMOVED', removedAt: new Date() })
      for (const [owner, id] of [[B, g], [A, rm], [A, randomUUID()]] as const) {
        expect(await code(getGroupDetail(owner, id))).toBe('GROUP_NOT_FOUND')
        expect(await code(updateSettings(owner, id, { showOrders: false }))).toBe('GROUP_NOT_FOUND')
        expect(await code(removeGroup(owner, id))).toBe('GROUP_NOT_FOUND')
        expect(await code(ackAlert(owner, id))).toBe('GROUP_NOT_FOUND')
      }
      // ของจริงไม่ถูกแตะ
      expect((await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: g } })).status).toBe('PENDING')
    })
  })

  describe('group: updateSettings', () => {
    it('กฎ NEEDS_TIME / METRIC_REQUIRED บน state รวม + ไม่เขียนอะไรเมื่อปฏิเสธ', async () => {
      const g = await mkGroup(A, [A1])
      const err = async (p: Promise<unknown>) => { try { await p; return null } catch (e) { const x = e as { code: string; details: { rule?: string } }; return `${x.code}:${x.details.rule}` } }
      expect(await err(updateSettings(A, g, { dailyEnabled: true }))).toBe('INVALID_SETTINGS:NEEDS_TIME')
      expect(await err(updateSettings(A, g, { showOrders: false, showSales: false, showCancelled: false, showTopProducts: false }))).toBe('INVALID_SETTINGS:METRIC_REQUIRED')
      const row = await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: g } })
      expect(row.dailyEnabled).toBe(false)
      expect(row.showOrders).toBe(true)
    })
    it('เซ็ตเวลา -> sort asc · ล้าง attachCycleToDaily เมื่อปิดรายเดือน · คืน DTO รูป §4.4', async () => {
      const g = await mkGroup(A, [A1])
      let d = await updateSettings(A, g, { dailyEnabled: true, dailyTimes: [1440, 540], monthlyEnabled: true, cutoffDay: 5, attachCycleToDaily: true })
      expect(d.settings.dailyTimes).toEqual([540, 1440])
      expect(d.settings.attachCycleToDaily).toBe(true)
      expect(d.cycle).toMatchObject({ nextFireDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
      d = await updateSettings(A, g, { monthlyEnabled: false })
      expect(d.settings.attachCycleToDaily).toBe(false)
      expect(d.cycle).toBeNull()
    })
    it('showProfit false→true ต้อง confirmProfit · ตั้ง/ล้าง profitEnabledAt', async () => {
      const g = await mkGroup(A, [A1])
      expect(await code(updateSettings(A, g, { showProfit: true }))).toBe('PROFIT_CONFIRM_REQUIRED')
      let d = await updateSettings(A, g, { showProfit: true, confirmProfit: true })
      expect(d.settings.profitEnabledAt).not.toBeNull()
      d = await updateSettings(A, g, { showProfit: false })
      expect(d.settings.profitEnabledAt).toBeNull()
    })
    it('แก้ได้ทั้ง PENDING/ACTIVE/INACTIVE', async () => {
      const act = await mkGroup(A, [A1], { status: 'ACTIVE', lineGroupId: `Clrs-${run}-set`, boundAt: new Date() })
      const ina = await mkGroup(A, [A1], { status: 'INACTIVE' })
      for (const id of [act, ina]) expect((await updateSettings(A, id, { skipWhenNoOrders: true })).settings.skipWhenNoOrders).toBe(true)
    })
  })

  describe('group: detail / list', () => {
    it('detail: ไม่มี pendingPayload · deliveries ≤10 ล่าสุดก่อน · usedToday นับวันไทย+ทุกสถานะที่กินโควตา', async () => {
      const g = await mkGroup(A, [A1, A3, A4], { status: 'ACTIVE', lineGroupId: `Clrs-${run}-det`, boundAt: new Date() })
      const { from } = thaiTodayBounds()
      const yesterdayThai = new Date(from.getTime() - 3_600_000)
      const mk = (slotKey: string, kind: string, status: string, createdAt: Date, extra: Record<string, unknown> = {}) =>
        prisma.lineReportDelivery.create({ data: { groupId: g, slotKey, kind, status, createdAt, ...extra } as never })
      const now = new Date()
      await mk('T:1', 'TEST', 'SENT', now)
      await mk('T:2', 'TEST', 'CLAIMED', now)
      await mk('T:3', 'TEST', 'FAILED', now) // ล้มก็กินโควตา (security M1)
      await mk('T:4', 'TEST', 'SENT', yesterdayThai) // เมื่อวานไทย
      await mk('T:5', 'DAILY', 'SENT', now) // ไม่ใช่ TEST
      for (let i = 0; i < 9; i++) await mk(`D:x${i}`, 'DAILY', 'SENT', new Date(now.getTime() - (i + 1) * 60_000), { pendingPayload: { raw: 'SECRET-PAYLOAD' } })
      const { group } = await getGroupDetail(A, g)
      expect(group.test).toEqual({ limit: 5, usedToday: 3, remaining: 2 })
      expect(group.deliveries).toHaveLength(10)
      expect(JSON.stringify(group)).not.toContain('SECRET-PAYLOAD')
      expect(JSON.stringify(group)).not.toContain('pendingPayload')
      expect(group.shops.map((s) => [s.shopId, s.state]).sort()).toEqual([[A1, 'OK'], [A3, 'LOCKED'], [A4, 'DELETED']].sort())
      expect(group.paused).toBe(false) // A มีแพ็กเกจตั้งแต่ describe shops (LOW-3) — pause สดเทสแยกที่ list
      expect(group.nextSendAt).toBeNull() // กลุ่มไม่ ACTIVE
    })
    it('detail: bind.hasLiveCode เห็นเฉพาะโค้ดที่ยังไม่หมดอายุ/ไม่ถูกใช้', async () => {
      const g = await mkGroup(A, [A1])
      expect((await getGroupDetail(A, g)).group.bind).toEqual({ hasLiveCode: false, expiresAt: null })
      await prisma.lineReportBindCode.create({ data: { ownerId: A, groupId: g, codeHash: `h-${run}-live`, expiresAt: new Date(Date.now() + 600_000) } })
      const b = (await getGroupDetail(A, g)).group.bind
      expect(b.hasLiveCode).toBe(true)
      expect(JSON.stringify(b)).not.toContain(`h-${run}`) // ไม่คืน hash/โค้ด
    })
    it('list: paused สด · nextSendAt เมื่อจ่าย+ACTIVE+มีตาราง · เรียงปัญหา→รอผูก→ปกติ · ไม่คืน REMOVED · shops ≤2', async () => {
      const O = await mkUser('list')
      const s = [await mkShop(O, 'l1'), await mkShop(O, 'l2', { vertical: 'SERVICE_QUEUE' }), await mkShop(O, 'l3')]
      const normal = await mkGroup(O, s, { status: 'ACTIVE', lineGroupId: `Clrs-${run}-l1`, boundAt: new Date(), dailyEnabled: true, dailyTimes: [540, 1440], groupName: 'ปกติ' })
      const pending = await mkGroup(O, [s[0]], { groupName: 'รอ' })
      const bad = await mkGroup(O, [s[0]], { status: 'INACTIVE', alertKind: 'BOT_REMOVED', alertAt: new Date(), groupName: 'เสีย' })
      await mkGroup(O, [s[0]], { status: 'REMOVED', removedAt: new Date() })

      let r = await listGroups(O)
      expect(r.meta).toMatchObject({ count: 3, limit: 10, paused: true, unackedAlerts: 1, canCreate: false })
      expect(r.groups.map((x) => x.id)).toEqual([bad, pending, normal])
      expect(r.groups.every((x) => x.nextSendAt === null)).toBe(true) // paused

      await mkSub(O, 'PRO', 'WALLET')
      r = await listGroups(O)
      expect(r.meta.paused).toBe(false)
      const n = r.groups.find((x) => x.id === normal)!
      expect(n).toMatchObject({ shopCount: 3, mixedVertical: true, paused: false })
      expect(n.shops).toHaveLength(2)
      expect(typeof n.nextSendAt).toBe('string')
      expect(r.groups.find((x) => x.id === pending)!.nextSendAt).toBeNull() // ไม่ ACTIVE
      expect(await countUnackedAlerts(O)).toBe(1)
    })
  })

  describe('alerts', () => {
    it('raise เหตุเดิมไม่ซ้ำ (แม้ ack แล้ว) · เหตุใหม่แจ้งใหม่ · resolve ตาม kinds', async () => {
      const O = await mkUser('alert')
      const g = await mkGroup(O, [], { status: 'INACTIVE' })
      const row = () => prisma.lineReportGroup.findUniqueOrThrow({ where: { id: g } })
      expect(await raiseAlert(g, 'SEND_FAILED')).toBe(true)
      const first = await row()
      expect(first).toMatchObject({ alertKind: 'SEND_FAILED', alertAckAt: null })
      expect(await raiseAlert(g, 'SEND_FAILED')).toBe(false)
      expect((await row()).alertAt).toEqual(first.alertAt)
      expect(await countUnackedAlerts(O)).toBe(1)

      await ackAlert(O, g)
      await ackAlert(O, g) // idempotent
      expect((await row()).alertAckAt).not.toBeNull()
      expect(await countUnackedAlerts(O)).toBe(0)
      expect(await raiseAlert(g, 'SEND_FAILED')).toBe(false) // ไม่แจ้งซ้ำเหตุเดิม
      expect((await row()).alertAckAt).not.toBeNull()

      expect(await raiseAlert(g, 'NO_SENDABLE_SHOPS')).toBe(true) // เหตุใหม่ -> แจ้งใหม่
      expect(await row()).toMatchObject({ alertKind: 'NO_SENDABLE_SHOPS', alertAckAt: null })

      expect(await resolveAlert(g, ['SEND_FAILED'])).toBe(false) // เหตุไม่ตรง
      expect(await resolveAlert(g, ['SEND_FAILED', 'NO_SENDABLE_SHOPS'])).toBe(true)
      expect(await row()).toMatchObject({ alertKind: null, alertAt: null, alertAckAt: null })
    })
    it('ไม่ raise ให้กลุ่ม REMOVED', async () => {
      const g = await mkGroup(A, [], { status: 'REMOVED', removedAt: new Date() })
      expect(await raiseAlert(g, 'SEND_FAILED')).toBe(false)
    })
    it('markInactive: ACTIVE -> INACTIVE + BOT_REMOVED · ซ้ำ/REMOVED/ไม่มี = false', async () => {
      const lg = `Clrs-${run}-mi`
      const g = await mkGroup(A, [], { status: 'ACTIVE', lineGroupId: lg, boundAt: new Date() })
      expect(await markInactive(lg)).toBe(true)
      expect(await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: g } })).toMatchObject({ status: 'INACTIVE', alertKind: 'BOT_REMOVED', alertAckAt: null })
      expect((await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: g } })).leftAt).not.toBeNull()
      expect(await markInactive(lg)).toBe(false)
      expect(await markInactive(`Clrs-${run}-none`)).toBe(false)
      const lg2 = `Clrs-${run}-mi2`
      const rm = await mkGroup(A, [], { status: 'REMOVED', removedAt: new Date(), lineGroupId: lg2 })
      expect(await markInactive(lg2)).toBe(false)
      expect((await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: rm } })).alertKind).toBeNull()
    })
  })

  describe('removeGroup', () => {
    it('ACTIVE -> REMOVED + revoke โค้ดสด + คืน lineGroupId · ครั้งที่สอง 404 · log คงอยู่', async () => {
      const O = await mkUser('rm')
      const g = await mkGroup(O, [], { status: 'ACTIVE', lineGroupId: `Clrs-${run}-rm`, boundAt: new Date() })
      await prisma.lineReportBindCode.create({ data: { ownerId: O, groupId: g, codeHash: `h-${run}-rm`, expiresAt: new Date(Date.now() + 600_000) } })
      await prisma.lineReportDelivery.create({ data: { groupId: g, kind: 'DAILY', slotKey: 'D:2026-10-01@09:00', status: 'SENT' } })
      expect(await removeGroup(O, g)).toEqual({ removed: true, leaveLineGroupId: `Clrs-${run}-rm` })
      expect(await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: g } })).toMatchObject({ status: 'REMOVED' })
      expect(await prisma.lineReportBindCode.count({ where: { groupId: g, revokedAt: null, usedAt: null } })).toBe(0)
      expect(await prisma.lineReportDelivery.count({ where: { groupId: g } })).toBe(1)
      expect(await code(removeGroup(O, g))).toBe('GROUP_NOT_FOUND')
    })
    it('PENDING / INACTIVE -> ไม่ต้อง leave (null) · ไม่ต้องมีแพ็กเกจ (L1)', async () => {
      const p = await mkGroup(A, [])
      const i = await mkGroup(A, [], { status: 'INACTIVE', lineGroupId: `Clrs-${run}-ina` })
      expect(await removeGroup(A, p)).toEqual({ removed: true, leaveLineGroupId: null })
      expect(await removeGroup(A, i)).toEqual({ removed: true, leaveLineGroupId: null })
    })
  })

  describe('deleteAccount hook (TFR-24)', () => {
    it('กลุ่มทุกแถวของ user -> REMOVED + โค้ดถูก revoke + คืน lineGroupId เฉพาะ ACTIVE · กลุ่มคนอื่นไม่ถูกแตะ', async () => {
      const name = `lrs-${run}-del`
      const U = await mkUser('del', name)
      await mkShop(U, 'del1', { kind: 'PERSONAL' })
      const act = await mkGroup(U, [], { status: 'ACTIVE', lineGroupId: `Clrs-${run}-d1`, boundAt: new Date() })
      const pen = await mkGroup(U, [])
      const ina = await mkGroup(U, [], { status: 'INACTIVE', lineGroupId: `Clrs-${run}-d2` })
      await prisma.lineReportBindCode.create({ data: { ownerId: U, groupId: pen, codeHash: `h-${run}-del`, expiresAt: new Date(Date.now() + 600_000) } })
      const other = await mkGroup(A, [], { status: 'INACTIVE' })

      const r = await deleteAccount(U, name)
      expect(r.lineGroupsToLeave).toEqual([`Clrs-${run}-d1`])
      const rows = await prisma.lineReportGroup.findMany({ where: { id: { in: [act, pen, ina] } }, select: { status: true, removedAt: true } })
      expect(rows.every((x) => x.status === 'REMOVED' && x.removedAt !== null)).toBe(true)
      expect(await prisma.lineReportBindCode.count({ where: { groupId: pen, revokedAt: null, usedAt: null } })).toBe(0)
      expect((await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: other } })).status).toBe('INACTIVE')
    })
  })
})
