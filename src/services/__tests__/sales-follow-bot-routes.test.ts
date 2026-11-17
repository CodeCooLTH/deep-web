/**
 * 00095 S-6 — route ของบอทติดตามยอดขาย บน Postgres จริง (API §5 ทุก error code · ข้ามร้าน · บทบาท · ด่านร้านนำร่อง)
 * mock แค่ session · 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะร้าน/ผู้ใช้ที่เทสสร้างเอง (cascade)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))
const sess: { current: unknown } = { current: null }
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => sess.current) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

import * as botsRoute from '@/app/api/shops/current/sales-follow-bot/bots/route'
import * as botRoute from '@/app/api/shops/current/sales-follow-bot/bots/[id]/route'
import * as statusRoute from '@/app/api/shops/current/sales-follow-bot/bots/[id]/status/route'
import * as optionsRoute from '@/app/api/shops/current/sales-follow-bot/options/route'
import * as roomsRoute from '@/app/api/shops/current/sales-follow-bot/test-rooms/route'
import * as sendsRoute from '@/app/api/shops/current/sales-follow-bot/sends/route'
import * as panelRoute from '@/app/api/chat/conversations/[id]/follow-bot/route'
import * as stopRoute from '@/app/api/chat/conversations/[id]/follow-bot/stop/route'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const BASE = 'http://seller.deepth.local/api/shops/current/sales-follow-bot'

const S = { dual: '', owner: '', chat: '', bill: '', tech: '', other: '', shop: '', shopB: '', salesless: '', ch: '', chB: '', conv: '', convB: '' }
const as = (userId: string | null, shopId?: string) => { sess.current = userId ? { user: { id: userId, activeShopId: shopId ?? S.shop } } : null }
const req = (path: string, method = 'GET', body?: unknown) =>
  new NextRequest(`${BASE}${path}`, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const step = (delayMin = 30, text = 'สวัสดีค่ะ คุณ{ชื่อ}') => ({ delayMin, parts: [{ kind: 'TEXT', text }] })
const botBody = (o: Record<string, unknown> = {}) => ({ name: `บอท ${randomUUID().slice(0, 6)}`, conditionMatch: 'ALL', rules: [{ field: 'stage', op: 'is', values: ['NOT_BOUGHT'] }], channelIds: [S.ch], steps: [step()], ...o })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, any> })
const mk = async (o: Record<string, unknown> = {}) => (await json(await botsRoute.POST(req('/bots', 'POST', botBody(o))))).body
const resetBots = () => db.salesFollowBot.updateMany({ where: { shopId: { in: [S.shop, S.shopB] } }, data: { status: 'CLOSED', deletedAt: new Date() } })
const ids = (xs: { id?: string; conversationId?: string }[]) => xs.map((x) => x.id ?? x.conversationId)

describe.skipIf(!isLocal)('sales-follow-bot routes (DB จริง)', () => {
  const prevEnv = process.env.SALES_FOLLOW_BOT_SHOP_IDS
  const pilot = () => `${S.shop},${S.shopB},${S.salesless}`
  beforeAll(async () => {
    const mkU = (n: string) => db.user.create({ data: { displayName: `sfbr-${n}-${run}`, username: `sfbr_${n}_${run}` }, select: { id: true } })
    const [owner, chat, bill, tech, other] = await Promise.all(['o', 'c', 'b', 't', 'x'].map(mkU))
    // chatScopeMode UNIFIED = กล่องแชทรวมหลายร้าน (ขอบเขตร้านของ resolveConversationShopId)
    const dual = await db.user.create({ data: { displayName: `sfbr-d-${run}`, username: `sfbr_d_${run}`, chatScopeMode: 'UNIFIED' }, select: { id: true } })
    const mkShop = (userId: string, n: string, vertical = 'ONLINE_SALES') => db.shop.create({ data: { userId, shopName: `sfbr-${n}-${run}`, kind: 'BUSINESS', vertical } as never, select: { id: true } })
    const [shop, shopB, salesless] = await Promise.all([mkShop(owner.id, 'a'), mkShop(other.id, 'b'), mkShop(owner.id, 'svc', 'SERVICE_QUEUE')])
    for (const sid of [shop.id, salesless.id]) {
      await db.shopMember.create({ data: { shopId: sid, userId: owner.id, role: 'OWNER', roles: [] } })
      for (const [u, r] of [[chat.id, 'CHAT'], [bill.id, 'BILLING'], [tech.id, 'TECHNICIAN']]) await db.shopMember.create({ data: { shopId: sid, userId: u, role: 'ADMIN', roles: [r] } })
    }
    await db.shopMember.create({ data: { shopId: shopB.id, userId: other.id, role: 'OWNER', roles: [] } })
    // สมาชิก 2 ร้าน (กล่องแชทรวม 00037): ตอบแชททั้ง A และ B · tech เป็นช่างของร้าน B (ไม่มี H1/H2)
    for (const sid of [shop.id, shopB.id]) await db.shopMember.create({ data: { shopId: sid, userId: dual.id, role: 'ADMIN', roles: ['CHAT'] } })
    await db.shopMember.create({ data: { shopId: shopB.id, userId: tech.id, role: 'ADMIN', roles: ['TECHNICIAN'] } })
    const mkCh = (shopId: string, userId: string, n: string) =>
      db.shopChannel.create({ data: { shopId, provider: 'MESSENGER', externalId: `sfbr-${n}-${run}`, name: `เพจ ${n}`, accessTokenEnc: 'x', connectedByUserId: userId } as never, select: { id: true } })
    const [ch, chB] = await Promise.all([mkCh(shop.id, owner.id, 'a'), mkCh(shopB.id, other.id, 'b')])
    const mkConv = async (shopId: string, chId: string) => {
      const ec = await db.externalContact.create({ data: { shopChannelId: chId, externalUserId: `psid-${randomUUID().slice(0, 8)}`, name: 'สมชาย' } as never, select: { id: true } })
      return (await db.conversation.create({ data: { shopId, channel: 'MESSENGER', shopChannelId: chId, externalContactId: ec.id, lastInboundAt: new Date() }, select: { id: true } })).id
    }
    Object.assign(S, { dual: dual.id, owner: owner.id, chat: chat.id, bill: bill.id, tech: tech.id, other: other.id, shop: shop.id, shopB: shopB.id, salesless: salesless.id, ch: ch.id, chB: chB.id })
    S.conv = await mkConv(shop.id, ch.id)
    S.convB = await mkConv(shopB.id, chB.id)
    process.env.SALES_FOLLOW_BOT_SHOP_IDS = pilot()
    as(S.owner)
  })
  afterAll(async () => {
    if (prevEnv === undefined) delete process.env.SALES_FOLLOW_BOT_SHOP_IDS
    else process.env.SALES_FOLLOW_BOT_SHOP_IDS = prevEnv
    // scope ด้วยร้าน/ผู้ใช้ที่เทสสร้างเอง (HR13) — ร้าน cascade ห้อง/บอท/ช่อง
    await db.shop.deleteMany({ where: { id: { in: [S.shop, S.shopB, S.salesless] } } })
    await db.user.deleteMany({ where: { id: { in: [S.owner, S.chat, S.bill, S.tech, S.other, S.dual] } } })
    await db.$disconnect()
  })

  describe('สิทธิ์/ด่าน', () => {
    const calls: [string, () => Promise<Response>][] = [
      ['GET bots', () => botsRoute.GET()],
      ['POST bots', () => botsRoute.POST(req('/bots', 'POST', botBody()))],
      ['GET bot', () => botRoute.GET(req('/bots/x'), p(randomUUID()))],
      ['PATCH bot', () => botRoute.PATCH(req('/bots/x', 'PATCH', { expectedUpdatedAt: new Date().toISOString() }), p(randomUUID()))],
      ['DELETE bot', () => botRoute.DELETE(req(`/bots/x?expectedUpdatedAt=${new Date().toISOString()}`, 'DELETE'), p(randomUUID()))],
      ['PUT status', () => statusRoute.PUT(req('/bots/x/status', 'PUT', { status: 'CLOSED', expectedUpdatedAt: new Date().toISOString() }), p(randomUUID()))],
      ['GET options', () => optionsRoute.GET()],
      ['GET test-rooms', () => roomsRoute.GET(req(`/test-rooms?channelIds=${S.ch}`))],
      ['GET sends', () => sendsRoute.GET(req('/sends'))],
      ['stop', () => stopRoute.POST(req('/x', 'POST'), p(S.conv))],
      ['GET panel', () => panelRoute.GET(req('/x'), p(S.conv))],
    ]
    it.each(calls)('%s: ไม่มี session = 401', async (_n, call) => {
      as(null)
      expect((await call()).status).toBe(401)
    })
    it.each(calls)('%s: BILLING/TECHNICIAN = 403', async (_n, call) => {
      for (const u of [S.bill, S.tech]) {
        as(u)
        expect((await call()).status).toBe(403)
      }
    })
    it('CHAT ผ่านด่านสิทธิ์ (H2) · คนนอกร้านที่ส่ง activeShopId ของร้านนี้ไม่ได้ข้อมูล', async () => {
      as(S.chat)
      expect((await botsRoute.GET()).status).toBe(200)
      as(S.other, S.shop)
      expect((await botsRoute.GET()).status).not.toBe(200) // ไม่ถอยไปร้านอื่นแล้วตอบข้อมูลร้านนี้
    })
    it('ร้านไม่อยู่ในรายชื่อนำร่อง = 403 FEATURE_NOT_ENABLED ทุก endpoint · แผง available:false · stop ยังหยุดได้', async () => {
      process.env.SALES_FOLLOW_BOT_SHOP_IDS = S.shopB
      try {
        as(S.owner)
        for (const [n, call] of calls.filter(([n]) => !['stop', 'GET panel'].includes(n))) {
          const r = await json(await call())
          expect([n, r.status, r.body.error]).toEqual([n, 403, 'FEATURE_NOT_ENABLED'])
        }
        expect((await json(await panelRoute.GET(req('/x'), p(S.conv)))).body).toEqual({ available: false })
        expect((await json(await stopRoute.POST(req('/x', 'POST'), p(S.conv)))).status).toBe(200)
      } finally {
        process.env.SALES_FOLLOW_BOT_SHOP_IDS = pilot()
      }
    })
    it('ร้านไม่ใช่ ONLINE_SALES = 409 NOT_AVAILABLE_FOR_SHOP', async () => {
      as(S.owner, S.salesless)
      for (const call of [() => botsRoute.GET(), () => optionsRoute.GET(), () => sendsRoute.GET(req('/sends')), () => botsRoute.POST(req('/bots', 'POST', botBody()))]) {
        const r = await json(await call())
        expect([r.status, r.body.error]).toEqual([409, 'NOT_AVAILABLE_FOR_SHOP'])
      }
      as(S.owner)
    })
  })

  describe('bots CRUD', () => {
    it('สร้าง 201 CLOSED เสมอ (ไม่รับ status) · อ่านรายการ/รายตัว · adOnly คำนวณฝั่งเซิร์ฟเวอร์', async () => {
      await resetBots()
      const r = await json(await botsRoute.POST(req('/bots', 'POST', botBody({ status: 'ACTIVE', steps: [{ ...step(30), adOnly: false }, step(1400)] }))))
      expect(r.status).toBe(201)
      expect(r.body).toMatchObject({ status: 'CLOSED', totalDelayMin: 1430 })
      expect(r.body.steps.map((s: { adOnly: boolean }) => s.adOnly)).toEqual([false, true])
      expect(ids((await json(await botsRoute.GET())).body.bots)).toContain(r.body.id)
      expect((await json(await botRoute.GET(req('/x'), p(r.body.id)))).body.id).toBe(r.body.id)
    })

    it('VALIDATION_ERROR: issues มี stepIndex/partIndex · ไม่มีเงื่อนไข · ไม่ใช่ JSON · ชนิดผิด', async () => {
      const bad = await json(await botsRoute.POST(req('/bots', 'POST', botBody({ steps: [step(), { delayMin: 5, parts: [{ kind: 'TEXT', text: '   ' }, { kind: 'TEXT', text: 'สวัสดี {อะไร}' }] }] }))))
      expect([bad.status, bad.body.error]).toEqual([400, 'VALIDATION_ERROR'])
      expect(bad.body.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'PART_TEXT_REQUIRED', stepIndex: 1, partIndex: 0 }),
        expect.objectContaining({ code: 'UNKNOWN_VARIABLE', stepIndex: 1, partIndex: 1, name: 'อะไร' }),
      ]))
      const none = await json(await botsRoute.POST(req('/bots', 'POST', botBody({ rules: [] }))))
      expect(none.body.issues).toEqual([expect.objectContaining({ code: 'NO_CONDITION' })])
      const raw = await json(await botsRoute.POST(new NextRequest(`${BASE}/bots`, { method: 'POST', body: 'not json' })))
      expect([raw.status, raw.body.error]).toEqual([400, 'VALIDATION_ERROR'])
      const shape = await json(await botsRoute.POST(req('/bots', 'POST', botBody({ steps: [{ delayMin: 'x', parts: 1 }] }))))
      expect(shape.status).toBe(400)
      expect(shape.body.issues[0]).toMatchObject({ stepIndex: 0 })
    })

    it('CHANNEL_NOT_FOUND (ช่องร้านอื่น/ไม่มี) · TAG_NOT_FOUND พร้อม names', async () => {
      for (const id of [S.chB, randomUUID()]) {
        const r = await json(await botsRoute.POST(req('/bots', 'POST', botBody({ channelIds: [id] }))))
        expect([r.status, r.body]).toEqual([400, { error: 'CHANNEL_NOT_FOUND' }])
      }
      const t = await json(await botsRoute.POST(req('/bots', 'POST', botBody({ rules: [{ field: 'stage', op: 'is', values: ['NOT_BOUGHT'] }, { field: 'tag', op: 'has_none', values: ['ไม่มีแท็กนี้'] }] }))))
      expect([t.status, t.body]).toEqual([400, { error: 'TAG_NOT_FOUND', names: ['ไม่มีแท็กนี้'] }])
    })

    it('ข้ามร้าน: id ของร้านอื่น = 404 NOT_FOUND ทั้ง GET/PATCH/DELETE/PUT status · ไม่ถูกแก้/ลบ', async () => {
      await resetBots()
      as(S.other, S.shopB)
      const theirs = await mk({ channelIds: [S.chB] })
      expect(theirs.id).toBeTruthy()
      as(S.owner)
      const results = await Promise.all([
        botRoute.GET(req('/x'), p(theirs.id)),
        botRoute.PATCH(req('/x', 'PATCH', { name: 'แฮก', expectedUpdatedAt: theirs.updatedAt }), p(theirs.id)),
        botRoute.DELETE(req(`/x?expectedUpdatedAt=${encodeURIComponent(theirs.updatedAt)}`, 'DELETE'), p(theirs.id)),
        statusRoute.PUT(req('/x', 'PUT', { status: 'CLOSED', expectedUpdatedAt: theirs.updatedAt }), p(theirs.id)),
        botRoute.GET(req('/x'), p('ไม่ใช่-uuid')),
      ])
      for (const r of results) expect([r.status, (await r.json()).error]).toEqual([404, 'NOT_FOUND'])
      const row = await db.salesFollowBot.findUniqueOrThrow({ where: { id: theirs.id } })
      expect([row.deletedAt, row.name]).toEqual([null, theirs.name])
      expect(ids((await json(await botsRoute.GET())).body.bots)).not.toContain(theirs.id)
    })

    it('BOT_STALE (PATCH/DELETE/PUT) พร้อม currentUpdatedAt · PATCH สำเร็จคืน stoppedRuns', async () => {
      await resetBots()
      const b = await mk()
      const ok = await json(await botRoute.PATCH(req('/x', 'PATCH', { name: 'ชื่อใหม่', expectedUpdatedAt: b.updatedAt }), p(b.id)))
      expect(ok.status).toBe(200)
      expect(ok.body).toMatchObject({ name: 'ชื่อใหม่', stoppedRuns: 0 })
      const stale = await json(await botRoute.PATCH(req('/x', 'PATCH', { name: 'อีกที', expectedUpdatedAt: b.updatedAt }), p(b.id)))
      expect([stale.status, stale.body]).toEqual([409, { error: 'BOT_STALE', currentUpdatedAt: ok.body.updatedAt }])
      const stDel = await json(await botRoute.DELETE(req(`/x?expectedUpdatedAt=${encodeURIComponent(b.updatedAt)}`, 'DELETE'), p(b.id)))
      expect([stDel.status, stDel.body.error]).toEqual([409, 'BOT_STALE'])
      const stPut = await json(await statusRoute.PUT(req('/x', 'PUT', { status: 'ACTIVE', expectedUpdatedAt: b.updatedAt }), p(b.id)))
      expect([stPut.status, stPut.body.error]).toEqual([409, 'BOT_STALE'])
    })

    it('PATCH ผลรวมไม่ผ่าน = 400 · ขาด expectedUpdatedAt = 400 · DELETE ไม่มี query = 400', async () => {
      await resetBots()
      const b = await mk()
      const none = await json(await botRoute.PATCH(req('/x', 'PATCH', { rules: [], expectedUpdatedAt: b.updatedAt }), p(b.id)))
      expect([none.status, none.body.error]).toEqual([400, 'VALIDATION_ERROR'])
      expect(none.body.issues).toEqual([expect.objectContaining({ code: 'NO_CONDITION' })])
      expect((await botRoute.PATCH(req('/x', 'PATCH', { name: 'x' }), p(b.id))).status).toBe(400)
      expect((await botRoute.DELETE(req('/x', 'DELETE'), p(b.id))).status).toBe(400)
    })

    it('CHANNEL_CONFLICT: ACTIVE ชนบอทอื่นช่อง+สถานะเดียวกัน → conflicts[] · สร้างใหม่ชนก็ 409 · ลบแล้ว 200 + หาไม่เจอ', async () => {
      await resetBots()
      const a = await mk({ name: 'บอท A' })
      const b = await mk({ name: 'บอท B' })
      const on = await json(await statusRoute.PUT(req('/x', 'PUT', { status: 'ACTIVE', expectedUpdatedAt: a.updatedAt }), p(a.id)))
      expect([on.status, on.body.status]).toEqual([200, 'ACTIVE'])
      const clash = await json(await statusRoute.PUT(req('/x', 'PUT', { status: 'ACTIVE', expectedUpdatedAt: b.updatedAt }), p(b.id)))
      expect([clash.status, clash.body.error]).toEqual([409, 'CHANNEL_CONFLICT'])
      expect(clash.body.conflicts).toEqual([expect.objectContaining({ channelId: S.ch, botId: a.id, botName: 'บอท A' })])
      const dup = await json(await botsRoute.POST(req('/bots', 'POST', botBody())))
      expect([dup.status, dup.body.error]).toEqual([409, 'CHANNEL_CONFLICT'])
      const del = await json(await botRoute.DELETE(req(`/x?expectedUpdatedAt=${encodeURIComponent(on.body.updatedAt)}`, 'DELETE'), p(a.id)))
      expect([del.status, del.body]).toEqual([200, { deleted: true, stoppedRuns: 0 }])
      expect((await json(await botRoute.GET(req('/x'), p(a.id)))).status).toBe(404)
    })

    it('PUT status: TEST_ROOMS_REQUIRED · TEST_ROOM_NOT_FOUND (ห้องร้านอื่น) · TESTING สำเร็จ · status ผิด = 400', async () => {
      await resetBots()
      const b = await mk()
      const none = await json(await statusRoute.PUT(req('/x', 'PUT', { status: 'TESTING', expectedUpdatedAt: b.updatedAt }), p(b.id)))
      expect([none.status, none.body]).toEqual([400, { error: 'TEST_ROOMS_REQUIRED' }])
      const foreign = await json(await statusRoute.PUT(req('/x', 'PUT', { status: 'TESTING', testRoomIds: [S.convB], expectedUpdatedAt: b.updatedAt }), p(b.id)))
      expect([foreign.status, foreign.body]).toEqual([400, { error: 'TEST_ROOM_NOT_FOUND' }])
      const ok = await json(await statusRoute.PUT(req('/x', 'PUT', { status: 'TESTING', testRoomIds: [S.conv], expectedUpdatedAt: b.updatedAt }), p(b.id)))
      expect([ok.status, ok.body.status]).toEqual([200, 'TESTING'])
      expect((await statusRoute.PUT(req('/x', 'PUT', { status: 'NOPE', expectedUpdatedAt: ok.body.updatedAt }), p(b.id))).status).toBe(400)
    })
  })

  describe('options · test-rooms · sends', () => {
    it('options: เฉพาะช่องของร้าน + limits', async () => {
      const r = await json(await optionsRoute.GET())
      expect(r.status).toBe(200)
      expect(ids(r.body.channels)).toEqual([S.ch])
      expect(r.body.limits.maxSteps).toBe(10)
    })
    it('test-rooms: ช่องร้านอื่นไม่ปรากฏ (ไม่ error) · ขาด/ไม่ใช่ uuid = 400', async () => {
      const mine = await json(await roomsRoute.GET(req(`/test-rooms?channelIds=${S.ch}`)))
      expect(ids(mine.body.rooms)).toEqual([S.conv])
      const theirs = await json(await roomsRoute.GET(req(`/test-rooms?channelIds=${S.chB}`)))
      expect([theirs.status, theirs.body]).toEqual([200, { rooms: [] }])
      expect((await roomsRoute.GET(req('/test-rooms'))).status).toBe(400)
      expect((await roomsRoute.GET(req('/test-rooms?channelIds=zzz'))).status).toBe(400)
    })
    it('sends: cursor ปลอม = 200 ว่าง · limit เกิน/ไม่ใช่ตัวเลข = 200', async () => {
      for (const c of ['ปลอม', 'AAAA', Buffer.from('x|y').toString('base64url')]) {
        const r = await json(await sendsRoute.GET(req(`/sends?cursor=${encodeURIComponent(c)}`)))
        expect([r.status, r.body]).toEqual([200, { items: [], nextCursor: null }])
      }
      expect((await sendsRoute.GET(req('/sends?limit=9999'))).status).toBe(200)
      expect((await sendsRoute.GET(req('/sends?limit=abc'))).status).toBe(200)
    })
  })

  describe('แผง/หยุดในห้อง', () => {
    it('panel: ห้องตัวเอง = available · ห้องร้านอื่น = 404 · stop ซ้ำ/ไม่มี run = 200 stopped:false · stop ห้องร้านอื่น = 404', async () => {
      const ok = await json(await panelRoute.GET(req('/x'), p(S.conv)))
      expect([ok.status, ok.body]).toEqual([200, { available: true, run: null }])
      const other = await json(await panelRoute.GET(req('/x'), p(S.convB)))
      expect([other.status, other.body]).toEqual([404, { error: 'NOT_FOUND' }])
      for (let i = 0; i < 2; i++) {
        const s = await json(await stopRoute.POST(req('/x', 'POST'), p(S.conv)))
        expect([s.status, s.body]).toEqual([200, { stopped: false }])
      }
      const foreign = await json(await stopRoute.POST(req('/x', 'POST'), p(S.convB)))
      expect([foreign.status, foreign.body]).toEqual([404, { error: 'NOT_FOUND' }])
    })
    it('panel: CHAT ผ่าน (H1)', async () => {
      as(S.chat)
      expect((await panelRoute.GET(req('/x'), p(S.conv))).status).toBe(200)
      as(S.owner)
    })
  })

  describe('ห้องของอีกร้าน (กล่องแชทรวม 00037) — ด่านตามร้านเจ้าของห้อง', () => {
    it('สมาชิก 2 ร้าน active A เปิดห้องร้าน B → แผง 200 · stop 200', async () => {
      as(S.dual, S.shop)
      const panel = await json(await panelRoute.GET(req('/x'), p(S.convB)))
      expect([panel.status, panel.body]).toEqual([200, { available: true, run: null }])
      expect((await json(await stopRoute.POST(req('/x', 'POST'), p(S.convB)))).body).toEqual({ stopped: false })
    })
    it('ผู้ใช้โหมด SINGLE ที่ active A เปิดห้องร้าน B → ไม่ได้ข้อมูล (ขอบเขตตามโหมดแชทเหมือน route พี่น้อง)', async () => {
      as(S.chat, S.shop)
      expect((await panelRoute.GET(req('/x'), p(S.convB))).status).not.toBe(200)
    })
    it('ไม่ใช่สมาชิกร้าน B → 404 ทั้งแผงและ stop (ไม่ใช่ 403)', async () => {
      as(S.bill, S.shop)
      for (const r of [await panelRoute.GET(req('/x'), p(S.convB)), await stopRoute.POST(req('/x', 'POST'), p(S.convB))]) {
        expect([r.status, (await r.json()).error]).toEqual([404, 'NOT_FOUND'])
      }
    })
    it('เป็นสมาชิกร้าน B แต่บทบาท (ช่าง) ไม่มี H1/H2 → 403', async () => {
      as(S.tech, S.shop)
      expect((await panelRoute.GET(req('/x'), p(S.convB))).status).toBe(403)
      expect((await stopRoute.POST(req('/x', 'POST'), p(S.convB))).status).toBe(403)
    })
  })
})
