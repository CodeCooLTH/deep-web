/**
 * line-report-bind.db.test.ts — integration ของ bind + command service กับ DB local (00068 U7)
 *
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 (นอกนั้น skip) · LINE ทั้งหมด mock (ไม่มีการยิงจริง)
 * ข้อมูลสร้างด้วย prefix `lrb-<run>` และลบ scope ด้วย id/lineGroupId ที่เทสสร้างเท่านั้น (ไม่มี deleteMany เปล่า)
 * ลำดับลบ: Delivery → RateEvent → BindCode → GroupShop → Group → Shop → Subscription → User
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const lc = vi.hoisted(() => ({
  replyTo: vi.fn(),
  pushToGroup: vi.fn(),
  fetchGroupSummary: vi.fn(),
  leaveGroup: vi.fn(),
}))
vi.mock('@/lib/line-report/line-client', () => lc)

import { consumeBindCode, createBindCode, reissueBindCode } from '@/services/line-report-bind.service'
import { handleEvents } from '@/services/line-report-command.service'
import { removeGroup } from '@/services/line-report-group.service'
import {
  ALREADY_BOUND_SELF_MESSAGE, BIND_FAILED_MESSAGE, COMMAND_RATE_LIMITED_MESSAGE,
  GREETING_MESSAGE, NOT_BOUND_MESSAGE, PACKAGE_PAUSED_MESSAGE,
} from '@/lib/line-report/messages'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)

const run = randomUUID().slice(0, 8)
const ids = { users: [] as string[], shops: [] as string[], groups: [] as string[], lineGroups: [] as string[] }
const lg = (tag: string) => {
  const id = `Clrb-${run}-${tag}`
  ids.lineGroups.push(id)
  return id
}

const mkOwner = async (tag: string, shopCount = 1, paid = true) => {
  const u = await prisma.user.create({ data: { displayName: `lrb-${run}-${tag}`, username: `lrb_${run}_${tag}` }, select: { id: true } })
  ids.users.push(u.id)
  const shopIds: string[] = []
  for (let i = 0; i < shopCount; i++) {
    const s = await prisma.shop.create({ data: { userId: u.id, shopName: `ร้าน-${run}-${tag}${i}`, kind: 'BUSINESS' } as never, select: { id: true } })
    ids.shops.push(s.id)
    shopIds.push(s.id)
  }
  await prisma.businessPackageSubscription.create({
    data: {
      ownerId: u.id, tier: 'PRO', source: 'WALLET', status: paid ? 'ACTIVE' : 'LOCKED_RENEWAL_FAILED',
      activatedAt: new Date(), currentPeriodStart: new Date(), nextRenewalAt: new Date(Date.now() + 86_400_000),
    },
  })
  return { ownerId: u.id, shopIds }
}
/** สร้างกลุ่มดิบ (ไม่ผ่าน createBindCode) — ไว้ยัดจำนวนกลุ่ม/สถานะ */
const rawGroup = async (ownerId: string, shopIds: string[], data: Record<string, unknown> = {}) => {
  const g = await prisma.lineReportGroup.create({ data: { ownerId, ...data } as never, select: { id: true } })
  ids.groups.push(g.id)
  for (const shopId of shopIds) await prisma.lineReportGroupShop.create({ data: { groupId: g.id, shopId } })
  return g.id
}
const create = async (ownerId: string, shopIds: string[]) => {
  const r = await createBindCode(ownerId, { shopIds })
  ids.groups.push(r.groupId)
  return r
}
const err = async (p: Promise<unknown>) => { try { await p; return null } catch (e) { return (e as { code?: string }).code ?? `RAW:${(e as Error).message}` } }

const ev = (type: string, groupId: string, extra: Record<string, unknown> = {}) => ({
  type, mode: 'active', timestamp: Date.now(), source: { type: 'group', groupId },
  replyToken: `rt-${randomUUID()}`, webhookEventId: randomUUID(), deliveryContext: { isRedelivery: false }, ...extra,
})
const say = (groupId: string, text: string, extra: Record<string, unknown> = {}) =>
  ev('message', groupId, { message: { id: randomUUID(), type: 'text', text }, ...extra })
const lastReply = () => lc.replyTo.mock.calls.at(-1)?.[1]?.[0] as { altText: string } | undefined

describe.skipIf(!isLocal)('00068 line-report bind + command (DB)', () => {
  beforeAll(() => {
    process.env.NEXTAUTH_SECRET ||= 'test-secret-lrb'
    process.env.LINE_REPORT_BOT_CHANNEL_SECRET = 'sec'
    process.env.LINE_REPORT_BOT_CHANNEL_ACCESS_TOKEN = 'tok'
  })
  beforeEach(() => {
    vi.clearAllMocks()
    lc.replyTo.mockResolvedValue({ ok: true, duplicate: false })
    lc.fetchGroupSummary.mockResolvedValue({ groupName: 'ทีมขายหน้าร้าน' })
  })

  afterAll(async () => {
    const g = { in: ids.groups }
    await prisma.lineReportDelivery.deleteMany({ where: { groupId: g } })
    await prisma.lineReportRateEvent.deleteMany({ where: { lineGroupId: { in: ids.lineGroups } } })
    await prisma.lineReportBindCode.deleteMany({ where: { groupId: g } })
    await prisma.lineReportGroupShop.deleteMany({ where: { groupId: g } })
    await prisma.lineReportGroup.deleteMany({ where: { id: g } })
    await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    await prisma.businessPackageSubscription.deleteMany({ where: { ownerId: { in: ids.users } } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  describe('createBindCode / reissueBindCode', () => {
    it('สร้าง PENDING + ร้าน + โค้ด 6 หลัก · ไม่เก็บโค้ดดิบ · โค้ดใหม่ revoke โค้ดเก่า', async () => {
      const o = await mkOwner('c1', 2)
      const a = await create(o.ownerId, o.shopIds)
      expect(a.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)
      expect(a.groupCount).toBe(1)
      expect(new Date(a.expiresAt).getTime() - Date.now()).toBeGreaterThan(9 * 60_000)
      const g = await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: a.groupId }, include: { shops: true, bindCodes: true } })
      expect(g.status).toBe('PENDING')
      expect(g.shops).toHaveLength(2)
      expect(JSON.stringify(g.bindCodes)).not.toContain(a.code)
      expect(JSON.stringify(g.bindCodes)).not.toContain(a.code.replace('-', ''))

      const b = await create(o.ownerId, [o.shopIds[0]])
      expect(b.groupCount).toBe(2)
      expect((await consumeBindCode({ lineGroupId: lg('c1x'), code: a.code, now: new Date() })).outcome).toBe('INVALID')
      expect((await consumeBindCode({ lineGroupId: lg('c1y'), code: b.code, now: new Date() })).outcome).toBe('OK')
    })

    it('ร้านของคนอื่น/ลบแล้ว → SHOP_NOT_ALLOWED · นับร้านผิด → SHOP_COUNT_OUT_OF_RANGE · bot env ว่าง → BOT_NOT_CONFIGURED', async () => {
      const o = await mkOwner('c2')
      const other = await mkOwner('c2o')
      expect(await err(createBindCode(o.ownerId, { shopIds: other.shopIds }))).toBe('SHOP_NOT_ALLOWED')
      expect(await err(createBindCode(o.ownerId, { shopIds: [] }))).toBe('SHOP_COUNT_OUT_OF_RANGE')
      const saved = process.env.LINE_REPORT_BOT_CHANNEL_SECRET
      process.env.LINE_REPORT_BOT_CHANNEL_SECRET = ''
      expect(await err(createBindCode(o.ownerId, { shopIds: o.shopIds }))).toBe('BOT_NOT_CONFIGURED')
      process.env.LINE_REPORT_BOT_CHANNEL_SECRET = saved
    })

    it('เพดาน 10: ครบ 10 (ไม่นับ REMOVED) → GROUP_LIMIT_REACHED', async () => {
      const o = await mkOwner('c3')
      for (let i = 0; i < 9; i++) await rawGroup(o.ownerId, o.shopIds)
      await rawGroup(o.ownerId, o.shopIds, { status: 'REMOVED', removedAt: new Date() })
      await create(o.ownerId, o.shopIds) // 10
      expect(await err(createBindCode(o.ownerId, { shopIds: o.shopIds }))).toBe('GROUP_LIMIT_REACHED')
    })

    it('แข่ง 2 คำขอที่กลุ่มที่ 9 → ผ่านได้ 1', async () => {
      const o = await mkOwner('c4')
      for (let i = 0; i < 9; i++) await rawGroup(o.ownerId, o.shopIds)
      const rs = await Promise.allSettled([createBindCode(o.ownerId, { shopIds: o.shopIds }), createBindCode(o.ownerId, { shopIds: o.shopIds })])
      const ok = rs.filter((r) => r.status === 'fulfilled')
      ok.forEach((r) => ids.groups.push((r as PromiseFulfilledResult<{ groupId: string }>).value.groupId))
      expect(ok).toHaveLength(1)
      expect(((rs.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason as { code: string }).code).toBe('GROUP_LIMIT_REACHED')
    })

    it('reissue: PENDING = regenerate (โค้ดเก่าใช้ไม่ได้) · ACTIVE → INVALID_STATE · ไม่ใช่ของตน → GROUP_NOT_FOUND · ร้านถูกลบ → SHOPS_INVALID', async () => {
      const o = await mkOwner('r1')
      const stranger = await mkOwner('r1s')
      const a = await create(o.ownerId, o.shopIds)
      const b = await reissueBindCode(o.ownerId, a.groupId)
      expect(b.status).toBe('PENDING')
      expect((await consumeBindCode({ lineGroupId: lg('r1x'), code: a.code, now: new Date() })).outcome).toBe('INVALID')
      expect(await err(reissueBindCode(stranger.ownerId, a.groupId))).toBe('GROUP_NOT_FOUND')

      await prisma.shop.update({ where: { id: o.shopIds[0] }, data: { deletedAt: new Date() } })
      expect(await err(reissueBindCode(o.ownerId, a.groupId))).toBe('SHOPS_INVALID')
      await prisma.shop.update({ where: { id: o.shopIds[0] }, data: { deletedAt: null } })

      const c = await reissueBindCode(o.ownerId, a.groupId)
      expect((await consumeBindCode({ lineGroupId: lg('r1y'), code: c.code, now: new Date() })).outcome).toBe('OK')
      expect(await err(reissueBindCode(o.ownerId, a.groupId))).toBe('INVALID_STATE')
    })
  })

  describe('consumeBindCode', () => {
    it('โค้ดถูก → ACTIVE + ชื่อกลุ่ม/ร้าน · reply ยืนยันมีชื่อกลุ่มและชื่อร้าน · เผาโค้ด', async () => {
      const o = await mkOwner('b1', 2)
      const c = await create(o.ownerId, o.shopIds)
      const G = lg('b1')
      await handleEvents([say(G, `  ผูก   ${c.code} `)], Date.now())
      const g = await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: c.groupId }, include: { bindCodes: true } })
      expect(g).toMatchObject({ status: 'ACTIVE', lineGroupId: G, groupName: 'ทีมขายหน้าร้าน' })
      expect(g.boundAt).not.toBeNull()
      expect(g.bindCodes[0].usedAt).not.toBeNull()
      const text = lastReply()!.altText
      expect(text).toContain('ทีมขายหน้าร้าน')
      expect(text).toContain(`ร้าน-${run}-b10`)
      expect(text).toContain(`ร้าน-${run}-b11`)
      expect(lc.pushToGroup).not.toHaveBeenCalled()
    })

    it('ผิด / หมดอายุ / ใช้แล้ว → ข้อความเดียวกันทุกตัวอักษร', async () => {
      const o = await mkOwner('b2')
      const c = await create(o.ownerId, o.shopIds)
      await handleEvents([say(lg('b2a'), 'ผูก ZZZZ-ZZZZ')], Date.now())
      const wrong = lastReply()!.altText
      await handleEvents([say(lg('b2b'), `ผูก ${c.code}`, {})], Date.now()) // ใช้สำเร็จ (ไว้ทำ "ใช้แล้ว")
      await handleEvents([say(lg('b2c'), `ผูก ${c.code}`)], Date.now())
      const used = lastReply()!.altText
      const o2 = await mkOwner('b2e')
      const c2 = await create(o2.ownerId, o2.shopIds)
      const late = await consumeBindCode({ lineGroupId: lg('b2d'), code: c2.code, now: new Date(Date.now() + 10 * 60_000 + 1000) })
      expect(late.outcome).toBe('INVALID')
      expect(wrong).toBe(BIND_FAILED_MESSAGE)
      expect(used).toBe(BIND_FAILED_MESSAGE)
    })

    it('เดาผิด 5 ครั้ง แล้วโค้ดถูกครั้งที่ 6 ถูกปฏิเสธ (ไม่เผาโค้ด) · พ้น 10 นาทีผ่าน', async () => {
      const o = await mkOwner('b3')
      const c = await create(o.ownerId, o.shopIds)
      const G = lg('b3')
      const now = new Date()
      for (let i = 0; i < 5; i++) expect((await consumeBindCode({ lineGroupId: G, code: 'ZZZZ-ZZZZ', now })).outcome).toBe('INVALID')
      expect((await consumeBindCode({ lineGroupId: G, code: c.code, now })).outcome).toBe('RATE_LIMITED')
      const row = await prisma.lineReportBindCode.findFirstOrThrow({ where: { groupId: c.groupId } })
      expect(row.usedAt).toBeNull()

      // ช่วงเดา "เมื่อ 11 นาทีก่อน" ไม่นับแล้ว
      const o2 = await mkOwner('b3b')
      const c2 = await create(o2.ownerId, o2.shopIds)
      const G2 = lg('b3b')
      const past = new Date(Date.now() - 11 * 60_000)
      for (let i = 0; i < 5; i++) await consumeBindCode({ lineGroupId: G2, code: 'ZZZZ-ZZZZ', now: past })
      expect((await consumeBindCode({ lineGroupId: G2, code: c2.code, now: new Date() })).outcome).toBe('OK')
    })

    it('กลุ่มผูกกับเจ้าของอื่น → ข้อความเดียวกับโค้ดผิด ไม่เผาโค้ด · ALREADY_BOUND_SELF ไม่เผาและไม่สร้างแถว', async () => {
      const a = await mkOwner('b4a')
      const b = await mkOwner('b4b')
      const G = lg('b4')
      const ca = await create(a.ownerId, a.shopIds)
      expect((await consumeBindCode({ lineGroupId: G, code: ca.code, now: new Date() })).outcome).toBe('OK')

      const cb = await create(b.ownerId, b.shopIds)
      await handleEvents([say(G, `ผูก ${cb.code}`)], Date.now())
      // M-1: ต่างเจ้าของ = ข้อความเดียวกับโค้ดผิดทุกตัวอักษร (ไม่เป็น oracle)
      expect(lastReply()!.altText).toBe(BIND_FAILED_MESSAGE)
      const rowB = await prisma.lineReportBindCode.findFirstOrThrow({ where: { groupId: cb.groupId } })
      expect(rowB.usedAt).toBeNull()
      expect((await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: cb.groupId } })).status).toBe('PENDING')

      const ca2 = await create(a.ownerId, a.shopIds)
      const before = await prisma.lineReportGroup.count({ where: { ownerId: a.ownerId } })
      await handleEvents([say(G, `ผูก ${ca2.code}`)], Date.now())
      expect(lastReply()!.altText).toBe(ALREADY_BOUND_SELF_MESSAGE)
      expect(await prisma.lineReportGroup.count({ where: { ownerId: a.ownerId } })).toBe(before)
      expect((await prisma.lineReportBindCode.findFirstOrThrow({ where: { groupId: ca2.groupId } })).usedAt).toBeNull()
    })

    it('แพ็กเกจไม่ ACTIVE ตอนใช้โค้ด → NOT_PAID (ข้อความผิดชุดเดียว) · ไม่ผูก', async () => {
      const o = await mkOwner('b5')
      const c = await create(o.ownerId, o.shopIds)
      await prisma.businessPackageSubscription.updateMany({ where: { ownerId: o.ownerId }, data: { status: 'LOCKED_RENEWAL_FAILED' } })
      expect((await consumeBindCode({ lineGroupId: lg('b5'), code: c.code, now: new Date() })).outcome).toBe('NOT_PAID')
      await handleEvents([say(lg('b5b'), `ผูก ${c.code}`)], Date.now())
      expect(lastReply()!.altText).toBe(BIND_FAILED_MESSAGE)
      expect((await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: c.groupId } })).status).toBe('PENDING')
    })

    it('ร้านถูกลบระหว่างทาง → INVALID · กลุ่มเกิน 10 ตอนผูก → INVALID', async () => {
      const o = await mkOwner('b6', 2)
      const c = await create(o.ownerId, o.shopIds)
      await prisma.shop.update({ where: { id: o.shopIds[1] }, data: { deletedAt: new Date() } })
      expect((await consumeBindCode({ lineGroupId: lg('b6'), code: c.code, now: new Date() })).outcome).toBe('INVALID')

      const o2 = await mkOwner('b6b')
      const c2 = await create(o2.ownerId, o2.shopIds)
      for (let i = 0; i < 10; i++) await rawGroup(o2.ownerId, o2.shopIds) // รวมเป็น 11
      expect((await consumeBindCode({ lineGroupId: lg('b6b'), code: c2.code, now: new Date() })).outcome).toBe('INVALID')
    })

    it('ใช้โค้ดเดียวกันพร้อมกันจาก 2 กลุ่ม LINE → สำเร็จ 1', async () => {
      const o = await mkOwner('b7')
      const c = await create(o.ownerId, o.shopIds)
      const rs = await Promise.all([
        consumeBindCode({ lineGroupId: lg('b7a'), code: c.code, now: new Date() }),
        consumeBindCode({ lineGroupId: lg('b7b'), code: c.code, now: new Date() }),
      ])
      expect(rs.filter((r) => r.outcome === 'OK')).toHaveLength(1)
    })

    it('2 เจ้าของคนละโค้ดพร้อมกันเข้ากลุ่ม LINE เดียว → ACTIVE ได้แถวเดียว', async () => {
      const a = await mkOwner('b8a')
      const b = await mkOwner('b8b')
      const ca = await create(a.ownerId, a.shopIds)
      const cb = await create(b.ownerId, b.shopIds)
      const G = lg('b8')
      const rs = await Promise.all([
        consumeBindCode({ lineGroupId: G, code: ca.code, now: new Date() }),
        consumeBindCode({ lineGroupId: G, code: cb.code, now: new Date() }),
      ])
      expect(rs.filter((r) => r.outcome === 'OK')).toHaveLength(1)
      expect(await prisma.lineReportGroup.count({ where: { lineGroupId: G, status: 'ACTIVE' } })).toBe(1)
    })
    it('M-2: 8 คำขอเดาผิดขนานในกลุ่มเดียว → ผ่านด่านได้ไม่เกิน 5 · ตารางไม่บวมเกินเพดาน (L-1)', async () => {
      const G = lg('rl1')
      const rs = await Promise.all(Array.from({ length: 8 }, () => consumeBindCode({ lineGroupId: G, code: 'ZZZZ-ZZZZ', now: new Date() })))
      expect(rs.filter((r) => r.outcome === 'INVALID').length).toBeLessThanOrEqual(5)
      expect(rs.filter((r) => r.outcome === 'RATE_LIMITED').length).toBeGreaterThanOrEqual(3)
      expect(await prisma.lineReportRateEvent.count({ where: { lineGroupId: G } })).toBe(5)
    })

    it('M-2/L-1: คำสั่งขนาน 15 ครั้ง → ตอบไม่เกิน 11 · RateEvent ไม่เกิน 11', async () => {
      const G = lg('rl2')
      await Promise.all(Array.from({ length: 15 }, () => handleEvents([say(G, 'สรุปวันนี้')], Date.now())))
      expect(lc.replyTo.mock.calls.length).toBe(11)
      expect(await prisma.lineReportRateEvent.count({ where: { lineGroupId: G } })).toBe(11)
    })

    it('โค้ดพิมพ์เล็ก/ไม่มีขีด/สลับ O→0 ผูกได้ (hash บนรูป normalize)', async () => {
      const o = await mkOwner('nrm')
      const c = await create(o.ownerId, o.shopIds)
      await handleEvents([say(lg('nrm'), `ผูก ${c.code.replace('-', '').toLowerCase()}`)], Date.now())
      expect(lastReply()!.altText).toContain('สำเร็จ')
    })
  })

  describe('M-3 ด่านแพ็กเกจที่ service', () => {
    it('createBindCode / reissueBindCode ของเจ้าของที่ไม่จ่าย → PACKAGE_REQUIRED · ไม่สร้างอะไร', async () => {
      const o = await mkOwner('pk', 1, true)
      const c = await create(o.ownerId, o.shopIds)
      await prisma.businessPackageSubscription.updateMany({ where: { ownerId: o.ownerId }, data: { status: 'LOCKED_RENEWAL_FAILED' } })
      const before = await prisma.lineReportGroup.count({ where: { ownerId: o.ownerId } })
      expect(await err(createBindCode(o.ownerId, { shopIds: o.shopIds }))).toBe('PACKAGE_REQUIRED')
      expect(await err(reissueBindCode(o.ownerId, c.groupId))).toBe('PACKAGE_REQUIRED')
      expect(await prisma.lineReportGroup.count({ where: { ownerId: o.ownerId } })).toBe(before)
    })
  })

  describe('leave / ผูกใหม่', () => {
    it('leave → INACTIVE + BOT_REMOVED · ผูกใหม่ที่กลุ่ม LINE อื่นคงค่าตั้งทุกฟิลด์ · ล้างแจ้งเตือน', async () => {
      const o = await mkOwner('l1', 2)
      const c = await create(o.ownerId, o.shopIds)
      const G1 = lg('l1a')
      await consumeBindCode({ lineGroupId: G1, code: c.code, now: new Date() })
      const settings = {
        dailyEnabled: true, dailyTimes: [540, 1080], monthlyEnabled: true, cutoffDay: 20, showOrders: true, showSales: false,
        showCancelled: true, showTopProducts: false, showProfit: true, skipWhenNoOrders: true, attachCycleToDaily: true,
      }
      await prisma.lineReportGroup.update({ where: { id: c.groupId }, data: { ...settings, profitEnabledAt: new Date() } })
      const before = await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: c.groupId }, include: { shops: true } })

      await handleEvents([ev('leave', G1, { replyToken: undefined })], Date.now())
      const left = await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: c.groupId } })
      expect(left).toMatchObject({ status: 'INACTIVE', alertKind: 'BOT_REMOVED', lineGroupId: G1 })
      expect(left.leftAt).not.toBeNull()

      const r = await reissueBindCode(o.ownerId, c.groupId)
      expect(r.status).toBe('PENDING')
      expect((await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: c.groupId } })).lineGroupId).toBe(G1) // คงไว้จนผูกสำเร็จ
      const G2 = lg('l1b')
      expect((await consumeBindCode({ lineGroupId: G2, code: r.code, now: new Date() })).outcome).toBe('OK')

      const after = await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: c.groupId }, include: { shops: true } })
      expect(after).toMatchObject({ ...settings, status: 'ACTIVE', lineGroupId: G2, alertKind: null, alertAt: null, alertAckAt: null })
      expect(after.profitEnabledAt?.getTime()).toBe(before.profitEnabledAt?.getTime())
      expect(after.shops.map((s) => s.shopId).sort()).toEqual(before.shops.map((s) => s.shopId).sort())
    })

    it('leave ของกลุ่มที่ไม่มีแถว/REMOVED → เมินเงียบ ไม่ error ไม่เปลี่ยนอะไร', async () => {
      const o = await mkOwner('l2')
      const c = await create(o.ownerId, o.shopIds)
      const G = lg('l2')
      await consumeBindCode({ lineGroupId: G, code: c.code, now: new Date() })
      await removeGroup(o.ownerId, c.groupId)
      const spy = vi.spyOn(console, 'error')
      await handleEvents([ev('leave', G), ev('leave', lg('l2-nonexistent'))], Date.now())
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
      expect((await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: c.groupId } })).status).toBe('REMOVED')
    })

    it('removeGroup แข่งกับ bind: ผลต้องสอดคล้อง (REMOVED ไม่กลายเป็น ACTIVE · ACTIVE ได้ leaveLineGroupId)', async () => {
      const o = await mkOwner('l3')
      const c = await create(o.ownerId, o.shopIds)
      const G = lg('l3')
      const [bind, rm] = await Promise.all([
        consumeBindCode({ lineGroupId: G, code: c.code, now: new Date() }),
        removeGroup(o.ownerId, c.groupId),
      ])
      const g = await prisma.lineReportGroup.findUniqueOrThrow({ where: { id: c.groupId } })
      expect(g.status).toBe('REMOVED')
      // ผูกชนะก่อน → ต้องสั่งบอทออก · ลบชนะก่อน → bind ต้องไม่สำเร็จ
      if (bind.outcome === 'OK') expect(rm.leaveLineGroupId).toBe(G)
      else expect(rm.leaveLineGroupId).toBeNull()
    })
  })

  describe('คำสั่งสรุป (reply เท่านั้น)', () => {
    const bound = async (tag: string, data: Record<string, unknown> = {}, paid = true) => {
      const o = await mkOwner(tag, 1, paid)
      const G = lg(tag)
      const gid = await rawGroup(o.ownerId, o.shopIds, { status: 'ACTIVE', lineGroupId: G, boundAt: new Date(), ...data })
      return { ...o, G, gid }
    }

    it('สรุปวันนี้: reply ครั้งเดียว ไม่เรียก push · log COMMAND SENT pushMessageCount 0 · ตอบแม้ 0 ออเดอร์', async () => {
      const x = await bound('m1', { skipWhenNoOrders: true })
      await handleEvents([say(x.G, 'สรุปวันนี้')], Date.now())
      expect(lc.replyTo).toHaveBeenCalledTimes(1)
      expect(lc.pushToGroup).not.toHaveBeenCalled()
      const rows = await prisma.lineReportDelivery.findMany({ where: { groupId: x.gid } })
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ kind: 'COMMAND', status: 'SENT', pushMessageCount: 0 })
      expect(rows[0].slotKey.startsWith('C:')).toBe(true)
    })

    it('webhookEventId เดิมส่งซ้ำ → ตอบครั้งเดียว (claim C:<id>)', async () => {
      const x = await bound('m2')
      const e = say(x.G, 'สรุปวันนี้')
      await handleEvents([e, { ...e, replyToken: 'other' }], Date.now())
      expect(lc.replyTo).toHaveBeenCalledTimes(1)
      expect(await prisma.lineReportDelivery.count({ where: { groupId: x.gid } })).toBe(1)
    })

    it('สรุปเดือนนี้ ใช้ได้แม้ monthlyEnabled=false', async () => {
      const x = await bound('m3', { monthlyEnabled: false, cutoffDay: 20 })
      await handleEvents([say(x.G, 'สรุปเดือนนี้')], Date.now())
      expect(lc.replyTo).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(lc.replyTo.mock.calls[0][1])).toContain('รายงานสรุปยอด')
    })

    it('showProfit=false → ข้อความไม่มีคำว่ากำไรเลย', async () => {
      const x = await bound('m4', { showProfit: false })
      await handleEvents([say(x.G, 'สรุปวันนี้')], Date.now())
      expect(JSON.stringify(lc.replyTo.mock.calls[0][1])).not.toContain('กำไร')
    })

    it('ตัวนับ: 10 ตอบปกติ · ครั้งที่ 11 ตอบ "ถามถี่เกินไป" ครั้งเดียว · ครั้งที่ 12 เงียบ', async () => {
      const x = await bound('m5')
      for (let i = 1; i <= 10; i++) await handleEvents([say(x.G, 'สรุปวันนี้')], Date.now())
      expect(lc.replyTo).toHaveBeenCalledTimes(10)
      expect(lastReply()!.altText).not.toBe(COMMAND_RATE_LIMITED_MESSAGE)
      await handleEvents([say(x.G, 'สรุปวันนี้')], Date.now())
      expect(lc.replyTo).toHaveBeenCalledTimes(11)
      expect(lastReply()!.altText).toBe(COMMAND_RATE_LIMITED_MESSAGE)
      await handleEvents([say(x.G, 'สรุปวันนี้')], Date.now())
      expect(lc.replyTo).toHaveBeenCalledTimes(11)
    })

    it('กลุ่มไม่ผูก → "ยังไม่ผูก" · ตัวนับเดียวกัน (12 ครั้ง = 11 reply) · ไม่มี log', async () => {
      const G = lg('m6')
      for (let i = 1; i <= 12; i++) await handleEvents([say(G, 'สรุปเดือนนี้')], Date.now())
      expect(lc.replyTo).toHaveBeenCalledTimes(11)
      expect(lc.replyTo.mock.calls[0][1][0].altText).toBe(NOT_BOUND_MESSAGE)
      expect(lc.replyTo.mock.calls[10][1][0].altText).toBe(COMMAND_RATE_LIMITED_MESSAGE)
    })

    it('แพ็กเกจหยุด → ข้อความหยุดชั่วคราว ไม่มีตัวเลข · log reason PACKAGE_PAUSED', async () => {
      const x = await bound('m7', {}, false)
      await handleEvents([say(x.G, 'สรุปวันนี้')], Date.now())
      expect(lastReply()!.altText).toBe(PACKAGE_PAUSED_MESSAGE)
      const row = await prisma.lineReportDelivery.findFirstOrThrow({ where: { groupId: x.gid } })
      expect(row).toMatchObject({ kind: 'COMMAND', reason: 'PACKAGE_PAUSED' })
    })

    it('เกิน 50 วินาทีจาก event.timestamp → ไม่ตอบ + log REPLY_FAILED/REPLY_TOKEN_EXPIRED', async () => {
      const x = await bound('m8')
      await handleEvents([say(x.G, 'สรุปวันนี้', { timestamp: Date.now() - 120_000 })], Date.now())
      expect(lc.replyTo).not.toHaveBeenCalled()
      expect(lc.pushToGroup).not.toHaveBeenCalled()
      const row = await prisma.lineReportDelivery.findFirstOrThrow({ where: { groupId: x.gid } })
      expect(row).toMatchObject({ status: 'REPLY_FAILED', reason: 'REPLY_TOKEN_EXPIRED' })
    })

    it('LINE ปฏิเสธ reply (400) → REPLY_FAILED/REPLY_REJECTED และไม่ push ทดแทน', async () => {
      lc.replyTo.mockResolvedValue({ ok: false, status: 400, kind: 'CLIENT', reason: 'HTTP_400' })
      const x = await bound('m9')
      await handleEvents([say(x.G, 'สรุปวันนี้')], Date.now())
      expect(lc.pushToGroup).not.toHaveBeenCalled()
      const row = await prisma.lineReportDelivery.findFirstOrThrow({ where: { groupId: x.gid } })
      expect(row).toMatchObject({ status: 'REPLY_FAILED', reason: 'REPLY_REJECTED' })
    })

    it('join → ทักทาย · ข้อความทั่วไป/ตั้งใกล้เคียง → ไม่ตอบ ไม่เขียน DB', async () => {
      const G = lg('m10')
      await handleEvents([ev('join', G)], Date.now())
      expect(lastReply()!.altText).toBe(GREETING_MESSAGE)
      vi.clearAllMocks()
      await handleEvents([say(G, 'สรุปวันนี้ครับ'), say(G, 'สวัสดี'), say(G, 'ผูก 12345')], Date.now())
      expect(lc.replyTo).not.toHaveBeenCalled()
      expect(await prisma.lineReportRateEvent.count({ where: { lineGroupId: G } })).toBe(0)
    })

    it('ซอร์ส command.service ไม่ import/เรียก pushToGroup (AC-22-3)', () => {
      const src = readFileSync('src/services/line-report-command.service.ts', 'utf8')
      expect(src).not.toMatch(/pushToGroup|message\/push/)
    })
  })
})
