/**
 * meta-capi-sweep.db.test.ts — 00089 FR-011/012: ตัวส่งคิวไป Meta บน Postgres จริง (fetch ปลอม)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { encryptToken } from '@/lib/token-crypto'
vi.mock('@/services/seller-push.service', () => ({ pushMetaCapiStopped: vi.fn() }))
import { pushMetaCapiStopped } from '@/services/seller-push.service'
import { sweepMetaCapi } from '@/services/meta-capi.service'

// คีย์ทดสอบ — เครื่อง dev บางเครื่องไม่มีใน .env
process.env.CHANNEL_TOKEN_KEY ||= 'ab'.repeat(32)
const url = process.env.DATABASE_URL ?? ''
const d = /@(localhost|127\.0\.0\.1):5434\//.test(url) ? describe : describe.skip
const run = randomUUID().slice(0, 8)
const ids = { users: [] as string[], shops: [] as string[] }
const f: Record<string, string> = {}
const NOW = new Date('2026-11-11T05:00:00Z')

type Call = { url: string; auth: string | null; body: Record<string, unknown> }
const fakeFetch = (status: number, json: unknown, calls: Call[]) =>
  (async (u: string, init: RequestInit) => {
    calls.push({ url: u, auth: new Headers(init.headers).get('authorization'), body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify(json), { status })
  }) as unknown as typeof fetch

d('00089 sweepMetaCapi (DB local)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `capis-${run}`, username: `capis_${run}` }, select: { id: true } })
    ids.users.push(u.id)
    const shop = await prisma.shop.create({ data: { userId: u.id, shopName: `capis-${run}` } as never, select: { id: true } })
    ids.shops.push(shop.id)
    f.shop = shop.id
    const ch = await prisma.shopChannel.create({
      data: { shopId: shop.id, provider: 'MESSENGER', externalId: `page-${run}`, name: 'p', accessTokenEnc: encryptToken('PAGE_TOKEN'), connectedByUserId: u.id },
      select: { id: true },
    })
    f.channel = ch.id
  })

  afterAll(async () => {
    if (ids.shops.length) {
      await prisma.shopChannel.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    }
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    vi.stubEnv('OPEN_META_CAPI', '1')
    vi.stubEnv('META_CAPI_PILOT_SHOP_IDS', '')
    await prisma.metaCapiDataset.deleteMany({ where: { shopId: f.shop } })
    const ds = await prisma.metaCapiDataset.create({
      data: { shopId: f.shop, shopChannelId: f.channel, datasetId: `ds-${run}`, source: 'PAGE', events: ['PURCHASE'] },
      select: { id: true },
    })
    f.ds = ds.id
  })

  const mkRow = (over: Record<string, unknown> = {}) =>
    prisma.metaCapiEvent.create({
      data: {
        shopId: f.shop, datasetRowId: f.ds, eventKey: 'PURCHASE', dedupeKey: `purchase:${randomUUID()}`,
        eventTime: new Date(NOW.getTime() - 60_000), pageId: `page-${run}`, psid: 'psid-1',
        payload: { value: 1070, orderId: 'o1' }, nextAttemptAt: new Date(NOW.getTime() - 1000), ...over,
      },
      select: { id: true },
    })
  const get = (id: string) => prisma.metaCapiEvent.findUniqueOrThrow({ where: { id } })
  const shopOnly = { shopIds: [] as string[] }
  beforeEach(() => { shopOnly.shopIds = [f.shop] })

  it('ส่งสำเร็จ: POST /{datasetId}/events ด้วย token เพจใน header · body business_messaging · แถว SENT', async () => {
    const { id } = await mkRow()
    const calls: Call[] = []
    await sweepMetaCapi({ now: NOW, fetchImpl: fakeFetch(200, { events_received: 1 }, calls), ...shopOnly })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toMatch(new RegExp(`/ds-${run}/events$`))
    expect(calls[0].auth).toBe('Bearer PAGE_TOKEN')
    expect(calls[0].body).toMatchObject({
      data: [{ event_name: 'Purchase', action_source: 'business_messaging', user_data: { page_id: `page-${run}`, page_scoped_user_id: 'psid-1' }, custom_data: { currency: 'THB', value: 1070 } }],
    })
    expect(JSON.stringify(calls[0].body)).not.toContain('PAGE_TOKEN')
    expect((calls[0].body.data as { event_id?: string }[])[0].event_id).toMatch(/^purchase:/) // ส่งซ้ำหลังล่มกลางทาง Meta ตัดซ้ำได้
    const r = await get(id)
    expect(r.status).toBe('SENT')
    expect(r.attempts).toBe(1)
    expect(JSON.stringify(r.lastRequest)).not.toContain('PAGE_TOKEN')
  })

  it('ล้มชั่วคราว: ลองใหม่หลัง 1 แล้ว 5 นาที · ครั้งที่ 3 = FAILED', async () => {
    const { id } = await mkRow()
    const calls: Call[] = []
    const retry = fakeFetch(503, {}, calls)
    await sweepMetaCapi({ now: NOW, fetchImpl: retry, ...shopOnly })
    let r = await get(id)
    expect([r.status, r.attempts, r.nextAttemptAt.getTime() - NOW.getTime()]).toEqual(['PENDING', 1, 60_000])
    await sweepMetaCapi({ now: NOW, fetchImpl: retry, ...shopOnly }) // ยังไม่ถึงเวลา
    expect(calls).toHaveLength(1)
    const t2 = new Date(NOW.getTime() + 60_000)
    await sweepMetaCapi({ now: t2, fetchImpl: retry, ...shopOnly })
    r = await get(id)
    expect([r.status, r.attempts, r.nextAttemptAt.getTime() - t2.getTime()]).toEqual(['PENDING', 2, 300_000])
    await sweepMetaCapi({ now: new Date(t2.getTime() + 300_000), fetchImpl: retry, ...shopOnly })
    r = await get(id)
    expect([r.status, r.attempts]).toEqual(['FAILED', 3])
  })

  it('200 แต่ events_received 0 = FAILED ทันที', async () => {
    const { id } = await mkRow()
    await sweepMetaCapi({ now: NOW, fetchImpl: fakeFetch(200, { events_received: 0 }, []), ...shopOnly })
    expect((await get(id)).status).toBe('FAILED')
  })

  it('token เสีย: dataset STOPPED · แถวยัง PENDING ไม่นับครั้ง · รอบถัดไปไม่ส่ง · แจ้งเจ้าของครั้งเดียว', async () => {
    vi.mocked(pushMetaCapiStopped).mockClear()
    const { id } = await mkRow()
    await mkRow()
    const calls: Call[] = []
    await sweepMetaCapi({ now: NOW, fetchImpl: fakeFetch(400, { error: { code: 190, message: 'expired' } }, calls), ...shopOnly })
    const ds = await prisma.metaCapiDataset.findUniqueOrThrow({ where: { id: f.ds } })
    expect(ds.status).toBe('STOPPED')
    expect(pushMetaCapiStopped).toHaveBeenCalledTimes(1)
    expect(vi.mocked(pushMetaCapiStopped).mock.calls[0][0]).toMatchObject({ shopId: f.shop })
    const r = await get(id)
    expect([r.status, r.attempts]).toEqual(['PENDING', 0])
    await sweepMetaCapi({ now: new Date(NOW.getTime() + 600_000), fetchImpl: fakeFetch(200, { events_received: 1 }, calls), ...shopOnly })
    expect(calls).toHaveLength(1)
  })

  it('เก่ากว่า 7 วัน = SKIPPED ไม่เรียก Meta', async () => {
    const { id } = await mkRow({ eventTime: new Date(NOW.getTime() - 7 * 864e5 - 1) })
    const calls: Call[] = []
    await sweepMetaCapi({ now: NOW, fetchImpl: fakeFetch(200, { events_received: 1 }, calls), ...shopOnly })
    expect(calls).toHaveLength(0)
    const r = await get(id)
    expect([r.status, r.reason]).toEqual(['SKIPPED', 'TOO_OLD'])
  })

  it('dataset กรอกเอง ใช้ token ของ dataset · เหตุการณ์จริงไม่มี test_event_code', async () => {
    await prisma.metaCapiDataset.update({ where: { id: f.ds }, data: { source: 'MANUAL', tokenEnc: encryptToken('MANUAL_TOKEN') } })
    await mkRow()
    const calls: Call[] = []
    await sweepMetaCapi({ now: NOW, fetchImpl: fakeFetch(200, { events_received: 1 }, calls), ...shopOnly })
    expect(calls[0].auth).toBe('Bearer MANUAL_TOKEN')
    expect(calls[0].body).not.toHaveProperty('test_event_code')
  })

  it('คืนสรุปจำนวนต่อผล', async () => {
    await mkRow()
    const sum = await sweepMetaCapi({ now: NOW, fetchImpl: fakeFetch(200, { events_received: 1 }, []), ...shopOnly })
    expect(sum).toMatchObject({ sent: 1, failed: 0, retried: 0, stopped: 0, skipped: 0 })
  })

})
