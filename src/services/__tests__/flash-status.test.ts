/**
 * 00084 T7a — flash-status.service (DB จริง localhost:5434 เท่านั้น · HR13: สร้าง/ลบเฉพาะ id ที่เทสสร้าง)
 * mutation ที่ต้องแดง: เอา FLASH_VERIFY_STATES ออก (เทส state 5 ปลอม) · เอา `deliveredAt: null` ออกจาก where (เทส write-once)
 * · เอาเงื่อนไข carrierStatusAt ออก (เทสเหตุการณ์เก่า) · ถอด provider ออกจาก findShipmentByPno
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))
const fx = vi.hoisted(() => ({ routes: vi.fn(), routesBatch: vi.fn(), deliveredInfo: vi.fn() }))
vi.mock('@/lib/flash/client', () => fx)

import { handleFlashWebhook, syncFlashStatuses, runFlashStatusSyncCron, applyFlashRoutes } from '@/services/flash-status.service'
import { loadFlashAccount, type LoadedFlashAccount } from '@/services/flash-account'
import { prisma } from '@/lib/prisma'
import { FlashError } from '@/lib/flash/errors'
import { encodeCredential } from '@/lib/flash/credential'
import type { ParsedWebhook } from '@/lib/flash/webhook-parse'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const S = { user: '', shop: '', shop2: '' }
const ids = { orders: [] as string[], pickups: [] as string[] }
let seq = 0
const T = (s: string) => Math.floor(new Date(s).getTime() / 1000) // epoch วินาที
const wh = (data: Record<string, unknown>): ParsedWebhook => ({ mchId: 'M1', nonceStr: 'n', sign: 's', data, raw: { data } })

async function mkShip(o: Record<string, unknown> = {}, shopId = S.shop) {
  const n = ++seq
  const ord = await db.order.create({
    data: { shopId, type: 'PHYSICAL', totalAmount: 100, status: 'PENDING', buyerContact: `08${run}`, buyerName: 'คุณสมชาย', items: { create: { name: 'เสื้อ', qty: 1, price: 100 } } },
    select: { id: true },
  })
  ids.orders.push(ord.id)
  return db.orderShipment.create({
    data: { orderId: ord.id, shopId, provider: 'FLASH', status: 'CREATED', trackingNo: `TH${run}${n}`.toUpperCase(), idempotencyKey: `fs-${randomUUID()}`, weight: 1, ...o },
  })
}
const ship = (id: string) => db.orderShipment.findUniqueOrThrow({ where: { id } })
const evs = (id: string) => db.shipmentEvent.findMany({ where: { shipmentId: id } })
let loaded: LoadedFlashAccount
const orderStatus = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).status

describe.skipIf(!isLocal)('flash-status.service (DB จริง)', () => {
  beforeAll(async () => {
    process.env.CHANNEL_TOKEN_KEY ??= '0'.repeat(64)
    const u = await db.user.create({ data: { displayName: `fs-${run}`, username: `fs_${run}` }, select: { id: true } })
    const mk = (n: string) => db.shop.create({ data: { userId: u.id, shopName: `fs-${n}-${run}`, kind: 'BUSINESS', vertical: 'ONLINE_SALES' } as never, select: { id: true } })
    const [a, b] = await Promise.all([mk('a'), mk('b')])
    Object.assign(S, { user: u.id, shop: a.id, shop2: b.id })
    for (const shopId of [a.id, b.id]) {
      await db.shopShippingAccount.create({
        data: { shopId, provider: 'FLASH', accessTokenEnc: encodeCredential({ secretKey: 'K1', webhookSecret: 'W1' }), merchantId: `M${run}${shopId.slice(0, 4)}`, status: 'ACTIVE', connectedByUserId: u.id },
      })
    }
    loaded = (await loadFlashAccount(S.shop))!
  })

  afterAll(async () => {
    await db.shipmentPickup.deleteMany({ where: { id: { in: ids.pickups } } })
    await db.order.deleteMany({ where: { id: { in: ids.orders } } }) // shipment/event/evidence ตาม cascade
    await db.shopShippingAccount.deleteMany({ where: { shopId: { in: [S.shop, S.shop2] } } })
    await db.shop.deleteMany({ where: { id: { in: [S.shop, S.shop2] } } })
    await db.user.deleteMany({ where: { id: S.user } })
    await db.$disconnect()
  })

  beforeEach(() => {
    fx.routes.mockReset(); fx.routesBatch.mockReset(); fx.deliveredInfo.mockReset()
  })

  it('webhook state 1 ซ้ำ 2 รอบ = ผลเท่ารอบเดียว (ไม่บวมไทม์ไลน์)', async () => {
    const s = await mkShip()
    const body = wh({ pno: s.trackingNo, state: '1', stateDate: String(T('2026-10-01T03:00:00Z')) })
    expect((await handleFlashWebhook(loaded, body)).outcome).toBe('APPLIED')
    const n1 = (await evs(s.id)).length
    await handleFlashWebhook(loaded, body)
    expect((await evs(s.id)).length).toBe(n1)
    const r = await ship(s.id)
    expect(r.carrierStatus).toBe('picked_up')
    expect((await evs(s.id)).some((e) => e.source === 'WEBHOOK_RAW')).toBe(true)
    expect(fx.routes).not.toHaveBeenCalled()
  })

  it('state 5 ปลอมแต่ routes ไม่ยืนยัน → ไม่ประทับ deliveredAt', async () => {
    const s = await mkShip()
    fx.routes.mockResolvedValue({ pno: s.trackingNo, state: 2, stateChangeAt: T('2026-10-01T05:00:00Z'), routes: [] })
    const res = await handleFlashWebhook(loaded, wh({ pno: s.trackingNo, state: '5', stateDate: String(T('2026-10-01T06:00:00Z')) }))
    expect(res.outcome).toBe('APPLIED')
    expect(res.after).toBeUndefined()
    const r = await ship(s.id)
    expect(r.deliveredAt).toBeNull()
    expect(r.carrierStatus).toBe('in_transit')
    expect(fx.routes.mock.calls[0][2]).toEqual({ timeoutMs: 5000 })
  })

  it('state 5 ที่ routes ยืนยัน: ประทับครั้งเดียวด้วยเวลาจาก routes · POD ครั้งเดียว · ไม่แตะ Order.status', async () => {
    const s = await mkShip()
    const t1 = T('2026-10-02T04:00:00Z')
    fx.routes.mockResolvedValue({ pno: s.trackingNo, state: 5, stateChangeAt: t1, routes: [{ routedAt: t1, routeAction: 'DELIVERY_CONFIRM', message: 'ส่งสำเร็จ', state: 5 }] })
    fx.deliveredInfo.mockResolvedValue({ signer: 'สมชาย', signerTypeText: 'ผู้รับ', podUrl: 'https://f/x.png', photos: ['a', 'b', 'c'], lat: '13.7', lng: '100.5' })
    const res = await handleFlashWebhook(loaded, wh({ pno: s.trackingNo, state: '5', stateDate: '1', markerCategory: '' }))
    expect(res.after).toBeTypeOf('function')
    const r1 = await ship(s.id)
    expect(r1.deliveredAt?.getTime()).toBe(t1 * 1000)
    expect(r1.carrierStatus).toBe('delivered')
    // เหตุการณ์ใหม่กว่าของสถานะเดียวกันห้ามขยับ deliveredAt
    fx.routes.mockResolvedValue({ pno: s.trackingNo, state: 5, stateChangeAt: t1 + 9999, routes: [] })
    await handleFlashWebhook(loaded, wh({ pno: s.trackingNo, state: '5', stateDate: '2' }))
    expect((await ship(s.id)).deliveredAt?.getTime()).toBe(t1 * 1000)
    await res.after!(); await res.after!()
    expect(fx.deliveredInfo).toHaveBeenCalledTimes(1)
    const pod = await db.shipmentEvidence.findMany({ where: { shipmentId: s.id } })
    expect(pod).toHaveLength(1)
    expect(pod[0]).toMatchObject({ reason: 'flash_pod', error: null, traceCount: 0 })
    expect((pod[0].parcel as { photos: string[]; kind: string }).photos).toHaveLength(2)
    expect(await orderStatus(s.orderId)).toBe('PENDING')
    expect(r1.codSettledAt).toBeNull()
  })

  it('routes ล้ม → RETRY ไม่ประทับ · 1001/1002 → TOKEN_INVALID หยุดยิงซ้ำ', async () => {
    const s = await mkShip()
    fx.routes.mockRejectedValue(new FlashError('UPSTREAM_TIMEOUT'))
    expect((await handleFlashWebhook(loaded, wh({ pno: s.trackingNo, state: '5' }))).outcome).toBe('RETRY')
    expect((await ship(s.id)).deliveredAt).toBeNull()
    fx.routes.mockRejectedValue(new FlashError('SIGN_INVALID', { flashCode: 1002 }))
    expect((await handleFlashWebhook(loaded, wh({ pno: s.trackingNo, state: '5' }))).outcome).toBe('TOKEN_INVALID')
    expect((await db.shopShippingAccount.findUniqueOrThrow({ where: { shopId_provider: { shopId: S.shop, provider: 'FLASH' } } })).status).toBe('TOKEN_INVALID')
    await db.shopShippingAccount.update({ where: { shopId_provider: { shopId: S.shop, provider: 'FLASH' } }, data: { status: 'ACTIVE' } })
  })

  it('เหตุการณ์เก่าไม่ทับใหม่', async () => {
    const s = await mkShip({ carrierStatus: 'in_transit', carrierStatusAt: new Date('2026-10-03T10:00:00Z') })
    await handleFlashWebhook(loaded, wh({ pno: s.trackingNo, state: '1', stateDate: String(T('2026-10-03T08:00:00Z')) }))
    const r = await ship(s.id)
    expect(r.carrierStatus).toBe('in_transit')
    expect(r.carrierStatusAt?.toISOString()).toBe('2026-10-03T10:00:00.000Z')
  })

  it('state 7: เก็บ returnedPno + returnStartedAt · webhook เลขใหม่เข้าแถวเดิม ไม่ทับ carrierStatus ขาไป ไม่สร้างใบใหม่', async () => {
    const s = await mkShip()
    const rp = `RT${run}${s.id.slice(0, 4)}`.toUpperCase()
    const t = T('2026-10-04T04:00:00Z')
    fx.routes.mockResolvedValue({ pno: s.trackingNo, state: 7, stateChangeAt: t, returnedPno: rp, routes: [] })
    await handleFlashWebhook(loaded, wh({ pno: s.trackingNo, state: '7' }))
    const r = await ship(s.id)
    expect(r).toMatchObject({ carrierStatus: 'return', returnedPno: rp })
    expect(r.returnStartedAt?.getTime()).toBe(t * 1000)
    const before = await db.orderShipment.count({ where: { orderId: s.orderId } })
    // เลขใหม่ state 3 (ไม่ต้องยืนยัน) → แถวเดิม ไทม์ไลน์เป็น return
    const res = await handleFlashWebhook(loaded, wh({ pno: rp, state: '3', stateDate: String(t + 60) }))
    expect(res.outcome).toBe('APPLIED')
    expect(await db.orderShipment.count({ where: { orderId: s.orderId } })).toBe(before)
    expect((await ship(s.id)).carrierStatus).toBe('return')
    expect((await evs(s.id)).some((e) => e.status === 'return' && e.dedupeKey.startsWith(`3:${(t + 60) * 1000}`))).toBe(true)
    // P0-8: state 5 ของเลขใหม่ยังไม่ถือว่าถึงร้าน
    fx.routes.mockResolvedValue({ pno: rp, state: 5, stateChangeAt: t + 600, routes: [] })
    const d = await handleFlashWebhook(loaded, wh({ pno: rp, state: '5' }))
    expect(d.after).toBeUndefined()
    expect((await ship(s.id))).toMatchObject({ carrierStatus: 'return', returnedAt: null, deliveredAt: null })
  })

  it('state 9 → CANCELLED · state 4 → issue + problemAt ครั้งเดียว', async () => {
    const c = await mkShip()
    fx.routes.mockResolvedValue({ pno: c.trackingNo, state: 9, stateChangeAt: T('2026-10-05T01:00:00Z'), routes: [] })
    await handleFlashWebhook(loaded, wh({ pno: c.trackingNo, state: '9' }))
    expect(await ship(c.id)).toMatchObject({ status: 'CANCELLED', carrierStatus: 'cancelled' })
    expect((await ship(c.id)).cancelledAt).not.toBeNull()

    const p = await mkShip()
    const t1 = T('2026-10-05T02:00:00Z')
    fx.routes.mockResolvedValue({ pno: p.trackingNo, state: 4, stateChangeAt: t1, routes: [] })
    await handleFlashWebhook(loaded, wh({ pno: p.trackingNo, state: '4', markerCategory: '40' }))
    fx.routes.mockResolvedValue({ pno: p.trackingNo, state: 4, stateChangeAt: t1 + 86400, routes: [] })
    await handleFlashWebhook(loaded, wh({ pno: p.trackingNo, state: '4', markerCategory: '40' }))
    const r = await ship(p.id)
    expect(r).toMatchObject({ carrierStatus: 'issue' })
    expect(r.problemAt?.getTime()).toBe(t1 * 1000)
    expect((await evs(p.id)).some((e) => e.statusDesc === 'ไม่อยู่หรือไม่รับสาย')).toBe(true)
  })

  it('state ไม่รู้จัก → คงสถานะเดิม + เก็บ raw · pno ไม่ใช่ของร้าน → ไม่เขียนอะไรเลย', async () => {
    const s = await mkShip({ carrierStatus: 'in_transit', carrierStatusAt: new Date('2026-10-06T00:00:00Z') })
    await handleFlashWebhook(loaded, wh({ pno: s.trackingNo, state: '12', stateDate: String(T('2026-10-07T00:00:00Z')) }))
    expect((await ship(s.id)).carrierStatus).toBe('in_transit')
    expect((await evs(s.id)).some((e) => e.source === 'WEBHOOK_RAW')).toBe(true)

    const other = await mkShip({}, S.shop2) // ร้านอื่น: pno เดียวกันต้องไม่ถูกหยิบข้ามร้าน
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = await handleFlashWebhook(loaded, wh({ pno: other.trackingNo, state: '1', stateDate: '1', buyerName: 'ลับ' }))
    expect(res.outcome).toBe('IGNORED_NO_SHIPMENT')
    expect(await evs(other.id)).toHaveLength(0)
    expect(JSON.stringify(info.mock.calls)).not.toContain(other.trackingNo)
    info.mockRestore()
  })

  it('ต้นทุน: รวมองค์ประกอบ · codFee แยก · ติดลบไม่เขียนแต่เก็บ raw · null ไม่ทับ', async () => {
    const s = await mkShip()
    await handleFlashWebhook(loaded, wh({ pno: s.trackingNo, freightPrice: '5000', remoteAreaFee: '1000', speedFee: '500', codFee: '700', priceAt: '1' }))
    expect(await ship(s.id)).toMatchObject({ carrierPrice: expect.anything(), codFee: expect.anything() })
    let r = await ship(s.id)
    expect(Number(r.carrierPrice)).toBe(65)
    expect(Number(r.codFee)).toBe(7)
    // ติดลบ → ทั้งก้อนไม่เขียน แต่ raw เก็บ
    await handleFlashWebhook(loaded, wh({ pno: s.trackingNo, freightPrice: '9000', speedFee: '-100', priceAt: '2' }))
    r = await ship(s.id)
    expect(Number(r.carrierPrice)).toBe(65)
    expect((await evs(s.id)).filter((e) => e.source === 'WEBHOOK_RAW').length).toBe(2)
    // ไม่มี codFee ในก้อนใหม่ → codFee เดิมคงอยู่ · carrierPrice เปลี่ยนจริงจึงเขียน
    await handleFlashWebhook(loaded, wh({ pno: s.trackingNo, freightPrice: '6000', priceAt: '3' }))
    r = await ship(s.id)
    expect(Number(r.carrierPrice)).toBe(60)
    expect(Number(r.codFee)).toBe(7)
    expect(r.carrierStatus).toBeNull()
  })

  it('น้ำหนัก: กรัม→กก. + ธงเกินน้ำหนัก (ร้านแจ้ง 1 กก.)', async () => {
    const s = await mkShip()
    await handleFlashWebhook(loaded, wh({ pno: s.trackingNo, weight: '1500', weightTime: '1' }))
    const r = await ship(s.id)
    expect(Number(r.actualWeight)).toBe(1.5)
    expect(r.isOverWeight).toBe(true)
    expect(r.carrierPrice).toBeNull() // ไม่มีเส้นเติมต้นทุนจากประมาณการ
  })

  it('courier: จับด้วย ticketPickupId หรือ currentTicketPickupId · state 3 อัปเดต current · ค่านอกชุดคงสถานะ · ไม่เจอ = ทิ้ง', async () => {
    const pk = await db.shipmentPickup.create({ data: { shopId: S.shop, provider: 'FLASH', courierCode: 'FLASH', ticketPickupId: `TP${run}`, currentTicketPickupId: `TP${run}`, createdByUserId: S.user } })
    ids.pickups.push(pk.id)
    const p = () => db.shipmentPickup.findUniqueOrThrow({ where: { id: pk.id } })
    expect((await handleFlashWebhook(loaded, wh({ ticketPickupId: `TP${run}`, state: '1', staffInfoName: 'พี่ขนส่ง' }))).outcome).toBe('APPLIED')
    expect(await p()).toMatchObject({ status: 'ACCEPTED', staffName: 'พี่ขนส่ง' })
    await handleFlashWebhook(loaded, wh({ ticketPickupId: `TP${run}`, currentTicketPickupId: `TN${run}`, state: '3' }))
    expect(await p()).toMatchObject({ status: 'ACCEPTED', currentTicketPickupId: `TN${run}` })
    await handleFlashWebhook(loaded, wh({ ticketPickupId: `TN${run}`, state: '99' })) // match ด้วย current
    expect((await p()).status).toBe('ACCEPTED')
    await handleFlashWebhook(loaded, wh({ ticketPickupId: `TN${run}`, state: '2' }))
    expect(await p()).toMatchObject({ status: 'CLOSED' })
    const before = await db.shipmentPickup.count({ where: { shopId: S.shop } })
    expect((await handleFlashWebhook(loaded, wh({ ticketPickupId: 'NOPE', state: '1' }))).outcome).toBe('IGNORED_NO_SHIPMENT')
    expect(await db.shipmentPickup.count({ where: { shopId: S.shop } })).toBe(before)
  })

  it('POD ล้ม → แถว error · ลองใหม่สำเร็จ → อัปเดตแถวเดิม (ยังแถวเดียว)', async () => {
    const s = await mkShip({ carrierStatus: 'delivered', carrierStatusAt: new Date(), deliveredAt: new Date() }, S.shop2)
    const l2 = (await loadFlashAccount(S.shop2))!
    fx.deliveredInfo.mockRejectedValueOnce(new FlashError('UPSTREAM_TIMEOUT'))
    const { captureFlashPod } = await import('@/services/flash-status.service')
    expect(await captureFlashPod(l2, s)).toBe('FAILED')
    let rows = await db.shipmentEvidence.findMany({ where: { shipmentId: s.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].error).toContain('UPSTREAM_TIMEOUT')
    fx.deliveredInfo.mockResolvedValue({ signer: 'x' })
    expect(await syncFlashStatuses(S.shop2, { force: true })).toBe(0) // poll ซ่อม POD
    rows = await db.shipmentEvidence.findMany({ where: { shipmentId: s.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].error).toBeNull()
  })

describe('syncFlashStatuses', () => {
  // ใช้ร้าน shop2 ที่เตรียมไว้ — ต้องรันหลังชุดบน (beforeAll ชุดบนสร้างให้ ถ้าไม่มีก็ข้าม)
  const reset = () => db.shopShippingAccount.update({ where: { shopId_provider: { shopId: S.shop2, provider: 'FLASH' } }, data: { statusSyncedAt: null, status: 'ACTIVE' } })

  it('ชุด poll: ใบ delivered/ใบ COD ที่ส่งถึงแล้วไม่ถูกถาม · ใช้ routesBatch ก้อนเดียวและ apply เหมือน webhook · 15 นาทีข้าม', async () => {
    await reset()
    const a = await mkShip({ carrierStatus: 'in_transit' }, S.shop2)
    await mkShip({ carrierStatus: 'delivered', codAmount: 500, deliveredAt: new Date() }, S.shop2)
    const t = T('2026-10-08T03:00:00Z')
    fx.routesBatch.mockResolvedValue([{ pno: a.trackingNo, state: 3, stateChangeAt: t, routes: [] }])
    fx.deliveredInfo.mockResolvedValue({ signer: 'y' })
    const n = await syncFlashStatuses(S.shop2)
    expect(n).toBe(1)
    expect(fx.routesBatch).toHaveBeenCalledTimes(1)
    const asked = (fx.routesBatch.mock.calls[0][1] as string[])
    expect(asked).toContain(a.trackingNo)
    expect(asked).toHaveLength(asked.filter((p) => p.startsWith('TH')).length)
    expect((await ship(a.id)).carrierStatus).toBe('progress')
    // webhook ซ้ำเหตุการณ์เดียวกันไม่บวมไทม์ไลน์ (dedupe เดียวกัน)
    const before = (await evs(a.id)).length
    await applyFlashRoutes((await db.orderShipment.findUniqueOrThrow({ where: { id: a.id } })) as never, { pno: a.trackingNo, state: 3, stateChangeAt: new Date(t * 1000), returnedPno: null, customaryPno: null, routes: [] }, 'WEBHOOK')
    expect((await evs(a.id)).length).toBe(before)
    // รอบถัดไปภายใน 15 นาที → ข้าม
    fx.routesBatch.mockClear()
    expect(await syncFlashStatuses(S.shop2)).toBe(0)
    expect(fx.routesBatch).not.toHaveBeenCalled()
  })

  it('ผล batch parse ไม่ได้ → ถอยรายใบ ≤8 ใบ/ร้าน/รอบ', async () => {
    await reset()
    await db.orderShipment.updateMany({ where: { shopId: S.shop2, provider: 'FLASH' }, data: { carrierStatus: 'delivered' } })
    for (let i = 0; i < 10; i++) await mkShip({ carrierStatus: 'in_transit' }, S.shop2)
    fx.routesBatch.mockResolvedValue('garbage')
    fx.routes.mockResolvedValue({ state: 2, stateChangeAt: T('2026-10-09T00:00:00Z'), routes: [] })
    fx.deliveredInfo.mockResolvedValue({})
    await syncFlashStatuses(S.shop2)
    expect(fx.routes).toHaveBeenCalledTimes(8)
  })

  it('key ผิดระหว่างรอบ → mark TOKEN_INVALID ข้ามร้าน ไม่อัปเดต statusSyncedAt · TOKEN_INVALID ไม่ถูกเลือก', async () => {
    await reset()
    fx.routesBatch.mockRejectedValue(new FlashError('MERCHANT_NOT_FOUND', { flashCode: 1001 }))
    expect(await syncFlashStatuses(S.shop2)).toBe(0)
    const a = await db.shopShippingAccount.findUniqueOrThrow({ where: { shopId_provider: { shopId: S.shop2, provider: 'FLASH' } } })
    expect(a.status).toBe('TOKEN_INVALID')
    expect(a.statusSyncedAt).toBeNull()
    fx.routesBatch.mockClear()
    expect(await syncFlashStatuses(S.shop2, { force: true })).toBe(0)
    expect(fx.routesBatch).not.toHaveBeenCalled()
  })

  it('cron: ร้านหนึ่งล้มไม่ทำให้ร้านอื่นล้ม (นับ failed) · ซ่อม POD ≤5 ใบ/ร้าน', async () => {
    await reset()
    // กรองบัญชีให้เหลือเฉพาะของเทส — กันไปแตะแถวของคนอื่นในฐานที่ใช้ร่วม
    const spy = vi.spyOn(prisma.shopShippingAccount, 'findMany').mockResolvedValue([{ shopId: S.shop }, { shopId: S.shop2 }] as never)
    await db.shopShippingAccount.update({ where: { shopId_provider: { shopId: S.shop, provider: 'FLASH' } }, data: { statusSyncedAt: null, status: 'ACTIVE' } })
    await db.orderShipment.updateMany({ where: { shopId: S.shop2, provider: 'FLASH' }, data: { carrierStatus: 'delivered', deliveredAt: new Date() } })
    await db.shipmentEvidence.deleteMany({ where: { shipment: { shopId: S.shop2 } } })
    const podShips = await db.orderShipment.count({ where: { shopId: S.shop2, provider: 'FLASH', deliveredAt: { not: null } } })
    expect(podShips).toBeGreaterThan(5)
    // shop (a): ไม่มีใบที่ต้องถาม จึงไม่ล้ม · shop2: เรียก deliveredInfo ซ้ำได้สูงสุด 5
    fx.deliveredInfo.mockResolvedValue({ signer: 'z' })
    const r = await runFlashStatusSyncCron()
    spy.mockRestore()
    expect(r.shops).toBe(2)
    expect(r.failed).toBe(0)
    expect(fx.deliveredInfo.mock.calls.length).toBeLessThanOrEqual(5)
    // ร้านแรกล้ม (routes batch error ของ shop a ที่มีใบค้าง) → นับ failed แต่ร้านที่สองยังทำงาน
    await reset()
    await db.shopShippingAccount.update({ where: { shopId_provider: { shopId: S.shop, provider: 'FLASH' } }, data: { statusSyncedAt: null, status: 'ACTIVE' } })
    await mkShip({ carrierStatus: 'in_transit' }, S.shop)
    fx.routesBatch.mockRejectedValue(new FlashError('UPSTREAM_TIMEOUT'))
    fx.deliveredInfo.mockClear()
    const spy2 = vi.spyOn(prisma.shopShippingAccount, 'findMany').mockResolvedValue([{ shopId: S.shop }, { shopId: S.shop2 }] as never)
    const r2 = await runFlashStatusSyncCron()
    spy2.mockRestore()
    expect(r2.failed).toBe(1)
    expect(fx.deliveredInfo).toHaveBeenCalled() // ร้านที่สองยังได้ซ่อม POD
  })
})
})
