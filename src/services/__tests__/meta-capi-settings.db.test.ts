/**
 * meta-capi-settings.db.test.ts — 00089 FR-002..004: บริการตั้งค่า CAPI บน Postgres จริง (fetch ปลอม ไม่ออกเน็ต)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { encryptToken } from '@/lib/token-crypto'
import {
  addCapiDataset, deleteCapiDataset, getCapiPage, listCapiLog, listCapiPages, resumeCapiDataset,
  testCapiDataset, updateCapiDataset, updateCapiPage,
} from '@/services/meta-capi-settings.service'

process.env.CHANNEL_TOKEN_KEY ||= 'ab'.repeat(32)
const url = process.env.DATABASE_URL ?? ''
const d = /@(localhost|127\.0\.0\.1):5434\//.test(url) ? describe : describe.skip
const run = randomUUID().slice(0, 8)
// รหัสเพจของ Meta เป็นตัวเลขล้วน (service ตรวจก่อนต่อ URL) — สุ่มต่อรอบให้ไม่ชนแถวจริงในฐาน dev
const pageNum = (tag: string) => `9${tag === 'a' ? 1 : 2}${String(parseInt(run, 16)).padStart(10, '0')}`
const ids = { users: [] as string[], shops: [] as string[] }
const f: Record<string, string> = {}

type Call = { url: string; method: string; auth: string | null; body: Record<string, unknown> | null }
const fakeFetch = (status: number, json: unknown, calls: Call[] = []) =>
  (async (u: string, init: RequestInit) => {
    calls.push({ url: u, method: init.method ?? 'GET', auth: new Headers(init.headers).get('authorization'), body: init.body ? JSON.parse(String(init.body)) : null })
    return new Response(JSON.stringify(json), { status })
  }) as unknown as typeof fetch

const code = (p: Promise<unknown>) => p.then(() => 'NO_ERROR', (e) => (e as { code?: string }).code ?? String(e))

d('00089 meta-capi-settings (DB local)', () => {
  beforeAll(async () => {
    const mkShop = async (tag: string) => {
      const u = await prisma.user.create({ data: { displayName: `${tag}-${run}`, username: `${tag}_${run}` }, select: { id: true } })
      ids.users.push(u.id)
      const s = await prisma.shop.create({ data: { userId: u.id, shopName: `${tag}-${run}` } as never, select: { id: true } })
      ids.shops.push(s.id)
      const ch = await prisma.shopChannel.create({
        data: { shopId: s.id, provider: 'MESSENGER', externalId: pageNum(tag), name: `เพจ ${tag}`, accessTokenEnc: encryptToken('PAGE_TOKEN'), connectedByUserId: u.id },
        select: { id: true },
      })
      return { shop: s.id, channel: ch.id, user: u.id }
    }
    const a = await mkShop('a')
    const b = await mkShop('b')
    Object.assign(f, { shop: a.shop, channel: a.channel, user: a.user, shopB: b.shop, channelB: b.channel })
    f.tag = (await prisma.shopTag.create({ data: { shopId: a.shop, name: 'ลีด', nameKey: `lead-${run}` }, select: { id: true } })).id
    f.tagB = (await prisma.shopTag.create({ data: { shopId: b.shop, name: 'ของอื่น', nameKey: `other-${run}` }, select: { id: true } })).id
    const ig = await prisma.shopChannel.create({
      data: { shopId: a.shop, provider: 'INSTAGRAM', externalId: `ig-${run}`, name: 'ig', accessTokenEnc: encryptToken('x'), connectedByUserId: a.user },
      select: { id: true },
    })
    f.ig = ig.id
  })

  afterAll(async () => {
    if (ids.shops.length) {
      await prisma.conversation.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.externalContact.deleteMany({ where: { channel: { shopId: { in: ids.shops } } } })
      await prisma.shopTag.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.shopChannel.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    }
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    vi.stubEnv('OPEN_META_CAPI', '1')
    vi.stubEnv('META_CAPI_PILOT_SHOP_IDS', '')
    await prisma.metaCapiDataset.deleteMany({ where: { shopId: { in: ids.shops } } })
    await prisma.metaCapiPageSetting.deleteMany({ where: { shopId: { in: ids.shops } } })
  })

  it('ช่องของร้านอื่น / ไม่ใช่ Messenger = NOT_FOUND ทุกฟังก์ชัน', async () => {
    expect(await code(getCapiPage(f.shop, f.channelB))).toBe('NOT_FOUND')
    expect(await code(getCapiPage(f.shop, f.ig))).toBe('NOT_FOUND')
    expect(await code(updateCapiPage(f.shop, f.channelB, { enabled: true }))).toBe('NOT_FOUND')
    expect(await code(addCapiDataset(f.shop, f.channelB, { source: 'MANUAL', datasetId: '123', token: 't' }))).toBe('NOT_FOUND')
    expect(await code(listCapiLog(f.shop, f.channelB, {}))).toBe('NOT_FOUND')
    const pages = await listCapiPages(f.shop)
    expect(pages.map((p) => p.channelId)).toEqual([f.channel]) // ไม่มี IG ไม่มีของร้านอื่น
  })

  it('ช่องที่ไม่ ACTIVE = NOT_FOUND', async () => {
    await prisma.shopChannel.update({ where: { id: f.channel }, data: { status: 'DISCONNECTED' } })
    try {
      expect(await code(getCapiPage(f.shop, f.channel))).toBe('NOT_FOUND')
      expect(await listCapiPages(f.shop)).toEqual([])
    } finally {
      await prisma.shopChannel.update({ where: { id: f.channel }, data: { status: 'ACTIVE' } })
    }
  })

  it('enabledAt ตั้งเฉพาะตอน false→true · ปิดแล้วเปิดใหม่ = ตั้งใหม่ · บันทึกซ้ำขณะเปิดไม่ขยับ', async () => {
    const p0 = await getCapiPage(f.shop, f.channel)
    expect(p0.setting).toMatchObject({ enabled: false, enabledAt: null, purchaseAt: 'CREATE', countPromotedDraft: true })
    const s1 = await updateCapiPage(f.shop, f.channel, { enabled: true })
    expect(s1.enabledAt).toBeInstanceOf(Date)
    await new Promise((r) => setTimeout(r, 15))
    const s2 = await updateCapiPage(f.shop, f.channel, { enabled: true, purchaseAt: 'PAYMENT' })
    expect(s2.enabledAt!.getTime()).toBe(s1.enabledAt!.getTime())
    expect(s2.purchaseAt).toBe('PAYMENT')
    await updateCapiPage(f.shop, f.channel, { enabled: false })
    await new Promise((r) => setTimeout(r, 15))
    const s4 = await updateCapiPage(f.shop, f.channel, { enabled: true })
    expect(s4.enabledAt!.getTime()).toBeGreaterThan(s1.enabledAt!.getTime())
  })

  it('บันทึกตั้งค่าโดยไม่แตะ enabled ขณะปิดอยู่ = enabledAt ยัง null', async () => {
    const s = await updateCapiPage(f.shop, f.channel, { countPromotedDraft: false })
    expect(s.enabled).toBe(false)
    expect(s.enabledAt).toBeNull()
    expect(s.countPromotedDraft).toBe(false)
  })

  it('eventOptions: ตรวจชนิด/ขอบเขต/แท็กต้องเป็นของร้านนี้', async () => {
    const bad = (eventOptions: unknown) => code(updateCapiPage(f.shop, f.channel, { eventOptions: eventOptions as never }))
    expect(await bad({ NOPE: {} })).toBe('INVALID_INPUT')
    expect(await bad({ PURCHASE: { valueMode: 'GROSS' } })).toBe('INVALID_INPUT')
    expect(await bad({ PURCHASE: { rules: [{ tagId: f.tag }] } })).toBe('INVALID_INPUT') // กฎแท็กเฉพาะ lead
    expect(await bad({ LEAD_SUBMITTED: { rules: Array.from({ length: 21 }, () => ({ tagId: f.tag })) } })).toBe('INVALID_INPUT')
    expect(await bad({ LEAD_SUBMITTED: { rules: [{ tagId: f.tag, valueBaht: -1 }] } })).toBe('INVALID_INPUT')
    expect(await bad({ LEAD_SUBMITTED: { rules: [{ tagId: f.tag, valueBaht: 10_000_001 }] } })).toBe('INVALID_INPUT')
    const ok = await updateCapiPage(f.shop, f.channel, {
      eventOptions: { PURCHASE: { valueMode: 'NO_VAT', sendContents: true }, QUALIFIED_LEAD: { rules: [{ tagId: f.tag, valueBaht: 500 }] } },
    })
    expect(ok.eventOptions).toMatchObject({ PURCHASE: { valueMode: 'NO_VAT' }, QUALIFIED_LEAD: { rules: [{ tagId: f.tag, valueBaht: 500 }] } })
  })

  it('dataset ที่ 4 = DATASET_LIMIT · ซ้ำในเพจเดียวกัน = DATASET_DUPLICATE', async () => {
    for (const n of ['1', '2', '3']) await addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: `90${n}`, token: 'T' })
    expect(await code(addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '904', token: 'T' }))).toBe('DATASET_LIMIT')
    const first = (await getCapiPage(f.shop, f.channel)).datasets[0]
    await deleteCapiDataset(f.shop, f.channel, first.id)
    expect(await code(addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '902', token: 'T' }))).toBe('DATASET_DUPLICATE')
  })

  it('MANUAL: datasetId ต้องเป็นตัวเลข + ต้องมี token · เก็บเข้ารหัส · getCapiPage ไม่เปิดเผย token', async () => {
    expect(await code(addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: 'abc', token: 'T' }))).toBe('INVALID_INPUT')
    expect(await code(addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '555' }))).toBe('TOKEN_REQUIRED')
    const ds = await addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '555', token: 'SECRET_TOKEN_XYZ' })
    expect(ds.events).toEqual(['PURCHASE'])
    const row = await prisma.metaCapiDataset.findUniqueOrThrow({ where: { id: ds.id } })
    expect(row.tokenEnc).toBeTruthy()
    expect(row.tokenEnc).not.toContain('SECRET_TOKEN_XYZ')
    const page = await getCapiPage(f.shop, f.channel)
    expect(page.datasets[0]).toMatchObject({ datasetId: '555', source: 'MANUAL', hasToken: true })
    expect(JSON.stringify(page)).not.toMatch(/tokenEnc|SECRET_TOKEN_XYZ/)
    expect(JSON.stringify(ds)).not.toMatch(/tokenEnc|SECRET_TOKEN_XYZ/)
  })

  it('PAGE: POST /{pageId}/dataset ด้วย token เพจใน header · เก็บ id ที่ได้กลับมา', async () => {
    const calls: Call[] = []
    const ds = await addCapiDataset(f.shop, f.channel, { source: 'PAGE' }, fakeFetch(200, { id: '777888' }, calls))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: 'POST', auth: 'Bearer PAGE_TOKEN' })
    expect(calls[0].url).toMatch(new RegExp(`/${pageNum('a')}/dataset$`))
    expect(ds).toMatchObject({ datasetId: '777888', source: 'PAGE' })
    expect(await prisma.metaCapiDataset.findUniqueOrThrow({ where: { id: ds.id } })).toMatchObject({ tokenEnc: null })
  })

  it('PAGE: Graph ปฏิเสธเรื่องสิทธิ์ = PAGE_EVENTS_PERMISSION · error อื่น = META_ERROR · ไม่มีแถวค้าง', async () => {
    const perm = fakeFetch(400, { error: { code: 100, message: '(#100) Missing Permission' } })
    expect(await code(addCapiDataset(f.shop, f.channel, { source: 'PAGE' }, perm))).toBe('PAGE_EVENTS_PERMISSION')
    expect(await code(addCapiDataset(f.shop, f.channel, { source: 'PAGE' }, fakeFetch(400, { error: { code: 100, message: 'bad param' } })))).toBe('META_ERROR')
    expect(await code(addCapiDataset(f.shop, f.channel, { source: 'PAGE' }, fakeFetch(200, {})))).toBe('META_ERROR') // ไม่มี id
    expect(await prisma.metaCapiDataset.count({ where: { shopChannelId: f.channel } })).toBe(0)
  })

  it('updateCapiDataset: events ต้องอยู่ในรายการ · token ใหม่ปลุก STOPPED กลับเป็น ACTIVE', async () => {
    const ds = await addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '600', token: 'OLD' })
    expect(await code(updateCapiDataset(f.shop, f.channel, ds.id, { events: ['PURCHASE', 'BOGUS' as never] }))).toBe('INVALID_INPUT')
    const u = await updateCapiDataset(f.shop, f.channel, ds.id, { label: 'หลัก', events: ['PURCHASE', 'ORDER_SHIPPED'] })
    expect(u).toMatchObject({ label: 'หลัก', events: ['PURCHASE', 'ORDER_SHIPPED'] })
    await prisma.metaCapiDataset.update({ where: { id: ds.id }, data: { status: 'STOPPED', stoppedReason: 'x', stoppedAt: new Date() } })
    const before = (await prisma.metaCapiDataset.findUniqueOrThrow({ where: { id: ds.id } })).tokenEnc
    const re = await updateCapiDataset(f.shop, f.channel, ds.id, { token: 'NEW' })
    expect(re).toMatchObject({ status: 'ACTIVE', stoppedReason: null, stoppedAt: null })
    expect((await prisma.metaCapiDataset.findUniqueOrThrow({ where: { id: ds.id } })).tokenEnc).not.toBe(before)
  })

  it('token ใหม่กับ dataset แบบ PAGE = INVALID_INPUT · dataset ของช่องอื่น = NOT_FOUND', async () => {
    const ds = await addCapiDataset(f.shop, f.channel, { source: 'PAGE' }, fakeFetch(200, { id: '700' }))
    expect(await code(updateCapiDataset(f.shop, f.channel, ds.id, { token: 'T' }))).toBe('INVALID_INPUT')
    expect(await code(deleteCapiDataset(f.shopB, f.channelB, ds.id))).toBe('NOT_FOUND')
  })

  it('resumeCapiDataset: PAGE ที่ STOPPED → ACTIVE ไม่เรียก Meta', async () => {
    const ds = await addCapiDataset(f.shop, f.channel, { source: 'PAGE' }, fakeFetch(200, { id: '701' }))
    await prisma.metaCapiDataset.update({ where: { id: ds.id }, data: { status: 'STOPPED', stoppedReason: 'x', stoppedAt: new Date() } })
    const r = await resumeCapiDataset(f.shop, f.channel, ds.id)
    expect(r).toMatchObject({ status: 'ACTIVE', stoppedReason: null })
  })

  it('ลบ dataset แล้วคิวหายตาม (cascade)', async () => {
    const ds = await addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '610', token: 'T' })
    await prisma.metaCapiEvent.create({ data: { shopId: f.shop, datasetRowId: ds.id, eventKey: 'PURCHASE', dedupeKey: 'k1', eventTime: new Date(), pageId: 'p', psid: 's' } })
    await deleteCapiDataset(f.shop, f.channel, ds.id)
    expect(await prisma.metaCapiEvent.count({ where: { datasetRowId: ds.id } })).toBe(0)
  })

  async function mkConversation(psid: string, at: Date) {
    const c = await prisma.externalContact.create({ data: { shopChannelId: f.channel, externalUserId: psid }, select: { id: true } })
    await prisma.conversation.create({
      data: { shopId: f.shop, channel: 'MESSENGER', shopChannelId: f.channel, externalContactId: c.id, lastMessageAt: at },
    })
  }

  it('ปุ่มทดสอบ: ไม่มีห้องแชท = NO_CONVERSATION', async () => {
    const ds = await addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '620', token: 'T' })
    expect(await code(testCapiDataset(f.shop, f.channel, ds.id, { testEventCode: 'TEST9' }, fakeFetch(200, { events_received: 1 })))).toBe('NO_CONVERSATION')
  })

  it('ปุ่มทดสอบมี test code: ส่ง Purchase ฿1 ด้วย PSID ห้องล่าสุด · ไม่เข้าคิว', async () => {
    await mkConversation(`psid-old-${run}`, new Date('2026-01-01'))
    await mkConversation(`psid-new-${run}`, new Date('2026-06-01'))
    const ds = await addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '621', token: 'MANUAL_T' })
    const calls: Call[] = []
    const r = await testCapiDataset(f.shop, f.channel, ds.id, { testEventCode: 'TEST42' }, fakeFetch(200, { events_received: 1 }, calls))
    expect(r).toMatchObject({ ok: true, eventsReceived: 1 })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: 'POST', auth: 'Bearer MANUAL_T' })
    expect(calls[0].url).toMatch(/\/621\/events$/)
    expect(calls[0].body).toMatchObject({
      test_event_code: 'TEST42',
      data: [{ event_name: 'Purchase', user_data: { page_id: pageNum('a'), page_scoped_user_id: `psid-new-${run}` }, custom_data: { value: 1, currency: 'THB' } }],
    })
    expect(await prisma.metaCapiEvent.count({ where: { shopId: f.shop } })).toBe(0)
  })

  it('ปุ่มทดสอบ: Meta ปฏิเสธ = ok false พร้อมข้อความ · ไม่เข้าคิว', async () => {
    await mkConversation(`psid-x-${run}`, new Date())
    const ds = await addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '622', token: 'T' })
    const r = await testCapiDataset(f.shop, f.channel, ds.id, { testEventCode: 'TEST1' }, fakeFetch(400, { error: { code: 190, message: 'Invalid OAuth' } }))
    expect(r.ok).toBe(false)
    expect(r.message).toBeTruthy()
    expect(await prisma.metaCapiEvent.count({ where: { shopId: f.shop } })).toBe(0)
  })

  it('ปุ่มทดสอบไม่มี code: GET /{datasetId}?fields=id อย่างเดียว · ไม่ส่งเหตุการณ์', async () => {
    const ds = await addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '623', token: 'T' })
    const calls: Call[] = []
    const r = await testCapiDataset(f.shop, f.channel, ds.id, {}, fakeFetch(200, { id: '623' }, calls))
    expect(r.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('GET')
    expect(calls[0].url).toMatch(/\/623\?fields=id$/)
  })

  it('ปุ่มทดสอบไม่มี code: อ่านโหนดไม่ได้เพราะสิทธิ์ = ok_but_unverified ไม่ใช่ล้ม · token เสีย (190) = ล้มจริง', async () => {
    const ds = await addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '624', token: 'T' })
    const perm = await testCapiDataset(f.shop, f.channel, ds.id, {}, fakeFetch(403, { error: { code: 10, message: 'perm' } }))
    expect(perm).toMatchObject({ ok: true, unverified: true })
    const dead = await testCapiDataset(f.shop, f.channel, ds.id, {}, fakeFetch(400, { error: { code: 190, message: 'expired' } }))
    expect(dead.ok).toBe(false)
  })

  it('listCapiLog: เรียงใหม่→เก่า · กรอง status/eventKey · cursor แบ่งหน้า · ไม่รั่ว token', async () => {
    const ds = await addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '630', token: 'T', label: 'L' })
    const base = new Date('2026-11-01T00:00:00Z').getTime()
    for (let i = 0; i < 5; i++) {
      await prisma.metaCapiEvent.create({
        data: {
          shopId: f.shop, datasetRowId: ds.id, eventKey: i % 2 ? 'ORDER_SHIPPED' : 'PURCHASE', dedupeKey: `k${i}`, eventTime: new Date(base),
          pageId: 'p', psid: 's', payload: { value: 100 + i }, status: i === 4 ? 'FAILED' : 'SENT', reason: i === 4 ? 'REJECTED' : null, attempts: 1,
          createdAt: new Date(base + i * 1000),
        },
      })
    }
    const p1 = await listCapiLog(f.shop, f.channel, { take: 2 })
    expect(p1.rows.map((r) => r.value)).toEqual([104, 103])
    expect(p1.rows[0]).toMatchObject({ eventKey: 'PURCHASE', status: 'FAILED', reason: 'REJECTED', attempts: 1, datasetLabel: 'L', datasetId: '630' })
    expect(p1.nextCursor).toBeTruthy()
    const p2 = await listCapiLog(f.shop, f.channel, { take: 2, cursor: p1.nextCursor! })
    expect(p2.rows.map((r) => r.value)).toEqual([102, 101])
    const p3 = await listCapiLog(f.shop, f.channel, { take: 2, cursor: p2.nextCursor! })
    expect(p3.rows.map((r) => r.value)).toEqual([100])
    expect(p3.nextCursor).toBeNull()
    expect((await listCapiLog(f.shop, f.channel, { status: 'FAILED' })).rows).toHaveLength(1)
    expect((await listCapiLog(f.shop, f.channel, { eventKey: 'ORDER_SHIPPED' })).rows).toHaveLength(2)
    expect((await listCapiLog(f.shop, f.channel, { take: 9999 })).rows).toHaveLength(5) // เพดาน 50
    expect(JSON.stringify(p1)).not.toMatch(/tokenEnc|lastRequest|psid/)
  })

  it('listCapiPages: นับ dataset/anyStopped/sent7d', async () => {
    const a = await addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '640', token: 'T' })
    await addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '641', token: 'T' })
    await prisma.metaCapiDataset.update({ where: { id: a.id }, data: { status: 'STOPPED' } })
    const mk = (k: string, status: string, at: Date) =>
      prisma.metaCapiEvent.create({ data: { shopId: f.shop, datasetRowId: a.id, eventKey: 'PURCHASE', dedupeKey: k, eventTime: at, pageId: 'p', psid: 's', status, createdAt: at } })
    await mk('s1', 'SENT', new Date())
    await mk('s2', 'SENT', new Date(Date.now() - 10 * 864e5))
    await mk('s3', 'FAILED', new Date())
    const [p] = await listCapiPages(f.shop)
    expect(p).toMatchObject({ channelId: f.channel, datasets: 2, anyStopped: true, sent7d: 1 })
    expect(p.setting).toMatchObject({ enabled: false })
  })

  it('ปิดสวิตช์ระบบ/ร้านไม่อยู่ในรายชื่อทดลอง = FEATURE_DISABLED ทุกฟังก์ชัน', async () => {
    const ds = await addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '650', token: 'T' })
    for (const off of [() => vi.stubEnv('OPEN_META_CAPI', ''), () => vi.stubEnv('META_CAPI_PILOT_SHOP_IDS', 'someone-else')]) {
      vi.stubEnv('OPEN_META_CAPI', '1'); vi.stubEnv('META_CAPI_PILOT_SHOP_IDS', '')
      off()
      expect(await code(listCapiPages(f.shop))).toBe('FEATURE_DISABLED')
      expect(await code(getCapiPage(f.shop, f.channel))).toBe('FEATURE_DISABLED')
      expect(await code(updateCapiPage(f.shop, f.channel, { enabled: true }))).toBe('FEATURE_DISABLED')
      expect(await code(addCapiDataset(f.shop, f.channel, { source: 'MANUAL', datasetId: '651', token: 'T' }))).toBe('FEATURE_DISABLED')
      expect(await code(updateCapiDataset(f.shop, f.channel, ds.id, { label: 'x' }))).toBe('FEATURE_DISABLED')
      expect(await code(resumeCapiDataset(f.shop, f.channel, ds.id))).toBe('FEATURE_DISABLED')
      expect(await code(deleteCapiDataset(f.shop, f.channel, ds.id))).toBe('FEATURE_DISABLED')
      expect(await code(testCapiDataset(f.shop, f.channel, ds.id))).toBe('FEATURE_DISABLED')
      expect(await code(listCapiLog(f.shop, f.channel, {}))).toBe('FEATURE_DISABLED')
    }
  })

  it('กฎที่ชี้แท็กร้านอื่น/แท็กที่ถูกลบไปแล้ว = ตัดทิ้งตอนบันทึก (ไม่ทำให้บันทึกตัวเลือกอื่นไม่ได้)', async () => {
    const res = await updateCapiPage(f.shop, f.channel, {
      eventOptions: { PURCHASE: { valueMode: 'NO_VAT' }, LEAD_SUBMITTED: { rules: [{ tagId: f.tag, valueBaht: 5 }, { tagId: f.tagB }, { tagId: randomUUID() }] } },
    } as never)
    const saved = (await prisma.metaCapiPageSetting.findUniqueOrThrow({ where: { shopChannelId: f.channel } })).eventOptions as Record<string, { rules?: { tagId: string }[]; valueMode?: string }>
    expect(saved.LEAD_SUBMITTED.rules!.map((r) => r.tagId)).toEqual([f.tag])
    expect(saved.PURCHASE.valueMode).toBe('NO_VAT')
    expect(res).toBeTruthy()
  })
})
