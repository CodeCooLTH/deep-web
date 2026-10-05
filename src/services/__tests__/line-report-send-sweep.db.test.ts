/**
 * 00068 U8 — integration ของ send.service + sweep.service กับ DB local (LINE mock ทั้งหมด · นาฬิกาปลอม)
 *
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 (นอกนั้น skip) · ข้อมูลทุกชิ้นสร้างด้วย prefix `lrx-<run>` และลบ scope ด้วย id ที่เทสสร้าง
 * · `now` ปลอมอยู่ปี 2000 ⇒ predicate เวลาของ cleanup/sweep ไม่แตะแถวจริงของฐาน · `runSweep` ส่ง `groupIds` จำกัดวง
 * mock ที่ `lineApiRequest` (ไม่ใช่ line-client) เพื่อให้ pushToGroup/409/retry key ของจริงถูกใช้
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'

const h = vi.hoisted(() => ({
  api: vi.fn(),
  nums: new Map<string, { orders: number; cancelled: number }>(),
  errShops: new Set<string>(),
  cleanupFail: { on: false },
  subFail: { on: false },
  onPush: { fn: null as null | (() => void) },
  cumulative: vi.fn(async () => ({ totals: { orders: 3, confirmed: 300, unconfirmed: 0, cancelled: 0 }, failedShops: 0 })),
}))
vi.mock('@/lib/line/client', async () => ({ ...(await vi.importActual<object>('@/lib/line/client')), lineApiRequest: h.api }))
vi.mock('@/services/business-package.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/business-package.service')>('@/services/business-package.service')
  return { ...actual, getSubscriptionStatus: (id: string) => (h.subFail.on ? Promise.reject(new Error('db blip')) : actual.getSubscriptionStatus(id)) }
})
vi.mock('@/services/line-report-delivery.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/line-report-delivery.service')>('@/services/line-report-delivery.service')
  return { ...actual, cleanupDeliveries: (now: Date) => (h.cleanupFail.on ? Promise.reject(new Error('db')) : actual.cleanupDeliveries(now)) }
})
vi.mock('@/services/line-report-summary.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/line-report-summary.service')>('@/services/line-report-summary.service')
  const { combineTotals } = await vi.importActual<typeof import('@/lib/line-report/aggregate')>('@/lib/line-report/aggregate')
  return {
    ...actual,
    buildCycleCumulative: h.cumulative,
    buildGroupSummary: vi.fn(async (i: { shops: { id: string; name: string; vertical: string | null }[]; excluded: { shop: never; reason: string }[]; window: never }) => {
      const results = i.shops.map((shop) => {
        const n = h.nums.get(shop.id) ?? { orders: 0, cancelled: 0 }
        return h.errShops.has(shop.id)
          ? { shop, state: 'ERROR' as const, orders: 0, confirmed: 0, unconfirmed: 0, cancelled: 0 }
          : { shop, state: 'OK' as const, orders: n.orders, confirmed: n.orders * 100, unconfirmed: 0, cancelled: n.cancelled }
      })
      const ex = i.excluded.map((e) => ({ shop: e.shop, state: 'EXCLUDED' as const, excludedReason: e.reason, orders: 0, confirmed: 0, unconfirmed: 0, cancelled: 0 }))
      return {
        window: i.window,
        shops: [...results, ...ex],
        ...(i.shops.length > 1 ? { total: combineTotals(results) } : {}),
        profitSummable: true,
        mixedFinanceRules: false,
      }
    }),
  }
})

import { LineApiError } from '@/lib/line/client'
import { prisma } from '@/lib/prisma'
import { fireAt } from '@/lib/line-report/schedule'
import { retryKeyFor } from '@/lib/line-report/retry-key'
import { FINAL_NOTICE_MESSAGE } from '@/lib/line-report/messages'
import { resolveSendableShops } from '@/services/line-report-shop.service'
import { runSweep, runCleanup } from '@/services/line-report-sweep.service'
import { sendTest, sendFinalNotice } from '@/services/line-report-send.service'
import { countTestsToday } from '@/services/line-report-delivery.service'

const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(process.env.DATABASE_URL ?? '')
const run = randomUUID().slice(0, 8)
const ids = { users: [] as string[], shops: [] as string[], groups: [] as string[], rateGroups: [] as string[] }
const MIN = 60_000
const D = '2000-03-10'
const D2 = '2000-03-11'
const FIRE = fireAt(D, 1080) // 18:00 ไทย
const T0 = new Date(FIRE + 5 * MIN)
const T1 = new Date(FIRE + 35 * MIN)
const T2 = new Date(FIRE + 65 * MIN)
let seq = 0

type Behave = 'ok' | 'throw' | number
const behave = new Map<string, Behave[]>()
const gone = new Set<string>()
const calls = () => h.api.mock.calls.map(([path, , init]) => ({ path: path as string, init: (init ?? {}) as { body?: { to?: string; messages?: unknown[] }; retryKey?: string } }))
const pushes = (gid: string) => calls().filter((c) => c.path === '/v2/bot/message/push' && c.init.body?.to === gid)

const mkUser = async (tag: string) => {
  const u = await prisma.user.create({ data: { displayName: `lrx-${run}-${tag}`, username: `lrx_${run}_${tag}` }, select: { id: true } })
  ids.users.push(u.id)
  return u.id
}
const mkShop = async (userId: string, tag: string, data: Record<string, unknown> = {}) => {
  const s = await prisma.shop.create({ data: { userId, shopName: `lrx-${run}-${tag}`, kind: 'BUSINESS', ...data } as never, select: { id: true } })
  ids.shops.push(s.id)
  return s.id
}
const mkSub = (ownerId: string, status: 'ACTIVE' | 'LOCKED_RENEWAL_FAILED' = 'ACTIVE') =>
  prisma.businessPackageSubscription.create({
    data: {
      ownerId, tier: 'PRO', source: 'WALLET', status, activatedAt: new Date(), currentPeriodStart: new Date(),
      nextRenewalAt: new Date(Date.now() + 86_400_000), ...(status === 'LOCKED_RENEWAL_FAILED' ? { lockedAt: new Date('2000-03-09T10:00:00Z') } : {}),
    },
  })
/** กลุ่ม ACTIVE ตั้งเวลา 18:00 · boundAt ปี 1999 (ให้ slot พลาดถูกบันทึก MISSED) */
const mkGroup = async (owner: string, shopIds: string[], data: Record<string, unknown> = {}) => {
  const lineGroupId = `Clrx${run}${++seq}`
  const g = await prisma.lineReportGroup.create({
    data: { ownerId: owner, lineGroupId, status: 'ACTIVE', dailyEnabled: true, dailyTimes: [1080], boundAt: new Date('1999-01-01T00:00:00Z'), ...data } as never,
  })
  ids.groups.push(g.id)
  for (const shopId of shopIds) await prisma.lineReportGroupShop.create({ data: { groupId: g.id, shopId } })
  return g
}
const tick = (at: Date, groupIds: string[], extra: Record<string, unknown> = {}) => runSweep({ now: at, groupIds, ...extra })
const rows = (groupId: string) => prisma.lineReportDelivery.findMany({ where: { groupId }, orderBy: { slotKey: 'asc' } })
const row = (groupId: string, slotKey: string) => prisma.lineReportDelivery.findUniqueOrThrow({ where: { groupId_slotKey: { groupId, slotKey } } })
const grp = (id: string) => prisma.lineReportGroup.findUniqueOrThrow({ where: { id } })
const SLOT = `D:${D}@18:00`

describe.skipIf(!isLocal)('00068 send/sweep (DB, LINE mock)', () => {
  let owner: string
  let shopA: string
  let shopB: string

  beforeAll(async () => {
    vi.stubEnv('LINE_REPORT_BOT_CHANNEL_SECRET', 'secret-x')
    vi.stubEnv('LINE_REPORT_BOT_CHANNEL_ACCESS_TOKEN', 'token-x')
    owner = await mkUser('owner')
    await mkSub(owner)
    shopA = await mkShop(owner, 'a')
    shopB = await mkShop(owner, 'b')
  })

  afterAll(async () => {
    const g = { in: ids.groups }
    await prisma.lineReportDelivery.deleteMany({ where: { groupId: g } })
    await prisma.lineReportBindCode.deleteMany({ where: { groupId: g } })
    await prisma.lineReportGroupShop.deleteMany({ where: { groupId: g } })
    await prisma.lineReportGroup.deleteMany({ where: { id: g } })
    await prisma.lineReportRateEvent.deleteMany({ where: { lineGroupId: { in: ids.rateGroups } } })
    await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    await prisma.businessPackageSubscription.deleteMany({ where: { ownerId: { in: ids.users } } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    h.api.mockReset()
    h.nums.clear()
    h.errShops.clear()
    h.cumulative.mockClear()
    h.subFail.on = false
    h.onPush.fn = null
    behave.clear()
    gone.clear()
    h.api.mockImplementation(async (path: string, _t: string, init: { body?: { to?: string } } = {}) => {
      if (path === '/v2/bot/message/push') {
        h.onPush.fn?.()
        const q = behave.get(init.body?.to ?? '')
        const b = q && q.length > 0 ? q.shift()! : 'ok'
        if (b === 'ok') return {}
        if (b === 'throw') throw new Error('boom')
        throw new LineApiError(`HTTP ${b}`, b)
      }
      if (path.includes('/summary')) {
        if ([...gone].some((gid) => path.includes(gid))) throw new LineApiError('not found', 404)
        return { groupName: 'g' }
      }
      if (path.includes('/members/count')) return { count: 7 }
      return {}
    })
  })

  describe('claim / ส่ง / 409', () => {
    it('sweep 2 ตัวพร้อมกันบน slot เดียว → push ครั้งเดียว · แถว SENT · payload ถูกล้าง', async () => {
      const g = await mkGroup(owner, [shopA])
      h.nums.set(shopA, { orders: 2, cancelled: 0 })
      await Promise.all([tick(T0, [g.id]), tick(T0, [g.id])])
      expect(pushes(g.lineGroupId!)).toHaveLength(1)
      const r = await row(g.id, SLOT)
      expect(r).toMatchObject({ status: 'SENT', kind: 'DAILY', pushMessageCount: 7, memberCount: 7, attempt: 0, pendingPayload: null })
      expect(r.retryKey).toBe(retryKeyFor(g.id, SLOT))
      expect(pushes(g.lineGroupId!)[0].init.retryKey).toBe(r.retryKey)
    })

    it('รันซ้ำใน tick ถัดไป (slot ยังอยู่ในหน้าต่าง) → ไม่ส่งซ้ำ', async () => {
      const g = await mkGroup(owner, [shopA])
      await tick(T0, [g.id])
      await tick(T1, [g.id])
      expect(pushes(g.lineGroupId!)).toHaveLength(1)
    })

    it('409 = SENT', async () => {
      const g = await mkGroup(owner, [shopA])
      behave.set(g.lineGroupId!, [409])
      await tick(T0, [g.id])
      expect((await row(g.id, SLOT)).status).toBe('SENT')
      expect(pushes(g.lineGroupId!)).toHaveLength(1)
    })

    it('slot พลาด (60–180 นาที, ≥ boundAt) → MISSED ไม่ส่งย้อนหลัง · slot ก่อน boundAt ไม่ถูกบันทึก', async () => {
      const g = await mkGroup(owner, [shopA])
      await tick(new Date(FIRE + 100 * MIN), [g.id])
      expect(pushes(g.lineGroupId!)).toHaveLength(0)
      expect((await row(g.id, SLOT)).status).toBe('MISSED')
      const late = await mkGroup(owner, [shopA], { boundAt: new Date(FIRE + 10 * MIN) })
      await tick(new Date(FIRE + 100 * MIN), [late.id])
      expect(await rows(late.id)).toHaveLength(0)
    })
  })

  describe('retry / ล้มเหลว (TFR-18)', () => {
    it('500 → RETRY_PENDING → tick ถัดไปส่ง body เดิมทุกไบต์ + key เดิม → ล้มอีก = FAILED + alert · ไม่ลองครั้งที่ 3', async () => {
      const g = await mkGroup(owner, [shopA])
      h.nums.set(shopA, { orders: 1, cancelled: 0 })
      behave.set(g.lineGroupId!, [500, 503])
      await tick(T0, [g.id])
      const r1 = await row(g.id, SLOT)
      expect(r1).toMatchObject({ status: 'RETRY_PENDING', attempt: 1, reason: 'HTTP_500', httpStatus: 500 })
      expect(r1.pendingPayload).not.toBeNull() // เก็บไว้ retry (HR: ก่อน push)
      expect(r1.payloadSha256).toMatch(/^[0-9a-f]{64}$/)

      await tick(T1, [g.id])
      const p = pushes(g.lineGroupId!)
      expect(p).toHaveLength(2)
      expect(JSON.stringify(p[1].init.body)).toBe(JSON.stringify(p[0].init.body)) // ไบต์เดิม
      expect(p[1].init.retryKey).toBe(p[0].init.retryKey)
      expect(JSON.stringify(p[0].init.body!.messages)).toBe((r1.pendingPayload as { raw: string }).raw)
      const r2 = await row(g.id, SLOT)
      expect(r2).toMatchObject({ status: 'FAILED', attempt: 2, reason: 'HTTP_503', pendingPayload: null })
      expect(await grp(g.id)).toMatchObject({ alertKind: 'SEND_FAILED', alertAckAt: null })

      await tick(T2, [g.id])
      expect(pushes(g.lineGroupId!)).toHaveLength(2)
    })

    it('500 แล้ว retry สำเร็จ → SENT + ล้ม alert SEND_FAILED ที่เคยมี', async () => {
      const g = await mkGroup(owner, [shopA], { alertKind: 'SEND_FAILED', alertAt: new Date() })
      behave.set(g.lineGroupId!, [429])
      await tick(T0, [g.id])
      expect((await row(g.id, SLOT)).status).toBe('RETRY_PENDING')
      await tick(T1, [g.id])
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'SENT', pendingPayload: null })
      expect(await grp(g.id)).toMatchObject({ alertKind: null })
    })

    it('timeout/network (status 0) = retry ได้เหมือน 5xx', async () => {
      const g = await mkGroup(owner, [shopA])
      behave.set(g.lineGroupId!, [0])
      await tick(T0, [g.id])
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'RETRY_PENDING', attempt: 1, httpStatus: null })
    })

    it('400 + summary 404 → INACTIVE + FAILED(BOT_NOT_IN_GROUP) + alert BOT_REMOVED · ไม่ retry', async () => {
      const g = await mkGroup(owner, [shopA])
      behave.set(g.lineGroupId!, [400])
      gone.add(g.lineGroupId!)
      await tick(T0, [g.id])
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'FAILED', reason: 'BOT_NOT_IN_GROUP', pendingPayload: null })
      expect(await grp(g.id)).toMatchObject({ status: 'INACTIVE', alertKind: 'BOT_REMOVED' })
      await tick(T1, [g.id])
      expect(pushes(g.lineGroupId!)).toHaveLength(1)
    })

    it('400 แต่กลุ่มยังอยู่ → FAILED ธรรมดา (ไม่ INACTIVE ไม่ retry) + alert SEND_FAILED', async () => {
      const g = await mkGroup(owner, [shopA])
      behave.set(g.lineGroupId!, [400])
      await tick(T0, [g.id])
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'FAILED', reason: 'HTTP_400' })
      expect(await grp(g.id)).toMatchObject({ status: 'ACTIVE', alertKind: 'SEND_FAILED' })
    })

    it('401 → RETRY_PENDING ไม่เพิ่ม attempt + log OPS · tick ถัดไปลองอีก (ยังไม่เผา retry)', async () => {
      const g = await mkGroup(owner, [shopA])
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      behave.set(g.lineGroupId!, [401, 403])
      await tick(T0, [g.id])
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'RETRY_PENDING', attempt: 0, reason: 'TOKEN_INVALID' })
      expect(spy).toHaveBeenCalledWith('[line-report][OPS] TOKEN_INVALID')
      await tick(T1, [g.id])
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'RETRY_PENDING', attempt: 0 })
      await tick(T2, [g.id])
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'SENT' })
      expect(spy.mock.calls.flat().join(' ')).not.toContain('token-x')
      spy.mockRestore()
    })

    it('RETRY_PENDING ค้างจน fireAt+90 นาที → MISSED + ล้าง payload', async () => {
      const g = await mkGroup(owner, [shopA])
      behave.set(g.lineGroupId!, [500, 'ok'])
      await tick(T0, [g.id])
      await tick(new Date(FIRE + 95 * MIN), [g.id])
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'MISSED', pendingPayload: null })
      expect(pushes(g.lineGroupId!)).toHaveLength(1)
    })

    it('CLAIMED ค้าง >5 นาที ไม่มี payload → คำนวณใหม่แล้วส่ง', async () => {
      const g = await mkGroup(owner, [shopA])
      const r = await prisma.lineReportDelivery.create({ data: { groupId: g.id, kind: 'DAILY', slotKey: SLOT } })
      await prisma.$executeRaw`UPDATE "LineReportDelivery" SET "updatedAt" = ${new Date(T0.getTime() - 10 * MIN)} WHERE "id" = ${r.id}`
      await tick(T0, [g.id])
      expect((await row(g.id, SLOT)).status).toBe('SENT')
      expect(pushes(g.lineGroupId!)).toHaveLength(1)
    })

    it('ร้านทุกร้านดึงข้อมูลไม่สำเร็จ → ไม่ push · retry ได้ครั้งเดียว แล้ว FAILED(ALL_SHOPS_FAILED)', async () => {
      const g = await mkGroup(owner, [shopA])
      h.errShops.add(shopA)
      await tick(T0, [g.id])
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'RETRY_PENDING', reason: 'ALL_SHOPS_FAILED', attempt: 1 })
      await tick(T1, [g.id])
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'FAILED', reason: 'ALL_SHOPS_FAILED' })
      expect(pushes(g.lineGroupId!)).toHaveLength(0)
    })
  })

  describe('แพ็กเกจหยุด (TFR-19)', () => {
    it('LOCKED ระหว่าง sweep → ไม่ push รายงาน · final notice ครั้งเดียว (รันซ้ำไม่ส่งซ้ำ) · กลับ ACTIVE ไม่ส่งย้อนหลัง', async () => {
      const u = await mkUser('lock')
      await mkSub(u)
      const s = await mkShop(u, 'lock')
      const g = await mkGroup(u, [s])
      await prisma.businessPackageSubscription.update({ where: { ownerId: u }, data: { status: 'LOCKED_RENEWAL_FAILED', lockedAt: new Date('2000-03-09T10:00:00Z') } })

      await tick(T0, [g.id])
      const p1 = pushes(g.lineGroupId!)
      expect(p1).toHaveLength(1) // มีแต่ข้อความสุดท้าย — ไม่ใช่รายงาน
      const text = JSON.stringify(p1[0].init.body!.messages)
      expect(text).toContain(FINAL_NOTICE_MESSAGE.slice(0, 12))
      expect(text).not.toMatch(/฿|https?:\/\//)
      const fin = await row(g.id, 'F:2000-03-09T10:00:00.000Z')
      expect(fin).toMatchObject({ kind: 'FINAL_NOTICE', status: 'SENT' })
      expect((await grp(g.id)).finalNoticeSentAt).not.toBeNull()
      expect((await row(g.id, SLOT)).status).toBe('MISSED') // slot ที่ผ่านระหว่างหยุดถูกใช้ไป

      await tick(T1, [g.id])
      await tick(T2, [g.id])
      expect(pushes(g.lineGroupId!)).toHaveLength(1)

      await prisma.businessPackageSubscription.update({ where: { ownerId: u }, data: { status: 'ACTIVE', lockedAt: null } })
      await tick(new Date(FIRE + 70 * MIN), [g.id]) // กลับ ACTIVE ใน slot เดิม
      expect(pushes(g.lineGroupId!)).toHaveLength(1) // ไม่ส่งย้อนหลัง
      expect((await grp(g.id)).finalNoticeSentAt).toBeNull() // มาร์กเกอร์รีเซ็ต (lazy)
      expect(await rows(g.id)).toHaveLength(2) // F + D(MISSED)

      await tick(new Date(fireAt(D2, 1080) + 5 * MIN), [g.id]) // วันถัดไปทำงานปกติ
      expect(pushes(g.lineGroupId!)).toHaveLength(2)
      expect((await row(g.id, `D:${D2}@18:00`)).status).toBe('SENT')
    })

    it('แพ็กเกจหยุดซ้ำช่วงใหม่ (ล็อกใหม่ = lockedAt ใหม่) ได้ข้อความสุดท้ายอีกครั้ง', async () => {
      const u = await mkUser('lock2')
      await mkSub(u, 'LOCKED_RENEWAL_FAILED')
      const g = await mkGroup(u, [await mkShop(u, 'lock2')])
      await tick(T0, [g.id])
      await prisma.businessPackageSubscription.update({ where: { ownerId: u }, data: { status: 'ACTIVE', lockedAt: null } })
      await tick(T1, [g.id])
      await prisma.businessPackageSubscription.update({ where: { ownerId: u }, data: { status: 'LOCKED_RENEWAL_FAILED', lockedAt: new Date('2000-03-10T12:00:00Z') } })
      await tick(T2, [g.id])
      expect(pushes(g.lineGroupId!)).toHaveLength(2)
    })

    it('ไม่มีแถวแพ็กเกจ (ยกเลิก) → key เป็นวันที่ไทย · กลุ่มที่ไม่ได้เปิดรายงานไม่ได้ข้อความสุดท้าย', async () => {
      const u = await mkUser('cancel')
      const s = await mkShop(u, 'cancel')
      const on = await mkGroup(u, [s])
      const off = await mkGroup(u, [s], { dailyEnabled: false, monthlyEnabled: false })
      await tick(T0, [on.id, off.id])
      expect((await row(on.id, 'F:2000-03-10')).kind).toBe('FINAL_NOTICE')
      expect(await rows(off.id)).toHaveLength(0)
      expect(pushes(off.lineGroupId!)).toHaveLength(0)
    })

    it('RETRY_PENDING ค้าง + แพ็กเกจหยุด → MISSED(PACKAGE_PAUSED) ล้าง payload ไม่ส่งต่อ', async () => {
      const u = await mkUser('lock3')
      await mkSub(u)
      const g = await mkGroup(u, [await mkShop(u, 'lock3')])
      behave.set(g.lineGroupId!, [500])
      await tick(T0, [g.id])
      await prisma.businessPackageSubscription.update({ where: { ownerId: u }, data: { status: 'LOCKED_RENEWAL_FAILED', lockedAt: new Date('2000-03-10T12:00:00Z') } })
      await tick(T1, [g.id])
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'MISSED', reason: 'PACKAGE_PAUSED', pendingPayload: null })
      expect(pushes(g.lineGroupId!).filter((c) => JSON.stringify(c.init.body).includes('รายงานสรุปยอดของกลุ่มนี้หยุด'))).toHaveLength(1)
    })
  })

  describe('skipWhenNoOrders (AC-19-7/8)', () => {
    const slotRow = async (shops: string[], data: Record<string, unknown>) => {
      const g = await mkGroup(owner, shops, data)
      await tick(T0, [g.id])
      return { g, r: await row(g.id, SLOT) }
    }
    it('ทุกร้าน 0/0 → SKIPPED_NO_ORDERS ไม่ push ไม่ retry', async () => {
      const { g, r } = await slotRow([shopA, shopB], { skipWhenNoOrders: true })
      expect(r).toMatchObject({ status: 'SKIPPED_NO_ORDERS', reason: 'NO_ORDERS', pendingPayload: null })
      expect(pushes(g.lineGroupId!)).toHaveLength(0)
    })
    it('ร้านหนึ่งมีออเดอร์ → ส่ง', async () => {
      h.nums.set(shopB, { orders: 1, cancelled: 0 })
      const { g, r } = await slotRow([shopA, shopB], { skipWhenNoOrders: true })
      expect(r.status).toBe('SENT')
      expect(pushes(g.lineGroupId!)).toHaveLength(1)
    })
    it('ยกเลิกอย่างเดียว → ส่ง', async () => {
      h.nums.set(shopA, { orders: 0, cancelled: 2 })
      const { r } = await slotRow([shopA, shopB], { skipWhenNoOrders: true })
      expect(r.status).toBe('SENT')
    })
    it('ตัวเลือกปิด → ส่งแม้ 0/0', async () => {
      const { r } = await slotRow([shopA, shopB], { skipWhenNoOrders: false })
      expect(r.status).toBe('SENT')
    })
    it('ร้านล้ม (ERROR) ไม่ถูกนับเป็น "ไม่มีออเดอร์" · ปิดทั้ง orders/sales = ไม่รู้ ห้ามข้าม', async () => {
      h.errShops.add(shopB)
      const { r } = await slotRow([shopA, shopB], { skipWhenNoOrders: true })
      expect(r.status).toBe('SENT')
      h.errShops.clear()
      const { r: r2 } = await slotRow([shopA], { skipWhenNoOrders: true, showOrders: false, showSales: false, showCancelled: true })
      expect(r2.status).toBe('SENT')
    })
    it('ส่งทดสอบไม่ใช้ตัวเลือกนี้ (ส่งแม้ 0/0)', async () => {
      const g = await mkGroup(owner, [shopA], { skipWhenNoOrders: true })
      const res = await sendTest(owner, g.id)
      expect(res.remaining).toBe(4)
      expect(pushes(g.lineGroupId!)).toHaveLength(1)
    })
  })

  describe('ร้านถูกล็อก (TFR-16)', () => {
    it('ล็อกบางร้าน → ส่งเฉพาะที่เหลือ + หมายเหตุชื่อร้าน/เหตุผล · ปลดล็อกแล้วรอบถัดไปรวมร้านนั้น', async () => {
      const u = await mkUser('shoplock')
      await mkSub(u)
      const ok = await mkShop(u, 'ok')
      const locked = await mkShop(u, 'locked', { packageLockedAt: new Date() })
      const g = await mkGroup(u, [ok, locked])
      await tick(T0, [g.id])
      const body = JSON.stringify(pushes(g.lineGroupId!)[0].init.body)
      expect(body).toContain(`lrx-${run}-locked`)
      expect(body).toContain('ถูกล็อก')
      await prisma.shop.update({ where: { id: locked }, data: { packageLockedAt: null } })
      await tick(new Date(fireAt(D2, 1080) + 5 * MIN), [g.id])
      expect(JSON.stringify(pushes(g.lineGroupId!)[1].init.body)).not.toContain('ถูกล็อก')
    })
    it('ทุกร้านถูกล็อก/ลบ → ไม่ push · NO_SENDABLE_SHOPS + alert · ไม่ retry', async () => {
      const u = await mkUser('alllock')
      await mkSub(u)
      const s1 = await mkShop(u, 'l1', { packageLockedAt: new Date() })
      const s2 = await mkShop(u, 'l2', { deletedAt: new Date() })
      const g = await mkGroup(u, [s1, s2])
      await tick(T0, [g.id])
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'NO_SENDABLE_SHOPS', reason: 'NO_SENDABLE_SHOPS' })
      expect(await grp(g.id)).toMatchObject({ alertKind: 'NO_SENDABLE_SHOPS' })
      await tick(T1, [g.id])
      expect(pushes(g.lineGroupId!)).toHaveLength(0)
      expect(await rows(g.id)).toHaveLength(1)
    })
  })

  describe('รายวัน + รายเดือน (TFR-10)', () => {
    const monthly = { monthlyEnabled: true, cutoffDay: 9, attachCycleToDaily: true }
    it('วันเดียวกัน → push เดียว 2 messages · แถว M: pushMessageCount 0 reason IN_DAILY_PUSH · ข้ามยอดสะสม', async () => {
      const g = await mkGroup(owner, [shopA], monthly)
      await tick(T0, [g.id])
      const p = pushes(g.lineGroupId!)
      expect(p).toHaveLength(1)
      expect(p[0].init.body!.messages).toHaveLength(2)
      expect(h.cumulative).not.toHaveBeenCalled() // AC-11-7
      expect(await row(g.id, SLOT)).toMatchObject({ kind: 'DAILY', status: 'SENT', pushMessageCount: 7 })
      expect(await row(g.id, 'M:2000-03-09')).toMatchObject({ kind: 'MONTHLY', status: 'SENT', pushMessageCount: 0, reason: 'IN_DAILY_PUSH' })
    })
    it('รายวันเปิดอย่างเดียวที่ attach=true → มียอดสะสม (cumulative เรียก)', async () => {
      const g = await mkGroup(owner, [shopA], { attachCycleToDaily: true })
      await tick(T0, [g.id])
      expect(h.cumulative).toHaveBeenCalledTimes(1)
      expect(pushes(g.lineGroupId!)[0].init.body!.messages).toHaveLength(1)
    })
    it('ปิดรายวัน → ส่งรายเดือนเดี่ยว 1 message', async () => {
      const g = await mkGroup(owner, [shopA], { ...monthly, dailyEnabled: false, dailyTimes: [1080] })
      await tick(T0, [g.id])
      expect(pushes(g.lineGroupId!)[0].init.body!.messages).toHaveLength(1)
      expect(await row(g.id, 'M:2000-03-09')).toMatchObject({ status: 'SENT', pushMessageCount: 7 })
      expect(await rows(g.id)).toHaveLength(1)
    })
    it('push รวมล้ม → ทั้งสองแถว RETRY_PENDING · retry ส่ง 2 messages เดิมไบต์เดิมครั้งเดียว → ทั้งสองแถว SENT', async () => {
      const g = await mkGroup(owner, [shopA], monthly)
      behave.set(g.lineGroupId!, [500])
      await tick(T0, [g.id])
      expect(await row(g.id, 'M:2000-03-09')).toMatchObject({ status: 'RETRY_PENDING', attempt: 1 })
      await tick(T1, [g.id])
      const p = pushes(g.lineGroupId!)
      expect(p).toHaveLength(2)
      expect(JSON.stringify(p[1].init.body)).toBe(JSON.stringify(p[0].init.body))
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'SENT', pendingPayload: null })
      expect(await row(g.id, 'M:2000-03-09')).toMatchObject({ status: 'SENT', reason: 'IN_DAILY_PUSH', pushMessageCount: 0 })
    })
    it('รายวัน+รายเดือนว่างทั้งคู่ + skipWhenNoOrders → ข้ามทั้งสองแถว ไม่ push', async () => {
      const g = await mkGroup(owner, [shopA], { ...monthly, skipWhenNoOrders: true })
      h.nums.set(shopA, { orders: 0, cancelled: 0 })
      await tick(T0, [g.id])
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'SKIPPED_NO_ORDERS' })
      expect(await row(g.id, 'M:2000-03-09')).toMatchObject({ status: 'SKIPPED_NO_ORDERS' })
      expect(pushes(g.lineGroupId!)).toHaveLength(0)
    })
  })

  describe('ความทนทาน (AC-19-5/6)', () => {
    it('กลุ่มหนึ่ง throw → อีกกลุ่มยังส่ง · errors นับ 1', async () => {
      const bad = await mkGroup(owner, [shopA])
      const good = await mkGroup(owner, [shopA])
      behave.set(bad.lineGroupId!, ['throw'])
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const res = await tick(T0, [bad.id, good.id])
      spy.mockRestore()
      expect(res).toMatchObject({ errors: 1, processed: 1 })
      expect((await row(good.id, SLOT)).status).toBe('SENT')
    })
    it('budget หมด → หยุดเริ่มกลุ่มใหม่ · tick ถัดไปเก็บที่เหลือ', async () => {
      const gs = [await mkGroup(owner, [shopA]), await mkGroup(owner, [shopA]), await mkGroup(owner, [shopA])]
      // นาฬิกาเดินตามการ push (ไม่ผูกกับจำนวนครั้งที่ถูกเรียก) — push ละ 130s: หลัง 2 กลุ่ม = 260s ≥ 240s
      let t = 0
      h.onPush.fn = () => { t += 130_000 }
      const res = await tick(T0, gs.map((g) => g.id), { budgetMs: 240_000, clock: () => t })
      expect(res).toMatchObject({ budgetStopped: true, processed: 2 })
      const started = (await Promise.all(gs.map((g) => rows(g.id)))).filter((r) => r.length > 0)
      expect(started).toHaveLength(2)
      await tick(T1, gs.map((g) => g.id))
      expect(gs.reduce((n, g) => n + pushes(g.lineGroupId!).length, 0)).toBe(3)
    })
    it('เรียงกลุ่มตาม slot เก่าสุดก่อน (24:00 ของเมื่อวานยิง 00:00 ก่อนรอบอื่น)', async () => {
      const late = await mkGroup(owner, [shopA], { dailyTimes: [30] }) // 00:30 ของ D2
      const early = await mkGroup(owner, [shopA], { dailyTimes: [1440] }) // 24:00 ของ D = 00:00 ของ D2
      await tick(new Date(fireAt(D2, 0) + 40 * MIN), [late.id, early.id])
      const order = calls().filter((c) => c.path === '/v2/bot/message/push').map((c) => c.init.body!.to)
      expect(order).toEqual([early.lineGroupId, late.lineGroupId])
    })
    it('env ไม่ครบ → { skipped: NOT_CONFIGURED } ไม่แตะ LINE', async () => {
      vi.stubEnv('LINE_REPORT_BOT_CHANNEL_ACCESS_TOKEN', '')
      const g = await mkGroup(owner, [shopA])
      expect(await tick(T0, [g.id])).toEqual({ skipped: 'NOT_CONFIGURED' })
      expect(h.api).not.toHaveBeenCalled()
      vi.stubEnv('LINE_REPORT_BOT_CHANNEL_ACCESS_TOKEN', 'token-x')
    })
    it('เลือกเฉพาะ ACTIVE ที่เปิดรายงาน — INACTIVE/PENDING ไม่ถูกหยิบ', async () => {
      const a = await mkGroup(owner, [shopA], { status: 'INACTIVE' })
      const b = await mkGroup(owner, [shopA], { status: 'PENDING' })
      await tick(T0, [a.id, b.id])
      expect(h.api).not.toHaveBeenCalled()
    })
  })

  describe('sendTest (TFR-12 · AC-13-1)', () => {
    it('5 ผ่าน / 6 ไม่ผ่าน · ข้ามเที่ยงคืนไทยรีเซ็ต · แถว TEST ไม่เก็บ payload', async () => {
      const g = await mkGroup(owner, [shopA])
      const now = new Date()
      for (let i = 0; i < 5; i++) expect((await sendTest(owner, g.id, now)).remaining).toBe(4 - i)
      await expect(sendTest(owner, g.id, now)).rejects.toMatchObject({ code: 'TEST_QUOTA_EXCEEDED', status: 429 })
      expect(pushes(g.lineGroupId!)).toHaveLength(5)
      expect(await countTestsToday(g.id, now)).toBe(5) // parity กับ predicate ใน tx
      const tests = (await rows(g.id)).filter((r) => r.kind === 'TEST')
      expect(tests.every((r) => r.status === 'SENT' && r.pendingPayload === null && r.slotKey.startsWith('T:'))).toBe(true)
      const nextDay = new Date(now.getTime() + 24 * 60 * MIN)
      expect((await sendTest(owner, g.id, nextDay)).remaining).toBe(4)
    })
    it('กดแข่งกัน 7 ครั้ง → สำเร็จ 5 พอดี', async () => {
      const g = await mkGroup(owner, [shopA])
      const res = await Promise.allSettled(Array.from({ length: 7 }, () => sendTest(owner, g.id)))
      expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(5)
      expect(res.filter((r) => r.status === 'rejected' && (r.reason as { code?: string }).code === 'TEST_QUOTA_EXCEEDED')).toHaveLength(2)
      expect(pushes(g.lineGroupId!)).toHaveLength(5)
    })
    it('ล้ม = กินโควตาด้วย (ทุกแถว TEST ของวัน) · ไม่ retry (push ครั้งเดียว) · แปลง error ตามตาราง', async () => {
      const g = await mkGroup(owner, [shopA])
      behave.set(g.lineGroupId!, [500])
      await expect(sendTest(owner, g.id)).rejects.toMatchObject({ code: 'LINE_UNAVAILABLE', status: 502 })
      behave.set(g.lineGroupId!, [401])
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await expect(sendTest(owner, g.id)).rejects.toMatchObject({ code: 'BOT_UNAVAILABLE' })
      spy.mockRestore()
      expect(pushes(g.lineGroupId!)).toHaveLength(2)
      expect(await countTestsToday(g.id, new Date())).toBe(2)
      expect((await rows(g.id)).every((r) => r.status === 'FAILED')).toBe(true)
      // ล้ม 3 ครั้งเพิ่ม = ครบ 5 → ครั้งที่ 6 ถูกปฏิเสธทั้งที่ไม่เคยส่งสำเร็จสักครั้ง
      for (let i = 0; i < 3; i++) {
        behave.set(g.lineGroupId!, [500])
        await expect(sendTest(owner, g.id)).rejects.toMatchObject({ code: 'LINE_UNAVAILABLE' })
      }
      await expect(sendTest(owner, g.id)).rejects.toMatchObject({ code: 'TEST_QUOTA_EXCEEDED' })
      expect(pushes(g.lineGroupId!)).toHaveLength(5)
    })
    it('400 + summary 404 → BOT_NOT_IN_GROUP + กลุ่ม INACTIVE + alert', async () => {
      const g = await mkGroup(owner, [shopA])
      behave.set(g.lineGroupId!, [400])
      gone.add(g.lineGroupId!)
      await expect(sendTest(owner, g.id)).rejects.toMatchObject({ code: 'BOT_NOT_IN_GROUP', status: 409 })
      expect(await grp(g.id)).toMatchObject({ status: 'INACTIVE', alertKind: 'BOT_REMOVED' })
    })
    it('ด่านเดียวกับการส่งจริง: ไม่ใช่ของตน/INACTIVE/แพ็กเกจหยุด/ไม่เหลือร้าน', async () => {
      const g = await mkGroup(owner, [shopA])
      const other = await mkUser('other')
      await expect(sendTest(other, g.id)).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' })
      const inactive = await mkGroup(owner, [shopA], { status: 'INACTIVE' })
      await expect(sendTest(owner, inactive.id)).rejects.toMatchObject({ code: 'GROUP_NOT_ACTIVE' })
      await expect(sendTest(other, randomUUID())).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' })
      const u = await mkUser('paused')
      const locked = await mkShop(u, 'paused', { packageLockedAt: new Date() })
      const g2 = await mkGroup(u, [locked])
      await expect(sendTest(u, g2.id)).rejects.toMatchObject({ code: 'PACKAGE_REQUIRED' })
      await mkSub(u)
      await expect(sendTest(u, g2.id)).rejects.toMatchObject({ code: 'NO_SENDABLE_SHOPS', status: 409 })
      expect(await countTestsToday(g2.id, new Date())).toBe(1) // แถวที่ปิดเป็น NO_SENDABLE_SHOPS ก็กินโควตา
      expect(h.api).not.toHaveBeenCalledWith('/v2/bot/message/push', expect.anything(), expect.objectContaining({ body: expect.objectContaining({ to: g2.lineGroupId }) }))
    })
    it('env ไม่ครบ → BOT_NOT_CONFIGURED ก่อนแตะข้อมูล', async () => {
      vi.stubEnv('LINE_REPORT_BOT_CHANNEL_SECRET', '')
      const g = await mkGroup(owner, [shopA])
      await expect(sendTest(owner, g.id)).rejects.toMatchObject({ code: 'BOT_NOT_CONFIGURED', status: 503 })
      vi.stubEnv('LINE_REPORT_BOT_CHANNEL_SECRET', 'secret-x')
    })
  })

  describe('rework: tri-state แพ็กเกจ (security M2)', () => {
    it('อ่านแพ็กเกจไม่ได้ (throw) → ข้ามกลุ่มใน tick นั้น: ไม่เขียนแถว ไม่ MISSED ไม่ push ไม่ final notice', async () => {
      const u = await mkUser('unk')
      await mkSub(u, 'LOCKED_RENEWAL_FAILED') // ถ้าอ่านได้จะเป็น UNPAID → final notice · แต่อ่านไม่ได้
      const g = await mkGroup(u, [await mkShop(u, 'unk')])
      h.subFail.on = true
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const res = await tick(T0, [g.id])
      expect(err).toHaveBeenCalledWith('[line-report] PAID_STATE_UNKNOWN', g.id)
      err.mockRestore()
      expect(res).toMatchObject({ unknown: 1, paused: 0, errors: 0 })
      expect(await rows(g.id)).toHaveLength(0)
      expect(h.api).not.toHaveBeenCalled()
      expect((await grp(g.id)).finalNoticeSentAt).toBeNull()
      h.subFail.on = false
      await tick(T1, [g.id]) // อ่านได้แล้ว = UNPAID จริง → ถึงจะส่งข้อความสุดท้าย (slot ยังไม่ถูกใช้ไปเพราะ UNKNOWN)
      expect(pushes(g.lineGroupId!)).toHaveLength(1)
    })
    it('sendFinalNotice ไม่ส่งเมื่อ UNKNOWN หรือ PAID — ส่งเฉพาะ UNPAID ที่ยืนยันแล้ว', async () => {
      const u = await mkUser('fn')
      await mkSub(u, 'LOCKED_RENEWAL_FAILED')
      const g = await mkGroup(u, [await mkShop(u, 'fn')])
      const ctx = { now: T0, cache: (await import('@/services/line-report-summary.service')).createSweepCache() }
      h.subFail.on = true
      expect(await sendFinalNotice(g, ctx)).toMatchObject({ state: 'ABORTED' })
      h.subFail.on = false
      await prisma.businessPackageSubscription.update({ where: { ownerId: u }, data: { status: 'ACTIVE', lockedAt: null } })
      expect(await sendFinalNotice(g, ctx)).toMatchObject({ state: 'ABORTED' })
      expect(h.api).not.toHaveBeenCalled()
      expect(await rows(g.id)).toHaveLength(0)
    })
    it('retry ของแถวค้างตอนอ่านแพ็กเกจไม่ได้ → ไม่แตะแถว (ไม่ MISSED)', async () => {
      const g = await mkGroup(owner, [shopA])
      behave.set(g.lineGroupId!, [500])
      await tick(T0, [g.id])
      h.subFail.on = true
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await tick(T1, [g.id])
      err.mockRestore()
      expect(await row(g.id, SLOT)).toMatchObject({ status: 'RETRY_PENDING', attempt: 1 })
      expect(h.api.mock.calls.filter(([p]) => p === '/v2/bot/message/push')).toHaveLength(1)
    })
  })

  describe('rework: claim atomic · ยอดสะสมไม่ครบ · budget ในกลุ่ม · ร้านไม่ใช่ของเจ้าของ', () => {
    const monthly = { monthlyEnabled: true, cutoffDay: 9 }
    it('D: ถูกถือไปก่อนแล้วแต่ไม่มีแถว M: → ส่งรายเดือนเดี่ยว', async () => {
      const g = await mkGroup(owner, [shopA], monthly)
      await prisma.lineReportDelivery.create({ data: { groupId: g.id, kind: 'DAILY', slotKey: SLOT, status: 'SENT' } })
      await tick(T0, [g.id])
      const p = pushes(g.lineGroupId!)
      expect(p).toHaveLength(1)
      expect(p[0].init.body!.messages).toHaveLength(1)
      expect(await row(g.id, 'M:2000-03-09')).toMatchObject({ status: 'SENT', pushMessageCount: 7 })
    })
    it('M: มีแถวอยู่แล้ว → ไม่ส่งรายเดือนซ้ำ (ส่งแค่รายวัน)', async () => {
      const g = await mkGroup(owner, [shopA], monthly)
      await prisma.lineReportDelivery.create({ data: { groupId: g.id, kind: 'MONTHLY', slotKey: 'M:2000-03-09', status: 'SENT' } })
      await tick(T0, [g.id])
      const p = pushes(g.lineGroupId!)
      expect(p).toHaveLength(1)
      expect(p[0].init.body!.messages).toHaveLength(1)
      expect((await row(g.id, SLOT)).status).toBe('SENT')
    })
    it('แถว M: ที่ติดมาได้ retryKey เดียวกับ D: ตอนเก็บ payload', async () => {
      const g = await mkGroup(owner, [shopA], monthly)
      behave.set(g.lineGroupId!, [500])
      await tick(T0, [g.id])
      const d = await row(g.id, SLOT)
      expect((await row(g.id, 'M:2000-03-09')).retryKey).toBe(d.retryKey)
      expect((await row(g.id, 'M:2000-03-09')).pendingPayload).toBeNull()
    })
    it('ยอดสะสมรอบ: บางร้านล้ม → ข้อความมีหมายเหตุไม่ครบ · ทุกร้านล้ม → "ดึงข้อมูลไม่สำเร็จ" ไม่ใช่ ฿0', async () => {
      const g = await mkGroup(owner, [shopA, shopB], { attachCycleToDaily: true, monthlyEnabled: true, cutoffDay: 20 })
      h.cumulative.mockResolvedValueOnce({ totals: { orders: 1, confirmed: 500, unconfirmed: 0, cancelled: 0 }, failedShops: 1 })
      await tick(T0, [g.id])
      const body = JSON.stringify(pushes(g.lineGroupId!)[0].init.body)
      expect(body).toContain('ยอดสะสมรอบนี้')
      expect(body).toContain('ยอดรวมยังไม่ครบ เพราะดึงข้อมูลบางร้านไม่สำเร็จ')
      const g2 = await mkGroup(owner, [shopA], { attachCycleToDaily: true, monthlyEnabled: true, cutoffDay: 20 })
      h.cumulative.mockResolvedValueOnce({ totals: { orders: 0, confirmed: 0, unconfirmed: 0, cancelled: 0 }, failedShops: 1 })
      await tick(T0, [g2.id])
      const b2 = JSON.stringify(pushes(g2.lineGroupId!)[0].init.body)
      expect(b2.slice(b2.indexOf('ยอดสะสมรอบนี้'))).toContain('ดึงข้อมูลไม่สำเร็จ')
    })
    it('budget ตรวจระหว่าง slot ในกลุ่มเดียวด้วย — เกินแล้วไม่เริ่ม slot ถัดไป', async () => {
      const g = await mkGroup(owner, [shopA], { dailyTimes: [1050, 1080] }) // 17:30 + 18:00 ถึงกำหนดทั้งคู่ที่ T0
      let t = 0
      h.onPush.fn = () => { t += 250_000 }
      const res = await tick(T0, [g.id], { clock: () => t })
      expect(res).toMatchObject({ budgetStopped: true })
      expect(pushes(g.lineGroupId!)).toHaveLength(1)
    })
    it('เรียงกลุ่ม: กลุ่มที่มีงานมาก่อนกลุ่มว่าง (ไม่ NaN) แม้อยู่ท้ายรายการ', async () => {
      const idle1 = await mkGroup(owner, [shopA], { dailyTimes: [30] })
      const idle2 = await mkGroup(owner, [shopA], { dailyTimes: [30] })
      const work = await mkGroup(owner, [shopA])
      let t = 0
      h.onPush.fn = () => { t += 250_000 } // push แรกใช้ budget หมด → ถ้ากลุ่มมีงานไม่ถูกเรียงขึ้นก่อนจะไม่มี push เลย
      await tick(T0, [idle1.id, idle2.id, work.id], { clock: () => t })
      expect(pushes(work.lineGroupId!)).toHaveLength(1)
    })
    it('ร้านที่ไม่ใช่ของเจ้าของกลุ่ม → NOT_OWNED ถูกตัดออก (แสดงเป็นไม่พร้อมใช้งาน) · ไม่เหลือร้านเลย = NO_SENDABLE_SHOPS', async () => {
      const stranger = await mkUser('stranger')
      const foreign = await mkShop(stranger, 'foreign')
      const g = await mkGroup(owner, [shopA, foreign])
      const r = await resolveSendableShops(g)
      expect(r.sendable.map((x) => x.id)).toEqual([shopA])
      expect(r.excluded).toMatchObject([{ shop: { id: foreign }, reason: 'NOT_OWNED' }])
      await tick(T0, [g.id])
      const body = JSON.stringify(pushes(g.lineGroupId!)[0].init.body)
      expect(body).toContain('ไม่พร้อมใช้งาน')
      const g2 = await mkGroup(owner, [foreign])
      await tick(T0, [g2.id])
      expect((await row(g2.id, SLOT)).status).toBe('NO_SENDABLE_SHOPS')
      expect(pushes(g2.lineGroupId!)).toHaveLength(0)
    })
  })

  describe('cleanup (TFR-23 · AC-23-3/5/6)', () => {
    const NOW = new Date('2000-06-01T03:05:00+07:00') // tick แรกหลัง 03:00 ไทย
    const ago = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * 86_400_000 - extraMs)

    it('ลบ/ล้างเฉพาะที่เกินเวลา · PENDING ที่ไม่เคยผูก >7 วัน → REMOVED', async () => {
      const u = await mkUser('clean')
      const g = await mkGroup(u, [], { status: 'ACTIVE', dailyEnabled: false })
      const mk = (slotKey: string, createdAt: Date, extra: Record<string, unknown> = {}) =>
        prisma.lineReportDelivery.create({ data: { groupId: g.id, kind: 'DAILY', slotKey, createdAt, ...extra } as never })
      const oldDel = await mk('X:old', ago(91))
      const newDel = await mk('X:new', ago(89))
      const oldPayload = await mk('X:payload-old', ago(0, 25 * 3_600_000), { status: 'RETRY_PENDING', pendingPayload: { raw: '[]' } })
      const newPayload = await mk('X:payload-new', ago(0, 23 * 3_600_000), { status: 'RETRY_PENDING', pendingPayload: { raw: '[]' } })

      const rg = `lrx-rate-${run}`
      ids.rateGroups.push(rg)
      const oldRate = await prisma.lineReportRateEvent.create({ data: { lineGroupId: rg, kind: 'COMMAND', createdAt: ago(2) } })
      const newRate = await prisma.lineReportRateEvent.create({ data: { lineGroupId: rg, kind: 'COMMAND', createdAt: ago(0, 3_600_000) } })

      const pendOld = await mkGroup(u, [], { status: 'PENDING', dailyEnabled: false, boundAt: null, createdAt: ago(8) })
      const pendYoung = await mkGroup(u, [], { status: 'PENDING', dailyEnabled: false, boundAt: null, createdAt: ago(6) })
      const pendFreshCode = await mkGroup(u, [], { status: 'PENDING', dailyEnabled: false, boundAt: null, createdAt: ago(20) })
      const code = (groupId: string, createdAt: Date, expiresAt: Date, revoked = false) =>
        prisma.lineReportBindCode.create({ data: { ownerId: u, groupId, codeHash: `h-${randomUUID()}`, createdAt, expiresAt, ...(revoked ? { revokedAt: createdAt } : {}) } })
      const oldCode = await code(pendOld.id, ago(8), ago(8, -10 * MIN), true) // หมดอายุเมื่อ >7 วัน
      const freshCode = await code(pendFreshCode.id, ago(0, 3_600_000), ago(0, -10 * MIN))
      const sevenOldCode = await code(pendFreshCode.id, ago(8), ago(8, -10 * MIN), true)

      const res = await runCleanup(NOW)
      expect(res.pendingRemoved).toBe(1)

      expect(await prisma.lineReportDelivery.findUnique({ where: { id: oldDel.id } })).toBeNull()
      expect(await prisma.lineReportDelivery.findUnique({ where: { id: newDel.id } })).not.toBeNull()
      expect((await prisma.lineReportDelivery.findUniqueOrThrow({ where: { id: oldPayload.id } })).pendingPayload).toBeNull()
      expect((await prisma.lineReportDelivery.findUniqueOrThrow({ where: { id: newPayload.id } })).pendingPayload).not.toBeNull()
      expect(await prisma.lineReportRateEvent.findUnique({ where: { id: oldRate.id } })).toBeNull()
      expect(await prisma.lineReportRateEvent.findUnique({ where: { id: newRate.id } })).not.toBeNull()
      expect(await prisma.lineReportBindCode.findUnique({ where: { id: oldCode.id } })).toBeNull()
      expect(await prisma.lineReportBindCode.findUnique({ where: { id: sevenOldCode.id } })).toBeNull()
      expect(await prisma.lineReportBindCode.findUnique({ where: { id: freshCode.id } })).not.toBeNull()
      expect(await grp(pendOld.id)).toMatchObject({ status: 'REMOVED' })
      expect((await grp(pendOld.id)).removedAt).not.toBeNull()
      expect(await grp(pendYoung.id)).toMatchObject({ status: 'PENDING' })
      expect(await grp(pendFreshCode.id)).toMatchObject({ status: 'PENDING' }) // โค้ดสดยังไม่หมดอายุ
      expect(await grp(g.id)).toMatchObject({ status: 'ACTIVE' })
    })

    it('รวมใน sweep: tick ใน [03:00,03:30) รัน · tick อื่นไม่รัน · cleanup ล้ม = sweep ไม่ล้ม', async () => {
      const at = (hhmm: string) => new Date(`2000-06-02T${hhmm}:00+07:00`)
      expect((await tick(at('02:59'), [])) ).toMatchObject({ cleanup: 'SKIPPED' })
      expect((await tick(at('12:00'), []))).toMatchObject({ cleanup: 'SKIPPED' })
      expect((await tick(at('03:00'), []))).toMatchObject({ cleanup: expect.objectContaining({ deleted: expect.any(Number) }) })
      expect((await tick(at('03:30'), []))).toMatchObject({ cleanup: 'SKIPPED' })
      h.cleanupFail.on = true
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      expect(await tick(at('03:10'), [])).toMatchObject({ cleanup: 'FAILED', errors: 0 })
      h.cleanupFail.on = false
      err.mockRestore()
    })
  })
})
