/**
 * meta-capi-order-hooks.db.test.ts — 00089 FR-006/008: จุดเกิดจริงในระบบคำสั่งซื้อ → คิวส่ง Meta
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้างเท่านั้น
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'

vi.mock('server-only', () => ({}))

import { createOrder, promoteDraftToOrder, confirmOrder, cancelOrder, markManualDispatched, attachSlip, setPaymentConfirmed, setCodReceived } from '@/services/order.service'
import { recordPayment } from '@/services/order-payment.service'
import { receiveOrderReturn } from '@/services/order-return.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const run = randomUUID().slice(0, 8)
const x = {} as Record<'user' | 'shop' | 'prod' | 'channel' | 'contact' | 'conv' | 'ds', string>
const orderIds: string[] = []

const body = (extra: Record<string, unknown> = {}) =>
  ({ type: 'PHYSICAL', fulfillmentMode: 'PICKUP', items: [{ productId: x.prod, name: 'สินค้า', qty: 1, price: 100 }], ...extra }) as never
const queued = (orderId: string) =>
  prisma.metaCapiEvent.findMany({ where: { datasetRowId: x.ds, dedupeKey: { endsWith: `:${orderId}` } }, orderBy: { eventKey: 'asc' } }).then((r) => r.map((e) => e.eventKey))
const mkDraft = async () => {
  const d = await prisma.order.create({
    data: {
      shopId: x.shop, conversationId: x.conv, status: 'DRAFTED', type: 'PHYSICAL', totalAmount: 0, orderNo: null,
      draftReasons: ['PROCESSING_FAILED'], expiresAt: new Date(Date.now() + 3600_000), createdVia: 'CHAT_AUTO_ORDER', createdByUserId: null,
    } as never,
    select: { id: true, publicToken: true },
  })
  orderIds.push(d.id)
  return d
}

describe.skipIf(!isLocal)('00089 จุดเกิดในระบบคำสั่งซื้อ (DB จริง)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `capih-${run}`, username: `capih_${run}` }, select: { id: true } })
    x.user = u.id
    x.shop = (await prisma.shop.create({ data: { userId: u.id, shopName: `capih-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })).id
    x.prod = (await prisma.product.create({ data: { shopId: x.shop, name: `p-${run}`, price: 100, fulfillmentMode: 'NO_SHIPPING' } as never, select: { id: true } })).id
    x.channel = (await prisma.shopChannel.create({
      data: { shopId: x.shop, provider: 'MESSENGER', externalId: `pg-${run}`, name: 'p', accessTokenEnc: 'x', connectedByUserId: u.id },
      select: { id: true },
    })).id
    x.contact = (await prisma.externalContact.create({ data: { shopChannelId: x.channel, externalUserId: `psid-${run}` }, select: { id: true } })).id
    x.conv = (await prisma.conversation.create({
      data: { shopId: x.shop, channel: 'MESSENGER', shopChannelId: x.channel, externalContactId: x.contact }, select: { id: true },
    })).id
    await prisma.metaCapiPageSetting.create({
      data: { shopId: x.shop, shopChannelId: x.channel, enabled: true, enabledAt: new Date(Date.now() - 60_000), purchaseAt: 'CREATE' },
    })
    x.ds = (await prisma.metaCapiDataset.create({
      data: { shopId: x.shop, shopChannelId: x.channel, datasetId: `ds-${run}`, source: 'PAGE', events: ['PURCHASE', 'ORDER_CREATED', 'ADD_PAYMENT_INFO', 'ORDER_SHIPPED', 'ORDER_DELIVERED', 'ORDER_CANCELED', 'ORDER_RETURNED'] },
      select: { id: true },
    })).id
  })

  afterAll(async () => {
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    await prisma.conversation.deleteMany({ where: { id: x.conv } })
    await prisma.shopChannel.deleteMany({ where: { id: x.channel } }) // cascade setting/dataset/queue
    await prisma.product.deleteMany({ where: { id: x.prod } })
    await prisma.shop.deleteMany({ where: { id: x.shop } })
    await prisma.user.deleteMany({ where: { id: x.user } })
    await prisma.$disconnect()
  })

  beforeEach(() => {
    vi.stubEnv('OPEN_META_CAPI', '1')
    vi.stubEnv('META_CAPI_PILOT_SHOP_IDS', '')
  })

  it('createOrder ในห้อง Messenger → OrderCreated + Purchase เข้าคิว', async () => {
    const o = await createOrder(x.shop, body({ conversationId: x.conv }))
    orderIds.push(o.id)
    expect(await queued(o.id)).toEqual(['ORDER_CREATED', 'PURCHASE'])
  })

  it('createOrder ไม่ผูกห้อง → ไม่มีอะไรเข้าคิว', async () => {
    const o = await createOrder(x.shop, body())
    orderIds.push(o.id)
    expect(await queued(o.id)).toEqual([])
  })

  it('ยืนยันออเดอร์ร่าง: ร้านนับ = เข้าคิว · ร้านไม่นับ = ไม่เข้า', async () => {
    const d1 = await mkDraft()
    expect(await queued(d1.id)).toEqual([]) // ร่างยังไม่ส่งอะไร
    await promoteDraftToOrder(x.shop, d1.publicToken, body(), null)
    expect(await queued(d1.id)).toEqual(['ORDER_CREATED', 'PURCHASE'])

    await prisma.metaCapiPageSetting.update({ where: { shopChannelId: x.channel }, data: { countPromotedDraft: false } })
    const d2 = await mkDraft()
    await promoteDraftToOrder(x.shop, d2.publicToken, body(), null)
    expect(await queued(d2.id)).toEqual([])
    await prisma.metaCapiPageSetting.update({ where: { shopChannelId: x.channel }, data: { countPromotedDraft: true } })
  })

  // ─── จุดเกิดหลังสร้าง: ตั้ง purchaseAt แล้วสร้างออเดอร์ใหม่ต่อเคส (ORDER_CREATED เข้าคิวเสมอ — เทสดูเฉพาะคีย์ที่สนใจ) ───
  const setPurchaseAt = (purchaseAt: 'CREATE' | 'CONFIRM' | 'PAYMENT') =>
    prisma.metaCapiPageSetting.update({ where: { shopChannelId: x.channel }, data: { purchaseAt } })
  const fresh = async (extra: Record<string, unknown> = {}) => {
    const o = await createOrder(x.shop, body({ conversationId: x.conv, ...extra }))
    orderIds.push(o.id)
    return o
  }

  it('confirmOrder: purchaseAt=CONFIRM → Purchase เข้าคิวตอนยืนยัน · ก่อนยืนยันยังไม่มี', async () => {
    await setPurchaseAt('CONFIRM')
    const o = await fresh()
    expect(await queued(o.id)).toEqual(['ORDER_CREATED'])
    await prisma.order.update({ where: { id: o.id }, data: { buyerUserId: x.user } })
    await confirmOrder(o.publicToken, x.user)
    expect(await queued(o.id)).toEqual(['ORDER_CREATED', 'PURCHASE'])
  })

  it('recordPayment: มัดจำอย่างเดียว = ไม่มี Purchase · ชำระครบ = Purchase (purchaseAt=PAYMENT)', async () => {
    await setPurchaseAt('PAYMENT')
    const o = await fresh()
    const pay = (kind: 'DEPOSIT' | 'BALANCE', amount: number) =>
      recordPayment({ shopId: x.shop, orderToken: o.publicToken, receivedByUserId: x.user, kind, amount, method: 'CASH' })
    await pay('DEPOSIT', 30)
    expect(await queued(o.id)).toEqual(['ORDER_CREATED'])
    await pay('BALANCE', 70)
    expect(await queued(o.id)).toEqual(['ORDER_CREATED', 'PURCHASE'])
  })

  it('ร้านกดยืนยันรับเงิน / ได้รับเงินปลายทาง = ชำระครบ → Purchase (purchaseAt=PAYMENT)', async () => {
    await setPurchaseAt('PAYMENT')
    const a = await fresh({ paymentMethod: 'โอนเงิน' })
    await setPaymentConfirmed(a.id, x.user)
    expect(await queued(a.id)).toEqual(['ORDER_CREATED', 'PURCHASE'])
    const b = await fresh({ paymentMethod: 'COD' })
    await setCodReceived(b.id, x.user, { clear: true }) // ล้างค่า = ไม่ใช่ชำระ
    expect(await queued(b.id)).toEqual(['ORDER_CREATED'])
    await setCodReceived(b.id, x.user)
    expect(await queued(b.id)).toEqual(['ORDER_CREATED', 'PURCHASE'])
  })

  it('attachSlip → AddPaymentInfo', async () => {
    const o = await fresh()
    await attachSlip(o.publicToken, randomUUID())
    expect(await queued(o.id)).toContain('ADD_PAYMENT_INFO')
  })

  it('cancelOrder → OrderCanceled', async () => {
    const o = await fresh()
    await cancelOrder(o.publicToken, 'buyer')
    expect(await queued(o.id)).toContain('ORDER_CANCELED')
  })

  it('markManualDispatched → OrderShipped (กดซ้ำ = ไม่เพิ่มแถว)', async () => {
    const o = await fresh()
    await prisma.order.update({ where: { id: o.id }, data: { fulfillmentMode: 'SHIPPED' } })
    await prisma.shipmentTracking.create({ data: { orderId: o.id, provider: 'x', trackingNo: `T${run}` } })
    await markManualDispatched(o.publicToken, x.shop, null)
    expect(await queued(o.id)).toContain('ORDER_SHIPPED')
    await markManualDispatched(o.publicToken, x.shop, null)
    expect((await queued(o.id)).filter((k) => k === 'ORDER_SHIPPED')).toHaveLength(1)
  })

  it('receiveOrderReturn คืนครบ → OrderReturned', async () => {
    const o = await fresh()
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: o.id } })
    const ret = await prisma.orderReturn.create({
      data: { orderId: o.id, shopId: x.shop, status: 'REQUESTED', items: { create: [{ orderItemId: item.id, qty: item.qty, unitPrice: 100 }] } },
      select: { id: true },
    })
    await receiveOrderReturn(x.shop, null, ret.id)
    expect(await queued(o.id)).toContain('ORDER_RETURNED')
  })
})
