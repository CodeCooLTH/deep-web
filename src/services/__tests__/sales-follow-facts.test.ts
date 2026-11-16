/**
 * 00095 S-3 — ตัวโหลดข้อเท็จจริงของบอทติดตามยอดขาย บน Postgres จริง (TFR-FB-01/02/03/10/11)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้างเอง (cascade จากร้านที่สร้าง)
 *
 * Mutation (ทำมือแล้วคืน — ดู report):
 *   M-pin    ให้ loadRoomBundles ไม่ปักตราประทับเดิม (pinRows = [])         → "stamp NOT_BOUGHT ไม่ขยับ" แดง
 *   M-window ถอดขอบ 30 วันออกจาก SQL ข้อความ (sinceExpr = epoch)              → "ข้อความเก่ากว่า 30 วัน" แดง
 *   M-shop   ถอด shopId ออกจาก where ของ conversation ใน loadRoomBundles      → "ข้ามร้าน" แดง
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

import { vi } from 'vitest'
vi.mock('server-only', () => ({}))

import { decideRun } from '@/lib/sales-follow-bot/decide'
import { STAMP_EVENT_TYPES } from '@/lib/sales-follow-bot/sales-stage'
import {
  loadAttachFacts,
  loadDecideFacts,
  loadRoomBundles,
  type DecideRunInput,
} from '@/services/sales-follow-facts.service'
import { attachRun } from '@/services/sales-follow-bot.service'
import { tagNameKey } from '@/lib/shop-tag-match'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const DAY = 86_400_000
const now = new Date()
const ago = (ms: number, base = now) => new Date(base.getTime() - ms)

const S = { user: '', shop: '', other: '', ch: '', otherCh: '', bot: '' }

async function mkConv(o: { shopId?: string; chId?: string; channel?: string; inbound?: Date | null; alias?: string } = {}) {
  const shopId = o.shopId ?? S.shop
  const chId = o.chId ?? S.ch
  const ec = await db.externalContact.create({ data: { shopChannelId: chId, externalUserId: `psid-${randomUUID().slice(0, 8)}`, name: 'สมชาย' } as never, select: { id: true } })
  return db.conversation.create({
    data: {
      shopId, channel: o.channel ?? 'MESSENGER', shopChannelId: chId, externalContactId: ec.id,
      lastInboundAt: o.inbound === undefined ? ago(60_000) : o.inbound, lastMessageAt: now,
    },
    select: { id: true },
  }).then((c) => c.id)
}

type Msg = { role?: 'BUYER' | 'SHOP'; at: Date; type?: string; kind?: string | null; ext?: string | null; del?: boolean; delivery?: string | null }
async function say(conversationId: string, m: Msg) {
  return db.chatMessage.create({
    data: {
      conversationId, senderRole: m.role ?? 'BUYER', type: m.type ?? 'TEXT', body: 'x', createdAt: m.at,
      autoReplyKind: m.kind ?? null, externalMessageId: m.ext ?? null, isDeleted: m.del ?? false, deliveryStatus: m.delivery ?? null,
    },
    select: { id: true, seq: true },
  })
}

async function mkOrder(conversationId: string, o: { status?: string; createdAt?: Date; paymentConfirmedAt?: Date | null; isDryRun?: boolean; shopId?: string; events?: { type: string; occurredAt: Date }[] } = {}) {
  const ord = await db.order.create({
    data: {
      shopId: o.shopId ?? S.shop, conversationId, type: 'PHYSICAL', totalAmount: 100, buyerContact: `08${run}`, buyerName: 'สมชาย',
      status: o.status ?? 'PENDING', createdAt: o.createdAt ?? ago(DAY), paymentConfirmedAt: o.paymentConfirmedAt ?? null, isDryRun: o.isDryRun ?? false,
      paymentMethod: 'TRANSFER',
      items: { create: { name: 'เสื้อ', qty: 1, price: 100 } },
      ...(o.events ? { events: { create: o.events } } : {}),
    },
    select: { id: true },
  })
  return ord.id
}

async function mkBot(o: { channelIds?: string[]; status?: string; salesStatuses?: string[]; shopId?: string; deletedAt?: Date | null } = {}) {
  const b = await db.salesFollowBot.create({
    data: {
      shopId: o.shopId ?? S.shop, name: `บอท-${run}`, status: o.status ?? 'ACTIVE', salesStatuses: o.salesStatuses ?? ['NOT_BOUGHT'],
      steps: [
        { delayMin: 30, parts: [{ kind: 'TEXT', text: 'สวัสดีค่ะ' }] },
        { delayMin: 60, parts: [{ kind: 'TEXT', text: 'ยังสนใจไหมคะ' }] },
      ],
      deletedAt: o.deletedAt ?? null,
      channels: { create: (o.channelIds ?? [S.ch]).map((shopChannelId) => ({ shopChannelId })) },
    },
    select: { id: true, structureRev: true },
  })
  return b
}

const runInput = (id: string, convId: string, stageStamp: Date, extra: Partial<DecideRunInput> = {}): DecideRunInput => ({
  id, shopId: S.shop, botId: S.bot, conversationId: convId, stageKey: 'NOT_BOUGHT', stageStamp, structureRev: 1, nextStep: 0, lastSentAt: null, ...extra,
})

describe.skipIf(!isLocal)('sales-follow facts loader (DB จริง)', () => {
  const prevEnv = process.env.SALES_FOLLOW_BOT_SHOP_IDS
  beforeAll(async () => {
    const u = await db.user.create({ data: { displayName: `sff-${run}`, username: `sff_${run}` }, select: { id: true } })
    const mk = (n: string) => db.shop.create({ data: { userId: u.id, shopName: `sff-${n}-${run}`, kind: 'BUSINESS', vertical: 'ONLINE_SALES' } as never, select: { id: true } })
    const [shop, other] = await Promise.all([mk('a'), mk('b')])
    const mkCh = (shopId: string, n: string) => db.shopChannel.create({ data: { shopId, provider: 'MESSENGER', externalId: `sff-${n}-${run}`, name: `เพจ ${n}`, accessTokenEnc: 'x', connectedByUserId: u.id } as never, select: { id: true } })
    const [ch, otherCh] = await Promise.all([mkCh(shop.id, 'a'), mkCh(other.id, 'b')])
    Object.assign(S, { user: u.id, shop: shop.id, other: other.id, ch: ch.id, otherCh: otherCh.id })
    S.bot = (await mkBot()).id
    process.env.SALES_FOLLOW_BOT_SHOP_IDS = S.shop
  })
  afterAll(async () => {
    process.env.SALES_FOLLOW_BOT_SHOP_IDS = prevEnv
    if (!prevEnv) delete process.env.SALES_FOLLOW_BOT_SHOP_IDS
    // scope ด้วยร้านที่เทสสร้างเอง (HR13) — Order.shopId ไม่ cascade จึงลบออเดอร์ก่อน แล้วร้านค่อย cascade ห้อง/ข้อความ/บอท/run
    await db.order.deleteMany({ where: { shopId: { in: [S.shop, S.other] } } })
    await db.shop.deleteMany({ where: { id: { in: [S.shop, S.other] } } })
    await db.user.deleteMany({ where: { id: S.user } })
    await db.$disconnect()
  })

  describe('ตราประทับ NOT_BOUGHT ไม่ขยับตามหน้าต่าง 30 วัน (reviewer should-fix → ข้อบังคับ)', () => {
    it('ข้อความแรกของรอบหลุดหน้าต่างระหว่างที่ run ยังตามอยู่ → stamp คงเดิม · ไม่หยุดด้วย STAGE_CHANGED [M-pin]', async () => {
      const conv = await mkConv()
      const m1 = ago(25 * DAY)
      await say(conv, { at: m1 })
      await say(conv, { at: ago(10 * 60_000) })

      // วันแนบ: ข้อความแรกยังอยู่ในหน้าต่าง → stamp = m1
      const att = (await loadAttachFacts(S.shop, S.bot, [conv], now)).get(conv)!
      expect(att.stage?.key).toBe('NOT_BOUGHT')
      expect(att.stage?.stamp?.getTime()).toBe(m1.getTime())
      const runId = await attachRun({ shopId: S.shop, botId: S.bot, conversationId: conv, stageKey: 'NOT_BOUGHT', stageStamp: att.stage!.stamp!, structureRev: 1, now })
      expect(runId).toBeTruthy()

      // 10 วันถัดมา: m1 อายุ 35 วัน → หลุดหน้าต่าง · เหลือแต่ข้อความใหม่
      const later = new Date(now.getTime() + 10 * DAY)
      const facts = (await loadDecideFacts([runInput(runId!, conv, m1)], later)).get(runId!)!
      expect(facts.stage?.stamp?.getTime()).toBe(m1.getTime())
      expect(decideRun(facts)).not.toEqual({ action: 'STOP', reason: 'STAGE_CHANGED' })

      // พิสูจน์ว่าหน้าต่างทำให้ขยับจริงถ้าไม่ปัก (เทสนี้แดงเมื่อโค้ดกลับไปพึ่งหน้าต่าง)
      const unpinned = (await loadDecideFacts([runInput(runId!, conv, m1)], later, { disablePins: true })).get(runId!)!
      expect(unpinned.stage?.stamp?.getTime()).not.toBe(m1.getTime())
      expect(decideRun(unpinned)).toEqual({ action: 'STOP', reason: 'STAGE_CHANGED' })
    })

    it('รอบเดิมจบแล้ว ข้อความแรกหลุดหน้าต่าง → ตัวแนบยังเห็น stamp เดิม แนบซ้ำไม่ได้ (OD-FB-3 ครั้งเดียวต่อรอบ)', async () => {
      const conv = await mkConv()
      const m1 = ago(25 * DAY)
      await say(conv, { at: m1 })
      await say(conv, { at: ago(5 * 60_000) })
      const first = await attachRun({ shopId: S.shop, botId: S.bot, conversationId: conv, stageKey: 'NOT_BOUGHT', stageStamp: m1, structureRev: 1, now })
      await db.salesFollowRun.update({ where: { id: first! }, data: { status: 'STOPPED', stopReason: 'CUSTOMER_REPLIED', finishedAt: now } })

      const later = new Date(now.getTime() + 10 * DAY)
      const att = (await loadAttachFacts(S.shop, S.bot, [conv], later)).get(conv)!
      expect(att.stage?.stamp?.getTime()).toBe(m1.getTime())
      expect(att.lastRunFinishedAt?.getTime()).toBe(now.getTime())
      // ถ้า stamp ขยับ แถวนี้จะ INSERT สำเร็จ (unique ไม่ชน) = ตามซ้ำรอบเดิม
      const again = await attachRun({ shopId: S.shop, botId: S.bot, conversationId: conv, stageKey: 'NOT_BOUGHT', stageStamp: att.stage!.stamp!, structureRev: 1, now: later })
      expect(again).toBeNull()
    })

    it('ตัวปักของรอบเก่าไม่ปนข้ามรอบหลังออเดอร์จบ (กรอง > stamp+HOLD เอง)', async () => {
      const conv = await mkConv()
      const old = ago(20 * DAY)
      await say(conv, { at: old })
      const first = await attachRun({ shopId: S.shop, botId: S.bot, conversationId: conv, stageKey: 'NOT_BOUGHT', stageStamp: old, structureRev: 1, now })
      await db.salesFollowRun.update({ where: { id: first! }, data: { status: 'DONE', finishedAt: ago(19 * DAY) } })
      // ออเดอร์ยกเลิกเมื่อ 10 วันก่อน (HOLD 0) แล้วลูกค้าทักใหม่เมื่อ 2 วันก่อน = รอบใหม่ stamp = ข้อความนั้น ไม่ใช่ตัวปัก
      await mkOrder(conv, { status: 'CANCELLED', createdAt: ago(12 * DAY), events: [{ type: 'ORDER_CANCELLED', occurredAt: ago(10 * DAY) }] })
      const back = ago(2 * DAY)
      await say(conv, { at: back })
      const b = (await loadRoomBundles(S.shop, [conv], now)).get(conv)!
      expect(b.stage).toMatchObject({ key: 'NOT_BOUGHT' })
      expect(b.stage?.stamp?.getTime()).toBe(back.getTime())
    })
  })

  describe('นิยามข้อความ (TFR-FB-03) ผ่านตัวโหลด', () => {
    it('ลูกค้า: ตัด pb:/ถูกลบ/บรรทัดระบบ · ร้าน: นับ echo/AUTO_NOTICE แต่ไม่นับ AUTO_FOLLOW/FAILED/บรรทัดระบบ', async () => {
      const conv = await mkConv()
      const real = await say(conv, { at: ago(60 * 60_000) })
      await say(conv, { at: ago(50 * 60_000), ext: `pb:${run}` }) // LINE postback
      await say(conv, { at: ago(49 * 60_000), del: true })
      await say(conv, { at: ago(48 * 60_000), type: 'META_NOTICE' })
      const reply = await say(conv, { role: 'SHOP', at: ago(40 * 60_000), kind: 'AUTO_NOTICE' })
      await say(conv, { role: 'SHOP', at: ago(30 * 60_000), kind: 'AUTO_FOLLOW' })
      await say(conv, { role: 'SHOP', at: ago(29 * 60_000), delivery: 'FAILED' })
      await say(conv, { role: 'SHOP', at: ago(28 * 60_000), type: 'FOLLOW_BOT_NOTE' })
      const b = (await loadRoomBundles(S.shop, [conv], now)).get(conv)!
      expect(b.latestBuyerMsg).toEqual({ createdAt: ago(60 * 60_000), seq: real.seq })
      expect(b.latestShopReply).toEqual({ createdAt: ago(40 * 60_000), seq: reply.seq })
    })

    it('ข้อความเก่ากว่า 30 วันไม่ถูกนับ (AC-FB-47) [M-window]', async () => {
      const conv = await mkConv()
      await say(conv, { at: ago(31 * DAY) })
      await say(conv, { role: 'SHOP', at: ago(31 * DAY) })
      const b = (await loadRoomBundles(S.shop, [conv], now)).get(conv)!
      expect(b.latestBuyerMsg).toBeNull()
      expect(b.latestShopReply).toBeNull()
      expect(b.stage).toMatchObject({ key: 'NOT_BOUGHT', stamp: null })
    })

    it('ฟองบอทล่าสุดของ run = ฟองใน messageIds ของ Send ที่ SENT เท่านั้น', async () => {
      const conv = await mkConv()
      const stamp = ago(2 * 60 * 60_000)
      await say(conv, { at: stamp })
      const runId = (await attachRun({ shopId: S.shop, botId: S.bot, conversationId: conv, stageKey: 'NOT_BOUGHT', stageStamp: stamp, structureRev: 1, now }))!
      const a = await say(conv, { role: 'SHOP', at: ago(60 * 60_000), kind: 'AUTO_FOLLOW' })
      const a2 = await say(conv, { role: 'SHOP', at: ago(59 * 60_000), kind: 'AUTO_FOLLOW' })
      const stray = await say(conv, { role: 'SHOP', at: ago(10 * 60_000), kind: 'AUTO_FOLLOW' }) // ไม่ได้อยู่ใน Send
      await db.salesFollowSend.create({
        data: { shopId: S.shop, runId, conversationId: conv, botId: S.bot, step: 0, stepCount: 2, status: 'SENT', chatMessageId: a.id, messageIds: [a.id, a2.id], settledAt: now },
      })
      const f = (await loadDecideFacts([runInput(runId, conv, stamp)], now)).get(runId)!
      expect(f.lastBotBubble).toEqual({ createdAt: ago(59 * 60_000), seq: a2.seq })
      expect(stray.seq).toBeGreaterThan(a2.seq)
    })
  })

  describe('สถานะการขายจากออเดอร์ล่าสุด (TFR-FB-01/02)', () => {
    it('ร่าง/ทดสอบ/ห้องอื่นไม่นับ · ใบล่าสุดชนะ · stamp จาก event', async () => {
      const conv = await mkConv()
      const other = await mkConv()
      await say(conv, { at: ago(5 * DAY) })
      await mkOrder(conv, { status: 'DRAFTED', createdAt: ago(1 * DAY) })
      await mkOrder(conv, { isDryRun: true, createdAt: ago(1 * DAY) })
      await mkOrder(other, { createdAt: ago(1 * DAY) })
      expect((await loadRoomBundles(S.shop, [conv], now)).get(conv)!.stage?.key).toBe('NOT_BOUGHT')

      const created = ago(3 * DAY)
      await mkOrder(conv, { createdAt: ago(4 * DAY), status: 'CANCELLED', events: [{ type: 'ORDER_CANCELLED', occurredAt: ago(4 * DAY) }] })
      await mkOrder(conv, { createdAt: created, events: [{ type: 'ORDER_CREATED', occurredAt: created }] })
      const b = (await loadRoomBundles(S.shop, [conv], now)).get(conv)!
      expect(b.stage?.key).toBe('BILLED') // ใบใหม่กว่า (3 วัน) ชนะใบยกเลิก (4 วัน)
      expect(b.stage?.stamp?.getTime()).toBe(created.getTime())
    })

    it('ชำระแล้ว → ORDER_CONFIRMED stamp = paymentConfirmedAt · ส่งสำเร็จ + ลูกค้าทักหลังพัก 7 วัน → NOT_BOUGHT รอบใหม่', async () => {
      const conv = await mkConv()
      const paid = ago(2 * DAY)
      await mkOrder(conv, { createdAt: ago(3 * DAY), paymentConfirmedAt: paid })
      const b = (await loadRoomBundles(S.shop, [conv], now)).get(conv)!
      expect(b.stage).toMatchObject({ key: 'ORDER_CONFIRMED' })
      expect(b.stage?.stamp?.getTime()).toBe(paid.getTime())

      const conv2 = await mkConv()
      const done = ago(20 * DAY)
      await mkOrder(conv2, { status: 'CONFIRMED', createdAt: ago(25 * DAY), events: [{ type: 'BUYER_CONFIRMED', occurredAt: done }] })
      const before = ago(15 * DAY) // ภายในพัก 7 วัน = ไม่ใช่รอบใหม่
      const after = ago(5 * DAY) // เกิน stamp+7d (= 13 วันก่อน) = รอบใหม่
      await say(conv2, { at: before })
      await say(conv2, { at: after })
      await say(conv2, { at: ago(1 * DAY) })
      const b2 = (await loadRoomBundles(S.shop, [conv2], now)).get(conv2)!
      expect(b2.stage?.key).toBe('NOT_BOUGHT')
      expect(b2.stage?.stamp?.getTime()).toBe(after.getTime())
    })

    it('event ทุกชนิดที่ stampOfOrder อ่านต้องอยู่ใน STAMP_EVENT_TYPES (ไม่งั้น stamp = null เงียบ ๆ)', () => {
      const src = readFileSync(join(process.cwd(), 'src/lib/sales-follow-bot/sales-stage.ts'), 'utf8')
      const body = src.slice(src.indexOf('export function stampOfOrder'), src.indexOf('export function deriveSalesStage'))
      const used = new Set([...body.matchAll(/'([A-Z_]{4,})'/g)].map((m) => m[1]).filter((t) => t === t.toUpperCase() && /_/.test(t)))
      for (const t of ['ORDER_CREATED', 'ORDER_CANCELLED', 'MANUAL_DISPATCHED', 'HANDED_OVER']) expect(used.has(t)).toBe(true) // sanity: สแกนเจอจริง
      const known = new Set<string>(STAMP_EVENT_TYPES)
      for (const t of used) {
        if (['NOT_BOUGHT', 'ORDER_CONFIRMED', 'PARCEL_PROBLEM'].includes(t) || ['BILLED', 'SHIPPED', 'COMPLETED', 'CANCELLED'].includes(t)) continue
        expect(known.has(t), `${t} ขาดใน STAMP_EVENT_TYPES`).toBe(true)
      }
    })
  })

  describe('ข้ามร้าน (NFR-FB-04)', () => {
    it('ห้องของร้านอื่นไม่ถูกโหลด · run ที่ชี้ห้อง/บอทข้ามร้านไม่มี facts · attach facts ข้ามร้านว่าง', async () => {
      const conv = await mkConv()
      await say(conv, { at: ago(60_000) })
      expect((await loadRoomBundles(S.other, [conv], now)).size).toBe(0)
      expect((await loadAttachFacts(S.other, S.bot, [conv], now)).size).toBe(0) // บอทไม่ใช่ของร้าน other

      const foreignBot = (await mkBot({ shopId: S.other, channelIds: [S.otherCh] })).id
      const rid = (await attachRun({ shopId: S.shop, botId: S.bot, conversationId: conv, stageKey: 'NOT_BOUGHT', stageStamp: ago(60_000), structureRev: 1, now }))!
      const facts = await loadDecideFacts(
        [
          runInput(rid, conv, ago(60_000)), // ปกติ
          { ...runInput('x1', conv, ago(60_000)), shopId: S.other }, // ห้องเป็นของ shop A แต่อ้างว่าอยู่ร้าน B
          runInput('x2', conv, ago(60_000), { botId: foreignBot }), // บอทของร้านอื่น
        ],
        now,
      )
      expect([...facts.keys()]).toEqual([rid])
    })

    it('attachRun: ห้อง/บอทข้ามร้าน = null (ไม่พึ่ง FK อย่างเดียว)', async () => {
      const conv = await mkConv()
      const foreignBot = (await mkBot({ shopId: S.other, channelIds: [S.otherCh] })).id
      const stamp = ago(60_000)
      expect(await attachRun({ shopId: S.shop, botId: foreignBot, conversationId: conv, stageKey: 'NOT_BOUGHT', stageStamp: stamp, structureRev: 1 })).toBeNull()
      expect(await attachRun({ shopId: S.other, botId: S.bot, conversationId: conv, stageKey: 'NOT_BOUGHT', stageStamp: stamp, structureRev: 1 })).toBeNull()
      expect(await db.salesFollowRun.count({ where: { conversationId: conv } })).toBe(0)
    })
  })

  describe('ข้อเท็จจริงอื่นที่ decide ใช้', () => {
    it('sendAllowed อ่าน env สด · บอทที่ถูกลบ = CLOSED ในสายตา decide (BOT_DISABLED)', async () => {
      const conv = await mkConv()
      const stamp = ago(60 * 60_000)
      await say(conv, { at: stamp })
      const botId = (await mkBot({ deletedAt: new Date() })).id
      const rid = (await attachRun({ shopId: S.shop, botId, conversationId: conv, stageKey: 'NOT_BOUGHT', stageStamp: stamp, structureRev: 1 }))!
      const input = runInput(rid, conv, stamp, { botId })
      const f1 = (await loadDecideFacts([input], now)).get(rid)!
      expect(f1.sendAllowed).toBe(true)
      expect(f1.bot.status).toBe('CLOSED')
      expect(decideRun(f1)).toEqual({ action: 'STOP', reason: 'BOT_DISABLED' })

      process.env.SALES_FOLLOW_BOT_SHOP_IDS = ''
      try {
        expect((await loadDecideFacts([input], now)).get(rid)!.sendAllowed).toBe(false)
      } finally {
        process.env.SALES_FOLLOW_BOT_SHOP_IDS = S.shop
      }
    })

    it('LINE/Meta: metaAi + adWindow เฉพาะห้อง Meta · ห้อง LINE ไม่มี', async () => {
      const line = await mkConv({ channel: 'LINE' })
      const meta = await mkConv()
      const m = await loadRoomBundles(S.shop, [line, meta], now)
      expect(m.get(line)!.metaAi).toBeNull()
      expect(m.get(line)!.adWindowStartAt).toBeNull()
      expect(m.get(meta)!.metaAi).not.toBeNull()
    })
  })
})
