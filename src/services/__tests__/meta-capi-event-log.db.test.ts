/**
 * meta-capi-event-log.db.test.ts — 00097: เหตุการณ์ CAPI ต่อห้อง/ต่อคำสั่งซื้อ + ตัวกรองหน้าบันทึก บน Postgres จริง
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import * as v from 'valibot'
import { prisma } from '@/lib/prisma'
import { encryptToken } from '@/lib/token-crypto'
import { CapiLogQuerySchema } from '@/lib/validations'
import { addCapiDataset, listCapiLog, listConversationCapiEvents, listOrderCapiEvents } from '@/services/meta-capi-settings.service'

process.env.CHANNEL_TOKEN_KEY ||= 'ab'.repeat(32)
const url = process.env.DATABASE_URL ?? ''
const d = /@(localhost|127\.0\.0\.1):5434\//.test(url) ? describe : describe.skip
const run = randomUUID().slice(0, 8)
const ids = { users: [] as string[], shops: [] as string[] }
const f: Record<string, string> = {}
const code = (p: Promise<unknown>) => p.then(() => 'NO_ERROR', (e) => (e as { code?: string }).code ?? String(e))
const T0 = new Date('2026-11-16T04:00:00Z').getTime()
const at = (s: number) => new Date(T0 + s * 1000)

d('00097 เหตุการณ์ CAPI ต่อห้อง/คำสั่งซื้อ (DB local)', () => {
  const ev = (o: { shop?: string; ds: string; conv: string | null; key: string; dk: string; status?: string; reason?: string | null; payload?: object; s: number; sentAt?: Date | null }) =>
    prisma.metaCapiEvent.create({
      data: {
        shopId: o.shop ?? f.shop, datasetRowId: o.ds, conversationId: o.conv, eventKey: o.key, dedupeKey: o.dk, eventTime: at(o.s), pageId: 'page-x',
        psid: 'PSID-SECRET', payload: o.payload ?? {}, status: o.status ?? 'SENT', reason: o.reason ?? null, attempts: 1, createdAt: at(o.s), sentAt: o.sentAt ?? null,
        lastRequest: 'REQ-SECRET', lastResponse: 'RES-SECRET', lastHttpStatus: 200,
      },
    })

  beforeAll(async () => {
    vi.stubEnv('OPEN_META_CAPI', '1')
    vi.stubEnv('META_CAPI_PILOT_SHOP_IDS', '')
    const mkShop = async (tag: string, page: string) => {
      const u = await prisma.user.create({ data: { displayName: `${tag}-${run}`, username: `${tag}97_${run}` }, select: { id: true } })
      ids.users.push(u.id)
      const s = await prisma.shop.create({ data: { userId: u.id, shopName: `${tag}-${run}` } as never, select: { id: true } })
      ids.shops.push(s.id)
      const ch = await prisma.shopChannel.create({
        data: { shopId: s.id, provider: 'MESSENGER', externalId: page, name: `เพจ ${tag}`, accessTokenEnc: encryptToken('PAGE_TOKEN'), connectedByUserId: u.id },
        select: { id: true },
      })
      return { shop: s.id, channel: ch.id, user: u.id }
    }
    const pg = (n: number) => `97${n}${String(parseInt(run, 16)).padStart(10, '0')}`
    const a = await mkShop('a', pg(1))
    const b = await mkShop('b', pg(2))
    Object.assign(f, { shop: a.shop, channel: a.channel, shopB: b.shop, channelB: b.channel })
    const dsMain = await addCapiDataset(a.shop, a.channel, { source: 'MANUAL', datasetId: '1001', token: 'T', label: 'หลัก' })
    const dsWeb = await addCapiDataset(a.shop, a.channel, { source: 'MANUAL', datasetId: '1002', token: 'T', label: 'เว็บ' })
    const dsThird = await addCapiDataset(a.shop, a.channel, { source: 'MANUAL', datasetId: '1003', token: 'T', label: 'สาม' })
    const dsB = await addCapiDataset(b.shop, b.channel, { source: 'MANUAL', datasetId: '2001', token: 'T', label: 'ของอื่น' })
    Object.assign(f, { dsMain: dsMain.id, dsWeb: dsWeb.id, dsThird: dsThird.id, dsB: dsB.id })
    const conv = (shopId: string, shopChannelId: string | null, channel = 'MESSENGER') =>
      prisma.conversation.create({ data: { shopId, channel, shopChannelId } as never, select: { id: true } }).then((c) => c.id)
    f.convA = await conv(a.shop, a.channel)
    f.convC = await conv(a.shop, a.channel)
    f.convBig = await conv(a.shop, a.channel)
    f.convLine = await conv(a.shop, null, 'LINE')
    f.convB = await conv(b.shop, b.channel)
    const order = (shopId: string, conversationId: string | null, n: string) =>
      prisma.order.create({ data: { shopId, type: 'PHYSICAL', totalAmount: 1070, buyerContact: `08${run}`, orderNo: `DP-${n}-${run}`, conversationId } as never, select: { id: true, publicToken: true, conversationId: true } })
    f.o1 = (await order(a.shop, f.convA, 'O1')).id
    const o1 = await prisma.order.findUniqueOrThrow({ where: { id: f.o1 }, select: { id: true, publicToken: true, conversationId: true } })
    const o2 = await order(a.shop, null, 'O2') // ไม่ผูกห้อง — การ์ดส่งในห้อง C
    const o4 = await order(a.shop, f.convA, 'O4') // ผูกห้อง Messenger ไม่มีแถว
    const o5 = await order(a.shop, null, 'O5') // ไม่ผูกห้อง ไม่เคยส่งการ์ด
    const oB = await order(b.shop, f.convB, 'OB')
    Object.assign(f, { o1t: o1.publicToken, o2: o2.id, o2t: o2.publicToken, o4: o4.id, o4t: o4.publicToken, o5: o5.id, o5t: o5.publicToken, oBt: oB.publicToken })
    await prisma.chatMessage.create({ data: { conversationId: f.convC, senderRole: 'SHOP', type: 'ORDER', orderRefToken: o2.publicToken } as never })
    await prisma.chatMessage.create({ data: { conversationId: f.convB, senderRole: 'SHOP', type: 'ORDER', orderRefToken: o1.publicToken } as never }) // ห้องของร้านอื่น ห้องนับ

    // ห้อง A: ORDER_CREATED/PURCHASE ของ O1 + VIEW_CONTENT ที่ไม่มี orderId
    await ev({ ds: dsMain.id, conv: f.convA, key: 'ORDER_CREATED', dk: 'oc1', payload: { value: 1070, orderId: f.o1 }, s: 10, sentAt: at(40) })
    await ev({ ds: dsMain.id, conv: f.convA, key: 'PURCHASE', dk: 'pu1', payload: { value: 1070, orderId: f.o1, items: [{ id: 'SECRET-ITEM' }] }, s: 20, sentAt: at(60) })
    await ev({ ds: dsWeb.id, conv: f.convA, key: 'PURCHASE', dk: 'pu1', payload: { value: 1070, orderId: f.o1 }, s: 21, status: 'PENDING', reason: 'TOKEN_OR_PERMISSION' })
    await ev({ ds: dsMain.id, conv: f.convA, key: 'VIEW_CONTENT', dk: 'vc1', payload: { value: 50 }, s: 5 })
    // ห้อง C: INITIATE_CHECKOUT ของ O2 (การ์ดส่งในห้องนี้)
    await ev({ ds: dsMain.id, conv: f.convC, key: 'INITIATE_CHECKOUT', dk: 'ic2', payload: { orderId: f.o2 }, s: 30, status: 'FAILED', reason: 'REJECTED' })
    // ร้านอื่น: ปลอม payload.orderId = O1 และ conversationId เดียวกับห้อง A / ห้องของตัวเอง
    await ev({ shop: b.shop, ds: dsB.id, conv: f.convA, key: 'PURCHASE', dk: 'fake1', payload: { orderId: f.o1 }, s: 25 })
    await ev({ shop: b.shop, ds: dsB.id, conv: f.convB, key: 'PURCHASE', dk: 'fakeB', payload: { orderId: f.o1 }, s: 26 })
    await ev({ shop: b.shop, ds: dsB.id, conv: f.convB, key: 'PURCHASE', dk: 'ownB', payload: { orderId: oB.id }, s: 27 })
    // ห้องใหญ่: แถวเดี่ยวใหม่สุด + 100 กลุ่ม × 3 ชุด = 301 แถว
    await ev({ ds: dsMain.id, conv: f.convBig, key: 'VIEW_CONTENT', dk: 'solo', s: 2000 })
    for (let g = 0; g < 100; g++)
      for (const ds of [dsMain.id, dsWeb.id, dsThird.id]) await ev({ ds, conv: f.convBig, key: 'ADD_PAYMENT_INFO', dk: `big${g}`, s: 1000 + g })
  }, 120_000)

  afterAll(async () => {
    if (ids.shops.length) {
      await prisma.order.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.conversation.deleteMany({ where: { shopId: { in: ids.shops } } }) // ChatMessage cascade
      await prisma.shopChannel.deleteMany({ where: { shopId: { in: ids.shops } } }) // dataset/event/setting cascade
      await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    }
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    vi.unstubAllEnvs()
    await prisma.$disconnect()
  })

  describe('listConversationCapiEvents', () => {
    it('กลุ่มตาม dedupeKey เรียงเก่า→ใหม่ · ผลต่อชุด · เฉพาะแถวของร้าน', async () => {
      const r = await listConversationCapiEvents(f.shop, f.convA)
      expect(r).toMatchObject({ visible: true, channelId: f.channel, pageStopped: false, truncated: false })
      expect(r.groups.map((g) => g.eventKey)).toEqual(['VIEW_CONTENT', 'ORDER_CREATED', 'PURCHASE']) // ไม่มีแถวร้านอื่น (fake1)
      const pu = r.groups[2]
      expect(pu.value).toBe(1070)
      expect(pu.datasets).toEqual([
        { label: 'เว็บ', datasetId: '1002', status: 'PENDING', reasonKey: 'waitToken', attempts: 1, sentAt: null },
        { label: 'หลัก', datasetId: '1001', status: 'SENT', reasonKey: 'none', attempts: 1, sentAt: at(60).toISOString() },
      ])
    })
    it('ไม่รั่ว: psid/payload/reason ดิบ/dedupeKey/lastRequest ไม่อยู่ใน response (เดิน key ทุกชั้นเทียบ allow-list)', async () => {
      const body = JSON.stringify(await listConversationCapiEvents(f.shop, f.convA))
      for (const s of ['PSID-SECRET', 'REQ-SECRET', 'RES-SECRET', 'SECRET-ITEM', 'TOKEN_OR_PERMISSION', 'REJECTED', 'pu1', 'page-x', 'orderId']) expect(body).not.toContain(s)
      const allowed = new Set(['visible', 'channelId', 'pageStopped', 'truncated', 'groups', 'id', 'eventKey', 'at', 'value', 'datasets', 'label', 'datasetId', 'status', 'reasonKey', 'attempts', 'sentAt'])
      const walk = (x: unknown): void => {
        if (Array.isArray(x)) x.forEach(walk)
        else if (x && typeof x === 'object') for (const [k, val] of Object.entries(x)) { expect(allowed.has(k), k).toBe(true); walk(val) }
      }
      walk(JSON.parse(body))
    })
    it('ห้องที่ไม่ใช่ Messenger / ไม่มีห้อง / ห้องร้านอื่น = visible:false ไม่มี groups', async () => {
      const none = { visible: false, channelId: null, pageStopped: false, truncated: false, groups: [] }
      expect(await listConversationCapiEvents(f.shop, f.convLine)).toEqual(none)
      expect(await listConversationCapiEvents(f.shop, randomUUID())).toEqual(none)
      expect(await listConversationCapiEvents(f.shop, f.convB)).toEqual(none) // scope ด้วย shopId ของห้อง
    })
    it('เพดาน 300: truncated · ทิ้งกลุ่มที่ชุดข้อมูลขาด · ทุกกลุ่มที่คืนครบ 3 ชุด', async () => {
      const r = await listConversationCapiEvents(f.shop, f.convBig)
      expect(r.truncated).toBe(true)
      expect(r.groups).toHaveLength(100) // solo + 99 กลุ่มเต็ม (กลุ่มที่ 100 ขาดชุด → ทิ้ง)
      expect(r.groups.filter((g) => g.datasets.length === 3)).toHaveLength(99)
      expect(r.groups[r.groups.length - 1].eventKey).toBe('VIEW_CONTENT')
    })
    it('เพจหยุดส่งทุกชุด = pageStopped · เพจที่ยกเลิกเชื่อม = channelId null + ไม่มีแถบ', async () => {
      await prisma.metaCapiPageSetting.upsert({ where: { shopChannelId: f.channel }, create: { shopId: f.shop, shopChannelId: f.channel, enabled: true }, update: { enabled: true } })
      await prisma.metaCapiDataset.updateMany({ where: { shopId: f.shop }, data: { status: 'STOPPED' } })
      expect((await listConversationCapiEvents(f.shop, f.convA)).pageStopped).toBe(true)
      await prisma.metaCapiPageSetting.update({ where: { shopChannelId: f.channel }, data: { enabled: false } })
      expect((await listConversationCapiEvents(f.shop, f.convA)).pageStopped).toBe(false) // เพจปิด = off
      await prisma.metaCapiPageSetting.update({ where: { shopChannelId: f.channel }, data: { enabled: true } })
      await prisma.shopChannel.update({ where: { id: f.channel }, data: { status: 'DISCONNECTED' } })
      expect(await listConversationCapiEvents(f.shop, f.convA)).toMatchObject({ visible: true, channelId: null, pageStopped: false })
      await prisma.shopChannel.update({ where: { id: f.channel }, data: { status: 'ACTIVE' } })
      await prisma.metaCapiDataset.updateMany({ where: { shopId: f.shop }, data: { status: 'ACTIVE' } })
      await prisma.metaCapiPageSetting.update({ where: { shopChannelId: f.channel }, data: { enabled: false } })
    })
    it('ฟีเจอร์ปิด/ร้านไม่อยู่ในรายชื่อทดลอง = FEATURE_DISABLED', async () => {
      vi.stubEnv('META_CAPI_PILOT_SHOP_IDS', 'someone-else')
      expect(await code(listConversationCapiEvents(f.shop, f.convA))).toBe('FEATURE_DISABLED')
      vi.stubEnv('META_CAPI_PILOT_SHOP_IDS', '')
      vi.stubEnv('OPEN_META_CAPI', '')
      expect(await code(listOrderCapiEvents(f.shop, { id: f.o1, publicToken: f.o1t, conversationId: f.convA }))).toBe('FEATURE_DISABLED')
      vi.stubEnv('OPEN_META_CAPI', '1')
    })
  })

  describe('listOrderCapiEvents (TC-019/020)', () => {
    it('O1: เฉพาะแถวที่ payload.orderId ตรง ในห้องของ O1 · เรียงใหม่→เก่า · ไม่มี VIEW_CONTENT/แถวร้านอื่น', async () => {
      const r = await listOrderCapiEvents(f.shop, { id: f.o1, publicToken: f.o1t, conversationId: f.convA })
      expect(r).toMatchObject({ show: true, channelId: f.channel, pageState: 'rows', pageName: 'เพจ a' })
      expect(r.show && r.groups.map((g) => g.eventKey)).toEqual(['PURCHASE', 'ORDER_CREATED'])
      expect(JSON.stringify(r)).not.toMatch(/PSID-SECRET|REQ-SECRET|SECRET-ITEM|TOKEN_OR_PERMISSION/)
    })
    it('O2 ไม่ผูกห้องแต่การ์ดส่งในห้อง C → เห็น INITIATE_CHECKOUT (convSet จากการ์ด)', async () => {
      const r = await listOrderCapiEvents(f.shop, { id: f.o2, publicToken: f.o2t, conversationId: null })
      expect(r.show && r.groups.map((g) => g.eventKey)).toEqual(['INITIATE_CHECKOUT'])
      expect(r.show && r.channelId).toBe(f.channel)
    })
    it('ห้องของร้านอื่นที่ส่งการ์ด O1 ไม่เข้า convSet (scope shopId ของการ์ด)', async () => {
      const r = await listOrderCapiEvents(f.shop, { id: f.o1, publicToken: f.o1t, conversationId: null })
      expect(r.show).toBe(false) // ไม่ผูกห้อง + การ์ดเดียวอยู่ห้องร้านอื่น
    })
    it('ไม่มีแถว: ห้อง Messenger เพจเปิด+มีชุด = empty · เพจปิด = off · ไม่ผูกห้อง/ไม่เคยส่งการ์ด = show:false', async () => {
      const o4 = { id: f.o4, publicToken: f.o4t, conversationId: f.convA }
      await prisma.metaCapiPageSetting.update({ where: { shopChannelId: f.channel }, data: { enabled: true } })
      expect(await listOrderCapiEvents(f.shop, o4)).toMatchObject({ show: true, groups: [], pageState: 'empty', pageName: 'เพจ a' })
      await prisma.metaCapiPageSetting.update({ where: { shopChannelId: f.channel }, data: { enabled: false } })
      expect(await listOrderCapiEvents(f.shop, o4)).toMatchObject({ show: true, groups: [], pageState: 'off' })
      expect(await listOrderCapiEvents(f.shop, { id: f.o5, publicToken: f.o5t, conversationId: null })).toEqual({ show: false })
    })
  })

  describe('listCapiLog ตัวกรองใหม่ (TC-021/022)', () => {
    it('conversation: เฉพาะแถวของห้อง (ร้านนี้) · มี sentAt · ห้องร้านอื่น = ว่าง', async () => {
      const r = await listCapiLog(f.shop, f.channel, { conversationId: f.convA })
      expect(r.rows.map((x) => x.eventKey).sort()).toEqual(['ORDER_CREATED', 'PURCHASE', 'PURCHASE', 'VIEW_CONTENT'])
      expect(r.rows.find((x) => x.eventKey === 'ORDER_CREATED')!.sentAt?.toISOString()).toBe(at(40).toISOString())
      expect(r.rows.every((x) => 'sentAt' in x)).toBe(true)
      expect((await listCapiLog(f.shop, f.channel, { conversationId: f.convB })).rows).toEqual([])
      expect((await listCapiLog(f.shop, f.channel, { conversationId: f.convA, status: 'SENT', eventKey: 'PURCHASE' })).rows).toHaveLength(1)
    })
    it('order: O1 เฉพาะแถวของ O1 · O2 ผ่านการ์ดในห้อง C · token ร้านอื่น/ไม่มี = ว่าง', async () => {
      expect((await listCapiLog(f.shop, f.channel, { orderToken: f.o1t })).rows.map((x) => x.eventKey).sort()).toEqual(['ORDER_CREATED', 'PURCHASE', 'PURCHASE'])
      expect((await listCapiLog(f.shop, f.channel, { orderToken: f.o2t })).rows.map((x) => x.eventKey)).toEqual(['INITIATE_CHECKOUT'])
      expect((await listCapiLog(f.shop, f.channel, { orderToken: f.oBt })).rows).toEqual([])
      expect((await listCapiLog(f.shop, f.channel, { orderToken: 'no-such-token' })).rows).toEqual([])
    })
    it('conversation + order พร้อมกัน = AND · ห้องที่ไม่อยู่ใน convSet ไม่ได้แถว', async () => {
      expect((await listCapiLog(f.shop, f.channel, { conversationId: f.convA, orderToken: f.o1t })).rows).toHaveLength(3)
      expect((await listCapiLog(f.shop, f.channel, { conversationId: f.convC, orderToken: f.o1t })).rows).toEqual([])
    })
  })

  it('CapiLogQuerySchema: conversation ต้อง uuid · order ≤ 64', () => {
    expect(v.safeParse(CapiLogQuerySchema, { conversation: 'abc' }).success).toBe(false)
    expect(v.safeParse(CapiLogQuerySchema, { order: 'x'.repeat(65) }).success).toBe(false)
    expect(v.safeParse(CapiLogQuerySchema, { conversation: randomUUID(), order: 'x'.repeat(64) }).success).toBe(true)
  })
})
