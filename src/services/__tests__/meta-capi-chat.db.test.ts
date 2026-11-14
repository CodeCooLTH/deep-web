/**
 * meta-capi-chat.db.test.ts — 00089 FR-009/010: เหตุการณ์ฝั่งห้องแชท → คิวส่ง Meta
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้างเท่านั้น
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { enqueueSentMessageCapi, enqueueTagLeadCapi, sweepCartAbandoned } from '@/services/meta-capi.service'
import { updateConversationCrm } from '@/services/chat-crm.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const run = randomUUID().slice(0, 8)
const x = {} as Record<'tag' | 'user' | 'shop' | 'prod' | 'channel' | 'contact' | 'conv' | 'ds' | 'order' | 'orderToken', string>

const keysOf = () =>
  prisma.metaCapiEvent.findMany({ where: { datasetRowId: x.ds }, orderBy: { createdAt: 'asc' } })
const msg = (data: Record<string, unknown>) =>
  prisma.chatMessage.create({ data: { conversationId: x.conv, senderRole: 'SHOP', deliveryStatus: 'SENT', ...data } as never, select: { id: true } })

describe.skipIf(!isLocal)('00089 เหตุการณ์ฝั่งห้องแชท (DB จริง)', () => {
  beforeAll(async () => {
    x.user = (await prisma.user.create({ data: { displayName: `capic-${run}`, username: `capic_${run}` }, select: { id: true } })).id
    x.shop = (await prisma.shop.create({ data: { userId: x.user, shopName: `capic-${run}` } as never, select: { id: true } })).id
    x.prod = (await prisma.product.create({ data: { shopId: x.shop, name: `p-${run}`, price: 250, fulfillmentMode: 'NO_SHIPPING' } as never, select: { id: true } })).id
    x.channel = (await prisma.shopChannel.create({
      data: { shopId: x.shop, provider: 'MESSENGER', externalId: `pg-${run}`, name: 'p', accessTokenEnc: 'x', connectedByUserId: x.user },
      select: { id: true },
    })).id
    x.contact = (await prisma.externalContact.create({ data: { shopChannelId: x.channel, externalUserId: `psid-${run}` }, select: { id: true } })).id
    x.conv = (await prisma.conversation.create({
      data: { shopId: x.shop, channel: 'MESSENGER', shopChannelId: x.channel, externalContactId: x.contact }, select: { id: true },
    })).id
    const o = await prisma.order.create({
      data: { shopId: x.shop, conversationId: x.conv, totalAmount: '500', status: 'PENDING', type: 'PHYSICAL' } as never,
      select: { id: true, publicToken: true },
    })
    x.order = o.id
    x.orderToken = o.publicToken
    await prisma.metaCapiPageSetting.create({
      data: { shopId: x.shop, shopChannelId: x.channel, enabled: true, enabledAt: new Date(Date.now() - 10 * 864e5) }, // เปิดก่อนการ์ดในเทส CartAbandoned
    })
    x.tag = (await prisma.shopTag.create({ data: { shopId: x.shop, name: 'สนใจจริง', nameKey: 'สนใจจริง' }, select: { id: true } })).id
    await prisma.metaCapiPageSetting.update({
      where: { shopChannelId: x.channel },
      data: { eventOptions: { QUALIFIED_LEAD: { rules: [{ tagId: x.tag, valueBaht: 200 }] } } },
    })
    x.ds = (await prisma.metaCapiDataset.create({
      data: { shopId: x.shop, shopChannelId: x.channel, datasetId: `ds-${run}`, source: 'PAGE', events: ['INITIATE_CHECKOUT', 'VIEW_CONTENT', 'QUALIFIED_LEAD', 'CART_ABANDONED'] },
      select: { id: true },
    })).id
  })

  afterAll(async () => {
    await prisma.chatMessage.deleteMany({ where: { conversationId: x.conv } })
    await prisma.order.deleteMany({ where: { id: x.order } })
    await prisma.conversation.deleteMany({ where: { id: x.conv } })
    await prisma.shopChannel.deleteMany({ where: { id: x.channel } })
    await prisma.shopTag.deleteMany({ where: { shopId: x.shop } })
    await prisma.product.deleteMany({ where: { id: x.prod } })
    await prisma.shop.deleteMany({ where: { id: x.shop } })
    await prisma.user.deleteMany({ where: { id: x.user } })
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.chatMessage.deleteMany({ where: { conversationId: x.conv } })
    vi.stubEnv('OPEN_META_CAPI', '1')
    vi.stubEnv('META_CAPI_PILOT_SHOP_IDS', '')
    await prisma.metaCapiEvent.deleteMany({ where: { datasetRowId: x.ds } })
  })

  it('การ์ดคำสั่งซื้อส่งสำเร็จ → InitiateCheckout ครั้งเดียวต่อออเดอร์', async () => {
    const m1 = await msg({ type: 'ORDER', orderRefToken: x.orderToken })
    const m2 = await msg({ type: 'ORDER', orderRefToken: x.orderToken })
    await enqueueSentMessageCapi(m1.id)
    await enqueueSentMessageCapi(m2.id)
    const r = await keysOf()
    expect(r.map((e) => [e.eventKey, e.dedupeKey])).toEqual([['INITIATE_CHECKOUT', `initiate_checkout:${x.order}`]])
    expect(r[0].payload).toEqual({ orderId: x.order })
  })

  it('การ์ดสินค้าส่งสำเร็จ → ViewContent ราคาสินค้า · วันละครั้งต่อห้องต่อสินค้า (เวลาไทย)', async () => {
    const at = new Date('2026-11-11T17:30:00Z') // = 00:30 วันที่ 12 เวลาไทย
    const m1 = await msg({ type: 'PRODUCT', productRefIds: [x.prod] })
    const m2 = await msg({ type: 'PRODUCT', productRefId: x.prod })
    await enqueueSentMessageCapi(m1.id, at)
    await enqueueSentMessageCapi(m2.id, at)
    const r = await keysOf()
    expect(r.map((e) => e.dedupeKey)).toEqual([`view_content:${x.conv}:${x.prod}:2026-11-12`])
    expect(r[0].payload).toMatchObject({ value: 250, items: [{ id: x.prod, quantity: 1, price: 250 }] })
  })

  it('ข้อความที่ยังไม่ SENT / ไม่ใช่การ์ด = ไม่เข้าคิว', async () => {
    const q = await msg({ type: 'ORDER', orderRefToken: x.orderToken, deliveryStatus: 'QUEUED' })
    const t = await msg({ type: 'TEXT', body: 'hi' })
    await enqueueSentMessageCapi(q.id)
    await enqueueSentMessageCapi(t.id)
    expect(await keysOf()).toHaveLength(0)
  })

  it('ติดแท็กที่ผูกกฎ → QualifiedLead มูลค่าตามกฎ · ห้องเดียวกันไม่เกิน 1 ครั้ง/30 วัน', async () => {
    const t0 = new Date()
    await enqueueTagLeadCapi(x.conv, ['สนใจจริง'], t0)
    await enqueueTagLeadCapi(x.conv, ['สนใจจริง'], new Date(t0.getTime() + 29 * 864e5))
    let r = await keysOf()
    expect(r.map((e) => e.eventKey)).toEqual(['QUALIFIED_LEAD'])
    expect(r[0].payload).toEqual({ value: 200 })
    expect(r[0].dedupeKey.startsWith(`qualified_lead:${x.conv}:${x.tag}:`)).toBe(true)
    await enqueueTagLeadCapi(x.conv, ['สนใจจริง'], new Date(t0.getTime() + 31 * 864e5))
    r = await keysOf()
    expect(r).toHaveLength(2)
  })

  it('แท็กที่ไม่มีกฎ = ไม่เข้าคิว · ชื่อแท็กไม่สนตัวพิมพ์', async () => {
    await enqueueTagLeadCapi(x.conv, ['vip'])
    expect(await keysOf()).toHaveLength(0)
  })

  it('ทางติดแท็กเอง (เขียนทับทั้งชุด) นับเฉพาะแท็กที่เพิ่งติด', async () => {
    await prisma.externalContact.update({ where: { id: x.contact }, data: { tags: ['vip'] } })
    await updateConversationCrm(x.conv, x.shop, { tags: ['vip', 'สนใจจริง'] })
    expect((await keysOf()).map((e) => e.eventKey)).toEqual(['QUALIFIED_LEAD'])
    await prisma.metaCapiEvent.deleteMany({ where: { datasetRowId: x.ds } })
    await updateConversationCrm(x.conv, x.shop, { tags: ['สนใจจริง', 'vip'] }) // มีอยู่แล้ว = ไม่นับ
    expect(await keysOf()).toHaveLength(0)
  })

  it('CartAbandoned: การ์ดส่งแล้ว 24–72 ชม. ออเดอร์ยังรอ ไม่ชำระ ไม่มีสลิป → ครั้งเดียวต่อการ์ด', async () => {
    const now = new Date()
    const ago = (h: number) => new Date(now.getTime() - h * 3600_000)
    const inWindow = await msg({ type: 'ORDER', orderRefToken: x.orderToken, createdAt: ago(30) })
    await msg({ type: 'ORDER', orderRefToken: x.orderToken, createdAt: ago(10) }) // ยังไม่ครบ 24 ชม.
    await msg({ type: 'ORDER', orderRefToken: x.orderToken, createdAt: ago(80) }) // เกิน 72 ชม.
    await sweepCartAbandoned({ now, shopIds: [x.shop] })
    await sweepCartAbandoned({ now, shopIds: [x.shop] })
    const r = await keysOf()
    expect(r.map((e) => [e.eventKey, e.dedupeKey])).toEqual([['CART_ABANDONED', `cart_abandoned:${inWindow.id}`]])
    expect(r[0].payload).toMatchObject({ value: 500, orderId: x.order })
  })

  it('CartAbandoned: มีสลิปแล้ว หรือยกเลิกแล้ว = ไม่ส่ง', async () => {
    const now = new Date()
    await msg({ type: 'ORDER', orderRefToken: x.orderToken, createdAt: new Date(now.getTime() - 30 * 3600_000) })
    await prisma.order.update({ where: { id: x.order }, data: { slipFileId: 'f1' } })
    await sweepCartAbandoned({ now, shopIds: [x.shop] })
    await prisma.order.update({ where: { id: x.order }, data: { slipFileId: null, status: 'CANCELLED' } })
    await sweepCartAbandoned({ now, shopIds: [x.shop] })
    await prisma.order.update({ where: { id: x.order }, data: { status: 'PENDING' } })
    expect(await keysOf()).toHaveLength(0)
  })
})
