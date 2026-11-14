/**
 * meta-audience.db.test.ts — 00092: hook เพิ่ม/ถอน · เติมย้อนหลัง · ตัวส่ง · ตั้งค่า บน Postgres จริง (fetch ปลอม ไม่แตะเครือข่าย)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { encryptToken } from '@/lib/token-crypto'
import { phoneHash } from '@/lib/meta-audience/identity'
vi.mock('@/services/seller-push.service', () => ({
  pushMetaCapiStopped: vi.fn(),
  pushMetaAudienceStopped: vi.fn(),
  pushMetaAudienceTokenExpiring: vi.fn(),
}))
import { pushMetaAudienceStopped, pushMetaAudienceTokenExpiring } from '@/services/seller-push.service'
import { markOrderPurchaserAfterCommit, backfillShopAudience, sweepMetaAudience } from '@/services/meta-audience.service'
import { connectManual, setAudienceEnabled, disconnectAudience, getAudienceStatus, AudienceError } from '@/services/meta-audience-settings.service'

process.env.CHANNEL_TOKEN_KEY ||= 'ab'.repeat(32)
const url = process.env.DATABASE_URL ?? ''
const d = /@(localhost|127\.0\.0\.1):5434\//.test(url) ? describe : describe.skip
const run = randomUUID().slice(0, 8)
const rnd8 = () => String(Math.floor(Math.random() * 1e8)).padStart(8, '0')
const ids = { users: [] as string[], shops: [] as string[] }
const f: Record<string, string> = {}
// แถวใหม่ได้ nextAttemptAt = now() จริง ⇒ "เวลาของตัวส่ง" ต้องอยู่หลังเวลาจริงเสมอ ไม่ตรึงวันที่
const NOW = new Date(Date.now() + 3_600_000)

type Call = { method: string; url: string; auth: string | null; body: { payload?: { schema: string; data: string[]; page_ids?: string[] } } & Record<string, unknown> }
const fakeFetch = (reply: (c: Call) => { status: number; json: unknown }, calls: Call[]) =>
  (async (u: string, init: RequestInit) => {
    const c: Call = { method: String(init.method), url: u, auth: new Headers(init.headers).get('authorization'), body: JSON.parse(String(init.body ?? '{}')) }
    calls.push(c)
    const r = reply(c)
    return new Response(JSON.stringify(r.json), { status: r.status })
  }) as unknown as typeof fetch
const okReply = (c: Call) => (c.url.endsWith('/customaudiences') ? { status: 200, json: { id: 'AUD1' } } : { status: 200, json: { num_received: 1 } })

d('00092 Custom Audience (DB local)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `aud-${run}`, username: `aud_${run}` }, select: { id: true } })
    ids.users.push(u.id)
    const shop = await prisma.shop.create({ data: { userId: u.id, shopName: `ร้านทดสอบ-${run}` } as never, select: { id: true } })
    const u2 = await prisma.user.create({ data: { displayName: `aud2-${run}`, username: `aud2_${run}` }, select: { id: true } })
    ids.users.push(u2.id)
    const other = await prisma.shop.create({ data: { userId: u2.id, shopName: `other-${run}` } as never, select: { id: true } })
    ids.shops.push(shop.id, other.id)
    f.shop = shop.id
    f.other = other.id
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
  })

  afterAll(async () => {
    if (ids.shops.length) {
      await prisma.metaAudienceMember.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.metaAudienceConnection.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.order.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.conversation.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.shopChannel.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    }
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    vi.stubEnv('OPEN_META_AUDIENCE', '1')
    vi.stubEnv('META_AUDIENCE_PILOT_SHOP_IDS', '')
    vi.mocked(pushMetaAudienceStopped).mockClear()
    vi.mocked(pushMetaAudienceTokenExpiring).mockClear()
    await prisma.metaAudienceMember.deleteMany({ where: { shopId: { in: [f.shop, f.other] } } })
    await prisma.metaAudienceConnection.deleteMany({ where: { shopId: { in: [f.shop, f.other] } } })
    await prisma.order.deleteMany({ where: { shopId: { in: [f.shop, f.other] } } })
  })

  const mkConn = (over: Record<string, unknown> = {}, shopId = f.shop) =>
    prisma.metaAudienceConnection.create({
      data: { shopId, adAccountId: '111222333', tokenEnc: encryptToken('SECRET_TOKEN'), tokenSource: 'MANUAL', enabled: true, enabledAt: NOW, backfilledAt: NOW, ...over },
    })
  /** ค่าเริ่มต้น = ชำระครบ (ร้านไม่มีค่าตั้ง 00089) */
  const mkOrder = async (o: { phone?: string; conv?: boolean; paid?: boolean; status?: string; dry?: boolean; shopId?: string } = {}) =>
    (await prisma.order.create({
      data: {
        shopId: o.shopId ?? f.shop, totalAmount: '500.00', status: o.status ?? 'PENDING', type: 'PHYSICAL',
        buyerContact: o.phone, conversationId: o.conv ? f.conv : null, isDryRun: o.dry ?? false,
        paymentConfirmedAt: (o.paid ?? true) ? NOW : null,
      } as never,
      select: { id: true },
    })).id
  const members = () => prisma.metaAudienceMember.findMany({ where: { shopId: f.shop }, orderBy: { identityType: 'asc' } })

  describe('hook (FR-004/005 · BR-CA-03)', () => {
    it('ชำระครบ ในห้อง Messenger + มีเบอร์ → เข้าทั้ง PSID+เพจ และเบอร์แฮช', async () => {
      await mkConn()
      const phone = `09${rnd8()}`
      const id = await mkOrder({ phone, conv: true })
      await markOrderPurchaserAfterCommit(id, 'FULLY_PAID')
      const m = await members()
      expect(m.map((x) => [x.identityType, x.identityKey, x.pageId, x.desired, x.syncedState])).toEqual([
        ['PHONE', phoneHash(phone), null, 'IN', 'OUT'],
        ['PSID', `psid-${run}`, `page-${run}`, 'IN', 'OUT'],
      ])
    })

    it('ยังไม่ชำระ + ทริกเกอร์ CREATED (ค่าเริ่มต้น = ชำระครบ) → ยังไม่เข้า', async () => {
      await mkConn()
      const id = await mkOrder({ phone: `09${rnd8()}`, paid: false })
      await markOrderPurchaserAfterCommit(id, 'CREATED')
      expect(await members()).toHaveLength(0)
    })

    it('ร้านตั้ง Purchase = CREATE → ถึงจังหวะตอนสร้าง', async () => {
      await mkConn()
      const s = await prisma.metaCapiPageSetting.create({ data: { shopId: f.shop, shopChannelId: f.channel, enabled: true, purchaseAt: 'CREATE' } })
      try {
        const id = await mkOrder({ conv: true, paid: false })
        await markOrderPurchaserAfterCommit(id, 'CREATED')
        expect((await members()).map((x) => x.identityType)).toEqual(['PSID'])
      } finally {
        await prisma.metaCapiPageSetting.delete({ where: { id: s.id } })
      }
    })

    it('ร่าง / ห้องทดสอบ / ไม่มี connection / ฟีเจอร์ปิด → ไม่เขียนอะไร', async () => {
      const phone = `09${rnd8()}`
      const draft = await mkOrder({ phone, status: 'DRAFTED' })
      const dry = await mkOrder({ phone, dry: true })
      const real = await mkOrder({ phone })
      await markOrderPurchaserAfterCommit(real, 'FULLY_PAID') // ยังไม่มี connection
      expect(await members()).toHaveLength(0)
      await mkConn()
      await markOrderPurchaserAfterCommit(draft, 'FULLY_PAID')
      await markOrderPurchaserAfterCommit(dry, 'FULLY_PAID')
      expect(await members()).toHaveLength(0)
      vi.stubEnv('OPEN_META_AUDIENCE', '')
      await markOrderPurchaserAfterCommit(real, 'FULLY_PAID')
      expect(await members()).toHaveLength(0)
    })

    it('ซื้อซ้ำ = แถวเดียว ไม่ส่งซ้ำ', async () => {
      await mkConn()
      const phone = `09${rnd8()}`
      const a = await mkOrder({ phone })
      const b = await mkOrder({ phone })
      await markOrderPurchaserAfterCommit(a, 'FULLY_PAID')
      await markOrderPurchaserAfterCommit(b, 'FULLY_PAID')
      expect(await members()).toHaveLength(1)
    })

    it('ทริกเกอร์ที่ไม่ใช่ Purchase (SHIPPED) ไม่เปลี่ยนอะไร', async () => {
      await mkConn()
      const id = await mkOrder({ phone: `09${rnd8()}` })
      await markOrderPurchaserAfterCommit(id, 'SHIPPED')
      expect(await members()).toHaveLength(0)
    })

    it('ยกเลิกใบเดียว (ไม่มีใบอื่น) → ถอน', async () => {
      await mkConn()
      const id = await mkOrder({ phone: `09${rnd8()}` })
      await markOrderPurchaserAfterCommit(id, 'FULLY_PAID')
      await prisma.metaAudienceMember.updateMany({ where: { shopId: f.shop }, data: { syncedState: 'IN' } }) // จำลองว่าส่งไปแล้ว
      await prisma.order.update({ where: { id }, data: { status: 'CANCELLED' } })
      await markOrderPurchaserAfterCommit(id, 'CANCELED')
      expect((await members()).map((x) => [x.desired, x.syncedState])).toEqual([['OUT', 'IN']])
    })

    it('ยกเลิกใบหนึ่งแต่ยังมีใบอื่นที่นับ (เบอร์เขียนคนละรูปแบบ) → ไม่ถอน', async () => {
      await mkConn()
      const raw = `09${rnd8()}`
      const dashed = `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6)}`
      const a = await mkOrder({ phone: raw })
      const b = await mkOrder({ phone: dashed })
      await markOrderPurchaserAfterCommit(a, 'FULLY_PAID')
      await prisma.order.update({ where: { id: a }, data: { status: 'CANCELLED' } })
      await markOrderPurchaserAfterCommit(a, 'CANCELED')
      expect((await members()).map((x) => x.desired)).toEqual(['IN'])
      // ใบที่เหลือถูกคืนของด้วย → ถอน
      await prisma.order.update({ where: { id: b }, data: { status: 'RETURNED' } })
      await markOrderPurchaserAfterCommit(b, 'RETURNED')
      expect((await members()).map((x) => x.desired)).toEqual(['OUT'])
    })

    it('ใบของร้านอื่นที่เบอร์เดียวกันไม่ช่วยค้ำ (ไม่ข้ามร้าน)', async () => {
      await mkConn()
      const phone = `09${rnd8()}`
      const mine = await mkOrder({ phone })
      await mkOrder({ phone, shopId: f.other })
      await markOrderPurchaserAfterCommit(mine, 'FULLY_PAID')
      await prisma.order.update({ where: { id: mine }, data: { status: 'CANCELLED' } })
      await markOrderPurchaserAfterCommit(mine, 'CANCELED')
      expect((await members()).map((x) => x.desired)).toEqual(['OUT'])
    })

    it('ลูกค้าที่ถูกถอนแล้วซื้อใหม่ → กลับเป็น IN', async () => {
      await mkConn()
      const phone = `09${rnd8()}`
      const a = await mkOrder({ phone, status: 'CANCELLED' })
      await prisma.metaAudienceMember.create({ data: { shopId: f.shop, identityType: 'PHONE', identityKey: phoneHash(phone)!, desired: 'OUT', syncedState: 'IN' } })
      void a
      const b = await mkOrder({ phone })
      await markOrderPurchaserAfterCommit(b, 'FULLY_PAID')
      expect((await members()).map((x) => [x.desired, x.syncedState])).toEqual([['IN', 'IN']])
    })
  })

  describe('เติมย้อนหลัง (FR-007)', () => {
    it('เก็บเฉพาะใบที่ถึงจังหวะและไม่ยกเลิก/คืน/ร่าง/ทดสอบ แล้วตั้ง backfilledAt', async () => {
      await mkConn({ backfilledAt: null })
      const [p1, p2, p3, p4] = [`09${rnd8()}`, `09${rnd8()}`, `09${rnd8()}`, `09${rnd8()}`]
      await mkOrder({ phone: p1 })
      await mkOrder({ phone: p2, status: 'CANCELLED' })
      await mkOrder({ phone: p3, paid: false })
      await mkOrder({ phone: p4, dry: true })
      await mkOrder({ conv: true })
      const n = await backfillShopAudience(f.shop)
      expect(n).toBe(2)
      expect((await members()).map((x) => x.identityKey).sort()).toEqual([phoneHash(p1)!, `psid-${run}`].sort())
      expect((await prisma.metaAudienceConnection.findUniqueOrThrow({ where: { shopId: f.shop } })).backfilledAt).not.toBeNull()
    })
  })

  describe('ตัวส่ง (FR-003/006)', () => {
    it('สร้าง audience แล้วส่ง PSID (ต่อเพจ, UID+page_ids) และเบอร์ (PHONE) แยก request · token ใน header ไม่อยู่ใน body', async () => {
      await mkConn({ audienceId: null })
      const phone = `09${rnd8()}`
      const id = await mkOrder({ phone, conv: true })
      await markOrderPurchaserAfterCommit(id, 'FULLY_PAID')
      const calls: Call[] = []
      const sum = await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(okReply, calls), shopIds: [f.shop] })
      expect(sum).toMatchObject({ connections: 1, added: 2, stopped: 0 })

      const create = calls[0]
      expect(create.url).toMatch(/\/act_111222333\/customaudiences$/)
      expect(create.body).toMatchObject({
        name: `Deep · ลูกค้าที่ซื้อแล้ว · ร้านทดสอบ-${run}`, subtype: 'CUSTOM', customer_file_source: 'USER_PROVIDED_ONLY', audience_labels: ['GENERAL_CUSTOMERS'],
      })
      const adds = calls.slice(1)
      expect(adds.every((c) => c.method === 'POST' && /\/AUD1\/users$/.test(c.url))).toBe(true)
      const bySchema = Object.fromEntries(adds.map((c) => [c.body.payload!.schema, c.body.payload!]))
      expect(bySchema.UID).toEqual({ schema: 'UID', data: [`psid-${run}`], page_ids: [`page-${run}`] })
      expect(bySchema.PHONE).toEqual({ schema: 'PHONE', data: [phoneHash(phone)] })
      // BR-CA-01: ไม่มีเบอร์ดิบ/ชื่อ/ยอดเงินใน body ใด ๆ · token อยู่ใน header เท่านั้น
      const all = JSON.stringify(calls.map((c) => c.body))
      expect(all).not.toContain(phone)
      expect(all).not.toContain('SECRET_TOKEN')
      expect(calls.every((c) => c.auth === 'Bearer SECRET_TOKEN')).toBe(true)

      const conn = await prisma.metaAudienceConnection.findUniqueOrThrow({ where: { shopId: f.shop } })
      expect(conn).toMatchObject({ audienceId: 'AUD1', lastSyncedAt: NOW, lockedAt: null })
      expect((await members()).every((m) => m.syncedState === 'IN')).toBe(true)
    })

    it('ถอน = DELETE /users · แล้วรอบถัดไปไม่ส่งซ้ำ', async () => {
      await mkConn({ audienceId: 'AUD1' })
      await prisma.metaAudienceMember.create({ data: { shopId: f.shop, identityType: 'PHONE', identityKey: 'h1', desired: 'OUT', syncedState: 'IN' } })
      const calls: Call[] = []
      const fetchImpl = fakeFetch(okReply, calls)
      const s1 = await sweepMetaAudience({ now: NOW, fetchImpl, shopIds: [f.shop] })
      expect(s1.removed).toBe(1)
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({ method: 'DELETE' })
      expect(calls[0].url).toMatch(/\/AUD1\/users$/)
      const s2 = await sweepMetaAudience({ now: NOW, fetchImpl, shopIds: [f.shop] })
      expect(s2).toMatchObject({ added: 0, removed: 0 })
      expect(calls).toHaveLength(1)
    })

    it('ชุดเกิน 10,000 แถว แบ่งหลาย request', async () => {
      await mkConn({ audienceId: 'AUD1' })
      const rows = Array.from({ length: 10_050 }, (_, i) => ({ shopId: f.shop, identityType: 'PHONE', identityKey: `bulk-${i}`, desired: 'IN' }))
      for (let i = 0; i < rows.length; i += 2000) await prisma.metaAudienceMember.createMany({ data: rows.slice(i, i + 2000) })
      const calls: Call[] = []
      const sum = await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(okReply, calls), shopIds: [f.shop] })
      expect(sum.added).toBe(10_050)
      expect(calls.map((c) => c.body.payload!.data.length).sort((a, b) => b - a)).toEqual([10_000, 50])
    }, 60_000)

    it('audience ถูกลบใน Ads Manager → สร้างใหม่ + เติมทุกคนที่ IN ใหม่', async () => {
      await mkConn({ audienceId: 'OLD' })
      await prisma.metaAudienceMember.create({ data: { shopId: f.shop, identityType: 'PHONE', identityKey: 'h1', desired: 'IN', syncedState: 'IN' } })
      // ถึงจุดนี้ Meta ว่า OLD หาย — แต่ทุกคนถูกมองว่าส่งแล้ว: จำลองด้วยแถวที่ยังค้างหนึ่งแถวเพื่อให้เกิดการเรียก /OLD/users
      await prisma.metaAudienceMember.create({ data: { shopId: f.shop, identityType: 'PHONE', identityKey: 'h2', desired: 'IN' } })
      const calls: Call[] = []
      const reply = (c: Call) =>
        c.url.includes('/OLD/users') ? { status: 400, json: { error: { code: 100, error_subcode: 33, message: 'Unsupported get request. Object does not exist' } } }
        : c.url.endsWith('/customaudiences') ? { status: 200, json: { id: 'NEW' } }
        : { status: 200, json: {} }
      const sum = await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(reply, calls), shopIds: [f.shop] })
      expect(sum.stopped).toBe(0)
      expect((await prisma.metaAudienceConnection.findUniqueOrThrow({ where: { shopId: f.shop } })).audienceId).toBe('NEW')
      const newAdds = calls.filter((c) => c.url.includes('/NEW/users'))
      expect(newAdds).toHaveLength(1)
      expect(newAdds[0].body.payload!.data.sort()).toEqual(['h1', 'h2'])
    })

    it('token เสีย (190) → หยุดร้านนั้น + แจ้งเจ้าของครั้งเดียว · แถวยังค้าง ไม่นับครั้ง · ร้านอื่นไม่โดน', async () => {
      await mkConn({ audienceId: 'AUD1' })
      await mkConn({ audienceId: 'AUDX' }, f.other)
      await prisma.metaAudienceMember.create({ data: { shopId: f.shop, identityType: 'PHONE', identityKey: 'h1', desired: 'IN' } })
      await prisma.metaAudienceMember.create({ data: { shopId: f.other, identityType: 'PHONE', identityKey: 'hx', desired: 'IN' } })
      const reply = (c: Call) => (c.url.includes('/AUD1/') ? { status: 400, json: { error: { code: 190, message: 'expired' } } } : { status: 200, json: {} })
      const sum = await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(reply, []), shopIds: [f.shop, f.other] })
      expect(sum.stopped).toBe(1)
      expect(await prisma.metaAudienceConnection.findUniqueOrThrow({ where: { shopId: f.shop } })).toMatchObject({ status: 'STOPPED', stoppedReason: 'TOKEN_OR_PERMISSION' })
      expect(await prisma.metaAudienceConnection.findUniqueOrThrow({ where: { shopId: f.other } })).toMatchObject({ status: 'ACTIVE' })
      expect(pushMetaAudienceStopped).toHaveBeenCalledTimes(1)
      expect(pushMetaAudienceStopped).toHaveBeenCalledWith({ shopId: f.shop, reason: 'TOKEN_OR_PERMISSION' })
      expect((await members())[0]).toMatchObject({ syncedState: 'OUT', attempts: 0 })
      expect((await prisma.metaAudienceMember.findFirstOrThrow({ where: { shopId: f.other } })).syncedState).toBe('IN')
      // หยุดแล้วรอบถัดไปไม่ยิงอีก
      const calls: Call[] = []
      await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(reply, calls), shopIds: [f.shop] })
      expect(calls).toHaveLength(0)
    })

    it('ยังไม่ยอมรับข้อตกลง → หยุดด้วยเหตุผล TERMS_NOT_ACCEPTED + ลิงก์ในสถานะ', async () => {
      await mkConn({ audienceId: null })
      const reply = () => ({ status: 400, json: { error: { code: 100, message: 'Custom Audience Terms Not Accepted' } } })
      await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(reply, []), shopIds: [f.shop] })
      expect(pushMetaAudienceStopped).toHaveBeenCalledWith({ shopId: f.shop, reason: 'TERMS_NOT_ACCEPTED' })
      const st = await getAudienceStatus(f.shop)
      expect(st.connection).toMatchObject({ status: 'STOPPED', termsUrl: 'https://business.facebook.com/ads/manage/customaudiences/tos/?act=111222333' })
      expect(JSON.stringify(st)).not.toMatch(/tokenEnc|SECRET_TOKEN/)
    })

    it('ล้มชั่วคราว (5xx) → ลองใหม่ด้วย backoff ไม่หยุดร้าน', async () => {
      await mkConn({ audienceId: 'AUD1' })
      await prisma.metaAudienceMember.create({ data: { shopId: f.shop, identityType: 'PHONE', identityKey: 'h1', desired: 'IN' } })
      const calls: Call[] = []
      await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(() => ({ status: 503, json: null }), calls), shopIds: [f.shop] })
      const m = (await members())[0]
      expect(m.attempts).toBe(1)
      expect(m.nextAttemptAt.getTime()).toBeGreaterThan(NOW.getTime())
      expect((await prisma.metaAudienceConnection.findUniqueOrThrow({ where: { shopId: f.shop } })).status).toBe('ACTIVE')
      // ยังไม่ถึงเวลา = ไม่ยิง
      await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(() => ({ status: 503, json: null }), calls), shopIds: [f.shop] })
      expect(calls).toHaveLength(1)
    })

    it('ปิดใช้ (enabled=false) = ไม่ส่ง · ร้านที่ถูกเอาออกจากรายชื่อทดลอง = ไม่ส่ง', async () => {
      await mkConn({ audienceId: 'AUD1', enabled: false })
      await prisma.metaAudienceMember.create({ data: { shopId: f.shop, identityType: 'PHONE', identityKey: 'h1', desired: 'IN' } })
      const calls: Call[] = []
      await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(okReply, calls), shopIds: [f.shop] })
      await prisma.metaAudienceConnection.update({ where: { shopId: f.shop }, data: { enabled: true } })
      vi.stubEnv('META_AUDIENCE_PILOT_SHOP_IDS', 'someone-else')
      await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(okReply, calls), shopIds: [f.shop] })
      expect(calls).toHaveLength(0)
    })

    it('token ใกล้หมด (<7 วัน) → แจ้งครั้งเดียว', async () => {
      await mkConn({ audienceId: 'AUD1', tokenSource: 'OAUTH', tokenExpiresAt: new Date(NOW.getTime() + 3 * 864e5) })
      await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(okReply, []), shopIds: [f.shop] })
      await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(okReply, []), shopIds: [f.shop] })
      expect(pushMetaAudienceTokenExpiring).toHaveBeenCalledTimes(1)
      expect(pushMetaAudienceTokenExpiring).toHaveBeenCalledWith({ shopId: f.shop, daysLeft: 3 })
    })

    it('ตัวส่งสองตัวชนกัน: ร้านที่ถูกจองอยู่ (lockedAt สด) ถูกข้าม', async () => {
      await mkConn({ audienceId: 'AUD1', lockedAt: NOW })
      await prisma.metaAudienceMember.create({ data: { shopId: f.shop, identityType: 'PHONE', identityKey: 'h1', desired: 'IN' } })
      const calls: Call[] = []
      const sum = await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(okReply, calls), shopIds: [f.shop] })
      expect(sum.connections).toBe(0)
      expect(calls).toHaveLength(0)
    })

    it('เปิดใช้ครั้งแรก (backfilledAt ว่าง) → เติมย้อนหลังแล้วส่งในรอบเดียว', async () => {
      await mkConn({ audienceId: null, backfilledAt: null })
      const phone = `09${rnd8()}`
      await mkOrder({ phone })
      const calls: Call[] = []
      const sum = await sweepMetaAudience({ now: NOW, fetchImpl: fakeFetch(okReply, calls), shopIds: [f.shop] })
      expect(sum.added).toBe(1)
      expect(calls.at(-1)!.body.payload).toEqual({ schema: 'PHONE', data: [phoneHash(phone)] })
    })
  })

  describe('ตั้งค่า (FR-002/008)', () => {
    const verifyFetch = (status: number, json: unknown) => (async () => new Response(JSON.stringify(json), { status })) as unknown as typeof fetch

    it('ฟีเจอร์ปิด → FEATURE_DISABLED', async () => {
      vi.stubEnv('OPEN_META_AUDIENCE', '')
      await expect(getAudienceStatus(f.shop)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' })
    })

    it('กรอก token เอง: ตรวจกับ Meta แล้วเก็บแบบเข้ารหัส · สถานะไม่มี token · เปิดได้หลังเชื่อม', async () => {
      await expect(setAudienceEnabled(f.shop, true)).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
      await connectManual(f.shop, { adAccountId: '999000111', token: 'MY_SYSTEM_TOKEN' }, verifyFetch(200, { name: 'บัญชีร้าน' }))
      const row = await prisma.metaAudienceConnection.findUniqueOrThrow({ where: { shopId: f.shop } })
      expect(row.tokenEnc).not.toContain('MY_SYSTEM_TOKEN')
      expect(row).toMatchObject({ adAccountName: 'บัญชีร้าน', tokenSource: 'MANUAL', enabled: false, tokenExpiresAt: null })
      await setAudienceEnabled(f.shop, true)
      const st = await getAudienceStatus(f.shop)
      expect(st.connection).toMatchObject({ enabled: true, status: 'ACTIVE', counts: { synced: 0, pending: 0 } })
      expect(JSON.stringify(st)).not.toContain('MY_SYSTEM_TOKEN')
    })

    it('token ไม่ผ่าน → TOKEN_INVALID ไม่เก็บอะไร', async () => {
      await expect(
        connectManual(f.shop, { adAccountId: '999000111', token: 'BAD_TOKEN_123' }, verifyFetch(400, { error: { code: 190, message: 'bad' } })),
      ).rejects.toBeInstanceOf(AudienceError)
      expect(await prisma.metaAudienceConnection.count({ where: { shopId: f.shop } })).toBe(0)
    })

    it('เปลี่ยนบัญชีโฆษณา → ล้าง audience + ทุกแถวกลับเป็นยังไม่ส่ง · ปิดใช้ไม่ลบอะไร · ตัดการเชื่อมล้างแถว', async () => {
      await mkConn({ audienceId: 'AUD1', audienceName: 'n' })
      await prisma.metaAudienceMember.create({ data: { shopId: f.shop, identityType: 'PHONE', identityKey: 'h1', desired: 'IN', syncedState: 'IN' } })
      await connectManual(f.shop, { adAccountId: '777', token: 'NEW_TOKEN_12345' }, verifyFetch(200, { name: 'อีกบัญชี' }))
      expect(await prisma.metaAudienceConnection.findUniqueOrThrow({ where: { shopId: f.shop } })).toMatchObject({ adAccountId: '777', audienceId: null })
      expect((await members())[0].syncedState).toBe('OUT')
      await setAudienceEnabled(f.shop, false)
      expect(await prisma.metaAudienceMember.count({ where: { shopId: f.shop } })).toBe(1)
      await disconnectAudience(f.shop)
      expect(await prisma.metaAudienceConnection.count({ where: { shopId: f.shop } })).toBe(0)
      expect(await prisma.metaAudienceMember.count({ where: { shopId: f.shop } })).toBe(0)
    })

    it('เปิดไม่ได้ขณะ STOPPED', async () => {
      await mkConn({ status: 'STOPPED', enabled: false })
      await expect(setAudienceEnabled(f.shop, true)).rejects.toMatchObject({ code: 'CONNECTION_STOPPED' })
    })
  })
})
