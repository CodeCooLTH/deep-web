/**
 * 00084 T6b — flash-ops.service (DB จริง localhost:5434 เท่านั้น · HR13: สร้าง/ลบเฉพาะ id ที่เทสสร้าง)
 * mutation ที่ต้องแดง: ถอด provider ออกจาก where (เทส ISHIP→404) · ถอดเช็ค 1015 · ถอด labelPrintCount increment
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))
const fx = vi.hoisted(() => ({ cancelOrder: vi.fn(), labelPdf: vi.fn(), routes: vi.fn() }))
vi.mock('@/lib/flash/client', () => fx)

import { cancelFlashShipment, getFlashLabelPdf, getFlashTraces, unlinkFlashShipment } from '@/services/flash-ops.service'
import { FlashError, FlashServiceError } from '@/lib/flash/errors'
import { encodeCredential } from '@/lib/flash/credential'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const S = { user: '', shop: '', shop2: '' }
const ids = { orders: [] as string[] }
let seq = 0
const T = (s: string) => Math.floor(new Date(s).getTime() / 1000)

async function mkShip(o: Record<string, unknown> = {}, shopId = S.shop) {
  const n = ++seq
  const ord = await db.order.create({
    data: { shopId, type: 'PHYSICAL', totalAmount: 100, status: 'PENDING', buyerContact: `08${run}`, buyerName: 'คุณสมชาย', items: { create: { name: 'เสื้อ', qty: 1, price: 100 } } },
    select: { id: true },
  })
  ids.orders.push(ord.id)
  return db.orderShipment.create({
    data: { orderId: ord.id, shopId, provider: 'FLASH', status: 'CREATED', source: 'CREATED', trackingNo: `TH${run}${n}`.toUpperCase(), idempotencyKey: `fo-${randomUUID()}`, weight: 1, ...o },
  })
}
const ship = (id: string) => db.orderShipment.findUniqueOrThrow({ where: { id } })
const code = async (p: Promise<unknown>) => { try { await p } catch (e) { return (e as { code?: string }).code } return 'OK' }
const setAcc = (data: Record<string, unknown>) => db.shopShippingAccount.updateMany({ where: { shopId: S.shop, provider: 'FLASH' }, data })

describe.skipIf(!isLocal)('flash-ops.service (DB จริง)', () => {
  beforeAll(async () => {
    process.env.CHANNEL_TOKEN_KEY ??= '0'.repeat(64)
    const u = await db.user.create({ data: { displayName: `fo-${run}`, username: `fo_${run}` }, select: { id: true } })
    const mk = (n: string) => db.shop.create({ data: { userId: u.id, shopName: `fo-${n}-${run}`, kind: 'BUSINESS', vertical: 'ONLINE_SALES' } as never, select: { id: true } })
    const [a, b] = await Promise.all([mk('a'), mk('b')])
    Object.assign(S, { user: u.id, shop: a.id, shop2: b.id })
    for (const shopId of [a.id, b.id]) {
      await db.shopShippingAccount.create({
        data: { shopId, provider: 'FLASH', accessTokenEnc: encodeCredential({ secretKey: 'K1', webhookSecret: 'W1' }), merchantId: `M${run}${shopId.slice(0, 4)}`, status: 'ACTIVE', connectedByUserId: u.id },
      })
    }
  })
  afterAll(async () => {
    await db.order.deleteMany({ where: { id: { in: ids.orders } } }) // shipment/event ตาม cascade
    await db.shopShippingAccount.deleteMany({ where: { shopId: { in: [S.shop, S.shop2] } } })
    await db.shop.deleteMany({ where: { id: { in: [S.shop, S.shop2] } } })
    await db.user.deleteMany({ where: { id: S.user } })
    await db.$disconnect()
  })
  beforeEach(async () => {
    Object.values(fx).forEach((f) => f.mockReset())
    await setAcc({ status: 'ACTIVE', labelSize: null })
  })

  describe('cancel', () => {
    it('สำเร็จ → CANCELLED + ผู้กด + OrderEvent · พิมพ์ไม่ได้ · ไม่แตะ pickup', async () => {
      const s = await mkShip()
      fx.cancelOrder.mockResolvedValue({})
      const v = await cancelFlashShipment(S.shop, S.user, s.id)
      expect(v.status).toBe('CANCELLED')
      const r = await ship(s.id)
      expect(r.cancelledByUserId).toBe(S.user)
      expect(r.cancelledAt).not.toBeNull()
      expect(fx.cancelOrder).toHaveBeenCalledWith(expect.objectContaining({ mchId: expect.any(String) }), s.trackingNo)
      expect(await db.orderEvent.count({ where: { orderId: s.orderId, type: 'SHIPMENT_CANCELLED' } })).toBe(1)
      expect(await code(getFlashLabelPdf(S.shop, s.id))).toBe('INVALID_STATE')
      expect(await code(cancelFlashShipment(S.shop, S.user, s.id))).toBe('INVALID_STATE')
    })
    it('1015 → NOT_CANCELLABLE สถานะคงเดิม ไม่มี event', async () => {
      const s = await mkShip()
      fx.cancelOrder.mockRejectedValue(new FlashError('NOT_CANCELLABLE', { flashCode: 1015 }))
      expect(await code(cancelFlashShipment(S.shop, S.user, s.id))).toBe('NOT_CANCELLABLE')
      expect((await ship(s.id)).status).toBe('CREATED')
      expect(await db.orderEvent.count({ where: { orderId: s.orderId, type: 'SHIPMENT_CANCELLED' } })).toBe(0)
    })
    it('FAILED ไม่มี pno → ปิดโดยไม่เรียก Flash', async () => {
      const s = await mkShip({ status: 'FAILED', trackingNo: null })
      expect((await cancelFlashShipment(S.shop, S.user, s.id)).status).toBe('CANCELLED')
      expect(fx.cancelOrder).not.toHaveBeenCalled()
    })
    it('LINKED / NEEDS_REVIEW / ใบ ISHIP / ข้ามร้าน → ปฏิเสธ', async () => {
      const l = await mkShip({ source: 'LINKED' })
      const n = await mkShip({ status: 'NEEDS_REVIEW', trackingNo: null })
      const i = await mkShip({ provider: 'ISHIP' })
      const o = await mkShip({}, S.shop2)
      expect(await code(cancelFlashShipment(S.shop, S.user, l.id))).toBe('INVALID_STATE')
      expect(await code(cancelFlashShipment(S.shop, S.user, n.id))).toBe('NEEDS_REVIEW')
      expect(await code(cancelFlashShipment(S.shop, S.user, i.id))).toBe('NOT_FOUND')
      expect(await code(cancelFlashShipment(S.shop, S.user, o.id))).toBe('NOT_FOUND')
      expect(fx.cancelOrder).not.toHaveBeenCalled()
    })
    it('1001 ระหว่างยกเลิก → mark TOKEN_INVALID แล้วโยนต่อ', async () => {
      const s = await mkShip()
      fx.cancelOrder.mockRejectedValue(new FlashError('SIGN_INVALID', { flashCode: 1002 }))
      expect(await code(cancelFlashShipment(S.shop, S.user, s.id))).toBe('SIGN_INVALID')
      expect((await db.shopShippingAccount.findFirstOrThrow({ where: { shopId: S.shop, provider: 'FLASH' } })).status).toBe('TOKEN_INVALID')
    })
    it('timeout ไม่ mark บัญชี', async () => {
      const s = await mkShip()
      fx.cancelOrder.mockRejectedValue(new FlashError('UPSTREAM_TIMEOUT'))
      await code(cancelFlashShipment(S.shop, S.user, s.id))
      expect((await db.shopShippingAccount.findFirstOrThrow({ where: { shopId: S.shop, provider: 'FLASH' } })).status).toBe('ACTIVE')
    })
  })

  describe('label', () => {
    it('ขนาดตาม labelSize (null=BIG, SMALL) + นับ +1 + labelPrintedAt', async () => {
      const s = await mkShip()
      fx.labelPdf.mockResolvedValue(Buffer.from('%PDF-1.4'))
      expect((await getFlashLabelPdf(S.shop, s.id)).toString()).toBe('%PDF-1.4')
      expect(fx.labelPdf).toHaveBeenLastCalledWith(expect.anything(), s.trackingNo, 'BIG')
      await setAcc({ labelSize: 'SMALL' })
      await getFlashLabelPdf(S.shop, s.id)
      expect(fx.labelPdf).toHaveBeenLastCalledWith(expect.anything(), s.trackingNo, 'SMALL')
      const r = await ship(s.id)
      expect(r.labelPrintCount).toBe(2)
      expect(r.labelPrintedAt).not.toBeNull()
    })
    it('ไม่ใช่ PDF (client โยน) → ไม่นับ ไม่ส่งไฟล์', async () => {
      const s = await mkShip()
      fx.labelPdf.mockRejectedValue(new FlashError('UPSTREAM_ERROR'))
      expect(await code(getFlashLabelPdf(S.shop, s.id))).toBe('UPSTREAM_ERROR')
      expect((await ship(s.id)).labelPrintCount).toBe(0)
    })
    it('LINKED พิมพ์ได้ · FAILED/NEEDS_REVIEW/dry-run/ไม่มี pno/ISHIP/ข้ามร้าน พิมพ์ไม่ได้', async () => {
      fx.labelPdf.mockResolvedValue(Buffer.from('%PDF'))
      const ok = await mkShip({ source: 'LINKED' })
      expect(await code(getFlashLabelPdf(S.shop, ok.id))).toBe('OK')
      for (const o of [{ status: 'FAILED' }, { status: 'NEEDS_REVIEW' }, { isDryRun: true }, { trackingNo: null }]) {
        const s = await mkShip(o)
        expect(await code(getFlashLabelPdf(S.shop, s.id))).toBe('INVALID_STATE')
      }
      expect(await code(getFlashLabelPdf(S.shop, (await mkShip({ provider: 'ISHIP' })).id))).toBe('NOT_FOUND')
      expect(await code(getFlashLabelPdf(S.shop, (await mkShip({}, S.shop2)).id))).toBe('NOT_FOUND')
      expect(fx.labelPdf).toHaveBeenCalledTimes(1)
    })
    it('1001 → mark แล้วโยนต่อ ไม่นับ', async () => {
      const s = await mkShip()
      fx.labelPdf.mockRejectedValue(new FlashError('MERCHANT_NOT_FOUND', { flashCode: 1001 }))
      expect(await code(getFlashLabelPdf(S.shop, s.id))).toBe('MERCHANT_NOT_FOUND')
      expect((await db.shopShippingAccount.findFirstOrThrow({ where: { shopId: S.shop, provider: 'FLASH' } })).status).toBe('TOKEN_INVALID')
      expect((await ship(s.id)).labelPrintCount).toBe(0)
    })
  })

  describe('traces', () => {
    const seed = (shipmentId: string, source: string, i = 1) =>
      db.shipmentEvent.create({ data: { shipmentId, status: 'progress', statusText: 't', occurredAt: new Date(`2026-10-0${i}T03:00:00Z`), source, dedupeKey: `${source}:${i}` } })

    it('ดึงสด → applyFlashRoutes บันทึกไทม์ไลน์ + สถานะ · ไม่รวม WEBHOOK_RAW', async () => {
      const s = await mkShip()
      await seed(s.id, 'WEBHOOK_RAW', 5)
      fx.routes.mockResolvedValue({ pno: s.trackingNo, state: 2, stateChangeAt: T('2026-10-02T03:00:00Z'), routes: [{ routedAt: T('2026-10-02T03:00:00Z'), routeAction: 'RECEIVED', message: 'รับพัสดุ', state: 2 }] })
      const r = await getFlashTraces(S.shop, s.id)
      expect(fx.routes).toHaveBeenCalledTimes(1)
      expect(r.events.length).toBeGreaterThan(0)
      expect(r.events.every((e) => e.source !== 'WEBHOOK_RAW')).toBe(true)
      expect(r.carrier.carrierStatus).not.toBeNull()
    })
    it('จบแล้ว + มีเหตุการณ์ → อ่าน DB อย่างเดียว · จบแต่ไม่มีเหตุการณ์ → ยิงครั้งแรก', async () => {
      const s = await mkShip({ carrierStatus: 'delivered', carrierStatusAt: new Date() })
      await seed(s.id, 'WEBHOOK')
      expect((await getFlashTraces(S.shop, s.id)).events).toHaveLength(1)
      expect(fx.routes).not.toHaveBeenCalled()
      const e = await mkShip({ carrierStatus: 'delivered', carrierStatusAt: new Date() })
      fx.routes.mockResolvedValue({ pno: e.trackingNo, state: 5, routes: [] })
      await getFlashTraces(S.shop, e.id)
      expect(fx.routes).toHaveBeenCalledTimes(1)
    })
    it('ดึงล้ม (ไม่ใช่ key) + มีของเก็บ → คืนของเก็บ · ไม่มีของเก็บ → โยน · key ผิด → mark+โยน', async () => {
      const s = await mkShip()
      await seed(s.id, 'POLL')
      fx.routes.mockRejectedValue(new FlashError('UPSTREAM_TIMEOUT'))
      expect((await getFlashTraces(S.shop, s.id)).events).toHaveLength(1)
      const e = await mkShip()
      expect(await code(getFlashTraces(S.shop, e.id))).toBe('UPSTREAM_TIMEOUT')
      fx.routes.mockRejectedValue(new FlashError('SIGN_INVALID', { flashCode: 1002 }))
      expect(await code(getFlashTraces(S.shop, s.id))).toBe('SIGN_INVALID')
      expect((await db.shopShippingAccount.findFirstOrThrow({ where: { shopId: S.shop, provider: 'FLASH' } })).status).toBe('TOKEN_INVALID')
    })
    it('ไม่มี pno → ว่างไม่ยิง · ISHIP/ข้ามร้าน → NOT_FOUND', async () => {
      const s = await mkShip({ trackingNo: null, status: 'FAILED' })
      expect((await getFlashTraces(S.shop, s.id)).events).toEqual([])
      expect(await code(getFlashTraces(S.shop, (await mkShip({ provider: 'ISHIP' })).id))).toBe('NOT_FOUND')
      expect(await code(getFlashTraces(S.shop, (await mkShip({}, S.shop2)).id))).toBe('NOT_FOUND')
      expect(fx.routes).not.toHaveBeenCalled()
    })
  })

  describe('unlink', () => {
    it('LINKED → ลบแถว ไม่เรียก Flash · CREATED → INVALID_STATE · ISHIP/ข้ามร้าน → NOT_FOUND', async () => {
      const l = await mkShip({ source: 'LINKED' })
      await unlinkFlashShipment(S.shop, l.id)
      expect(await db.orderShipment.findUnique({ where: { id: l.id } })).toBeNull()
      expect(fx.cancelOrder).not.toHaveBeenCalled()
      const c = await mkShip()
      expect(await code(unlinkFlashShipment(S.shop, c.id))).toBe('INVALID_STATE')
      expect(await code(unlinkFlashShipment(S.shop, (await mkShip({ provider: 'ISHIP', source: 'LINKED' })).id))).toBe('NOT_FOUND')
      expect(await code(unlinkFlashShipment(S.shop, (await mkShip({ source: 'LINKED' }, S.shop2)).id))).toBe('NOT_FOUND')
      expect(FlashServiceError).toBeDefined()
    })
  })
})
