/**
 * 00095-ext "ตามครบแล้วไม่ตอบ ทำอะไรต่อ" — ด่าน action ท้ายสุดของ engine บน Postgres จริง (BR-FA-1..6)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ทุก tick ปักหมุด opts.shopIds = ร้านที่เทสสร้างเอง · ลบเฉพาะร้าน/ผู้ใช้ที่เทสสร้าง (cascade)
 *
 * Mutation (ทำมือแล้วคืน — ดู report):
 *   M-claim  ถอดเงื่อนไข `"finalActionAt" IS NULL` ใน UPDATE claim     → "3 tick พร้อมกัน" แดง (บรรทัดระบบซ้ำ)
 *   M-reply  ถอดด่าน CUSTOMER_REPLIED ใน decideFinalAction              → "ลูกค้าตอบหลังรอบสุดท้าย" แดง
 *   M-test   ถอดด่าน TEST_ROOM_ONLY                                      → "บอททดสอบ: ห้องจริง" แดง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))

import { runSalesFollowTick } from '@/services/sales-follow-engine.service'
import { cancelFinalForConversation, getConversationPanel, getFollowBotRowSummaries } from '@/services/sales-follow-bot.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const HOUR = 3_600_000
const ago = (ms: number) => new Date(Date.now() - ms)

const S = { user: '' }
const worlds: string[] = []
interface World { shop: string; ch: string }

async function mkWorld(): Promise<World> {
  const shop = await db.shop.create({ data: { userId: S.user, shopName: `sffa-${randomUUID().slice(0, 6)}-${run}`, kind: 'BUSINESS', vertical: 'ONLINE_SALES' } as never, select: { id: true } })
  const ch = await db.shopChannel.create({ data: { shopId: shop.id, provider: 'MESSENGER', externalId: `sffa-${randomUUID().slice(0, 8)}`, name: 'M', accessTokenEnc: 'x', connectedByUserId: S.user } as never, select: { id: true } })
  worlds.push(shop.id)
  process.env.SALES_FOLLOW_BOT_SHOP_IDS = worlds.join(',')
  return { shop: shop.id, ch: ch.id }
}

const STEPS = [{ delayMin: 30, parts: [{ kind: 'TEXT', text: 'สวัสดีค่ะ' }] }, { delayMin: 600, parts: [{ kind: 'TEXT', text: 'ยังสนใจไหมคะ' }] }]
async function mkBot(w: World, o: { finalAction?: string; finalDelayMin?: number; status?: string } = {}) {
  return db.salesFollowBot.create({
    data: {
      shopId: w.shop, name: `บอท-${run}`, status: o.status ?? 'ACTIVE', conditionRules: [{ field: 'stage', op: 'is', values: ['NOT_BOUGHT'] }] as never, steps: STEPS as never,
      finalAction: o.finalAction ?? 'SPAM', finalDelayMin: o.finalDelayMin ?? 240,
      channels: { create: [{ shopChannelId: w.ch }] },
    },
    select: { id: true },
  })
}

interface RoomOpts { w: World; botId: string; lastSentAgo?: number; buyerAfter?: boolean; shopReplyAfter?: boolean; conv?: Record<string, unknown>; status?: string; lastSentAt?: Date | null }
/** ห้องที่ run ครบ (DONE) แล้ว: ลูกค้าทัก → บอทส่งรอบสุดท้าย (lastSentAgo ก่อนหน้า) → ไม่มีใครตอบ */
async function mkDoneRoom(o: RoomOpts) {
  const { w } = o
  const lastSentAt = o.lastSentAt !== undefined ? o.lastSentAt : ago(o.lastSentAgo ?? 5 * HOUR)
  const base = lastSentAt ?? ago(5 * HOUR)
  const ec = await db.externalContact.create({ data: { shopChannelId: w.ch, externalUserId: `u-${randomUUID().slice(0, 8)}`, name: 'สมชาย' } as never, select: { id: true } })
  const conv = await db.conversation.create({
    data: { shopId: w.shop, channel: 'MESSENGER', shopChannelId: w.ch, externalContactId: ec.id, lastInboundAt: new Date(base.getTime() - 10 * HOUR), lastMessageAt: base, ...(o.conv ?? {}) } as never,
    select: { id: true },
  })
  await db.chatMessage.create({ data: { conversationId: conv.id, senderRole: 'BUYER', type: 'TEXT', body: 'สนใจค่ะ', createdAt: new Date(base.getTime() - 10 * HOUR) } })
  await db.chatMessage.create({ data: { conversationId: conv.id, senderRole: 'SHOP', type: 'TEXT', body: 'ยังสนใจไหมคะ', autoReplyKind: 'AUTO_FOLLOW', deliveryStatus: 'SENT', createdAt: base } })
  if (o.buyerAfter) await db.chatMessage.create({ data: { conversationId: conv.id, senderRole: 'BUYER', type: 'TEXT', body: 'ขอดูก่อนนะ', createdAt: new Date(base.getTime() + 10 * 60_000) } })
  if (o.shopReplyAfter) await db.chatMessage.create({ data: { conversationId: conv.id, senderRole: 'SHOP', type: 'TEXT', body: 'ค่ะ', senderUserId: S.user, createdAt: new Date(base.getTime() + 10 * 60_000) } })
  const r = await db.salesFollowRun.create({
    data: {
      shopId: w.shop, botId: o.botId, conversationId: conv.id, stageKey: 'NOT_BOUGHT', stageStamp: new Date(base.getTime() - 11 * HOUR), structureRev: 1,
      nextStep: 2, status: 'DONE', lastSentAt, finishedAt: base,
    },
    select: { id: true },
  })
  await db.salesFollowSend.create({ data: { shopId: w.shop, runId: r.id, conversationId: conv.id, botId: o.botId, step: 1, stepCount: 2, status: 'SENT', settledAt: base } })
  return { conv: conv.id, runId: r.id }
}

const tick = (w: World) => runSalesFollowTick(new Date(), { shopIds: [w.shop] })
const runOf = (id: string) => db.salesFollowRun.findUniqueOrThrow({ where: { id } })
const convOf = (id: string) => db.conversation.findUniqueOrThrow({ where: { id } })
const notes = (conv: string) => db.chatMessage.findMany({ where: { conversationId: conv, type: 'FOLLOW_BOT_NOTE' } })

describe.skipIf(!isLocal)('sales-follow final action (DB จริง)', () => {
  const prevEnv = process.env.SALES_FOLLOW_BOT_SHOP_IDS
  beforeAll(async () => {
    const u = await db.user.create({ data: { displayName: `sffa-${run}`, username: `sffa_${run}` }, select: { id: true } })
    S.user = u.id
  })
  afterAll(async () => {
    if (prevEnv === undefined) delete process.env.SALES_FOLLOW_BOT_SHOP_IDS
    else process.env.SALES_FOLLOW_BOT_SHOP_IDS = prevEnv
    await db.shop.deleteMany({ where: { id: { in: worlds } } })
    await db.user.deleteMany({ where: { id: S.user } })
    await db.$disconnect()
  })
  beforeEach(() => {
    process.env.SALES_FOLLOW_BOT_SHOP_IDS = worlds.join(',')
  })

  it.each([
    ['SPAM', { isSpam: true }, 'ย้ายไปสแปม'],
    ['HIDE', { isHidden: true }, 'ซ่อน'],
    ['RESOLVE', { resolvedAtSet: true }, 'ปิดงาน'],
  ] as const)('พ้นเวลารอ + ไม่มีใครตอบ → %s ผ่านธงเดิมของห้อง + บรรทัดระบบ', async (kind, expectFlag, word) => {
    const w = await mkWorld()
    const bot = await mkBot(w, { finalAction: kind })
    const r = await mkDoneRoom({ w, botId: bot.id })
    const res = await tick(w)
    expect(res.finalActed).toBe(1)
    const conv = await convOf(r.conv)
    if ('isSpam' in expectFlag) expect(conv).toMatchObject({ isSpam: true, isPinned: false })
    if ('isHidden' in expectFlag) expect(conv.isHidden).toBe(true)
    if ('resolvedAtSet' in expectFlag) expect(conv.resolvedAt).not.toBeNull()
    const after = await runOf(r.runId)
    expect(after.finalActionTaken).toBe(kind)
    expect(after.finalActionAt).not.toBeNull()
    const [n] = await notes(r.conv)
    expect(n.body).toBe(`บอทตามครบ 2 รอบ ลูกค้าไม่ตอบ — ${word}`)
  })

  it('ครั้งเดียวต่อ run: tick ซ้ำและ 3 tick พร้อมกัน = บรรทัดระบบเดียว (BR-FA-4) · [M-claim]', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const r = await mkDoneRoom({ w, botId: bot.id })
    await Promise.all([tick(w), tick(w), tick(w)])
    await tick(w)
    expect(await notes(r.conv)).toHaveLength(1)
    expect((await convOf(r.conv)).isSpam).toBe(true)
  })

  it('ยังไม่ถึงเวลา → ไม่แตะอะไร และแถวยังรอ (ไม่ถูกปิด)', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w, { finalDelayMin: 24 * 60 })
    const r = await mkDoneRoom({ w, botId: bot.id })
    expect((await tick(w)).finalActed).toBe(0)
    expect((await convOf(r.conv)).isSpam).toBe(false)
    expect((await runOf(r.runId)).finalActionAt).toBeNull()
  })

  it('แก้เวลารอทีหลังมีผลกับ run ที่ครบแล้ว (BR-FA-6) และไม่ใช่โครงรอบ', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w, { finalDelayMin: 24 * 60 })
    const r = await mkDoneRoom({ w, botId: bot.id })
    await tick(w)
    expect((await convOf(r.conv)).isSpam).toBe(false)
    await db.salesFollowBot.update({ where: { id: bot.id }, data: { finalDelayMin: 60 } })
    await tick(w)
    expect((await convOf(r.conv)).isSpam).toBe(true)
  })

  it('บอทตั้ง "ไม่ทำอะไร" → ไม่ทำและไม่ปิดแถว', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w, { finalAction: 'NONE' })
    const r = await mkDoneRoom({ w, botId: bot.id })
    await tick(w)
    expect((await convOf(r.conv)).isSpam).toBe(false)
    expect((await runOf(r.runId)).finalActionAt).toBeNull()
  })

  it.each([
    ['ลูกค้าตอบหลังรอบสุดท้าย [M-reply]', { buyerAfter: true }, {}],
    ['ร้าน/แอดมินตอบหลังรอบสุดท้าย', { shopReplyAfter: true }, {}],
    ['ห้องถูกซ่อนไปแล้ว', {}, { isHidden: true }],
    ['ห้องถูกปิดงานไปแล้ว', {}, { resolvedAt: new Date() }],
  ])('%s → ไม่ทำ · ปิดแถว (taken ว่าง) · ไม่มีบรรทัดระบบ', async (_n, o, conv) => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const r = await mkDoneRoom({ w, botId: bot.id, conv, ...o })
    const res = await tick(w)
    expect(res).toMatchObject({ finalActed: 0, finalSkipped: 1 })
    expect((await convOf(r.conv)).isSpam).toBe(false)
    const after = await runOf(r.runId)
    expect(after.finalActionAt).not.toBeNull()
    expect(after.finalActionTaken).toBeNull()
    // ลูกค้าตอบ = BR-FA-12 ข เขียนบรรทัด "ยกเลิก" + บรรทัดส่งห้องต่อ (2) · เหตุอื่น = ไม่มีบรรทัด
    expect(await notes(r.conv)).toHaveLength(o.buyerAfter ? 2 : 0)
    expect((await tick(w)).finalSkipped).toBe(0) // ปิดแถวแล้ว ไม่หยิบซ้ำ
  })

  it('บอทถูกลบ/ปิด → ไม่ทำ', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w, { status: 'CLOSED' })
    const r = await mkDoneRoom({ w, botId: bot.id })
    await tick(w)
    expect((await convOf(r.conv)).isSpam).toBe(false)
    expect((await runOf(r.runId)).finalActionTaken).toBeNull()
  })

  it('บอททดสอบ: ห้องจริงไม่ถูกแตะ · ห้องทดสอบถูกทำ (BR-FA-5) · [M-test]', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w, { status: 'TESTING' })
    const real = await mkDoneRoom({ w, botId: bot.id })
    const test = await mkDoneRoom({ w, botId: bot.id })
    await db.salesFollowBotTestRoom.create({ data: { botId: bot.id, conversationId: test.conv } })
    const res = await tick(w)
    expect(res.finalActed).toBe(1)
    expect((await convOf(real.conv)).isSpam).toBe(false)
    expect((await convOf(test.conv)).isSpam).toBe(true)
  })

  it('run ที่ไม่มี lastSentAt ไม่ถูกหยิบ · run ที่ถูกหยุด (STOPPED) ไม่เข้าเงื่อนไข', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const none = await mkDoneRoom({ w, botId: bot.id, lastSentAt: null })
    const stopped = await mkDoneRoom({ w, botId: bot.id })
    await db.salesFollowRun.update({ where: { id: stopped.runId }, data: { status: 'STOPPED', stopReason: 'CUSTOMER_REPLIED' } })
    expect((await tick(w)).finalActed).toBe(0)
    expect((await convOf(none.conv)).isSpam).toBe(false)
    expect((await convOf(stopped.conv)).isSpam).toBe(false)
  })
})

describe.skipIf(!isLocal)('00095 BR-FA-12 ช่วงรอ action ท้ายสุด (DB จริง)', () => {
  const prevEnv = process.env.SALES_FOLLOW_BOT_SHOP_IDS
  beforeAll(async () => {
    const u = await db.user.create({ data: { displayName: `sffp-${run}`, username: `sffp_${run}` }, select: { id: true } })
    S.user = u.id
  })
  afterAll(async () => {
    if (prevEnv === undefined) delete process.env.SALES_FOLLOW_BOT_SHOP_IDS
    else process.env.SALES_FOLLOW_BOT_SHOP_IDS = prevEnv
    await db.shop.deleteMany({ where: { id: { in: worlds } } })
    await db.user.deleteMany({ where: { id: S.user } })
    await db.$disconnect()
  })
  beforeEach(() => {
    process.env.SALES_FOLLOW_BOT_SHOP_IDS = worlds.join(',')
  })

  it('แถวกล่องแชท + แผงในห้องเห็น pending พร้อมเวลา · NONE = ไม่เห็น · [M-pending-clause]', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w, { finalDelayMin: 24 * 60 })
    const r = await mkDoneRoom({ w, botId: bot.id, lastSentAgo: HOUR })
    const sums = await getFollowBotRowSummaries(w.shop, [r.conv])
    const fp = sums.get(r.conv)?.finalPending
    expect(fp?.kind).toBe('SPAM')
    const run0 = await runOf(r.runId)
    expect(Date.parse(fp!.dueAt)).toBe(run0.lastSentAt!.getTime() + 24 * HOUR)
    const panel = await getConversationPanel(w.shop, r.conv)
    expect(panel.available && panel.run?.finalPending?.kind).toBe('SPAM')
    // บอท NONE = ไม่มี pending
    const w2 = await mkWorld()
    const bot2 = await mkBot(w2, { finalAction: 'NONE' })
    const r2 = await mkDoneRoom({ w: w2, botId: bot2.id, lastSentAgo: HOUR })
    expect((await getFollowBotRowSummaries(w2.shop, [r2.conv])).get(r2.conv)).toBeNull()
    const p2 = await getConversationPanel(w2.shop, r2.conv)
    expect(p2.available && p2.run).toBeNull()
  })

  it('ทำ action ไปแล้ว (finalActionAt ตั้ง) = ไม่เป็น pending', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w, { finalDelayMin: 24 * 60 })
    const r = await mkDoneRoom({ w, botId: bot.id, lastSentAgo: HOUR })
    await db.salesFollowRun.update({ where: { id: r.runId }, data: { finalActionAt: new Date() } })
    expect((await getFollowBotRowSummaries(w.shop, [r.conv])).get(r.conv)).toBeNull()
  })

  it('ลูกค้าตอบระหว่างรอ → tick ถัดไป SKIP ทันที + ส่งห้องต่อครั้งเดียว + บรรทัดระบบ · ห้องไม่ถูกย้าย', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w, { finalDelayMin: 24 * 60 })
    const r = await mkDoneRoom({ w, botId: bot.id, lastSentAgo: 2 * HOUR, buyerAfter: true })
    await Promise.all([tick(w), tick(w)])
    await tick(w)
    const after = await runOf(r.runId)
    expect(after.finalActionAt).not.toBeNull()
    expect(after.finalActionTaken).toBeNull()
    expect((await convOf(r.conv)).isSpam).toBe(false)
    const ns = await notes(r.conv)
    expect(ns.filter((n) => n.body.includes('ยกเลิกการย้ายไปสแปม'))).toHaveLength(1)
    expect(ns.filter((n) => !n.body.includes('ยกเลิกการ'))).toHaveLength(1) // บรรทัดส่งห้องต่อ (BR-FA-10) หนึ่งครั้ง
  })

  it('ร้านตอบระหว่างรอ → SKIP ทันที ไม่มีบรรทัดระบบ', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w, { finalDelayMin: 24 * 60 })
    const r = await mkDoneRoom({ w, botId: bot.id, lastSentAgo: 2 * HOUR, shopReplyAfter: true })
    await tick(w)
    expect((await runOf(r.runId)).finalActionAt).not.toBeNull()
    expect(await notes(r.conv)).toHaveLength(0)
  })

  it('แอดมินยกเลิก: claim ครั้งเดียว (ครั้งสองไม่ทำอะไร) + บรรทัดระบบ + tick ไม่ทำ action', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w, { finalDelayMin: 10 })
    const r = await mkDoneRoom({ w, botId: bot.id, lastSentAgo: 5 * HOUR })
    expect(await cancelFinalForConversation(w.shop, r.conv)).toEqual({ cancelled: true })
    expect(await cancelFinalForConversation(w.shop, r.conv)).toEqual({ cancelled: false })
    await tick(w)
    expect((await convOf(r.conv)).isSpam).toBe(false)
    const ns = await notes(r.conv)
    expect(ns).toHaveLength(1)
    expect(ns[0].body).toContain('แอดมินยกเลิกการย้ายไปสแปม')
  })

  it('ยกเลิกห้องร้านอื่น = NotFound', async () => {
    const w = await mkWorld()
    const other = await mkWorld()
    const bot = await mkBot(w)
    const r = await mkDoneRoom({ w, botId: bot.id })
    await expect(cancelFinalForConversation(other.shop, r.conv)).rejects.toThrow()
  })

  it('pending กันบอทอื่นแนบห้อง · run ที่ทำไปแล้ว = แนบได้ (ตัวควบคุม) · [M-attach-guard]', async () => {
    const attached = async (acted: boolean) => {
      const w = await mkWorld()
      const a = await mkBot(w, { finalDelayMin: 24 * 60 })
      const r = await mkDoneRoom({ w, botId: a.id, lastSentAgo: 10 * 60_000 })
      // ลูกค้าทักก่อนรอบสุดท้าย 10 นาที (ยังอยู่ในหน้าต่าง delay รอบแรกของบอท B) — ไม่ใช่ "ตอบหลังรอบสุดท้าย" จึงไม่ถูกยกเลิกก่อนตัวแนบ
      await db.chatMessage.create({ data: { conversationId: r.conv, senderRole: 'BUYER', type: 'TEXT', body: 'ราคาเท่าไหร่', createdAt: ago(20 * 60_000) } })
      await db.conversation.update({ where: { id: r.conv }, data: { lastInboundAt: ago(20 * 60_000) } })
      if (acted) await db.salesFollowRun.update({ where: { id: r.runId }, data: { finalActionAt: new Date() } })
      await mkBot(w, { finalAction: 'NONE' })
      return (await tick(w)).attached
    }
    expect(await attached(true)).toBeGreaterThan(0)
    expect(await attached(false)).toBe(0)
  })
})
