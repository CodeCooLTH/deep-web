/**
 * 00095 S-3 — service บอทติดตามยอดขาย + บรรทัดระบบ บน Postgres จริง (TFR-FB-04..07/17/19/20 · TC-127/140/179/180/183..187)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะร้าน/ผู้ใช้ที่เทสสร้างเอง (cascade)
 *
 * Mutation (ทำมือแล้วคืน — ดู report):
 *   M-lock   ถอด lockShop ใน changeBotStatus                             → "บันทึกชนกันพร้อมกัน = สำเร็จ 1" แดง
 *   M-active ถอด `"status" = 'ACTIVE'` ใน stopRunsWithNote               → "หยุดซ้ำพร้อมกัน = บรรทัดเดียว" แดง
 *   M-rev    ถอดการเพิ่ม structureRev/หยุด run ใน updateBot              → "แก้โครง" แดง
 *   M-shop   ถอด shopId ออกจาก where ของ listSends                       → "ข้ามร้าน" แดง
 *   M-img-owner  findOwnedImageIds ไม่เช็คเจ้าของ (คืนทุกไฟล์ที่รูปแบบถูก)  → ด่านรูปของร้านอื่น/รูปลูกค้า แดง
 *   M-img-buyer  ถอด senderRole='SHOP' ของรูปในแชท                         → "รูปที่ลูกค้าส่ง" แดง
 *   M-stop-shop  ถอด shopId ออกจาก cond ของ stopRunsWithNote               → "หยุดข้ามร้าน" แดง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))

import {
  SalesFollowBotChannelConflictError,
  SalesFollowBotChannelNotFoundError,
  SalesFollowBotNotFoundError,
  SalesFollowBotStaleError,
  SalesFollowBotTagNotFoundError,
  SalesFollowBotTestRoomsError,
  SalesFollowBotValidationError,
} from '@/lib/sales-follow-bot/errors'
import type { BotFields } from '@/lib/sales-follow-bot/schemas'
import {
  attachRun,
  changeBotStatus,
  createBot,
  decodeSendsCursor,
  deleteBot,
  encodeSendsCursor,
  getBot,
  getBotOptions,
  getConversationPanel,
  getBotStats7d,
  getFollowBotRowSummaries,
  listBots,
  listSends,
  searchTestRooms,
  stopRunForConversation,
  updateBot,
} from '@/services/sales-follow-bot.service'
import { loadRoomBundles } from '@/services/sales-follow-facts.service'
import { assertOwnedImages, findOwnedImageIds, isValidImageFileId } from '@/services/sales-follow-images.service'
import { stopRunsWithNote } from '@/services/sales-follow-note.service'
import { validateBotFields } from '@/lib/sales-follow-bot/schemas'
import { SalesFollowBotNotAvailableError } from '@/lib/sales-follow-bot/errors'
import { buildStopNoteBody, STOP_NOTE_REASON_TEXT } from '@/services/sales-follow-note.service'
import { STOP_REASONS } from '@/lib/sales-follow-bot/constants'
import { tagNameKey } from '@/lib/shop-tag-match'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const now = new Date()
const ago = (ms: number) => new Date(now.getTime() - ms)

const S = { user: '', user2: '', shop: '', other: '', ch: '', ch2: '', line: '', otherCh: '', foreignQm: '', qm: '' }
const TEXT = (t: string) => ({ kind: 'TEXT' as const, text: t })
const step = (delayMin = 30, text = 'สวัสดีค่ะ คุณ{ชื่อ}') => ({ delayMin, parts: [TEXT(text)] })
/** รูปเดิมของเทส (สถานะ + แท็ก + tagMatch) → กฎแถวของ FR-FA-8 — เหมือน backfill ของ migration */
const rulesOf = (st: string[] = [], tags: string[] = [], tagMatch: 'ANY' | 'ALL' = 'ANY'): BotFields['rules'] => [
  ...(st.length ? [{ field: 'stage' as const, op: 'is' as const, values: st as never }] : []),
  ...(tags.length ? [{ field: 'tag' as const, op: tagMatch === 'ALL' ? ('has_all' as const) : ('has_any' as const), values: tags }] : []),
]
type Legacy = Partial<BotFields> & { salesStatuses?: string[]; tags?: string[]; tagMatch?: 'ANY' | 'ALL' }
const fields = ({ salesStatuses = ['NOT_BOUGHT'], tags = [], tagMatch = 'ANY', ...o }: Legacy = {}): BotFields => ({
  name: `บอท ${randomUUID().slice(0, 6)}`, conditionMatch: 'ALL', rules: rulesOf(salesStatuses, tags, tagMatch), channelIds: [S.ch], steps: [step(30), step(60)], ...o,
})

async function mkConv(o: { shopId?: string; chId?: string; channel?: string } = {}) {
  const chId = o.chId ?? S.ch
  const ec = await db.externalContact.create({ data: { shopChannelId: chId, externalUserId: `psid-${randomUUID().slice(0, 8)}`, name: 'สมชาย' } as never, select: { id: true } })
  const c = await db.conversation.create({
    data: {
      shopId: o.shopId ?? S.shop, channel: o.channel ?? 'MESSENGER', shopChannelId: chId, externalContactId: ec.id,
      lastInboundAt: ago(60_000), lastMessageAt: ago(3_600_000), lastMessagePreview: 'ข้อความล่าสุดเดิม', lastSenderRole: 'BUYER',
    },
    select: { id: true },
  })
  return c.id
}
async function say(conversationId: string, at: Date, role: 'BUYER' | 'SHOP' = 'BUYER', extra: Record<string, unknown> = {}) {
  return db.chatMessage.create({ data: { conversationId, senderRole: role, type: 'TEXT', body: 'x', createdAt: at, ...extra }, select: { id: true, seq: true } })
}
/** บอท ACTIVE (ผ่าน service) + run ที่แนบกับห้องหนึ่ง */
async function botWithRun(o: { fields?: Legacy; stamp?: Date; conv?: string } = {}) {
  let bot = await createBot(S.shop, S.user, fields(o.fields))
  bot = await changeBotStatus(S.shop, S.user, bot.id, { status: 'ACTIVE', expectedUpdatedAt: bot.updatedAt })
  const conv = o.conv ?? (await mkConv())
  const stamp = o.stamp ?? ago(2 * 3_600_000)
  await say(conv, stamp)
  const runId = (await attachRun({ shopId: S.shop, botId: bot.id, conversationId: conv, stageKey: 'NOT_BOUGHT', stageStamp: stamp, structureRev: bot.structureRev, now }))!
  return { bot, conv, runId, stamp }
}
const notesOf = (conv: string) => db.chatMessage.findMany({ where: { conversationId: conv, type: 'FOLLOW_BOT_NOTE' }, orderBy: { seq: 'asc' } })
/** ปิดทุกบอทของร้านเทสก่อนแต่ละเคส (CLOSED ไม่ชนใคร) — ลบเฉพาะบอทของร้านที่เทสสร้าง */
const resetBots = async () => {
  await db.salesFollowBot.updateMany({ where: { shopId: { in: [S.shop, S.other] } }, data: { status: 'CLOSED' } })
}

describe.skipIf(!isLocal)('sales-follow-bot service (DB จริง)', () => {
  const prevEnv = process.env.SALES_FOLLOW_BOT_SHOP_IDS
  beforeAll(async () => {
    const mkU = (n: string) => db.user.create({ data: { displayName: `sfb-${n}-${run}`, username: `sfb_${n}_${run}` }, select: { id: true } })
    const [u, u2] = await Promise.all([mkU('a'), mkU('b')])
    const mkShop = (userId: string, n: string) => db.shop.create({ data: { userId, shopName: `sfb-${n}-${run}`, kind: 'BUSINESS', vertical: 'ONLINE_SALES' } as never, select: { id: true } })
    const [shop, other] = await Promise.all([mkShop(u.id, 'a'), mkShop(u2.id, 'b')])
    const mkCh = (shopId: string, userId: string, provider: string, n: string, extra: object = {}) =>
      db.shopChannel.create({ data: { shopId, provider, externalId: `sfb-${n}-${run}`, name: `เพจ ${n}`, accessTokenEnc: 'x', connectedByUserId: userId, ...extra } as never, select: { id: true } })
    const [ch, ch2, line, otherCh] = await Promise.all([
      mkCh(shop.id, u.id, 'MESSENGER', 'm1'),
      mkCh(shop.id, u.id, 'INSTAGRAM', 'm2', { name: '@ig_shop' }),
      mkCh(shop.id, u.id, 'LINE', 'line', { basicId: '@lineoa' }),
      mkCh(other.id, u2.id, 'MESSENGER', 'o1'),
    ])
    const qm = await db.quickMessage.create({ data: { shopId: shop.id, title: 'ทักทาย', body: 'สวัสดีครับ', createdByUserId: u.id }, select: { id: true } })
    const foreignQm = await db.quickMessage.create({ data: { shopId: other.id, title: 'ของร้านอื่น', body: 'x', createdByUserId: u2.id }, select: { id: true } })
    await db.shopTag.createMany({
      data: ['ถามราคา', 'VIP'].map((name) => ({ shopId: shop.id, name, nameKey: tagNameKey(name) })).concat([{ shopId: other.id, name: 'ของร้านอื่น', nameKey: 'ของร้านอื่น' }]),
    })
    Object.assign(S, { user: u.id, user2: u2.id, shop: shop.id, other: other.id, ch: ch.id, ch2: ch2.id, line: line.id, otherCh: otherCh.id, qm: qm.id, foreignQm: foreignQm.id })
    process.env.SALES_FOLLOW_BOT_SHOP_IDS = `${S.shop},${S.other}`
  })
  afterAll(async () => {
    process.env.SALES_FOLLOW_BOT_SHOP_IDS = prevEnv
    if (!prevEnv) delete process.env.SALES_FOLLOW_BOT_SHOP_IDS
    // scope ด้วยร้าน/ผู้ใช้ที่เทสสร้างเอง (HR13) — ร้าน cascade ห้อง/ข้อความ/บอท/run/Send
    await db.shop.deleteMany({ where: { id: { in: [S.shop, S.other] } } })
    await db.user.deleteMany({ where: { id: { in: [S.user, S.user2] } } })
    await db.$disconnect()
  })
  beforeEach(resetBots)

  // ───────────────────────── สร้าง/อ่าน ─────────────────────────
  describe('createBot / getBot / listBots', () => {
    it('สร้าง = CLOSED เสมอ · แท็กแปลงเป็นคีย์ · DTO ครบ (adOnly คำนวณ · ช่องทางมีรูป/handle)', async () => {
      const bot = await createBot(S.shop, S.user, fields({ tags: ['  VIP ', 'ถามราคา'], channelIds: [S.ch, S.line, S.ch2], steps: [step(30), step(600), step(900)] }))
      expect(bot.status).toBe('CLOSED')
      expect(bot.rules).toEqual([
        { field: 'stage', op: 'is', values: ['NOT_BOUGHT'] },
        { field: 'tag', op: 'has_any', values: [{ key: 'vip', name: 'VIP', missing: false }, { key: 'ถามราคา', name: 'ถามราคา', missing: false }] },
      ])
      expect(bot.steps.map((s) => s.adOnly)).toEqual([false, false, true]) // สะสม 1530 > 1380
      expect(bot.totalDelayMin).toBe(1530)
      expect(bot.channels.map((c) => c.handle).sort()).toEqual(['@ig_shop', '@lineoa', null].sort())
      expect(bot.warnings).toEqual([])
      expect(bot.activeRunCount).toBe(0)
      const row = await db.salesFollowBot.findUniqueOrThrow({ where: { id: bot.id } })
      expect(row).toMatchObject({ status: 'CLOSED', createdByUserId: S.user, structureRev: 1, conditionMatch: 'ALL' })
      // เก็บกฎเป็น nameKey · คอลัมน์เก่า (salesStatuses/tagKeys) ไม่ถูกเขียนอีก
      expect(row.conditionRules).toEqual([{ field: 'stage', op: 'is', values: ['NOT_BOUGHT'] }, { field: 'tag', op: 'has_any', values: ['vip', 'ถามราคา'] }])
      expect(row.tagKeys).toEqual([])
    })

    it('ข้อมูลไม่ผ่าน: ไม่มีเงื่อนไข · ช่องของร้านอื่น · แท็กที่ไม่มี · quick message ของร้านอื่น', async () => {
      await expect(createBot(S.shop, S.user, fields({ salesStatuses: [], tags: [] }))).rejects.toMatchObject({ issues: [expect.objectContaining({ code: 'NO_CONDITION' })] })
      await expect(createBot(S.shop, S.user, fields({ channelIds: [S.otherCh] }))).rejects.toBeInstanceOf(SalesFollowBotChannelNotFoundError)
      await expect(createBot(S.shop, S.user, fields({ channelIds: [S.ch, randomUUID()] }))).rejects.toBeInstanceOf(SalesFollowBotChannelNotFoundError)
      await expect(createBot(S.shop, S.user, fields({ tags: ['ถามราคา', 'ไม่มีแท็กนี้', 'ของร้านอื่น'] }))).rejects.toMatchObject({ names: ['ไม่มีแท็กนี้', 'ของร้านอื่น'] })
      const bad = fields({ steps: [step(30), { delayMin: 5, parts: [TEXT('ก'), { kind: 'QUICK_MESSAGE', quickMessageId: S.foreignQm }] }] })
      const err = await createBot(S.shop, S.user, bad).catch((e) => e)
      expect(err).toBeInstanceOf(SalesFollowBotValidationError)
      expect(err.issues).toEqual([{ code: 'QUICK_MESSAGE_REQUIRED', path: 'steps.1.parts.1.quickMessageId', stepIndex: 1, partIndex: 1 }])
      // ของร้านเองผ่าน
      await expect(createBot(S.shop, S.user, fields({ steps: [{ delayMin: 5, parts: [{ kind: 'QUICK_MESSAGE', quickMessageId: S.qm }] }] }))).resolves.toBeTruthy()
    })

    it('listBots: เฉพาะของร้าน ไม่รวมที่ลบ · แท็กหาย = warnings (คำนวณตอนอ่าน) · activeRunCount', async () => {
      const { bot } = await botWithRun({ fields: { tags: ['VIP'], salesStatuses: [] } })
      await db.shopTag.deleteMany({ where: { shopId: S.shop, nameKey: 'vip' } })
      try {
        const list = await listBots(S.shop)
        const mine = list.find((b) => b.id === bot.id)!
        expect(mine.warnings).toEqual([{ code: 'TAG_MISSING', keys: ['vip'] }])
        expect(mine.rules[0]).toMatchObject({ field: 'tag', values: [{ key: 'vip', missing: true }] })
        expect(mine.activeRunCount).toBe(1)
        expect(list.every((b) => b.id !== undefined)).toBe(true)
        expect((await listBots(S.other)).some((b) => b.id === bot.id)).toBe(false)
      } finally {
        await db.shopTag.create({ data: { shopId: S.shop, name: 'VIP', nameKey: 'vip' } })
      }
      await deleteBot(S.shop, S.user, bot.id, (await getBot(S.shop, bot.id)).updatedAt)
      expect((await listBots(S.shop)).some((b) => b.id === bot.id)).toBe(false)
    })

    it('options: ช่องทางของร้าน + รูป/handle · แท็ก · ด่าน · quick message ของร้านเท่านั้น', async () => {
      const o = await getBotOptions(S.shop)
      expect(o.channels.map((c) => c.id).sort()).toEqual([S.ch, S.ch2, S.line].sort())
      expect(o.channels.find((c) => c.id === S.line)).toMatchObject({ provider: 'LINE', handle: '@lineoa', status: 'ACTIVE' })
      expect(o.tags.map((t) => t.key).sort()).toEqual(['vip', 'ถามราคา'])
      expect(o.quickMessages).toEqual([{ id: S.qm, title: 'ทักทาย', bodyPreview: 'สวัสดีครับ', thumbUrl: null, imageCount: 0 }])
      expect(o.limits.maxTotalDelayMin).toBe(10_020)
      expect(o.variables).toEqual(['ชื่อ'])
      expect(o.stages).toHaveLength(7)
    })
  })

  // ───────────────────────── ข้ามร้าน ─────────────────────────
  describe('ข้ามร้านทุกฟังก์ชัน (NFR-FB-04) — id ของร้านอื่น = NotFound / ไม่ปรากฏ', () => {
    it('getBot · updateBot · changeBotStatus · deleteBot · stop · panel', async () => {
      const mine = await createBot(S.shop, S.user, fields())
      const nf = SalesFollowBotNotFoundError
      await expect(getBot(S.other, mine.id)).rejects.toBeInstanceOf(nf)
      await expect(updateBot(S.other, S.user2, mine.id, { name: 'แฮก', expectedUpdatedAt: mine.updatedAt })).rejects.toBeInstanceOf(nf)
      await expect(changeBotStatus(S.other, S.user2, mine.id, { status: 'ACTIVE', expectedUpdatedAt: mine.updatedAt })).rejects.toBeInstanceOf(nf)
      await expect(deleteBot(S.other, S.user2, mine.id, mine.updatedAt)).rejects.toBeInstanceOf(nf)
      const conv = await mkConv()
      await expect(stopRunForConversation(S.other, conv, S.user2)).rejects.toBeInstanceOf(nf)
      await expect(getConversationPanel(S.other, conv)).rejects.toBeInstanceOf(nf)
      expect(await getBot(S.shop, mine.id)).toMatchObject({ name: mine.name, status: 'CLOSED' }) // ไม่ถูกแตะ
    })

    it('ใช้ช่อง/แท็ก/quick message ของร้านอื่นในการอัปเดต = ปฏิเสธ · searchTestRooms/listSends/summaries ไม่รั่ว', async () => {
      const mine = await createBot(S.shop, S.user, fields())
      await expect(updateBot(S.shop, S.user, mine.id, { channelIds: [S.otherCh], expectedUpdatedAt: mine.updatedAt })).rejects.toBeInstanceOf(SalesFollowBotChannelNotFoundError)
      await expect(updateBot(S.shop, S.user, mine.id, { rules: rulesOf([], ['ของร้านอื่น']), expectedUpdatedAt: mine.updatedAt })).rejects.toBeInstanceOf(SalesFollowBotTagNotFoundError)

      const { conv, runId, bot } = await botWithRun()
      await db.salesFollowSend.create({ data: { shopId: S.shop, runId, conversationId: conv, botId: bot.id, step: 0, stepCount: 2, status: 'SENDING' } })
      expect((await listSends(S.other)).items).toEqual([])
      expect((await listSends(S.shop)).items.some((i) => i.conversationId === conv)).toBe(true)
      expect(await searchTestRooms(S.other, [S.ch])).toEqual([]) // ช่องของร้านอื่น = ว่าง ไม่ error
      expect((await searchTestRooms(S.shop, [S.ch])).some((r) => r.conversationId === conv)).toBe(true)
      expect((await getFollowBotRowSummaries(S.other, [conv])).get(conv)).toBeNull()
      expect((await getFollowBotRowSummaries(S.shop, [conv])).get(conv)).not.toBeNull()
    })
  })

  // ───────────────────────── stale / พร้อมกัน ─────────────────────────
  describe('stale + ชนช่องทางพร้อมกัน', () => {
    it('expectedUpdatedAt เก่า = Stale พร้อม currentUpdatedAt ทุกทาง (PATCH/status/DELETE) · ไม่เขียนอะไร', async () => {
      const b = await createBot(S.shop, S.user, fields())
      const edited = await updateBot(S.shop, S.user2, b.id, { name: 'แก้โดยอีกคน', expectedUpdatedAt: b.updatedAt })
      const check = (p: Promise<unknown>) => p.then(() => null, (e) => e)
      for (const e of [
        await check(updateBot(S.shop, S.user, b.id, { name: 'ทับ', expectedUpdatedAt: b.updatedAt })),
        await check(changeBotStatus(S.shop, S.user, b.id, { status: 'ACTIVE', expectedUpdatedAt: b.updatedAt })),
        await check(deleteBot(S.shop, S.user, b.id, b.updatedAt)),
      ]) {
        expect(e).toBeInstanceOf(SalesFollowBotStaleError)
        expect((e as SalesFollowBotStaleError).currentUpdatedAt?.toISOString()).toBe(edited.updatedAt)
      }
      expect(await getBot(S.shop, b.id)).toMatchObject({ name: 'แก้โดยอีกคน', status: 'CLOSED' })
      expect(edited.stoppedRuns).toBe(0)
    })

    it('บันทึกชนกันพร้อมกัน 2 ตัว (ช่องเดียว สถานะซ้อน) = สำเร็จ 1 อีกตัว CHANNEL_CONFLICT · ไม่ค้างครึ่งทาง (TC-127) [M-lock]', async () => {
      const a = await createBot(S.shop, S.user, fields({ channelIds: [S.line] }))
      const b = await createBot(S.shop, S.user, fields({ channelIds: [S.line], salesStatuses: ['NOT_BOUGHT', 'BILLED'] }))
      const r = await Promise.allSettled([
        changeBotStatus(S.shop, S.user, a.id, { status: 'ACTIVE', expectedUpdatedAt: a.updatedAt }),
        changeBotStatus(S.shop, S.user, b.id, { status: 'ACTIVE', expectedUpdatedAt: b.updatedAt }),
      ])
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
      const lost = r.find((x) => x.status === 'rejected') as PromiseRejectedResult
      expect(lost.reason).toBeInstanceOf(SalesFollowBotChannelConflictError)
      expect((lost.reason as SalesFollowBotChannelConflictError).conflicts[0]).toMatchObject({ channelId: S.line })
      const statuses = (await Promise.all([a, b].map((x) => getBot(S.shop, x.id)))).map((x) => x.status).sort()
      expect(statuses).toEqual(['ACTIVE', 'CLOSED'])
    })

    it('ชน: สถานะไม่ซ้อน/คนละช่อง/อีกตัวปิดอยู่ = ผ่าน · สร้างทับบอทที่เปิดอยู่ = ชน · แก้ตัวเองไม่ชนตัวเอง', async () => {
      const a = await createBot(S.shop, S.user, fields({ channelIds: [S.ch2], salesStatuses: ['NOT_BOUGHT'] }))
      await changeBotStatus(S.shop, S.user, a.id, { status: 'ACTIVE', expectedUpdatedAt: a.updatedAt })
      await expect(createBot(S.shop, S.user, fields({ channelIds: [S.ch2], salesStatuses: ['BILLED'] }))).resolves.toBeTruthy() // สถานะไม่ซ้อน
      await expect(createBot(S.shop, S.user, fields({ channelIds: [S.line], salesStatuses: ['NOT_BOUGHT'] }))).resolves.toBeTruthy() // คนละช่อง
      await expect(createBot(S.shop, S.user, fields({ channelIds: [S.ch2, S.line], salesStatuses: [] , tags: ['VIP'] }))).rejects.toBeInstanceOf(SalesFollowBotChannelConflictError) // ว่าง = ทุกสถานะ
      await expect(updateBot(S.shop, S.user, a.id, { name: 'ชื่อใหม่', expectedUpdatedAt: (await getBot(S.shop, a.id)).updatedAt })).resolves.toMatchObject({ name: 'ชื่อใหม่' })
    })
  })

  // ───────────────────────── สถานะ + ห้องทดสอบ ─────────────────────────
  describe('changeBotStatus + ห้องทดสอบ (TFR-FB-06)', () => {
    it('TESTING ต้องมีห้อง 1..20 บนช่องของบอทและเป็นของร้าน · แทนที่ชุดเดิม', async () => {
      const b = await createBot(S.shop, S.user, fields({ channelIds: [S.ch] }))
      const room = await mkConv()
      const otherChannelRoom = await mkConv({ chId: S.ch2, channel: 'INSTAGRAM' })
      const foreign = await mkConv({ shopId: S.other, chId: S.otherCh })
      const go = (ids?: string[], at = b.updatedAt) => changeBotStatus(S.shop, S.user, b.id, { status: 'TESTING', testRoomIds: ids, expectedUpdatedAt: at })
      await expect(go(undefined)).rejects.toMatchObject({ code: 'TEST_ROOMS_REQUIRED' })
      await expect(go([])).rejects.toMatchObject({ code: 'TEST_ROOMS_REQUIRED' })
      await expect(go([randomUUID()])).rejects.toMatchObject({ code: 'TEST_ROOM_NOT_FOUND' })
      await expect(go([otherChannelRoom])).rejects.toMatchObject({ code: 'TEST_ROOM_NOT_FOUND' })
      await expect(go([foreign])).rejects.toBeInstanceOf(SalesFollowBotTestRoomsError)
      await expect(go(Array.from({ length: 21 }, () => randomUUID()))).rejects.toMatchObject({ code: 'TEST_ROOMS_TOO_MANY' })
      const ok = await go([room])
      expect(ok).toMatchObject({ status: 'TESTING', testRoomIds: [room] })
      const room2 = await mkConv()
      expect((await go([room2], ok.updatedAt)).testRoomIds).toEqual([room2])
    })

    it('searchTestRooms: ค้นชื่อ/นามแฝง · ≤20 · ไม่รวมสแปม/ซ่อน/DEEP', async () => {
      const a = await mkConv()
      await db.conversation.update({ where: { id: a }, data: { alias: `พิเศษ-${run}` } })
      const spam = await mkConv()
      await db.conversation.update({ where: { id: spam }, data: { alias: `พิเศษ-${run}`, isSpam: true } })
      const r = await searchTestRooms(S.shop, [S.ch], `พิเศษ-${run}`.toUpperCase())
      expect(r.map((x) => x.conversationId)).toEqual([a])
      expect(r[0]).toMatchObject({ contactName: `พิเศษ-${run}`, channel: 'MESSENGER', shopChannelId: S.ch })
      expect((await searchTestRooms(S.shop, [S.ch])).length).toBeLessThanOrEqual(20)
      expect(await searchTestRooms(S.shop, [])).toEqual([])
    })
  })

  // ───────────────────────── แก้ / ลบ ─────────────────────────
  describe('updateBot: โครงขั้น vs ถ้อยคำ (TC-183/184)', () => {
    it('แก้ถ้อยคำ/delay/ชื่อ/รูปของชิ้นเดิม/บันทึกซ้ำ = ไม่หยุด structureRev เท่าเดิม', async () => {
      const { bot, runId, conv } = await botWithRun()
      const cur = await getBot(S.shop, bot.id)
      const r1 = await updateBot(S.shop, S.user, bot.id, { steps: [step(45, 'ข้อความใหม่'), step(90)], name: 'ชื่อใหม่', expectedUpdatedAt: cur.updatedAt })
      expect(r1).toMatchObject({ stoppedRuns: 0, structureRev: bot.structureRev, name: 'ชื่อใหม่' })
      const r2 = await updateBot(S.shop, S.user, bot.id, { steps: r1.steps, expectedUpdatedAt: r1.updatedAt }) // บันทึกซ้ำ
      expect(r2.stoppedRuns).toBe(0)
      expect(await db.salesFollowRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: 'ACTIVE', stopReason: null })
      expect(await notesOf(conv)).toHaveLength(0)
    })

    it('FR-FA-8 แก้กฎเงื่อนไข = ไม่ใช่โครงรอบ (structureRev เท่าเดิม · run ไม่หยุด) · เก็บ has_none/is_not เป็น nameKey · แท็กที่ร้านไม่มี = TagNotFound', async () => {
      const { bot, runId, conv } = await botWithRun()
      const cur = await getBot(S.shop, bot.id)
      const rules: BotFields['rules'] = [
        { field: 'stage', op: 'is_not', values: ['SHIPPED'] },
        { field: 'tag', op: 'has_none', values: ['  VIP '] },
        { field: 'tag', op: 'has_any', values: ['ถามราคา'] },
      ]
      const r = await updateBot(S.shop, S.user, bot.id, { rules, conditionMatch: 'ALL', expectedUpdatedAt: cur.updatedAt })
      expect(r).toMatchObject({ stoppedRuns: 0, structureRev: bot.structureRev })
      expect(r.rules[1]).toEqual({ field: 'tag', op: 'has_none', values: [{ key: 'vip', name: 'VIP', missing: false }] })
      expect(await db.salesFollowRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: 'ACTIVE', stopReason: null })
      expect(await notesOf(conv)).toHaveLength(0)
      await expect(updateBot(S.shop, S.user, bot.id, { rules: [{ field: 'tag', op: 'has_none', values: ['ไม่มีแท็กนี้'] }, { field: 'tag', op: 'has_any', values: ['VIP'] }], expectedUpdatedAt: r.updatedAt })).rejects.toBeInstanceOf(SalesFollowBotTagNotFoundError)
      // มีแต่ "ไม่ใช่/ไม่มี" = ครอบเกือบทั้งร้าน ปฏิเสธ
      await expect(updateBot(S.shop, S.user, bot.id, { rules: [{ field: 'tag', op: 'has_none', values: ['VIP'] }], expectedUpdatedAt: r.updatedAt })).rejects.toMatchObject({ issues: [expect.objectContaining({ code: 'RULES_TOO_BROAD' })] })
    })

    it('แก้โครง (เพิ่มชิ้น/เปลี่ยนชนิด/เพิ่มรอบ/สลับลำดับ) = structureRev+1 · หยุด run BOT_EDITED + บรรทัดระบบในทรานแซกชันเดียว [M-rev]', async () => {
      const img = `2026/11/16/${randomUUID()}.png`
      await db.mediaAsset.create({ data: { shopId: S.shop, hash: randomUUID(), fileId: img, contentType: 'image/png', size: 1 } })
      const structural: ((s: BotFields['steps']) => BotFields['steps'])[] = [
        (s) => [{ ...s[0], parts: [...s[0].parts, TEXT('ชิ้นที่สอง')] }, s[1]],
        (s) => [{ ...s[0], parts: [{ kind: 'IMAGES', fileIds: [img] }] }, s[1]],
        (s) => [...s, step(10)],
        (s) => [s[0], { ...s[1], parts: [TEXT('x'), { kind: 'IMAGES', fileIds: [img] }] }].reverse() as BotFields['steps'],
      ]
      for (const edit of structural) {
        const { bot, runId, conv } = await botWithRun({ fields: { channelIds: [S.line] } })
        const cur = await getBot(S.shop, bot.id)
        const r = await updateBot(S.shop, S.user, bot.id, { steps: edit(cur.steps.map(({ adOnly: _a, ...s }) => s)), expectedUpdatedAt: cur.updatedAt })
        expect(r.structureRev).toBe(bot.structureRev + 1)
        expect(r.stoppedRuns).toBe(1)
        expect(await db.salesFollowRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: 'STOPPED', stopReason: 'BOT_EDITED', stoppedByUserId: S.user })
        expect((await notesOf(conv)).map((n) => n.body)).toEqual([`บอท “${bot.name}” หยุดติดตามแล้ว เพราะบอทถูกแก้ไขขั้นตอน`])
        await db.salesFollowBot.update({ where: { id: bot.id }, data: { deletedAt: new Date() } })
      }
    })

    it('quick message เดิมที่ถูกลบไปแล้วยังบันทึกได้ถ้าไม่ได้เลือกใหม่ · เลือกใหม่ของร้านอื่นไม่ได้', async () => {
      const qm = await db.quickMessage.create({ data: { shopId: S.shop, title: 'จะลบ', body: 'x', createdByUserId: S.user }, select: { id: true } })
      const quickStep = (id: string) => ({ delayMin: 5, parts: [{ kind: 'QUICK_MESSAGE' as const, quickMessageId: id }] })
      const b = await createBot(S.shop, S.user, fields({ steps: [quickStep(qm.id)] }))
      await db.quickMessage.delete({ where: { id: qm.id } })
      const ok = await updateBot(S.shop, S.user, b.id, { name: 'ยังบันทึกได้', expectedUpdatedAt: b.updatedAt })
      expect(ok.stoppedRuns).toBe(0)
      await expect(updateBot(S.shop, S.user, b.id, { steps: [quickStep(S.foreignQm)], expectedUpdatedAt: ok.updatedAt })).rejects.toBeInstanceOf(SalesFollowBotValidationError)
    })
  })

  describe('deleteBot (TC-185)', () => {
    it('soft delete · หยุดทุก run BOT_DELETED + บรรทัดระบบ · ประวัติ Send ยังอยู่ botDeleted=true', async () => {
      const { bot, runId, conv } = await botWithRun()
      const r2 = await botWithRun({ fields: { channelIds: [S.line] } }) // ชนช่อง? คนละช่อง ไม่ชน
      await db.salesFollowSend.create({ data: { shopId: S.shop, runId, conversationId: conv, botId: bot.id, step: 0, stepCount: 2, status: 'SKIPPED', reason: 'IMAGE_MISSING', settledAt: now } })
      const cur = await getBot(S.shop, bot.id)
      expect(cur.activeRunCount).toBe(1)
      expect(await deleteBot(S.shop, S.user, bot.id, cur.updatedAt)).toEqual({ deleted: true, stoppedRuns: 1 })
      expect(await db.salesFollowBot.findUniqueOrThrow({ where: { id: bot.id } })).toMatchObject({ deletedAt: expect.any(Date) })
      expect(await db.salesFollowRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: 'STOPPED', stopReason: 'BOT_DELETED' })
      expect((await notesOf(conv))[0].body).toBe(`บอท “${bot.name}” หยุดติดตามแล้ว เพราะบอทถูกลบ`)
      expect(await db.salesFollowRun.findUniqueOrThrow({ where: { id: r2.runId } })).toMatchObject({ status: 'ACTIVE' }) // บอทอื่นไม่โดน
      const hist = (await listSends(S.shop)).items.find((i) => i.conversationId === conv)!
      expect(hist).toMatchObject({ botDeleted: true, botName: bot.name, reason: 'IMAGE_MISSING', reasonText: 'ไม่พบรูป', step: 1, stepCount: 2 })
      await expect(getBot(S.shop, bot.id)).rejects.toBeInstanceOf(SalesFollowBotNotFoundError)
    })
  })

  // ───────────────────────── หยุดรายห้อง + บรรทัดระบบ ─────────────────────────
  describe('stopRunForConversation + FOLLOW_BOT_NOTE (TC-140/179/180)', () => {
    it('หยุดครั้งแรก ADMIN_STOPPED + บรรทัดระบบ · ซ้ำ/ไม่มี run = stopped:false ไม่เขียนซ้ำ · ไม่แตะ lastMessage*', async () => {
      const { runId, conv, bot } = await botWithRun()
      const before = await db.conversation.findUniqueOrThrow({ where: { id: conv }, select: { lastMessageAt: true, lastMessagePreview: true, lastSenderRole: true } })
      expect(await stopRunForConversation(S.shop, conv, S.user2)).toEqual({ stopped: true })
      expect(await stopRunForConversation(S.shop, conv, S.user2)).toEqual({ stopped: false })
      expect(await stopRunForConversation(S.shop, await mkConv(), S.user2)).toEqual({ stopped: false })
      const row = await db.salesFollowRun.findUniqueOrThrow({ where: { id: runId } })
      expect(row).toMatchObject({ status: 'STOPPED', stopReason: 'ADMIN_STOPPED', stoppedByUserId: S.user2, finishedAt: expect.any(Date), holdReason: null })
      const notes = await notesOf(conv)
      expect(notes).toHaveLength(1)
      expect(notes[0]).toMatchObject({ senderRole: 'SHOP', senderUserId: null, autoReplyKind: null, type: 'FOLLOW_BOT_NOTE', body: `บอท “${bot.name}” หยุดติดตามแล้ว เพราะร้านสั่งหยุด` })
      expect(await db.conversation.findUniqueOrThrow({ where: { id: conv }, select: { lastMessageAt: true, lastMessagePreview: true, lastSenderRole: true } })).toEqual(before)
      // บรรทัดระบบไม่ใช่ "ร้านตอบ" (TFR-FB-17)
      expect((await loadRoomBundles(S.shop, [conv], now)).get(conv)!.latestShopReply).toBeNull()
    })

    it('หยุดพร้อมกัน 2 คำขอ = มีผู้ชนะ 1 · บรรทัดเดียว [M-active]', async () => {
      const { conv } = await botWithRun()
      const r = await Promise.all([stopRunForConversation(S.shop, conv, S.user), stopRunForConversation(S.shop, conv, S.user2)])
      expect(r.filter((x) => x.stopped)).toHaveLength(1)
      expect(await notesOf(conv)).toHaveLength(1)
    })

    it('ทุกเหตุหยุดมีคำไทยในบรรทัดระบบ (ไม่โชว์รหัสดิบ)', () => {
      for (const r of STOP_REASONS) {
        expect(STOP_NOTE_REASON_TEXT[r]).toMatch(/[ก-๙]/)
        expect(buildStopNoteBody('ทดสอบ', r)).toBe(`บอท “ทดสอบ” หยุดติดตามแล้ว เพราะ${STOP_NOTE_REASON_TEXT[r]}`)
      }
    })
  })

  // ───────────────────────── ประวัติ + cursor ─────────────────────────
  describe('listSends (TC keyset)', () => {
    it('keyset (createdAt DESC, id DESC) หน้าละ limit · ไม่ซ้ำไม่ตก · เวลา = ฟองจริงเมื่อ SENT · ฟิลด์โปรไฟล์/ช่องทางครบ', async () => {
      const { runId, conv, bot } = await botWithRun({ fields: { steps: [step(1), step(2), step(3)] } })
      const bubble = await say(conv, ago(7 * 60_000), 'SHOP', { autoReplyKind: 'AUTO_FOLLOW' })
      const t = (m: number) => ago(m * 60_000)
      await db.salesFollowSend.createMany({
        data: [
          { shopId: S.shop, runId, conversationId: conv, botId: bot.id, step: 0, stepCount: 3, status: 'SENT', chatMessageId: bubble.id, messageIds: [bubble.id], createdAt: t(9), settledAt: t(8) },
          { shopId: S.shop, runId, conversationId: conv, botId: bot.id, step: 1, stepCount: 3, status: 'FAILED', reason: 'PLATFORM_REJECTED', createdAt: t(6), settledAt: t(5) },
          { shopId: S.shop, runId, conversationId: conv, botId: bot.id, step: 2, stepCount: 3, status: 'SKIPPED', reason: 'LINE_QUOTA_FULL', createdAt: t(6), settledAt: t(4) }, // createdAt ชน → ตัดสินที่ id
        ],
      })
      // เดินทุกหน้าด้วย limit 2 — ต้องได้ครบทุกแถวของร้าน ไม่ซ้ำ ไม่ตก เรียงเหมือน DB
      const items: Awaited<ReturnType<typeof listSends>>['items'] = []
      let cursor: string | null = null
      let pages = 0
      do {
        const page: Awaited<ReturnType<typeof listSends>> = await listSends(S.shop, { limit: 2, cursor })
        expect(page.items.length).toBeLessThanOrEqual(2)
        items.push(...page.items)
        cursor = page.nextCursor
        pages++
      } while (cursor && pages < 100)
      const rows = await db.salesFollowSend.findMany({ where: { shopId: S.shop }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } })
      expect(items.map((i) => i.id)).toEqual(rows.map((r) => r.id))
      expect(pages).toBeGreaterThan(1)
      const all = items.filter((i) => i.conversationId === conv)
      expect(all).toHaveLength(3)
      const sent = all.find((i) => i.status === 'SENT')!
      expect(sent.at).toBe(ago(7 * 60_000).toISOString()) // ฟองจริง ไม่ใช่ settledAt/createdAt
      expect(sent).toMatchObject({ contactName: 'สมชาย', channel: 'MESSENGER', channelName: 'เพจ m1', channelHandle: null, botDeleted: false, step: 1, stepCount: 3, contactAvatarUrl: null })
      expect(all.find((i) => i.reason === 'LINE_QUOTA_FULL')).toMatchObject({ reasonText: 'โควตา LINE เต็ม', step: 3 })
    })

    it('cursor ปลอม/พัง = หน้าว่าง ไม่ throw (AC-FB-81)', async () => {
      const bad = ['!!!', 'abc', Buffer.from('ไม่ใช่เวลา|x').toString('base64url'), Buffer.from(`${now.toISOString()}|ไม่ใช่uuid`).toString('base64url'),
        Buffer.from(`2026-13-45T00:00:00.000Z|${randomUUID()}`).toString('base64url'), Buffer.from(`${now.toISOString()}|${randomUUID()}|extra`).toString('base64url')]
      for (const c of bad) expect(await listSends(S.shop, { cursor: c })).toEqual({ items: [], nextCursor: null })
      expect(decodeSendsCursor(encodeSendsCursor(now, randomUUID()))).not.toBeNull()
      expect(decodeSendsCursor('!!!')).toBeNull()
    })
  })

  // ───────────────────────── แผงในห้อง ─────────────────────────
  describe('getConversationPanel (TFR-FB-20 · TC-187)', () => {
    it('ห้อง DEEP / ร้านไม่ผ่านด่าน = available:false · ไม่มี run = run:null', async () => {
      const deep = await db.conversation.create({ data: { shopId: S.shop, channel: 'DEEP' }, select: { id: true } })
      expect(await getConversationPanel(S.shop, deep.id)).toEqual({ available: false })
      const conv = await mkConv()
      expect(await getConversationPanel(S.shop, conv)).toEqual({ available: true, run: null })
      process.env.SALES_FOLLOW_BOT_SHOP_IDS = S.other
      try {
        expect(await getConversationPanel(S.shop, conv)).toEqual({ available: false })
      } finally {
        process.env.SALES_FOLLOW_BOT_SHOP_IDS = `${S.shop},${S.other}`
      }
    })

    it('แสดงรอบ: ส่งแล้ว (เวลาฟองจริง) / รอส่ง (dueAt) / ข้าม + เหตุผล · ร้านค้างตอบ = awaitingShop และไม่มี dueAt', async () => {
      const { runId, conv, bot } = await botWithRun({ fields: { steps: [step(30), step(60), step(120)] } })
      await say(conv, ago(30 * 60_000), 'SHOP') // ร้านตอบ → ไม่ค้างตอบ
      const b1 = await say(conv, ago(20 * 60_000), 'SHOP', { autoReplyKind: 'AUTO_FOLLOW' })
      await db.salesFollowSend.create({ data: { shopId: S.shop, runId, conversationId: conv, botId: bot.id, step: 0, stepCount: 3, status: 'SENT', chatMessageId: b1.id, messageIds: [b1.id], settledAt: now } })
      await db.salesFollowRun.update({ where: { id: runId }, data: { nextStep: 1, lastSentAt: ago(20 * 60_000) } })

      const p = await getConversationPanel(S.shop, conv, now)
      if (!p.available || !p.run) throw new Error('ควรมี run')
      expect(p.run).toMatchObject({ runId, botName: bot.name, stageLabel: 'ยังไม่ซื้อ', holdReason: null, awaitingShop: false, canStop: true })
      expect(p.run.steps.map((s) => s.state)).toEqual(['SENT', 'PENDING', 'PENDING'])
      expect(p.run.steps[0].sentAt).toBe(ago(20 * 60_000).toISOString())
      // dueAt รอบที่ 2 = max(ร้านตอบ, lastSent) + 60 นาที · รอบที่ 3 ต่อท้ายด้วย 120
      expect(p.run.steps[1].dueAt).toBe(new Date(ago(20 * 60_000).getTime() + 60 * 60_000).toISOString())
      expect(p.run.steps[2].dueAt).toBe(new Date(ago(20 * 60_000).getTime() + 180 * 60_000).toISOString())

      // ลูกค้าพิมพ์หลังบอท → แผงซ่อน run ทันที (ก่อน tick หยุดจริง) AC-FB-74
      await say(conv, ago(5 * 60_000))
      expect(await getConversationPanel(S.shop, conv, now)).toEqual({ available: true, run: null })
      expect(await db.salesFollowRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: 'ACTIVE' }) // ยังไม่ถูกหยุดโดยแผง
    })

    it('ลูกค้าตอบก่อนฟองบอทแรก (ยังไม่ส่ง) ไม่ใช่เหตุหยุด → ร้านค้างตอบ = awaitingShop ไม่มี dueAt · แท็กไม่ตรง = ซ่อน', async () => {
      const { conv, runId } = await botWithRun({ fields: { salesStatuses: ['NOT_BOUGHT'], tags: ['VIP'], tagMatch: 'ALL' } })
      const contact = await db.conversation.findUniqueOrThrow({ where: { id: conv }, select: { externalContactId: true } })
      // แท็กยังไม่ติด → TAG_REMOVED → ซ่อน
      expect(await getConversationPanel(S.shop, conv, now)).toEqual({ available: true, run: null })
      await db.externalContact.update({ where: { id: contact.externalContactId! }, data: { tags: ['VIP'] } })
      const p = await getConversationPanel(S.shop, conv, now)
      if (!p.available || !p.run) throw new Error('ควรมี run เมื่อแท็กตรง')
      expect(p.run.awaitingShop).toBe(true)
      expect(p.run.steps.every((s) => s.dueAt === null)).toBe(true)
      expect(p.run.runId).toBe(runId)
    })

    it('พัก: ช่องทางหลุด = holdText ภาษาไทย', async () => {
      const { conv } = await botWithRun({ fields: { channelIds: [S.ch2] }, conv: await mkConv({ chId: S.ch2, channel: 'INSTAGRAM' }) })
      await say(conv, ago(60_000), 'SHOP')
      await db.shopChannel.update({ where: { id: S.ch2 }, data: { status: 'TOKEN_INVALID' } })
      try {
        const p = await getConversationPanel(S.shop, conv, now)
        if (!p.available || !p.run) throw new Error('ควรมี run')
        expect(p.run).toMatchObject({ holdReason: 'CHANNEL_NOT_ACTIVE', holdText: 'ช่องทางหลุด' })
      } finally {
        await db.shopChannel.update({ where: { id: S.ch2 }, data: { status: 'ACTIVE' } })
      }
    })
  })

  // ───────────────────────── แถวกล่องแชท ─────────────────────────
  describe('getFollowBotRowSummaries (UX §21)', () => {
    it('{ sentRounds, totalRounds, awaitingShop } | null ต่อห้อง · คีย์ครบทุก id · ไม่มี run = null · ร้านไม่ผ่านด่าน = null ทั้งหมด', async () => {
      const a = await botWithRun({ fields: { steps: [step(30), step(60), step(90)] } })
      const idle = await mkConv()
      await say(a.conv, ago(30 * 60_000), 'SHOP')
      const b1 = await say(a.conv, ago(20 * 60_000), 'SHOP', { autoReplyKind: 'AUTO_FOLLOW' })
      await db.salesFollowSend.create({ data: { shopId: S.shop, runId: a.runId, conversationId: a.conv, botId: a.bot.id, step: 0, stepCount: 3, status: 'SENT', chatMessageId: b1.id, messageIds: [b1.id], settledAt: now } })
      await db.salesFollowSend.create({ data: { shopId: S.shop, runId: a.runId, conversationId: a.conv, botId: a.bot.id, step: 1, stepCount: 3, status: 'SKIPPED', reason: 'EMPTY_MESSAGE', settledAt: now } })

      let m = await getFollowBotRowSummaries(S.shop, [a.conv, idle, a.conv])
      expect([...m.keys()].sort()).toEqual([a.conv, idle].sort())
      expect(m.get(a.conv)).toEqual({ sentRounds: 1, totalRounds: 3, awaitingShop: false, finalPending: null }) // ข้าม ≠ ส่งแล้ว
      expect(m.get(idle)).toBeNull()

      await say(a.conv, ago(1 * 60_000)) // ลูกค้าพิมพ์ล่าสุด
      m = await getFollowBotRowSummaries(S.shop, [a.conv])
      expect(m.get(a.conv)).toEqual({ sentRounds: 1, totalRounds: 3, awaitingShop: true, finalPending: null })

      process.env.SALES_FOLLOW_BOT_SHOP_IDS = ''
      try {
        expect((await getFollowBotRowSummaries(S.shop, [a.conv])).get(a.conv)).toBeNull()
      } finally {
        process.env.SALES_FOLLOW_BOT_SHOP_IDS = `${S.shop},${S.other}`
      }
      expect((await getFollowBotRowSummaries(S.shop, [])).size).toBe(0)
    })
  })


  // ───────────────────────── ด่านรูป (security HIGH: IDOR) ─────────────────────────
  describe('assertOwnedImages / findOwnedImageIds', () => {
    const fid = (ext = 'png') => `2026/11/16/${randomUUID()}.${ext}`
    const imgStep = (...fileIds: string[]) => [{ delayMin: 5, parts: [{ kind: 'IMAGES' as const, fileIds }] }]
    const ownedBy = async (shopId: string, ids: string[]) => [...(await findOwnedImageIds(db, shopId, ids))].sort()

    it('รูปแบบ: รับ YYYY/MM/DD/uuid.ext และ uuid.ext แบบเก่า · ปฏิเสธ .. http /api/files ? ยาวเกิน ว่าง ชนิดผิด', () => {
      const u = randomUUID()
      for (const ok of [fid(), `${u}.jpg`, `2026/01/02/${u}.JPEG`]) expect(isValidImageFileId(ok), ok).toBe(true)
      const bad = [`../${u}.png`, `2026/11/16/../${u}.png`, `https://x.com/${u}.png`, `/api/files/2026/11/16/${u}.png`, `${fid()}?t=1`, `2026/11/16/${u}`,
        `kyc/${u}.png`, `2026/11/16/${'a'.repeat(120)}.png`, '', 'x', `2026/11/16/${u}.png/`, `2026/1/2/${u}.png`]
      for (const b of bad) expect(isValidImageFileId(b), b).toBe(false)
      expect(isValidImageFileId(null)).toBe(false)
      expect(isValidImageFileId(`${'a'.repeat(100)}/${u}.png`)).toBe(false)
    })

    it('ของร้านจากทุกแหล่งผ่าน (ข้อความสำเร็จรูป · imageFileId เก่า · คลังลูกค้า · MediaAsset · รูปที่ร้านส่งในแชท)', async () => {
      const [a, b, c, d, e] = [fid(), fid(), fid('jpg'), fid(), fid()]
      await db.quickMessage.create({ data: { shopId: S.shop, title: 'q', body: '', createdByUserId: S.user, imageFileIds: [a] } })
      await db.quickMessage.create({ data: { shopId: S.shop, title: 'q2', body: '', createdByUserId: S.user, imageFileId: b } })
      const conv = await mkConv()
      await db.customerFile.create({ data: { shopId: S.shop, conversationId: conv, fileId: c, kind: 'IMAGE', senderRole: 'SHOP', sentAt: now } })
      await db.mediaAsset.create({ data: { shopId: S.shop, hash: randomUUID(), fileId: d, contentType: 'image/png', size: 1 } })
      await say(conv, now, 'SHOP', { imageUrl: e, type: 'IMAGE' })
      expect(await ownedBy(S.shop, [a, b, c, d, e])).toEqual([a, b, c, d, e].sort())
      await expect(assertOwnedImages(db, S.shop, imgStep(a, b, c, d, e))).resolves.toBeUndefined()
    })

    it('ของร้านอื่นทุกแหล่ง = ไม่ผ่าน (ไม่บอกว่าเป็นของใคร) · PART_IMAGE_NOT_FOUND ที่ชิ้นนั้น', async () => {
      const [a, c, d, e] = [fid(), fid(), fid(), fid()]
      await db.quickMessage.create({ data: { shopId: S.other, title: 'q', body: '', createdByUserId: S.user2, imageFileIds: [a] } })
      const oc = await mkConv({ shopId: S.other, chId: S.otherCh })
      await db.customerFile.create({ data: { shopId: S.other, conversationId: oc, fileId: c, kind: 'IMAGE', senderRole: 'SHOP', sentAt: now } })
      await db.mediaAsset.create({ data: { shopId: S.other, hash: randomUUID(), fileId: d, contentType: 'image/png', size: 1 } })
      await say(oc, now, 'SHOP', { imageUrl: e, type: 'IMAGE' })
      expect(await ownedBy(S.shop, [a, c, d, e])).toEqual([])
      expect(await ownedBy(S.other, [a, c, d, e])).toEqual([a, c, d, e].sort()) // ร้านเจ้าของเองยังผ่าน (กัน mutation คืนว่างเสมอ)
      const err = await assertOwnedImages(db, S.shop, [{ delayMin: 5, parts: [TEXT('ก'), { kind: 'IMAGES', fileIds: [fid(), a] }] }]).catch((x) => x)
      expect(err).toBeInstanceOf(SalesFollowBotValidationError)
      expect(err.issues).toEqual([{ code: 'PART_IMAGE_NOT_FOUND', path: 'steps.0.parts.1.fileIds', stepIndex: 0, partIndex: 1 }])
    })

    it('รูปที่ "ลูกค้า" ส่งในแชทของร้านเดียวกัน (และรูปใน CustomerFile ฝั่งลูกค้าไม่นับ — มีแค่ ChatMessage ที่ตรวจ role) = ไม่ผ่าน [M-img-buyer]', async () => {
      const f = fid()
      const conv = await mkConv()
      await say(conv, now, 'BUYER', { imageUrl: f, type: 'IMAGE' })
      expect(await ownedBy(S.shop, [f])).toEqual([])
      await expect(createBot(S.shop, S.user, fields({ steps: imgStep(f) }))).rejects.toMatchObject({ issues: [expect.objectContaining({ code: 'PART_IMAGE_NOT_FOUND' })] })
    })

    it('รูปแบบผิด = ไม่แตะฐานและปฏิเสธ · createBot/updateBot ใช้ด่านจริง · fileId เดิมของบอทผ่านแม้ที่มาหายไปแล้ว [M-img-owner]', async () => {
      const mine = fid()
      const qm = await db.quickMessage.create({ data: { shopId: S.shop, title: 'img', body: '', createdByUserId: S.user, imageFileIds: [mine] }, select: { id: true } })
      await expect(createBot(S.shop, S.user, fields({ steps: imgStep(`../${randomUUID()}.png`) }))).rejects.toBeInstanceOf(SalesFollowBotValidationError)
      await expect(createBot(S.shop, S.user, fields({ steps: imgStep(fid()) }))).rejects.toBeInstanceOf(SalesFollowBotValidationError) // รูปแบบถูกแต่ไม่มีเจ้าของ
      const bot = await createBot(S.shop, S.user, fields({ steps: imgStep(mine) }))
      // แก้ → ใส่รูปของคนอื่นเพิ่ม = ปฏิเสธ
      const foreign = fid()
      await db.mediaAsset.create({ data: { shopId: S.other, hash: randomUUID(), fileId: foreign, contentType: 'image/png', size: 1 } })
      await expect(updateBot(S.shop, S.user, bot.id, { steps: imgStep(mine, foreign), expectedUpdatedAt: bot.updatedAt })).rejects.toBeInstanceOf(SalesFollowBotValidationError)
      // ที่มาหาย (ลบข้อความสำเร็จรูป) แต่ fileId เดิมของบอท = แก้ชื่อ/ถ้อยคำได้
      await db.quickMessage.delete({ where: { id: qm.id } })
      const r = await updateBot(S.shop, S.user, bot.id, { name: 'ยังแก้ได้', steps: imgStep(mine), expectedUpdatedAt: bot.updatedAt })
      expect(r.name).toBe('ยังแก้ได้')
    })

    it('ความยาว fileId / quickMessageId ≤ 120 (validateBotFields)', () => {
      const base = fields()
      const long = 'a'.repeat(121)
      expect(validateBotFields({ ...base, steps: imgStep(long) }).map((i) => i.code)).toContain('PART_IMAGES_COUNT')
      expect(validateBotFields({ ...base, steps: [{ delayMin: 5, parts: [{ kind: 'QUICK_MESSAGE', quickMessageId: long }] }] }).map((i) => i.code)).toContain('QUICK_MESSAGE_REQUIRED')
    })
  })

  // ───────────────────────── ชั้นที่สองของด่านร้าน ─────────────────────────
  describe('assertAvailable ที่ฟังก์ชันเขียน (security LOW)', () => {
    it('ร้านไม่อยู่ในรายชื่อนำร่อง = FEATURE_NOT_ENABLED ทุกฟังก์ชันเขียน · แต่ stop ยังหยุดบอทที่ค้างได้', async () => {
      const { conv, bot } = await botWithRun()
      process.env.SALES_FOLLOW_BOT_SHOP_IDS = S.other
      try {
        const cur = await getBot(S.shop, bot.id)
        const nope = { reason: 'FEATURE_NOT_ENABLED' }
        await expect(createBot(S.shop, S.user, fields())).rejects.toMatchObject(nope)
        await expect(updateBot(S.shop, S.user, bot.id, { name: 'x', expectedUpdatedAt: cur.updatedAt })).rejects.toMatchObject(nope)
        await expect(changeBotStatus(S.shop, S.user, bot.id, { status: 'CLOSED', expectedUpdatedAt: cur.updatedAt })).rejects.toBeInstanceOf(SalesFollowBotNotAvailableError)
        expect(await stopRunForConversation(S.shop, conv, S.user)).toEqual({ stopped: true })
      } finally {
        process.env.SALES_FOLLOW_BOT_SHOP_IDS = `${S.shop},${S.other}`
      }
    })

    it('ร้านไม่ใช่ ONLINE_SALES = NOT_AVAILABLE_FOR_SHOP · summaries คืน null ทุกห้อง', async () => {
      const { conv } = await botWithRun()
      await db.shop.update({ where: { id: S.shop }, data: { vertical: 'LODGING' } })
      try {
        await expect(createBot(S.shop, S.user, fields())).rejects.toMatchObject({ reason: 'NOT_AVAILABLE_FOR_SHOP' })
        expect((await getFollowBotRowSummaries(S.shop, [conv])).get(conv)).toBeNull()
      } finally {
        await db.shop.update({ where: { id: S.shop }, data: { vertical: 'ONLINE_SALES' } })
      }
      expect((await getFollowBotRowSummaries(S.shop, [conv])).get(conv)).not.toBeNull()
    })
  })

  describe('stopRunsWithNote ข้ามร้านตรง ๆ [M-stop-shop]', () => {
    it('shopId ไม่ตรง = ไม่หยุด run ไม่เขียนบรรทัด (ทั้งตัวกรอง conversationId/botId/runId)', async () => {
      const { conv, bot, runId } = await botWithRun()
      for (const f of [{ conversationId: conv }, { botId: bot.id }, { runId }]) {
        const r = await db.$transaction((tx) => stopRunsWithNote(tx, { shopId: S.other, ...f }, 'ADMIN_STOPPED'))
        expect(r).toEqual([])
      }
      expect(await db.salesFollowRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: 'ACTIVE' })
      expect(await notesOf(conv)).toHaveLength(0)
      await expect(db.$transaction((tx) => stopRunsWithNote(tx, { shopId: S.shop }, 'ADMIN_STOPPED'))).rejects.toThrow() // ต้องระบุตัวกรอง
    })
  })

  describe('searchTestRooms: escape wildcard', () => {
    it('q มี % หรือ _ จับตรงตัวอักษร ไม่ใช่ wildcard', async () => {
      const mk = async (alias: string) => {
        const id = await mkConv()
        await db.conversation.update({ where: { id }, data: { alias } })
        return id
      }
      const tag = run
      const a = await mk(`ab_${tag}c`)
      const b = await mk(`abX${tag}c`)
      const c = await mk(`50%${tag}`)
      const d = await mk(`500${tag}`)
      const ids = async (q: string) => (await searchTestRooms(S.shop, [S.ch], q)).map((r) => r.conversationId).sort()
      expect(await ids(`ab_${tag}c`)).toEqual([a])
      expect(await ids(`50%${tag}`)).toEqual([c])
      expect(await ids('%')).toEqual([c])
      expect(await ids(`_${tag}`)).toEqual([a])
      expect([b, d].some((x) => x === a)).toBe(false)
    })
  })

  // ───────────────────────── ตัวเลข 7 วัน (redesign) ─────────────────────────
  describe('getBotStats7d: ผูกร้าน + ช่วง 7 วัน + ตัวหารตอบกลับ', () => {
    it('นับเฉพาะ SENT/FAILED ในช่วง · ตอบกลับ = run ที่ได้รับข้อความแล้วหยุดเพราะลูกค้าตอบ · ไม่รั่วข้ามร้าน', async () => {
      await resetBots()
      const a = await botWithRun()
      const b = await botWithRun({ fields: { salesStatuses: ['BILLED'] } })
      const mkSend = (runId: string, botId: string, conv: string, step: number, status: string, at: Date, shopId = S.shop) =>
        db.salesFollowSend.create({ data: { shopId, runId, conversationId: conv, botId, step, stepCount: 2, status, reason: status === 'FAILED' ? 'PLATFORM_REJECTED' : null, createdAt: at, settledAt: at } as never })
      await mkSend(a.runId, a.bot.id, a.conv, 0, 'SENT', ago(3_600_000))
      await mkSend(a.runId, a.bot.id, a.conv, 1, 'SENT', ago(1_800_000))
      await mkSend(b.runId, b.bot.id, b.conv, 0, 'FAILED', ago(3_600_000))
      await mkSend(b.runId, b.bot.id, b.conv, 1, 'SENT', ago(8 * 86_400_000)) // นอกช่วง
      await db.salesFollowRun.update({ where: { id: a.runId }, data: { status: 'STOPPED', stopReason: 'CUSTOMER_REPLIED', finishedAt: now } })
      const r = await getBotStats7d(S.shop, now)
      expect(r.byBot[a.bot.id]).toEqual({ sent: 2, failed: 0, reached: 1, replied: 1 })
      expect(r.byBot[b.bot.id]).toEqual({ sent: 0, failed: 1, reached: 0, replied: 0 })
      // ร้านเทสใช้ร่วมกับเคสอื่น (อาจมี send ค้าง) — เช็คว่ายอดรวม = ผลรวมต่อบอท ไม่ผูกกับตัวเลขตายตัว
      expect(r.total.sent).toBe(Object.values(r.byBot).reduce((n, x) => n + x.sent, 0))
      expect(r.total.sent).toBeGreaterThanOrEqual(2)
      expect((await getBotStats7d(S.other, now)).total).toEqual({ sent: 0, failed: 0, reached: 0, replied: 0 })
    })
  })

  // ───────────────────────── attach insert ─────────────────────────
  describe('attachRun: INSERT … ON CONFLICT DO NOTHING (TC-122/123/126)', () => {
    it('ห้องเดียว ACTIVE ได้ 1 · stamp ซ้ำชน · พร้อมกัน 2 ตัว = 1 · ไม่มี error log', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const conv = await mkConv()
        await db.salesFollowBot.updateMany({ where: { shopId: S.shop }, data: { status: 'CLOSED' } })
        const a = await createBot(S.shop, S.user, fields({ channelIds: [S.line] }))
        const b = await createBot(S.shop, S.user, fields({ channelIds: [S.ch2], salesStatuses: ['BILLED'] }))
        const stamp = ago(60_000)
        const mk = (botId: string, at = stamp) => attachRun({ shopId: S.shop, botId, conversationId: conv, stageKey: 'NOT_BOUGHT', stageStamp: at, structureRev: 1 })
        const r = await Promise.all([mk(a.id), mk(b.id)])
        expect(r.filter(Boolean)).toHaveLength(1)
        expect(await db.salesFollowRun.count({ where: { conversationId: conv, status: 'ACTIVE' } })).toBe(1)
        expect(await mk(a.id, new Date(stamp.getTime() + 1))).toBeNull() // ห้องมี ACTIVE แล้ว
        const winner = r.find(Boolean)!
        await db.salesFollowRun.update({ where: { id: winner }, data: { status: 'STOPPED', stopReason: 'CUSTOMER_REPLIED', finishedAt: now } })
        const botOfWinner = (await db.salesFollowRun.findUniqueOrThrow({ where: { id: winner } })).botId
        expect(await mk(botOfWinner)).toBeNull() // (บอท,ห้อง,stamp) เดิม = ไม่แนบซ้ำ
        expect(await mk(botOfWinner, new Date(stamp.getTime() + 2))).toBeTruthy() // stamp ใหม่ = แนบได้
        expect(spy).not.toHaveBeenCalled()
      } finally {
        spy.mockRestore()
      }
    })
  })
})
