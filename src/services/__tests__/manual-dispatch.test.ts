/**
 * 00080 — ขั้นตอนจัดส่งแบบส่งเอง บน Postgres จริง (shipOrder / updateShipmentTracking / markManualDispatched / markManualDelivered)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้างเอง
 *
 * Mutation (บังคับ — baseline S-6, S-11):
 *   M-effects  ถอด runPostConfirmEffects ใน markManualDelivered   → "ผลข้างเคียงครั้งเดียว" แดง
 *   M-both     shipOrder จองทุก timing                             → "ON_DISPATCH ไม่จองตอนบันทึก" แดง
 *   M-ondisp   updateShipmentTracking ไม่เช็ก holdNotice           → "PATCH ใน ON_DISPATCH ไม่จอง" แดง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: () => 'tok', encryptToken: (t: string) => t }))

const { dispatched, effects } = vi.hoisted(() => ({
  dispatched: [] as (string | null | undefined)[],
  effects: { seller: vi.fn(async () => {}), user: vi.fn(async () => {}) },
}))
// จองจริง (ledger จริง) แต่ไม่ยิงข้อความ — เก็บ id ที่ส่งเข้า dispatch ไว้ดู
vi.mock('@/services/auto-notify.service', async (orig) => ({
  ...(await orig<typeof import('@/services/auto-notify.service')>()),
  dispatchAutoNotifyAfterCommit: (id: string | null | undefined) => { dispatched.push(id) },
}))
// ผลข้างเคียงหลังปิดงาน (เหรียญ+Trust) — นับครั้งที่ถูกเรียก
vi.mock('@/services/badge.service', async (orig) => ({
  ...(await orig<typeof import('@/services/badge.service')>()),
  evaluateSellerBadgesForShop: effects.seller,
  evaluateBadges: effects.user,
}))

import { createShipment, IShipServiceError } from '@/services/iship.service'
import { confirmOrder } from '@/services/order.service'
import {
  shipOrder,
  ShipmentTrackingExistsError,
  updateShipmentTracking,
  markManualDispatched,
  markManualDelivered,
  OrderNotShippedError,
  ManualDispatchNotAllowedError,
  ManualDeliveryNotAllowedError,
  OrderNotFoundError,
} from '@/services/order.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000)

const S = { user: '', shop: '', otherShop: '', conv: '' }
const ids = { orders: [] as string[], convs: [] as string[] }

async function mkOrder(o: { status?: string; tracking?: string; iship?: 'CREATED' | 'FAILED'; dryRun?: boolean; shopId?: string } = {}) {
  const conv = await db.conversation.create({
    data: { shopId: S.shop, channel: 'DEEP', alias: `md-${run}`, lastSenderRole: 'BUYER', lastInboundAt: hoursAgo(1), lastMessageAt: hoursAgo(1) },
    select: { id: true },
  })
  ids.convs.push(conv.id)
  const ord = await db.order.create({
    data: {
      shopId: o.shopId ?? S.shop, conversationId: conv.id, type: 'PHYSICAL', totalAmount: 100, status: o.status ?? 'PENDING',
      buyerContact: `08${run}`, buyerName: 'คุณสมชาย',
      items: { create: { name: 'เสื้อยืด', qty: 1, price: 100 } },
    },
    select: { id: true, publicToken: true },
  })
  ids.orders.push(ord.id)
  if (o.tracking) await db.shipmentTracking.create({ data: { orderId: ord.id, provider: 'Kerry', trackingNo: o.tracking } })
  if (o.iship) {
    await db.orderShipment.create({
      data: { orderId: ord.id, shopId: S.shop, status: o.iship, isDryRun: o.dryRun ?? false, idempotencyKey: `md-${randomUUID()}`, trackingNo: `IS-${randomUUID().slice(0, 8)}` },
    })
  }
  return ord
}
const setTiming = (t: 'ON_SAVE' | 'ON_DISPATCH') =>
  db.autoNotifyConfig.upsert({
    where: { shopId: S.shop },
    create: { shopId: S.shop, trackingNoticeTiming: t },
    update: { trackingNoticeTiming: t },
  })
const ledger = (orderId: string) => db.autoNotifyLedger.findMany({ where: { orderId, kind: 'TRACKING' }, orderBy: { createdAt: 'asc' } })
const events = (orderId: string, type: string) => db.orderEvent.findMany({ where: { orderId, type } })
const statusOf = async (orderId: string) => (await db.order.findUniqueOrThrow({ where: { id: orderId } })).status

describe.skipIf(!isLocal)('ส่งเอง 3 ขั้น (DB จริง)', () => {
  beforeAll(async () => {
    const u = await db.user.create({ data: { displayName: `md-${run}`, username: `md_${run}` }, select: { id: true } })
    const mk = (n: string) => db.shop.create({ data: { userId: u.id, shopName: `md-${n}-${run}`, kind: 'BUSINESS', vertical: 'ONLINE_SALES' } as never, select: { id: true } })
    const [shop, other] = await Promise.all([mk('a'), mk('b')])
    Object.assign(S, { user: u.id, shop: shop.id, otherShop: other.id })
    await db.shopShippingAccount.create({ data: { shopId: shop.id, accessTokenEnc: 'x', connectedByUserId: u.id, status: 'ACTIVE', defaultCourierCode: 'FlashExpressA' } })
    await db.autoNotifySwitch.create({ data: { shopId: shop.id, kind: 'TRACKING', enabled: true, enabledAt: hoursAgo(1) } })
  })

  afterAll(async () => {
    // เฉพาะ id ที่เทสสร้าง (HR13) — event/ledger/tracking/shipment ลบตาม cascade ของ order
    await db.shopShippingAccount.deleteMany({ where: { shopId: S.shop } })
    await db.order.deleteMany({ where: { id: { in: ids.orders } } })
    await db.conversation.deleteMany({ where: { id: { in: ids.convs } } })
    await db.shop.deleteMany({ where: { id: { in: [S.shop, S.otherShop] } } })
    await db.user.deleteMany({ where: { id: S.user } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    dispatched.length = 0
    effects.seller.mockClear()
    effects.user.mockClear()
    await setTiming('ON_SAVE')
  })

  describe('shipOrder / updateShipmentTracking', () => {
    it('บันทึกเลข: status คง PENDING + TRACKING_ADDED + ยังไม่มี dispatchedAt', async () => {
      const o = await mkOrder()
      const res = await shipOrder(o.publicToken, { provider: 'Kerry', trackingNo: 'KEX1' }, S.user)
      expect(res.status).toBe('PENDING')
      expect(await statusOf(o.id)).toBe('PENDING')
      expect(await events(o.id, 'TRACKING_ADDED')).toHaveLength(1)
      expect((await db.shipmentTracking.findUniqueOrThrow({ where: { orderId: o.id } })).dispatchedAt).toBeNull()
    })

    it('ON_SAVE จองตอนบันทึก · ON_DISPATCH ไม่จองตอนบันทึก [M-both]', async () => {
      const a = await mkOrder()
      await shipOrder(a.publicToken, { provider: 'Kerry', trackingNo: 'SAVE1' })
      expect(await ledger(a.id)).toHaveLength(1)

      await setTiming('ON_DISPATCH')
      const b = await mkOrder()
      await shipOrder(b.publicToken, { provider: 'Kerry', trackingNo: 'HOLD1' })
      expect(await ledger(b.id)).toHaveLength(0)
    })

    it('PATCH ใน PENDING ได้ (status คงเดิม) · ON_DISPATCH ไม่จอง [M-ondisp] · ON_SAVE เลขเปลี่ยนจอง', async () => {
      await setTiming('ON_DISPATCH')
      const a = await mkOrder({ tracking: 'OLD1' })
      await updateShipmentTracking(a.publicToken, { provider: 'Flash', trackingNo: 'NEW1' }, S.user)
      expect(await statusOf(a.id)).toBe('PENDING')
      expect((await db.shipmentTracking.findUniqueOrThrow({ where: { orderId: a.id } })).trackingNo).toBe('NEW1')
      expect(await ledger(a.id)).toHaveLength(0)

      await setTiming('ON_SAVE')
      const b = await mkOrder({ tracking: 'OLD2' })
      await updateShipmentTracking(b.publicToken, { provider: 'Flash', trackingNo: 'NEW2' })
      expect(await ledger(b.id)).toHaveLength(1)
    })

    it('PATCH ใน SHIPPED ยังได้ · CONFIRMED/CANCELLED → OrderNotShippedError', async () => {
      const s = await mkOrder({ status: 'SHIPPED', tracking: 'A1' })
      await expect(updateShipmentTracking(s.publicToken, { provider: 'K', trackingNo: 'A2' })).resolves.toBeTruthy()
      for (const status of ['CONFIRMED', 'CANCELLED']) {
        const x = await mkOrder({ status, tracking: 'B1' })
        await expect(updateShipmentTracking(x.publicToken, { provider: 'K', trackingNo: 'B2' })).rejects.toThrow(OrderNotShippedError)
      }
    })
  })

  describe('markManualDispatched', () => {
    it('PENDING → SHIPPED + MANUAL_DISPATCHED (ผู้กด) + dispatchedAt', async () => {
      const o = await mkOrder({ tracking: 'D1' })
      const r = await markManualDispatched(o.publicToken, S.shop, S.user)
      expect(r).toMatchObject({ changed: true, order: { status: 'SHIPPED' } })
      expect(await statusOf(o.id)).toBe('SHIPPED')
      const ev = await events(o.id, 'MANUAL_DISPATCHED')
      expect(ev).toHaveLength(1)
      expect(ev[0].actorUserId).toBe(S.user)
      expect((await db.shipmentTracking.findUniqueOrThrow({ where: { orderId: o.id } })).dispatchedAt).not.toBeNull()
    })

    it('กดซ้ำพร้อมกัน N=10 → changed 1 ใบ · event 1 แถว · จอง notice 1 แถว', async () => {
      await setTiming('ON_DISPATCH')
      const o = await mkOrder({ tracking: 'RACE1' })
      const rs = await Promise.all(Array.from({ length: 10 }, () => markManualDispatched(o.publicToken, S.shop, S.user)))
      expect(rs.filter((r) => r.changed)).toHaveLength(1)
      expect(rs.filter((r) => !r.changed)).toHaveLength(9)
      expect(await events(o.id, 'MANUAL_DISPATCHED')).toHaveLength(1)
      expect(await ledger(o.id)).toHaveLength(1)
    })

    it('ถูกปฏิเสธ (ข้อความไทย): iShip live · CONFIRMED · CANCELLED · ไม่มีเลข', async () => {
      const ish = await mkOrder({ tracking: 'X1', iship: 'CREATED' })
      await expect(markManualDispatched(ish.publicToken, S.shop, S.user)).rejects.toThrow(/iShip/)
      const conf = await mkOrder({ status: 'CONFIRMED', tracking: 'X2' })
      await expect(markManualDispatched(conf.publicToken, S.shop, S.user)).rejects.toThrow(/สำเร็จ.*ไปแล้ว/)
      const canc = await mkOrder({ status: 'CANCELLED', tracking: 'X3' })
      await expect(markManualDispatched(canc.publicToken, S.shop, S.user)).rejects.toThrow(/ยกเลิกแล้ว/)
      const none = await mkOrder()
      await expect(markManualDispatched(none.publicToken, S.shop, S.user)).rejects.toThrow(ManualDispatchNotAllowedError)
      await expect(markManualDispatched(none.publicToken, S.shop, S.user)).rejects.toThrow(/ยังไม่มีเลขพัสดุ/)
      // ไม่มี event/ไม่เปลี่ยนสถานะ
      expect(await events(ish.id, 'MANUAL_DISPATCHED')).toHaveLength(0)
      expect(await statusOf(ish.id)).toBe('PENDING')
    })

    it('iShip FAILED / dry-run ไม่กั้นส่งเอง (ใช้นิยาม live เดียวกับหน้าจอ) · CREATED จริง = 409 [M-live]', async () => {
      for (const o of [{ iship: 'FAILED' as const }, { iship: 'CREATED' as const, dryRun: true }]) {
        const a = await mkOrder({ tracking: `L${randomUUID().slice(0, 6)}`, ...o })
        await expect(markManualDispatched(a.publicToken, S.shop, S.user)).resolves.toMatchObject({ changed: true })
        await expect(markManualDelivered(a.publicToken, S.shop, S.user)).resolves.toMatchObject({ changed: true })
        expect(await statusOf(a.id)).toBe('CONFIRMED')
      }
      const live = await mkOrder({ tracking: `L${randomUUID().slice(0, 6)}`, iship: 'CREATED' })
      await expect(markManualDispatched(live.publicToken, S.shop, S.user)).rejects.toThrow(ManualDispatchNotAllowedError)
      await db.order.update({ where: { id: live.id }, data: { status: 'SHIPPED' } })
      await expect(markManualDelivered(live.publicToken, S.shop, S.user)).rejects.toThrow(ManualDeliveryNotAllowedError)
    })

    it('ออเดอร์ร้านอื่น → OrderNotFoundError (scope ด้วย shopId)', async () => {
      const o = await mkOrder({ tracking: 'Y1' })
      await expect(markManualDispatched(o.publicToken, S.otherShop, S.user)).rejects.toThrow(OrderNotFoundError)
      expect(await statusOf(o.id)).toBe('PENDING')
    })
  })

  describe('จังหวะแจ้งเลข (timing matrix)', () => {
    it('ON_SAVE แจ้งไปแล้ว → กดจัดส่งแล้วไม่จองซ้ำ (ledger 1 แถว)', async () => {
      const o = await mkOrder()
      await shipOrder(o.publicToken, { provider: 'K', trackingNo: 'M1' })
      await markManualDispatched(o.publicToken, S.shop, S.user)
      expect(await ledger(o.id)).toHaveLength(1)
    })

    it('ON_DISPATCH: บันทึก/แก้เลขไม่จอง · กดจัดส่งแล้วจองเลขปัจจุบันครั้งเดียว', async () => {
      await setTiming('ON_DISPATCH')
      const o = await mkOrder()
      await shipOrder(o.publicToken, { provider: 'K', trackingNo: 'first1' })
      await updateShipmentTracking(o.publicToken, { provider: 'K', trackingNo: 'second2' })
      expect(await ledger(o.id)).toHaveLength(0)
      await markManualDispatched(o.publicToken, S.shop, S.user)
      const rows = await ledger(o.id)
      expect(rows).toHaveLength(1)
      expect(rows[0].valueKey).toBe('SECOND2')
      expect(dispatched.filter(Boolean)).toHaveLength(1)
    })

    it('สลับ ON_DISPATCH → ON_SAVE กลางทาง: เลขที่ยังไม่แจ้งถูกแจ้งตอนกดจัดส่งแล้ว (ไม่หาย) ครั้งเดียว', async () => {
      await setTiming('ON_DISPATCH')
      const o = await mkOrder()
      await shipOrder(o.publicToken, { provider: 'K', trackingNo: 'SW1' })
      await setTiming('ON_SAVE')
      await markManualDispatched(o.publicToken, S.shop, S.user)
      expect(await ledger(o.id)).toHaveLength(1)
    })
  })

  describe('รอบ review', () => {
    it('createShipment (iShip) ปฏิเสธเมื่อมีเลขส่งเองและไม่มี iShip live · FAILED ก็ปฏิเสธ [M-create]', async () => {
      for (const iship of [undefined, 'FAILED' as const]) {
        const o = await mkOrder({ tracking: `C${randomUUID().slice(0, 6)}`, iship })
        const err = await createShipment(S.shop, S.user, o.id).catch((e) => e)
        expect(err).toBeInstanceOf(IShipServiceError)
        expect(err.code).toBe('SHIPMENT_EXISTS')
        expect(err.userMessage).toMatch(/ส่งเองไว้แล้ว/)
      }
    })

    it('confirmOrder หลังร้านกด "ส่งสำเร็จ" → ไม่เขียน BUYER_CONFIRMED · ผลข้างเคียงครั้งเดียว [M-confirm]', async () => {
      const o = await mkOrder({ status: 'SHIPPED', tracking: `F${randomUUID().slice(0, 6)}` })
      await db.order.update({ where: { id: o.id }, data: { buyerUserId: S.user } })
      await markManualDelivered(o.publicToken, S.shop, S.user)
      // อ่านสด: ลูกค้ากดจากหน้าเก่าที่ยังเห็น SHIPPED — จำลองด้วยการเรียกขนาน
      const rs = await Promise.allSettled([confirmOrder(o.publicToken, S.user), markManualDelivered(o.publicToken, S.shop, S.user)])
      expect(rs.length).toBe(2)
      expect(await events(o.id, 'BUYER_CONFIRMED')).toHaveLength(0)
      expect(effects.seller).toHaveBeenCalledTimes(1)
    })

    it('ลูกค้ากับร้านปิดพร้อมกัน N=10 → ผู้ชนะคนเดียว · event ชุดเดียว · ผลข้างเคียงครั้งเดียว', async () => {
      const o = await mkOrder({ status: 'SHIPPED', tracking: `G${randomUUID().slice(0, 6)}` })
      await db.order.update({ where: { id: o.id }, data: { buyerUserId: S.user } })
      await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) => (i % 2 ? confirmOrder(o.publicToken, S.user) : markManualDelivered(o.publicToken, S.shop, S.user))),
      )
      expect(await statusOf(o.id)).toBe('CONFIRMED')
      const sellerEv = (await events(o.id, 'SELLER_DELIVERED')).length
      const buyerEv = (await events(o.id, 'BUYER_CONFIRMED')).length
      expect(sellerEv + buyerEv).toBe(1)
      expect(effects.seller).toHaveBeenCalledTimes(1)
    })

    it('shipOrder ซ้ำเมื่อมีเลขแล้ว → ShipmentTrackingExistsError', async () => {
      const o = await mkOrder({ tracking: `H${randomUUID().slice(0, 6)}` })
      await expect(shipOrder(o.publicToken, { provider: 'K', trackingNo: 'again' })).rejects.toThrow(ShipmentTrackingExistsError)
    })
  })

  describe('markManualDelivered', () => {
    it('SHIPPED → CONFIRMED + SELLER_DELIVERED (ผู้กด)', async () => {
      const o = await mkOrder({ status: 'SHIPPED', tracking: 'V1' })
      const r = await markManualDelivered(o.publicToken, S.shop, S.user)
      expect(r).toMatchObject({ changed: true, order: { status: 'CONFIRMED' } })
      expect(await statusOf(o.id)).toBe('CONFIRMED')
      const ev = await events(o.id, 'SELLER_DELIVERED')
      expect(ev).toHaveLength(1)
      expect(ev[0].actorUserId).toBe(S.user)
      expect(await events(o.id, 'BUYER_CONFIRMED')).toHaveLength(0)
    })

    it('ใบเก่า (SHIPPED ไม่มี dispatchedAt) ปิดได้', async () => {
      const o = await mkOrder({ status: 'SHIPPED', tracking: 'OLD' })
      expect((await db.shipmentTracking.findUniqueOrThrow({ where: { orderId: o.id } })).dispatchedAt).toBeNull()
      await expect(markManualDelivered(o.publicToken, S.shop, S.user)).resolves.toMatchObject({ changed: true })
    })

    it('N=10 พร้อมกัน → ปิดครั้งเดียว · runPostConfirmEffects ถูกเรียกครั้งเดียว [M-effects]', async () => {
      const o = await mkOrder({ status: 'SHIPPED', tracking: 'V2' })
      const rs = await Promise.all(Array.from({ length: 10 }, () => markManualDelivered(o.publicToken, S.shop, S.user)))
      expect(rs.filter((r) => r.changed)).toHaveLength(1)
      expect(rs.filter((r) => r.alreadyClosed)).toHaveLength(9)
      expect(await events(o.id, 'SELLER_DELIVERED')).toHaveLength(1)
      // shop.kind = BUSINESS → เหรียญรายร้านถูกประเมิน 1 ครั้ง
      expect(effects.seller).toHaveBeenCalledTimes(1)
    })

    it('ลูกค้ายืนยันไปก่อน → alreadyClosed (ไม่ error ไม่รันผลข้างเคียง)', async () => {
      const o = await mkOrder({ status: 'CONFIRMED', tracking: 'V3' })
      const r = await markManualDelivered(o.publicToken, S.shop, S.user)
      expect(r).toMatchObject({ changed: false, alreadyClosed: true })
      expect(effects.seller).not.toHaveBeenCalled()
      expect(await events(o.id, 'SELLER_DELIVERED')).toHaveLength(0)
    })

    it('ถูกปฏิเสธ: PENDING · CANCELLED · iShip', async () => {
      const p = await mkOrder({ tracking: 'Z1' })
      await expect(markManualDelivered(p.publicToken, S.shop, S.user)).rejects.toThrow(/ยังไม่ได้กด "จัดส่งแล้ว"/)
      const c = await mkOrder({ status: 'CANCELLED', tracking: 'Z2' })
      await expect(markManualDelivered(c.publicToken, S.shop, S.user)).rejects.toThrow(ManualDeliveryNotAllowedError)
      const i = await mkOrder({ status: 'SHIPPED', tracking: 'Z3', iship: 'CREATED' })
      await expect(markManualDelivered(i.publicToken, S.shop, S.user)).rejects.toThrow(/iShip/)
      expect(effects.seller).not.toHaveBeenCalled()
      expect(await statusOf(c.id)).toBe('CANCELLED')
    })
  })
})
