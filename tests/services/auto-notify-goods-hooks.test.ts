/**
 * 00078 T15 — จุดเสียบ reserve ฝั่งสินค้า (createOrder / promoteDraft / shipOrder / updateShipmentTracking /
 * iship linkShipment+advanceOrderIfDispatched / dispatchShipment) บน Postgres จริง
 * 🛑 HR13/HR14: รันเฉพาะ localhost:5434 · ลบเฉพาะ id ที่เทสสร้างเอง
 * ไม่มีการเรียกเครือข่าย: runAfterResponse ถูก mock (เก็บ ledgerId ไว้ ไม่รัน dispatch) · iShip client ถูก mock
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))

const { after } = vi.hoisted(() => ({ after: { tasks: [] as unknown[] } }))
// จับงานหลัง response ไว้นับ — ไม่รันจริง (ไม่ยิงข้อความ)
vi.mock('@/lib/run-after-response', () => ({ runAfterResponse: (t: unknown) => void after.tasks.push(t) }))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: () => 'tok', encryptToken: (t: string) => t }))
const { ishipMock } = vi.hoisted(() => ({
  ishipMock: { track: 'TH0001', status: 2 as number, dryRun: false },
}))
vi.mock('@/lib/iship/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/iship/client')>()),
  getOrder: async () => ({ track_no: ishipMock.track, courier_code: 'FlashExpressA', status: ishipMock.status, cod_amount: 0 }),
  getTraces: async () => [],
  createOrder: async () => ({ result: { tracking_number: ishipMock.track, ref: 'R1', id: 1 }, dryRun: ishipMock.dryRun }),
}))

import { prisma as appPrisma } from '@/lib/prisma'
import { createOrder, promoteDraftToOrder, shipOrder, updateShipmentTracking } from '@/services/order.service'
import { linkShipment, retryShipment } from '@/services/iship.service'
import { reserveTrackingNotice } from '@/services/auto-notify.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000)

const S = { user: '', shop: '' }
const ids = { convs: [] as string[], orders: [] as string[] }

async function mkConv() {
  const c = await db.conversation.create({
    data: { shopId: S.shop, channel: 'DEEP', alias: `gh-${run}`, lastSenderRole: 'BUYER', lastInboundAt: hoursAgo(1), lastMessageAt: hoursAgo(1) },
    select: { id: true },
  })
  ids.convs.push(c.id)
  return c.id
}
/** ออเดอร์ที่ส่งแล้วต้องเป็น SHIPPED mode — สร้างตรงด้วย db (createOrder ทดสอบแยก) */
async function mkOrder(conversationId: string | null, o: { status?: string; shipped?: boolean } = {}) {
  const ord = await db.order.create({
    data: {
      shopId: S.shop, conversationId, type: 'PHYSICAL', totalAmount: 100, buyerContact: `08${run}`, buyerName: 'คุณสมชาย',
      status: o.status ?? 'PENDING', fulfillmentMode: o.shipped === false ? 'NO_SHIPPING' : 'SHIPPED',
      items: { create: { name: 'เสื้อยืด', qty: 1, price: 100 } },
    },
    select: { id: true, publicToken: true },
  })
  ids.orders.push(ord.id)
  return ord
}
async function setSwitch(kind: string, enabled: boolean) {
  await db.autoNotifySwitch.upsert({
    where: { shopId_kind: { shopId: S.shop, kind } },
    create: { shopId: S.shop, kind, enabled, enabledAt: hoursAgo(1) },
    update: { enabled, enabledAt: hoursAgo(1) },
  })
}
const ledger = (orderId: string, kind?: string) =>
  db.autoNotifyLedger.findMany({ where: { orderId, ...(kind ? { kind } : {}) }, orderBy: { createdAt: 'asc' } })
const newOrderData = (conversationId: string | null, extra: Record<string, unknown> = {}) => ({
  items: [{ name: 'คอร์สออนไลน์', qty: 1, price: 390 }], type: 'DIGITAL', buyerContact: `08${run}`, conversationId, ...extra,
}) as Parameters<typeof createOrder>[1]

describe.skipIf(!isLocal)('auto-notify goods hooks (DB จริง)', () => {
  beforeAll(async () => {
    const u = await db.user.create({ data: { displayName: `gh-${run}`, username: `gh_${run}` }, select: { id: true } })
    const shop = await db.shop.create({ data: { userId: u.id, shopName: `gh-${run}`, kind: 'BUSINESS', vertical: 'ONLINE_SALES' } as never, select: { id: true } })
    await db.shopShippingAccount.create({
      data: { shopId: shop.id, accessTokenEnc: 'x', connectedByUserId: u.id, status: 'ACTIVE', defaultCourierCode: 'FlashExpressA' },
    })
    Object.assign(S, { user: u.id, shop: shop.id })
  })

  afterAll(async () => {
    // เฉพาะ id ที่เทสสร้าง (HR13) — ledger/event ลบตาม cascade ของ order
    const created = await db.order.findMany({ where: { shopId: S.shop }, select: { id: true } }) // ออเดอร์จาก createOrder ในร้านเทสของเราเอง
    const orderIds = [...new Set([...ids.orders, ...created.map((o) => o.id)])]
    await db.orderShipment.deleteMany({ where: { orderId: { in: orderIds } } })
    await db.shipmentTracking.deleteMany({ where: { orderId: { in: orderIds } } })
    await db.order.deleteMany({ where: { id: { in: orderIds } } })
    await db.conversation.deleteMany({ where: { id: { in: ids.convs } } })
    await db.shopShippingAccount.deleteMany({ where: { shopId: S.shop } })
    await db.autoNotifySwitch.deleteMany({ where: { shopId: S.shop } })
    await db.shop.deleteMany({ where: { id: S.shop } })
    await db.user.deleteMany({ where: { id: S.user } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    after.tasks.length = 0
    ishipMock.track = `TH${randomUUID().slice(0, 8).toUpperCase()}`
    ishipMock.status = 2
    ishipMock.dryRun = false
    await setSwitch('ORDER_SUMMARY', true)
    await setSwitch('TRACKING', true)
  })

  describe('createOrder / promoteDraft → ORDER_SUMMARY', () => {
    it('ผูกห้อง + สวิตช์เปิด → 1 แถว INTENT + สั่ง dispatch หลัง commit 1 ครั้ง', async () => {
      const conv = await mkConv()
      const o = await createOrder(S.shop, newOrderData(conv))
      const rows = await ledger(o.id)
      expect(rows.map((r) => [r.kind, r.status, r.valueKey])).toEqual([['ORDER_SUMMARY', 'INTENT', '-']])
      expect(after.tasks).toHaveLength(1)
    })

    it('ไม่ผูกห้อง / สวิตช์ปิด → ไม่มีแถว ไม่ dispatch', async () => {
      const a = await createOrder(S.shop, newOrderData(null))
      expect(await ledger(a.id)).toHaveLength(0)
      await setSwitch('ORDER_SUMMARY', false)
      const b = await createOrder(S.shop, newOrderData(await mkConv()))
      expect(await ledger(b.id)).toHaveLength(0)
      expect(after.tasks).toHaveLength(0)
    })

    it('D-13: วันที่ผู้ขายระบุต่างวันไทย → ไม่ส่ง · วันเดียวกัน (ต่างแค่เวลา) → ส่ง', async () => {
      const conv = await mkConv()
      const back = await createOrder(S.shop, newOrderData(conv, { createdAt: new Date(Date.now() - 3 * 86400_000) }))
      expect(await ledger(back.id)).toHaveLength(0)
      // เลือกเวลาที่ไม่ข้ามเที่ยงคืนไทย: ถอย 1 นาที (ถ้าตกเที่ยงคืนพอดีพอดีค่อยพลาด — ยอมรับได้)
      const same = await createOrder(S.shop, newOrderData(conv, { createdAt: new Date(Date.now() - 60_000) }))
      expect(await ledger(same.id)).toHaveLength(1)
    })

    it('ร้านบริการ + ไม่มีนัด → ORDER_SUMMARY ไม่อยู่ใน vertical → ไม่มีแถว', async () => {
      await db.shop.update({ where: { id: S.shop }, data: { vertical: 'SERVICE_QUEUE' } })
      try {
        const o = await createOrder(S.shop, newOrderData(await mkConv()))
        expect(await ledger(o.id)).toHaveLength(0)
      } finally {
        await db.shop.update({ where: { id: S.shop }, data: { vertical: 'ONLINE_SALES' } })
      }
    })

    it('promoteDraft: ร่างผูกห้อง → 1 แถว · ไม่ผูก → 0', async () => {
      const conv = await mkConv()
      const mk = async (c: string | null) => {
        const d = await db.order.create({
          data: { shopId: S.shop, conversationId: c, type: 'PHYSICAL', status: 'DRAFTED', totalAmount: 100, items: { create: { name: 'เสื้อ', qty: 1, price: 100 } } },
          select: { id: true, publicToken: true },
        })
        ids.orders.push(d.id)
        return d
      }
      const d1 = await mkDraftSafe(mk, conv)
      await promoteDraftToOrder(S.shop, d1.publicToken, newOrderData(conv), null)
      expect(await ledger(d1.id)).toHaveLength(1)
      const d2 = await mkDraftSafe(mk, null)
      await promoteDraftToOrder(S.shop, d2.publicToken, newOrderData(null), null)
      expect(await ledger(d2.id)).toHaveLength(0)
    })
  })

  describe('shipOrder / updateShipmentTracking → TRACKING', () => {
    it('shipOrder ผูกห้อง → 1 แถว TRACKING (key normalize) · ไม่ผูก/สวิตช์ปิด → 0', async () => {
      const o = await mkOrder(await mkConv())
      await shipOrder(o.publicToken, { provider: 'FLASH', trackingNo: ' th123x ' })
      const rows = await ledger(o.id, 'TRACKING')
      expect(rows.map((r) => [r.status, r.valueKey])).toEqual([['INTENT', 'TH123X']])
      expect(after.tasks).toHaveLength(1)

      const un = await mkOrder(null)
      await shipOrder(un.publicToken, { provider: 'FLASH', trackingNo: 'TH9' })
      expect(await ledger(un.id)).toHaveLength(0)

      await setSwitch('TRACKING', false)
      const off = await mkOrder(await mkConv())
      await shipOrder(off.publicToken, { provider: 'FLASH', trackingNo: 'TH8' })
      expect(await ledger(off.id)).toHaveLength(0)
    })

    it('แก้เลข: เลขเดิม (ต่างแค่ตัวพิมพ์/ขนส่ง) ไม่เพิ่มแถว · เลขใหม่เพิ่ม 1 แถว', async () => {
      const o = await mkOrder(await mkConv())
      await shipOrder(o.publicToken, { provider: 'FLASH', trackingNo: 'TH111' })
      await updateShipmentTracking(o.publicToken, { provider: 'KERRY', trackingNo: 'th111' })
      expect(await ledger(o.id, 'TRACKING')).toHaveLength(1)
      await updateShipmentTracking(o.publicToken, { provider: 'KERRY', trackingNo: 'TH222' })
      expect((await ledger(o.id, 'TRACKING')).map((r) => r.valueKey)).toEqual(['TH111', 'TH222'])
    })

    it('10 คำขอพร้อมกันเลขเดียวกัน → แถวเดียว', async () => {
      const o = await mkOrder(await mkConv())
      const res = await Promise.all(
        Array.from({ length: 10 }, () => appPrisma.$transaction((tx) => reserveTrackingNotice(tx, o.id, 'TH-PAR'))),
      )
      expect(res.filter(Boolean)).toHaveLength(1)
      expect(await ledger(o.id, 'TRACKING')).toHaveLength(1)
    })

    it('reserve ล้ม (เลขยาว > 120 ชน CHECK) → shipOrder ยังสำเร็จ · สถานะ SHIPPED · ไม่มีแถว', async () => {
      const o = await mkOrder(await mkConv())
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        await shipOrder(o.publicToken, { provider: 'FLASH', trackingNo: 'X'.repeat(200) })
        expect(spy).toHaveBeenCalled()
      } finally {
        spy.mockRestore()
      }
      expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('SHIPPED')
      expect(await db.shipmentTracking.count({ where: { orderId: o.id } })).toBe(1)
      expect(await ledger(o.id)).toHaveLength(0)
    })
  })

  describe('iShip → TRACKING', () => {
    it('linkShipment (+advanceOrderIfDispatched เลขเดียวกัน) → แถวเดียว · ไม่ผูกห้อง → 0', async () => {
      const o = await mkOrder(await mkConv())
      await linkShipment(S.shop, S.user, o.id, ishipMock.track, 'KEEP_ORDER')
      expect((await ledger(o.id, 'TRACKING')).map((r) => r.valueKey)).toEqual([ishipMock.track])
      expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('SHIPPED') // advance ทำงานจริง
      expect(after.tasks).toHaveLength(1)

      ishipMock.track = `TH${randomUUID().slice(0, 8).toUpperCase()}`
      const un = await mkOrder(null)
      await linkShipment(S.shop, S.user, un.id, ishipMock.track, 'KEEP_ORDER')
      expect(await ledger(un.id)).toHaveLength(0)
    })

    it('dispatchShipment (retryShipment ใบที่ FAILED) → 1 แถว · โหมดทดลอง iShip (เลขปลอม) → 0', async () => {
      const mkFailed = async (conv: string) => {
        const o = await mkOrder(conv)
        const s = await db.orderShipment.create({
          data: {
            orderId: o.id, shopId: S.shop, status: 'FAILED', idempotencyKey: `gh-${randomUUID()}`, courierCode: 'FlashExpressA',
            categoryId: 6, weight: 1, width: 10, length: 10, height: 10,
            senderSnapshot: { name: 'ร้าน', phone: '0800000000', address: 'x', subdistrict: 'a', district: 'b', province: 'c', postcode: '10000' },
            receiverSnapshot: {}, optionsSnapshot: {},
          },
          select: { id: true },
        })
        return { o, s }
      }
      const a = await mkFailed(await mkConv())
      await retryShipment(S.shop, S.user, a.s.id)
      expect((await ledger(a.o.id, 'TRACKING')).map((r) => r.valueKey)).toEqual([ishipMock.track])

      ishipMock.track = `TH${randomUUID().slice(0, 8).toUpperCase()}`
      ishipMock.dryRun = true
      const b = await mkFailed(await mkConv())
      await retryShipment(S.shop, S.user, b.s.id)
      expect(await ledger(b.o.id)).toHaveLength(0)
    })
  })
})

/** ร่างต้องผ่าน CHECK draftReasons — ถ้า create ตรงไม่ผ่านจะ throw ชัดเจนในเทส */
async function mkDraftSafe(mk: (c: string | null) => Promise<{ id: string; publicToken: string }>, c: string | null) {
  return mk(c)
}
