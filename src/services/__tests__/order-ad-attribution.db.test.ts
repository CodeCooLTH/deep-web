/**
 * order-ad-attribution.db.test.ts — 00091 FR-001/002: บันทึกแอดที่มาลงคำสั่งซื้อตอนสร้าง
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้างเท่านั้น
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'

vi.mock('server-only', () => ({}))

import { createOrder, promoteDraftToOrder } from '@/services/order.service'
import { backfillOrderAdAttribution } from '@/services/order-ad-attribution.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const run = randomUUID().slice(0, 8)
const x = {} as Record<'user' | 'shop' | 'prod' | 'channel' | 'contact' | 'conv' | 'conv2', string>
const orderIds: string[] = []

const body = (extra: Record<string, unknown> = {}) =>
  ({ type: 'PHYSICAL', fulfillmentMode: 'PICKUP', items: [{ productId: x.prod, name: 'สินค้า', qty: 1, price: 100 }], ...extra }) as never
const ref = (conversationId: string, o: { source?: string; adId: string; adTitle?: string; photoFileId?: string; at: string }) =>
  prisma.conversationAdReferral.create({
    data: { conversationId, source: o.source ?? 'ADS', adId: o.adId, adTitle: o.adTitle ?? null, photoFileId: o.photoFileId ?? null, receivedAt: new Date(o.at) },
  })
const ad = (id: string) =>
  prisma.order.findUniqueOrThrow({ where: { id }, select: { adId: true, adTitle: true, adClickedAt: true, adPhotoFileId: true } })

describe.skipIf(!isLocal)('00091 บันทึกแอดที่มาของคำสั่งซื้อ (DB จริง)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `ad-${run}`, username: `ad_${run}` }, select: { id: true } })
    x.user = u.id
    x.shop = (await prisma.shop.create({ data: { userId: u.id, shopName: `ad-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })).id
    x.prod = (await prisma.product.create({ data: { shopId: x.shop, name: `p-${run}`, price: 100, fulfillmentMode: 'NO_SHIPPING' } as never, select: { id: true } })).id
    x.channel = (await prisma.shopChannel.create({
      data: { shopId: x.shop, provider: 'MESSENGER', externalId: `pg-${run}`, name: 'p', accessTokenEnc: 'x', connectedByUserId: u.id },
      select: { id: true },
    })).id
    const mk = async (suffix: string) => {
      const c = await prisma.externalContact.create({ data: { shopChannelId: x.channel, externalUserId: `psid-${suffix}-${run}` }, select: { id: true } })
      return (await prisma.conversation.create({
        data: { shopId: x.shop, channel: 'MESSENGER', shopChannelId: x.channel, externalContactId: c.id }, select: { id: true },
      })).id
    }
    x.conv = await mk('a')
    x.conv2 = await mk('b')
    x.contact = ''
  })

  afterAll(async () => {
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    await prisma.conversation.deleteMany({ where: { id: { in: [x.conv, x.conv2] } } })
    await prisma.shopChannel.deleteMany({ where: { id: x.channel } })
    await prisma.product.deleteMany({ where: { id: x.prod } })
    await prisma.shop.deleteMany({ where: { id: x.shop } })
    await prisma.user.deleteMany({ where: { id: x.user } })
    await prisma.$disconnect()
  })

  it('เลือกตัวล่าสุดก่อนเวลาสร้าง · ไม่เลือกหลัง · ไม่เลือก SHORTLINK · เก็บรูป', async () => {
    await ref(x.conv, { adId: 'AD1', adTitle: 'โปรล้อแม็ก', at: '2026-11-01T03:00:00Z' })
    await ref(x.conv, { adId: 'AD2', adTitle: 'ไฟหน้า LED', photoFileId: 'photo-2', at: '2026-11-05T03:00:00Z' })
    await ref(x.conv, { source: 'SHORTLINK', adId: 'SL', at: '2026-11-05T10:00:00Z' })
    await ref(x.conv, { adId: 'AD3', adTitle: 'หลังสร้าง', at: '2026-11-08T03:00:00Z' })
    // ลงย้อนหลัง (00033): เวลาอ้างอิง = createdAt ที่ลง
    const o = await createOrder(x.shop, body({ conversationId: x.conv, createdAt: new Date('2026-11-06T03:00:00Z') }))
    orderIds.push(o.id)
    expect(await ad(o.id)).toEqual({ adId: 'AD2', adTitle: 'ไฟหน้า LED', adClickedAt: new Date('2026-11-05T03:00:00Z'), adPhotoFileId: 'photo-2' })
  })

  it('ไม่ผูกห้อง / ห้องไม่เคยคลิกแอด = ว่าง', async () => {
    const a = await createOrder(x.shop, body())
    const b = await createOrder(x.shop, body({ conversationId: x.conv2 }))
    orderIds.push(a.id, b.id)
    expect((await ad(a.id)).adId).toBeNull()
    expect((await ad(b.id)).adId).toBeNull()
  })

  it('ยืนยันออเดอร์ร่าง: ใช้เวลายืนยัน (คลิกหลังสร้างร่างแต่ก่อนยืนยันนับ)', async () => {
    const d = await prisma.order.create({
      data: {
        shopId: x.shop, conversationId: x.conv2, status: 'DRAFTED', type: 'PHYSICAL', totalAmount: 0, orderNo: null,
        draftReasons: ['PROCESSING_FAILED'], expiresAt: new Date(Date.now() + 3600_000), createdVia: 'CHAT_AUTO_ORDER', createdByUserId: null,
      } as never,
      select: { id: true, publicToken: true },
    })
    orderIds.push(d.id)
    await ref(x.conv2, { adId: 'AD9', adTitle: 'หลังร่าง', at: new Date().toISOString() })
    await promoteDraftToOrder(x.shop, d.publicToken, { items: [{ productId: x.prod, name: 'สินค้า', qty: 1, price: 100 }] } as never, x.user)
    expect((await ad(d.id)).adId).toBe('AD9')
  })

  it('ลบห้องแชทแล้วคำสั่งซื้อยังจำแอดเดิม (FR-002)', async () => {
    const o = await prisma.order.findFirstOrThrow({ where: { id: { in: orderIds }, adId: 'AD2' }, select: { id: true } })
    await prisma.conversation.delete({ where: { id: x.conv } })
    expect((await ad(o.id)).adId).toBe('AD2')
  })

  it('เติมย้อนหลัง: dry-run ไม่เขียน · apply เติมเฉพาะว่าง · ไม่ทับใบที่มีค่า · ข้ามร่าง/ทดสอบ · รันซ้ำเท่าเดิม', async () => {
    const mkO = async (extra: Record<string, unknown>) => {
      const o = await prisma.order.create({
        data: { shopId: x.shop, conversationId: x.conv2, type: 'PHYSICAL', totalAmount: 100, status: 'PENDING', createdAt: new Date('2026-11-10T00:00:00Z'), ...extra } as never,
        select: { id: true },
      })
      orderIds.push(o.id)
      return o.id
    }
    await ref(x.conv2, { adId: 'BF1', adTitle: 'แอดเติมย้อนหลัง', at: '2026-11-09T00:00:00Z' })
    const empty = await mkO({})
    const had = await mkO({ adId: 'KEEP', adTitle: 'เดิม' })
    const draft = await mkO({ status: 'DRAFTED' })
    const dry = await mkO({ isDryRun: true })
    const before = await backfillOrderAdAttribution({ apply: false, shopId: x.shop })
    expect((await ad(empty)).adId).toBeNull()
    expect(before.matched).toBeGreaterThanOrEqual(1)
    const r1 = await backfillOrderAdAttribution({ apply: true, shopId: x.shop })
    expect(r1.written).toBeGreaterThanOrEqual(1)
    expect((await ad(empty)).adId).toBe('BF1')
    expect((await ad(had)).adId).toBe('KEEP')
    expect((await ad(draft)).adId).toBeNull()
    expect((await ad(dry)).adId).toBeNull()
    const r2 = await backfillOrderAdAttribution({ apply: true, shopId: x.shop })
    expect(r2.written).toBe(0)
    expect((await ad(empty)).adId).toBe('BF1')
  })
})
