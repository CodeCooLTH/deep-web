/**
 * shop-tag-order-removal.db.test.ts — 00083 TC-040..045 (DB จริง) + TC-048 (static)
 * 🛑 HR13/HR14: ส่วน DB รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้างเท่านั้น (ลูก→แม่)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))

import { createOrder, promoteDraftToOrder, promoteAutoOrderDraft, cancelOrder } from '@/services/order.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)

type Side = { user: string; shop: string; prod: string; channel: string; contact: string; conv: string }
const A = {} as Side
const B = {} as Side
const orderIds: string[] = []
const TAG = `รอคีย์ออเดอร์-${run}`
// เบอร์สุ่มต่อรอบ — ไม่ชนลูกค้าจริงในฐาน dev และลบ Customer ที่ createOrder สร้างได้โดยไม่แตะของคนอื่น (HR13)
const PHONE = `08${String(parseInt(run, 16) % 1e8).padStart(8, '0')}`
const startedAt = new Date()

async function mkSide(label: string): Promise<Side> {
  const u = await prisma.user.create({ data: { displayName: `${label}-${run}`, username: `${label}_${run}` }, select: { id: true } })
  const s = await prisma.shop.create({ data: { userId: u.id, shopName: `${label}-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })
  const p = await prisma.product.create({
    data: { shopId: s.id, name: `สินค้า-${label}-${run}`, price: 100, cost: 50, fulfillmentMode: 'NO_SHIPPING' } as never,
    select: { id: true },
  })
  const ch = await prisma.shopChannel.create({
    data: { shopId: s.id, provider: 'MESSENGER', externalId: `pg-${label}-${run}`, name: 'p', accessTokenEnc: 'x', connectedByUserId: u.id },
    select: { id: true },
  })
  const c = await prisma.externalContact.create({
    data: { shopChannelId: ch.id, externalUserId: `psid-${label}-${run}`, tags: [TAG, 'vip', 'ปิดสวิตช์'] },
    select: { id: true },
  })
  const cv = await prisma.conversation.create({
    data: { shopId: s.id, channel: 'MESSENGER', shopChannelId: ch.id, externalContactId: c.id },
    select: { id: true },
  })
  await prisma.shopTag.create({ data: { shopId: s.id, name: TAG, nameKey: TAG.toLowerCase(), removeOnOrderCreate: true } })
  await prisma.shopTag.create({ data: { shopId: s.id, name: 'ปิดสวิตช์', nameKey: 'ปิดสวิตช์', removeOnOrderCreate: false } })
  return { user: u.id, shop: s.id, prod: p.id, channel: ch.id, contact: c.id, conv: cv.id }
}

const reset = (x: Side) => prisma.externalContact.update({ where: { id: x.contact }, data: { tags: [TAG, 'vip', 'ปิดสวิตช์'] } })
const tagsOf = async (x: Side) => (await prisma.externalContact.findUniqueOrThrow({ where: { id: x.contact }, select: { tags: true } })).tags
const eventsOf = (x: Side) => prisma.shopTagEvent.findMany({ where: { externalContactId: x.contact, source: 'ORDER_CREATED' } })
const clearEvents = (x: Side) => prisma.shopTagEvent.deleteMany({ where: { externalContactId: x.contact } })
const body = (x: Side, extra: Record<string, unknown> = {}) =>
  ({ type: 'PHYSICAL', fulfillmentMode: 'PICKUP', items: [{ productId: x.prod, name: 'สินค้า', qty: 1, price: 100 }], ...extra }) as never
const mk = async (x: Side, extra: Record<string, unknown> = {}) => {
  const o = await createOrder(x.shop, body(x, extra))
  orderIds.push(o.id)
  return o as { id: string; publicToken: string }
}
const mkDraft = async (x: Side) => {
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

describe.skipIf(!isLocal)('00083 ตัวถอด tag ตอนสร้างออเดอร์ (DB จริง)', () => {
  beforeAll(async () => {
    Object.assign(A, await mkSide('tagA'))
    Object.assign(B, await mkSide('tagB'))
  })

  afterAll(async () => {
    const shops = [A.shop, B.shop].filter(Boolean)
    await prisma.shopTagEvent.deleteMany({ where: { shopId: { in: shops } } })
    await prisma.shopTag.deleteMany({ where: { shopId: { in: shops } } })
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    await prisma.customer.deleteMany({ where: { phone: PHONE, createdAt: { gte: startedAt } } })
    for (const x of [A, B]) {
      if (!x.user) continue
      await prisma.conversation.deleteMany({ where: { id: x.conv } })
      await prisma.externalContact.deleteMany({ where: { id: x.contact } })
      await prisma.shopChannel.deleteMany({ where: { id: x.channel } })
      await prisma.product.deleteMany({ where: { id: x.prod } })
      await prisma.shop.deleteMany({ where: { id: x.shop } })
      await prisma.user.deleteMany({ where: { id: x.user } })
    }
    await prisma.$disconnect()
  })

  it('TC-040 ถอดเฉพาะ tag ที่เปิดสวิตช์ + event 1 แถว orderId ตรง', async () => {
    await reset(A); await clearEvents(A)
    const o = await mk(A, { conversationId: A.conv })
    expect(await tagsOf(A)).toEqual(['vip', 'ปิดสวิตช์'])
    const ev = await eventsOf(A)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ action: 'REMOVE', orderId: o.id, tagName: TAG })
  })

  it('TC-041 [blocker] ไม่ผูกห้อง (buyerContact ตรงเบอร์) → ไม่ถอด ไม่มี event', async () => {
    await reset(A); await clearEvents(A)
    await prisma.externalContact.update({ where: { id: A.contact }, data: { phones: [PHONE] } })
    await mk(A, { buyerContact: PHONE })
    expect(await tagsOf(A)).toContain(TAG)
    expect(await eventsOf(A)).toHaveLength(0)
  })

  it('TC-042 [blocker] ร่างไม่ถอด · promoteDraftToOrder และ promoteAutoOrderDraft ถอด', async () => {
    for (const promote of ['manual', 'auto'] as const) {
      await reset(A); await clearEvents(A)
      const d = await mkDraft(A)
      expect(await tagsOf(A)).toContain(TAG)
      expect(await eventsOf(A)).toHaveLength(0)
      if (promote === 'manual') await promoteDraftToOrder(A.shop, d.publicToken, body(A), null)
      else await promoteAutoOrderDraft(A.shop, d.publicToken, body(A))
      expect(await tagsOf(A)).toEqual(['vip', 'ปิดสวิตช์'])
      expect((await eventsOf(A)).map((e) => e.orderId)).toEqual([d.id])
    }
  })

  it('TC-043 isDryRun ไม่ถอด · createdAt ย้อนหลังถอด · cancel แล้วไม่ติดกลับ', async () => {
    await reset(A); await clearEvents(A)
    const dry = await createOrder(A.shop, body(A, { conversationId: A.conv, isDryRun: true }))
    orderIds.push(dry.id)
    expect(await tagsOf(A)).toContain(TAG)
    expect(await eventsOf(A)).toHaveLength(0)

    const back = await mk(A, { conversationId: A.conv, createdAt: new Date(Date.now() - 5 * 86400_000).toISOString() })
    expect(await tagsOf(A)).toEqual(['vip', 'ปิดสวิตช์'])
    await cancelOrder(back.publicToken, 'seller', 'BUYER_REQUESTED', A.user)
    expect(await tagsOf(A)).toEqual(['vip', 'ปิดสวิตช์'])
  })

  it('TC-044 ห้องไม่มี tag = ไม่ error ไม่มี event · ร้านอื่นไม่ถูกแตะ', async () => {
    await reset(A); await reset(B); await clearEvents(A); await clearEvents(B)
    await prisma.externalContact.update({ where: { id: A.contact }, data: { tags: ['vip'] } })
    await mk(A, { conversationId: A.conv })
    expect(await tagsOf(A)).toEqual(['vip'])
    expect(await eventsOf(A)).toHaveLength(0)
    expect(await tagsOf(B)).toContain(TAG)
    // ร้าน A สั่งด้วย conversationId ของร้าน B → WHERE shopId กัน ไม่แตะ B
    await mk(A, { conversationId: B.conv })
    expect(await tagsOf(B)).toContain(TAG)
    expect(await eventsOf(B)).toHaveLength(0)
  })

  it('TC-045 [blocker] สร้างล้ม → tag ยังอยู่ · ถอดล้ม → สร้างสำเร็จ', async () => {
    await reset(A); await clearEvents(A)
    await expect(
      createOrder(A.shop, body(A, { conversationId: A.conv, items: [{ productId: randomUUID(), name: 'x', qty: 1, price: 1 }] })),
    ).rejects.toThrow()
    expect(await tagsOf(A)).toContain(TAG)

    // (ข) ถอดล้มแล้วออเดอร์ไม่ย้อน: ตัวถอดห่อ try/catch ในตัวและอยู่หลัง commit (บังคับด้วย static ข้างล่าง) — ที่นี่ยืนยันว่าออเดอร์อยู่ครบหลังถอด
    const o = await mk(A, { conversationId: A.conv })
    expect(await prisma.order.findUnique({ where: { id: o.id }, select: { id: true } })).not.toBeNull()
  })
})

// ── TC-048 static (ไม่ใช้ DB) ─────────────────────────────────────────────────────────
const read = (f: string) => readFileSync(f, 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
/** ตัดเนื้อฟังก์ชัน export จนถึงฟังก์ชัน/คอมเมนต์ doc ถัดไปที่ขึ้นต้นบรรทัด */
const fnBody = (src: string, name: string) => {
  const m = new RegExp(`^(?:export )?async function ${name}\\b[\\s\\S]*?(?=^(?:export )?(?:async )?function |^(?:export )?(?:const|class|type|interface) |(?![\\s\\S]))`, 'm').exec(src)
  return m?.[0] ?? ''
}

describe('00083 TC-048 [blocker] เส้นทางที่ผูกห้องถูกไล่ครบ (static)', () => {
  it('removeTagsOnOrderCreated( ถูกเรียกเฉพาะ order.service.ts 2 ครั้ง', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const files = execSync(`grep -rl "removeTagsOnOrderCreated(" src --include=*.ts --include=*.tsx || true`, { encoding: 'utf8' })
      .split('\n').filter(Boolean)
      .filter((f) => !/(^|\/)__tests__\/|\.test\.tsx?$/.test(f) && !f.endsWith('shop-tag-auto.service.ts'))
      .filter((f) => /removeTagsOnOrderCreated\(/.test(strip(read(f))))
    expect(files).toEqual(['src/services/order.service.ts'])
    expect(strip(read('src/services/order.service.ts')).match(/removeTagsOnOrderCreated\(/g)).toHaveLength(2)
  })

  it.each(['src/services/booking.service.ts', 'src/services/auction.service.ts'])('%s ไม่มี conversationId', (f) => {
    expect(strip(read(f))).not.toMatch(/conversationId/)
  })

  it('updateOrder / cancelOrder ไม่เรียกตัวถอด · createOrder / promoteDraftCore เรียกหลัง commit', () => {
    const src = strip(read('src/services/order.service.ts'))
    expect(fnBody(src, 'updateOrder')).not.toMatch(/removeTagsOnOrderCreated/)
    expect(fnBody(src, 'cancelOrder')).not.toMatch(/removeTagsOnOrderCreated/)
    for (const name of ['createOrder', 'promoteDraftCore']) {
      const b = fnBody(src, name)
      expect(b, name).toMatch(/removeTagsOnOrderCreated\(/)
      // ต้องอยู่หลัง dispatchAutoNotifyAfterCommit (= นอก $transaction) ไม่ใช่ข้างใน
      expect(b.indexOf('removeTagsOnOrderCreated('), name).toBeGreaterThan(b.indexOf('dispatchAutoNotifyAfterCommit('))
    }
  })
})
