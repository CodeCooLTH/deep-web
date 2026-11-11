/**
 * meta-capi-enqueue.db.test.ts — 00089 FR-008/BR-CAPI-01: การกระทำกับออเดอร์ → แถวในคิวส่ง Meta บน Postgres จริง
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { enqueueOrderCapi } from '@/services/meta-capi.service'

const url = process.env.DATABASE_URL ?? ''
const d = /@(localhost|127\.0\.0\.1):5434\//.test(url) ? describe : describe.skip
const run = randomUUID().slice(0, 8)
const ids = { users: [] as string[], shops: [] as string[] }
const f: Record<string, string> = {}

d('00089 enqueueOrderCapi (DB local)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `capi-${run}`, username: `capi_${run}` }, select: { id: true } })
    ids.users.push(u.id)
    const shop = await prisma.shop.create({ data: { userId: u.id, shopName: `capi-${run}` } as never, select: { id: true } })
    ids.shops.push(shop.id)
    f.shop = shop.id
    const ch = await prisma.shopChannel.create({
      data: { shopId: shop.id, provider: 'MESSENGER', externalId: `page-${run}`, name: 'p', accessTokenEnc: 'x', connectedByUserId: u.id },
      select: { id: true },
    })
    f.channel = ch.id
    const ec = await prisma.externalContact.create({ data: { shopChannelId: ch.id, externalUserId: `psid-${run}` } as never, select: { id: true } })
    const conv = await prisma.conversation.create({
      data: { shopId: shop.id, channel: 'MESSENGER', shopChannelId: ch.id, externalContactId: ec.id } as never,
      select: { id: true },
    })
    f.conv = conv.id
    await prisma.metaCapiPageSetting.create({
      data: {
        shopId: shop.id, shopChannelId: ch.id, enabled: true, enabledAt: new Date(Date.now() - 60_000), purchaseAt: 'CREATE',
        eventOptions: { PURCHASE: { valueMode: 'NO_VAT', sendContents: true } },
      },
    })
    const ds = await prisma.metaCapiDataset.create({
      data: { shopId: shop.id, shopChannelId: ch.id, datasetId: `ds-${run}`, source: 'PAGE', events: ['PURCHASE', 'ORDER_CREATED'] },
      select: { id: true },
    })
    f.ds = ds.id
  })

  afterAll(async () => {
    if (ids.shops.length) {
      await prisma.order.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.conversation.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.shopChannel.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    }
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  beforeEach(() => {
    vi.stubEnv('OPEN_META_CAPI', '1')
    vi.stubEnv('META_CAPI_PILOT_SHOP_IDS', '')
  })

  const mkOrder = async (conversationId: string | null) => {
    const o = await prisma.order.create({
      data: {
        shopId: f.shop, totalAmount: '1070.00', vatAmount: '70.00', status: 'PENDING', type: 'PHYSICAL', conversationId,
        items: { create: [{ productId: null, name: 'A', qty: 2, price: '500.00' }] },
      } as never,
      select: { id: true },
    })
    return o.id
  }
  const rows = (orderId: string) =>
    prisma.metaCapiEvent.findMany({ where: { datasetRowId: f.ds, dedupeKey: { endsWith: orderId } }, orderBy: { eventKey: 'asc' } })

  it('สร้างคำสั่งซื้อในห้อง Messenger → OrderCreated + Purchase · ยอดไม่รวม VAT + สินค้า · PSID/page จากห้อง', async () => {
    const id = await mkOrder(f.conv)
    await enqueueOrderCapi(prisma, id, 'CREATED')
    const r = await rows(id)
    expect(r.map((x) => [x.eventKey, x.dedupeKey])).toEqual([
      ['ORDER_CREATED', `order_created:${id}`],
      ['PURCHASE', `purchase:${id}`],
    ])
    const p = r.find((x) => x.eventKey === 'PURCHASE')!
    expect(p.psid).toBe(`psid-${run}`)
    expect(p.pageId).toBe(`page-${run}`)
    expect(p.payload).toMatchObject({ value: 1000, orderId: id, items: [{ quantity: 2, price: 500 }] })
    expect(r.find((x) => x.eventKey === 'ORDER_CREATED')!.payload).toMatchObject({ value: 1070 })
  })

  it('เรียกซ้ำ = ไม่มีแถวเพิ่ม (คีย์กันซ้ำต่อ dataset)', async () => {
    const id = await mkOrder(f.conv)
    await enqueueOrderCapi(prisma, id, 'CREATED')
    await enqueueOrderCapi(prisma, id, 'CREATED')
    expect(await rows(id)).toHaveLength(2)
  })

  it('ไม่ผูกห้องแชท = ไม่เข้าคิว', async () => {
    const id = await mkOrder(null)
    await enqueueOrderCapi(prisma, id, 'CREATED')
    expect(await rows(id)).toHaveLength(0)
  })

  it('ปิดสวิตช์ระบบ / ร้านไม่อยู่ในรายชื่อทดลอง = ไม่เข้าคิว', async () => {
    const id = await mkOrder(f.conv)
    vi.stubEnv('OPEN_META_CAPI', '')
    await enqueueOrderCapi(prisma, id, 'CREATED')
    vi.stubEnv('OPEN_META_CAPI', '1')
    vi.stubEnv('META_CAPI_PILOT_SHOP_IDS', 'other-shop')
    await enqueueOrderCapi(prisma, id, 'CREATED')
    expect(await rows(id)).toHaveLength(0)
  })

  it('เหตุการณ์ที่ dataset ไม่ได้เปิด = ไม่เข้าคิว', async () => {
    const id = await mkOrder(f.conv)
    await enqueueOrderCapi(prisma, id, 'SHIPPED')
    expect(await rows(id)).toHaveLength(0)
  })

  it('ออเดอร์ที่ยกเลิกแล้ว: ส่งได้แค่ OrderCanceled · เงินเข้าทีหลังไม่กลายเป็น Purchase', async () => {
    await prisma.metaCapiDataset.update({ where: { id: f.ds }, data: { events: ['PURCHASE', 'ORDER_CREATED', 'ORDER_CANCELED'] } })
    await prisma.metaCapiPageSetting.update({ where: { shopChannelId: f.channel }, data: { purchaseAt: 'PAYMENT' } })
    const id = await mkOrder(f.conv)
    await prisma.order.update({ where: { id }, data: { status: 'CANCELLED' } })
    await enqueueOrderCapi(prisma, id, 'FULLY_PAID')
    await enqueueOrderCapi(prisma, id, 'CANCELED')
    expect((await rows(id)).map((r) => r.eventKey)).toEqual(['ORDER_CANCELED'])
  })
})
