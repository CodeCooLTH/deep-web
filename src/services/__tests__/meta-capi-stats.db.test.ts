/**
 * meta-capi-stats.db.test.ts — 00089: getCapiStats บน Postgres จริง (ผูก shopId + เพจ · นับ dedupeKey ไม่ซ้ำข้ามชุดข้อมูล)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getCapiStats } from '@/lib/meta-capi/stats'

const url = process.env.DATABASE_URL ?? ''
const d = /@(localhost|127\.0\.0\.1):5434\//.test(url) ? describe : describe.skip
const run = randomUUID().slice(0, 8)
const ids = { users: [] as string[], shops: [] as string[] }
const f: Record<string, string> = {}

d('00089 getCapiStats (DB local)', () => {
  beforeAll(async () => {
    const mk = async (tag: string) => {
      const u = await prisma.user.create({ data: { displayName: `${tag}-${run}`, username: `${tag}_${run}` }, select: { id: true } })
      ids.users.push(u.id)
      const shop = await prisma.shop.create({ data: { userId: u.id, shopName: `${tag}-${run}` } as never, select: { id: true } })
      ids.shops.push(shop.id)
      const ch = await prisma.shopChannel.create({ data: { shopId: shop.id, provider: 'MESSENGER', externalId: `page-${tag}-${run}`, name: 'p', accessTokenEnc: 'x', connectedByUserId: u.id }, select: { id: true } })
      const mkDs = (datasetId: string) => prisma.metaCapiDataset.create({ data: { shopId: shop.id, shopChannelId: ch.id, datasetId, source: 'MANUAL', events: ['PURCHASE'] }, select: { id: true } })
      return { shop: shop.id, ch: ch.id, ds1: (await mkDs(`1${tag}${run}`)).id, ds2: (await mkDs(`2${tag}${run}`)).id }
    }
    const a = await mk('a')
    const b = await mk('b')
    Object.assign(f, a, { shopB: b.shop, chB: b.ch })
    const at = new Date(Date.now() - 3600e3)
    const row = (shopId: string, datasetRowId: string, dedupeKey: string, eventKey: string, status: string, payload: object = {}) => ({
      shopId, datasetRowId, dedupeKey, eventKey, status, payload, eventTime: at, pageId: 'pg', psid: 'ps', sentAt: status === 'SENT' ? at : null,
    })
    await prisma.metaCapiEvent.createMany({
      data: [
        // ออเดอร์เดียวส่งเข้า 2 ชุดข้อมูล = 1 เหตุการณ์
        row(a.shop, a.ds1, 'purchase:o1', 'PURCHASE', 'SENT', { value: 500 }),
        row(a.shop, a.ds2, 'purchase:o1', 'PURCHASE', 'SENT', { value: 500 }),
        row(a.shop, a.ds1, 'lead:1', 'QUALIFIED_LEAD', 'SENT'),
        row(a.shop, a.ds1, 'purchase:o2', 'PURCHASE', 'PENDING', { value: 99 }),
        row(a.shop, a.ds1, 'purchase:o3', 'PURCHASE', 'FAILED', { value: 99 }),
        // ร้านอื่น ต้องไม่ปน
        row(b.shop, b.ds1, 'purchase:ob', 'PURCHASE', 'SENT', { value: 7777 }),
      ],
    })
  })

  afterAll(async () => {
    if (ids.shops.length) {
      await prisma.metaCapiEvent.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.metaCapiDataset.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.shopChannel.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    }
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  it('นับ distinct dedupeKey · ยอดครั้งเดียว · pending/failed · ไม่ปนร้านอื่น', async () => {
    const s = await getCapiStats(f.shop, f.ch, 7)
    expect(s.sent.total).toBe(2) // purchase:o1 + lead:1
    expect(s.sales.total).toBe(500)
    expect(s.sales.orders).toBe(1)
    expect(s.leads.total).toBe(1)
    expect(s.pending).toBe(1)
    expect(s.failed).toBe(1)
    expect(s.lastSentAt).not.toBeNull()
    expect(s.sent.series.reduce((x, y) => x + y, 0)).toBe(2)
  })

  it('ผูกเพจ: ถามด้วย channel ของร้านอื่น = ศูนย์', async () => {
    const s = await getCapiStats(f.shop, f.chB, 30)
    expect(s.sent.total).toBe(0)
    expect(s.lastSentAt).toBeNull()
  })
})
