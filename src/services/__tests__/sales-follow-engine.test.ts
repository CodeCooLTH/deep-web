/**
 * 00095 S-4 — engine บอทติดตามยอดขาย (tick/claim/ตรวจซ้ำ/ส่ง/ปิดผล/sweep/แนบ) บน Postgres จริง (TFR-FB-09..16 · TFR-FB-24/25)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ทุก tick ปักหมุด opts.shopIds = ร้านที่เทสสร้างเอง · ลบเฉพาะร้านที่เทสสร้าง (cascade)
 * ตัวส่ง Meta/LINE ถูก mock ที่ `transmitOutbound` (ห้ามยิงจริง) — enqueueOutbound/deliverRoom/outbox เป็นของจริงทั้งสาย
 *
 * Mutation (ทำมือแล้วคืน — ดู report):
 *   M-newer  ถอดด่าน "ร้านตอบหลังจอง" (newerReply) ใน sendStep           → "แอดมินตอบหลังจอง = ไม่ยิง" แดง
 *   M-owned  composeRound ไม่กรองด้วย findOwnedImageIds                    → "รูปของร้านอื่น" แดง
 *   M-sweep  sweep ข้อ (ก) ลบแถวแทนปิด UNCERTAIN_SEND (= ให้ยิงรอบเดิมซ้ำ)   → "sweep ไม่ยิงซ้ำ" แดง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const mocks = vi.hoisted(() => ({ transmit: vi.fn(), quota: vi.fn(), calls: 0, failAt: null as number | null }))
vi.mock('server-only', () => ({}))
vi.mock('@/services/channel-chat.service', async (orig) => ({
  ...(await orig<typeof import('@/services/channel-chat.service')>()),
  transmitOutbound: mocks.transmit,
}))
vi.mock('@/services/chat-outbox.service', async (orig) => {
  const o = await orig<typeof import('@/services/chat-outbox.service')>()
  // ของจริงทั้งสาย ยกเว้นสั่งให้ enqueue ครั้งที่ N โยน (เทส S2)
  return { ...o, enqueueOutbound: (p: Parameters<typeof o.enqueueOutbound>[0]) => (++mocks.calls === mocks.failAt ? Promise.reject(new Error('boom')) : o.enqueueOutbound(p)) }
})
vi.mock('@/services/line-quota.service', async (orig) => ({
  ...(await orig<typeof import('@/services/line-quota.service')>()),
  getLineQuotaByChannelId: mocks.quota,
}))

import { runSalesFollowTick } from '@/services/sales-follow-engine.service'
import { attachRun } from '@/services/sales-follow-bot.service'
import { getMessages } from '@/services/chat.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const MIN = 60_000
const HOUR = 3_600_000
const ago = (ms: number, base = new Date()) => new Date(base.getTime() - ms)

const S = { user: '', user2: '' }
const worlds: string[] = []
const fileIds: string[] = []
const OK = { externalMessageId: 'mid-x', outboundResponse: {}, failureReason: null, sendMethod: null, sendBatchId: null }

interface World { shop: string; ch: string; line: string }
async function mkWorld(): Promise<World> {
  const shop = await db.shop.create({ data: { userId: S.user, shopName: `sfe-${randomUUID().slice(0, 6)}-${run}`, kind: 'BUSINESS', vertical: 'ONLINE_SALES' } as never, select: { id: true } })
  const mkCh = (provider: string) =>
    db.shopChannel.create({ data: { shopId: shop.id, provider, externalId: `sfe-${randomUUID().slice(0, 8)}`, name: provider, accessTokenEnc: 'x', connectedByUserId: S.user } as never, select: { id: true } })
  const [ch, line] = await Promise.all([mkCh('MESSENGER'), mkCh('LINE')])
  await db.shopMember.create({ data: { shopId: shop.id, userId: S.user, role: 'OWNER', roles: [] } }) // ร้าน BUSINESS ต้องมีแถวสมาชิกถึงอ่านแชทฝั่งร้านได้
  worlds.push(shop.id)
  process.env.SALES_FOLLOW_BOT_SHOP_IDS = worlds.join(',')
  return { shop: shop.id, ch: ch.id, line: line.id }
}

const TEXT = (text: string) => ({ kind: 'TEXT' as const, text })
const defSteps = [{ delayMin: 30, parts: [TEXT('สวัสดีค่ะ คุณ{ชื่อ}')] }, { delayMin: 600, parts: [TEXT('ยังสนใจไหมคะ')] }]
async function mkBot(w: World, o: { steps?: unknown; channelIds?: string[]; status?: string } = {}) {
  const b = await db.salesFollowBot.create({
    data: {
      shopId: w.shop, name: `บอท-${run}`, status: o.status ?? 'ACTIVE', salesStatuses: ['NOT_BOUGHT'], steps: (o.steps ?? defSteps) as never,
      channels: { create: (o.channelIds ?? [w.ch]).map((shopChannelId) => ({ shopChannelId })) },
    },
    select: { id: true, structureRev: true },
  })
  return b
}

interface RoomOpts { channel?: 'MESSENGER' | 'LINE'; name?: string | null; buyerAgo?: number; replyAgo?: number | null; ad?: boolean; bot?: { id: string; structureRev: number }; w: World }
/** ห้องที่ "ถึงกำหนดส่งขั้นแรก": ลูกค้าทัก → ร้านตอบ → รอ delay (ร้านค้างตอบ = WAIT ไม่ส่ง) แล้วแนบ run */
async function mkRoom(o: RoomOpts) {
  const { w } = o
  const isLine = o.channel === 'LINE'
  const chId = isLine ? w.line : w.ch
  const buyerAt = ago(o.buyerAgo ?? 3 * HOUR)
  const ec = await db.externalContact.create({
    data: { shopChannelId: chId, externalUserId: `u-${randomUUID().slice(0, 8)}`, name: o.name === undefined ? 'สมชาย' : o.name } as never,
    select: { id: true },
  })
  const conv = await db.conversation.create({
    data: { shopId: w.shop, channel: o.channel ?? 'MESSENGER', shopChannelId: chId, externalContactId: ec.id, lastInboundAt: buyerAt, lastMessageAt: buyerAt },
    select: { id: true },
  })
  await db.chatMessage.create({ data: { conversationId: conv.id, senderRole: 'BUYER', type: 'TEXT', body: 'สนใจค่ะ', createdAt: buyerAt } })
  if (o.replyAgo !== null)
    await db.chatMessage.create({ data: { conversationId: conv.id, senderRole: 'SHOP', type: 'TEXT', body: 'ค่ะ', createdAt: ago(o.replyAgo ?? 2 * HOUR), senderUserId: S.user } })
  if (o.ad) await db.conversationAdReferral.create({ data: { conversationId: conv.id, source: 'ADS', receivedAt: buyerAt } })
  let runId: string | null = null
  if (o.bot) runId = await attachRun({ shopId: w.shop, botId: o.bot.id, conversationId: conv.id, stageKey: 'NOT_BOUGHT', stageStamp: buyerAt, structureRev: o.bot.structureRev })
  return { conv: conv.id, runId: runId!, buyerAt }
}

const tick = (w: World, now = new Date()) => runSalesFollowTick(now, { shopIds: [w.shop] })
const runOf = (id: string) => db.salesFollowRun.findUniqueOrThrow({ where: { id } })
const sendsOf = (runId: string) => db.salesFollowSend.findMany({ where: { runId }, orderBy: { step: 'asc' } })
const botMsgs = (conv: string) => db.chatMessage.findMany({ where: { conversationId: conv, autoReplyKind: 'AUTO_FOLLOW' }, orderBy: [{ createdAt: 'asc' }, { seq: 'asc' }] })
const notes = (conv: string) => db.chatMessage.findMany({ where: { conversationId: conv, type: 'FOLLOW_BOT_NOTE' } })
const sentParams = () => mocks.transmit.mock.calls.map((c) => c[1] as { text?: string; attachment?: { fileId: string } })
const mkFile = async (shopId: string) => {
  const fileId = `2026/11/16/${randomUUID()}.jpg`
  fileIds.push(fileId)
  await db.mediaAsset.create({ data: { shopId, hash: randomUUID(), fileId, contentType: 'image/jpeg', size: 1 } })
  return fileId
}

describe.skipIf(!isLocal)('sales-follow engine (DB จริง · ตัวส่งถูก mock)', () => {
  const prevEnv = process.env.SALES_FOLLOW_BOT_SHOP_IDS
  beforeAll(async () => {
    const mkU = (n: string) => db.user.create({ data: { displayName: `sfe-${n}-${run}`, username: `sfe_${n}_${run}` }, select: { id: true } })
    const [u, u2] = await Promise.all([mkU('a'), mkU('b')])
    Object.assign(S, { user: u.id, user2: u2.id })
  })
  afterAll(async () => {
    if (prevEnv === undefined) delete process.env.SALES_FOLLOW_BOT_SHOP_IDS
    else process.env.SALES_FOLLOW_BOT_SHOP_IDS = prevEnv
    // scope ด้วยร้าน/ไฟล์/ผู้ใช้ที่เทสสร้างเอง (HR13) — ร้าน cascade ห้อง/ข้อความ/บอท/run/Send/QuickMessage
    await db.mediaAsset.deleteMany({ where: { fileId: { in: fileIds } } })
    await db.shop.deleteMany({ where: { id: { in: worlds } } })
    await db.user.deleteMany({ where: { id: { in: [S.user, S.user2] } } })
    await db.$disconnect()
  })
  beforeEach(() => {
    mocks.transmit.mockReset().mockResolvedValue(OK)
    mocks.quota.mockReset().mockResolvedValue(null)
    mocks.calls = 0
    mocks.failAt = null
    process.env.SALES_FOLLOW_BOT_SHOP_IDS = worlds.join(',')
  })

  it('ส่งรอบแรก: ฟอง AUTO_FOLLOW เนื้อหาแทนตัวแปรแล้ว · Send SENT · run เดินขั้น · lastSentAt = เวลาฟองจริง · ไม่ส่งรอบถัดไปใน tick เดียวกัน', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const r = await mkRoom({ w, bot })
    const res = await tick(w)
    expect(res).toMatchObject({ evaluated: 1, sent: 1, failed: 0, skipped: 0, timedOut: false })
    expect(sentParams().map((p) => p.text)).toEqual(['สวัสดีค่ะ คุณสมชาย'])
    const [s] = await sendsOf(r.runId)
    expect(s).toMatchObject({ step: 0, stepCount: 2, status: 'SENT', reason: null })
    const [m] = await botMsgs(r.conv)
    expect(s.chatMessageId).toBe(m.id)
    expect(s.messageIds).toEqual([m.id])
    expect(m).toMatchObject({ senderRole: 'SHOP', senderUserId: null, deliveryStatus: 'SENT' })
    const after = await runOf(r.runId)
    expect(after).toMatchObject({ status: 'ACTIVE', nextStep: 1, holdReason: null })
    expect(after.lastSentAt?.getTime()).toBe(m.createdAt.getTime())
    // tick ซ้ำ: ขั้นที่ 2 ยังไม่ถึงกำหนด (600 นาที) = ไม่ส่ง
    await tick(w)
    expect(mocks.transmit).toHaveBeenCalledTimes(1)
  })

  it('แข่งกัน 2 tick พร้อมกัน = ส่งรอบละครั้งเดียว (claim + UNIQUE runId,step)', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const r = await mkRoom({ w, bot })
    await Promise.all([tick(w), tick(w), tick(w)])
    expect(mocks.transmit).toHaveBeenCalledTimes(1)
    expect(await sendsOf(r.runId)).toHaveLength(1)
    expect(await botMsgs(r.conv)).toHaveLength(1)
    expect((await runOf(r.runId)).nextStep).toBe(1)
  })

  it('ตรวจซ้ำ: แอดมินตอบหลังจอง = ไม่ยิง · คืนกุญแจ (ไม่มีแถว Send) · [M-newer]', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    // เวลา tick เลื่อนไป +3 ชม. แล้วให้ร้านตอบ "หลังเวลาจอง" (DB now) แต่ก่อนเวลา tick: ตอนประเมิน/ตรวจซ้ำ decideRun ได้ SEND ทั้งคู่
    // มีเพียงด่าน newerReply (createdAt > send.createdAt) เท่านั้นที่กันได้ — ยิงเข้าที่ด่านนั้นตรง ๆ
    const tickNow = new Date(Date.now() + 3 * HOUR)
    const r = await mkRoom({ w, bot, buyerAgo: HOUR, replyAgo: -HOUR })
    await tick(w, tickNow)
    expect(mocks.transmit).not.toHaveBeenCalled()
    expect(await sendsOf(r.runId)).toHaveLength(0)
    expect((await runOf(r.runId)).nextStep).toBe(0)
  })

  it('ลูกค้าตอบหลังฟองบอท = หยุด CUSTOMER_REPLIED + บรรทัดระบบเดียว · ไม่ส่งอีก', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const r = await mkRoom({ w, bot })
    await tick(w)
    await db.chatMessage.create({ data: { conversationId: r.conv, senderRole: 'BUYER', type: 'TEXT', body: 'เอาค่ะ', createdAt: new Date(Date.now() + MIN) } })
    const res = await tick(w)
    expect(res.stopped).toBe(1)
    expect(await runOf(r.runId)).toMatchObject({ status: 'STOPPED', stopReason: 'CUSTOMER_REPLIED' })
    expect(await notes(r.conv)).toHaveLength(1)
    expect((await tick(w)).stopped).toBe(0)
    expect(mocks.transmit).toHaveBeenCalledTimes(1)
  })

  it('สถานะการขายเปลี่ยน = หยุด STAGE_CHANGED ไม่ส่ง', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const r = await mkRoom({ w, bot })
    await db.salesFollowRun.update({ where: { id: r.runId }, data: { stageKey: 'BILLED' } })
    await tick(w)
    expect(await runOf(r.runId)).toMatchObject({ status: 'STOPPED', stopReason: 'STAGE_CHANGED' })
    expect(mocks.transmit).not.toHaveBeenCalled()
  })

  it('กรอบโฆษณา: รอบเกิน 23 ชม. — ห้องโฆษณาส่ง · ห้องที่ไม่ใช่โฆษณาหยุด WINDOW_CLOSED + บรรทัดระบบ', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const ad = await mkRoom({ w, bot, buyerAgo: 30 * HOUR, replyAgo: 26 * HOUR, ad: true })
    await tick(w)
    expect(mocks.transmit).toHaveBeenCalledTimes(1)
    expect((await sendsOf(ad.runId))[0]).toMatchObject({ status: 'SENT' })

    const w2 = await mkWorld()
    const bot2 = await mkBot(w2)
    const plain = await mkRoom({ w: w2, bot: bot2, buyerAgo: 30 * HOUR, replyAgo: 26 * HOUR })
    mocks.transmit.mockClear()
    await tick(w2)
    expect(mocks.transmit).not.toHaveBeenCalled()
    expect(await runOf(plain.runId)).toMatchObject({ status: 'STOPPED', stopReason: 'WINDOW_CLOSED' })
    expect(await notes(plain.conv)).toHaveLength(1)
  })

  it('ร้านถูกถอดจากนำร่อง = HOLD SHOP_NOT_ENABLED ไม่ส่ง (เขียนเหตุครั้งเดียว) · คืนสิทธิ์แล้วส่งต่อและล้างเหตุ', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const r = await mkRoom({ w, bot })
    process.env.SALES_FOLLOW_BOT_SHOP_IDS = 'ไม่ใช่ร้านนี้'
    expect((await tick(w)).held).toBe(1)
    expect(await runOf(r.runId)).toMatchObject({ status: 'ACTIVE', holdReason: 'SHOP_NOT_ENABLED', nextStep: 0 })
    expect(mocks.transmit).not.toHaveBeenCalled()
    process.env.SALES_FOLLOW_BOT_SHOP_IDS = worlds.join(',')
    await tick(w)
    expect(mocks.transmit).toHaveBeenCalledTimes(1)
    expect((await runOf(r.runId)).holdReason).toBeNull()
  })

  it('หลายชิ้น + quick message: ข้อความ → quick message (ข้อความแล้วรูปของมัน) → รูปหลายรูป ฟองต่อรูป · ป้าย followStep ตรงทุกฟอง · ผู้ซื้อไม่ได้ป้าย', async () => {
    const w = await mkWorld()
    const imgs = [await mkFile(w.shop), await mkFile(w.shop), await mkFile(w.shop)]
    const qm = await db.quickMessage.create({ data: { shopId: w.shop, title: 'โปร', body: 'โปรโมชันพิเศษ', imageFileIds: [imgs[0]], createdByUserId: S.user }, select: { id: true } })
    const bot = await mkBot(w, {
      steps: [
        { delayMin: 30, parts: [TEXT('สวัสดีค่ะ'), { kind: 'QUICK_MESSAGE', quickMessageId: qm.id }, { kind: 'IMAGES', fileIds: [imgs[1], imgs[2]] }] },
        { delayMin: 600, parts: [TEXT('ยังสนใจไหมคะ')] },
      ],
    })
    const r = await mkRoom({ w, bot })
    await tick(w)
    expect(sentParams().map((p) => p.text ?? p.attachment?.fileId)).toEqual(['สวัสดีค่ะ', 'โปรโมชันพิเศษ', imgs[0], imgs[1], imgs[2]])
    const msgs = await botMsgs(r.conv)
    const [s] = await sendsOf(r.runId)
    expect(s.status).toBe('SENT')
    expect(s.messageIds).toEqual(msgs.map((m) => m.id))
    expect(s.chatMessageId).toBe(msgs[0].id)

    const view = (await getMessages(r.conv, S.user, { shopCap: 'H1' })).items.filter((m) => m.autoReplyKind === 'AUTO_FOLLOW').sort((a, b) => a.seq! - b.seq!) // getMessages คืนใหม่→เก่า
    expect(view).toHaveLength(5)
    expect(view.map((m) => [m.followStep, m.followStepCount])).toEqual(Array(5).fill([1, 2]))
    expect(view.map((m) => m.followIsFirst)).toEqual([true, false, false, false, false])
    // บอทถูกแก้จำนวนขั้นหลังส่ง = ป้ายเดิมไม่เปลี่ยน (เก็บ stepCount ตอนจอง)
    await db.salesFollowBot.update({ where: { id: bot.id }, data: { steps: [defSteps[0]] as never } })
    const again = (await getMessages(r.conv, S.user, { shopCap: 'H1' })).items.find((m) => m.autoReplyKind === 'AUTO_FOLLOW')
    expect(again?.followStepCount).toBe(2)
    // ฝั่งผู้ซื้อ (ผู้อ่านเป็น buyerUserId) ไม่คืนฟิลด์
    await db.conversation.update({ where: { id: r.conv }, data: { buyerUserId: S.user2 } })
    const buyerView = (await getMessages(r.conv, S.user2)).items.find((m) => m.autoReplyKind === 'AUTO_FOLLOW')
    expect(buyerView).toBeDefined()
    expect(buyerView && 'followStep' in buyerView).toBe(false)
  })

  it('quick message ถูกลบ = ข้ามชิ้น (ส่งชิ้นที่เหลือ) · เหลือแต่ชิ้นที่ถูกลบ = SKIPPED/EMPTY_MESSAGE ไม่ส่ง', async () => {
    const w = await mkWorld()
    const qm = await db.quickMessage.create({ data: { shopId: w.shop, title: 'โปร', body: 'โปรโมชันพิเศษ', createdByUserId: S.user }, select: { id: true } })
    const bot = await mkBot(w, { steps: [{ delayMin: 30, parts: [TEXT('สวัสดีค่ะ'), { kind: 'QUICK_MESSAGE', quickMessageId: qm.id }] }, { delayMin: 600, parts: [TEXT('x')] }] })
    const only = await mkBot(w, { channelIds: [w.ch], steps: [{ delayMin: 30, parts: [{ kind: 'QUICK_MESSAGE', quickMessageId: qm.id }] }, { delayMin: 600, parts: [TEXT('x')] }] })
    const a = await mkRoom({ w, bot })
    const b = await mkRoom({ w, bot: only })
    await db.quickMessage.delete({ where: { id: qm.id } })
    await tick(w)
    expect(sentParams().map((p) => p.text)).toEqual(['สวัสดีค่ะ'])
    expect((await sendsOf(a.runId))[0].status).toBe('SENT')
    expect((await sendsOf(b.runId))[0]).toMatchObject({ status: 'SKIPPED', reason: 'EMPTY_MESSAGE', chatMessageId: null })
    expect((await runOf(b.runId)).nextStep).toBe(1) // เดินขั้นต่อ ไม่ลองซ้ำ
  })

  it('รูปของร้านอื่นข้ามชิ้น (ไม่ส่ง) · ไม่เหลือรูปเลย = IMAGE_MISSING · ไม่เหลือชิ้น (ตัวแปรชื่อว่าง) = EMPTY_MESSAGE [M-owned]', async () => {
    const w = await mkWorld()
    const other = await mkWorld()
    const mine = await mkFile(w.shop)
    const foreign = await mkFile(other.shop)
    const mixed = await mkBot(w, { steps: [{ delayMin: 30, parts: [TEXT('สวัสดีค่ะ'), { kind: 'IMAGES', fileIds: [foreign, mine] }] }, { delayMin: 600, parts: [TEXT('x')] }] })
    const imageOnly = await mkBot(w, { steps: [{ delayMin: 30, parts: [{ kind: 'IMAGES', fileIds: [foreign] }] }, { delayMin: 600, parts: [TEXT('x')] }] })
    const emptyName = await mkBot(w, { steps: [{ delayMin: 30, parts: [TEXT('{ชื่อ}')] }, { delayMin: 600, parts: [TEXT('x')] }] })
    const a = await mkRoom({ w, bot: mixed })
    const b = await mkRoom({ w, bot: imageOnly })
    const c = await mkRoom({ w, bot: emptyName, name: null })
    await tick(w)
    const files = sentParams().flatMap((p) => (p.attachment ? [p.attachment.fileId] : []))
    expect(files).toEqual([mine])
    expect(files).not.toContain(foreign)
    expect(sentParams().map((p) => p.text).filter(Boolean)).toEqual(['สวัสดีค่ะ'])
    expect((await sendsOf(a.runId))[0].status).toBe('SENT')
    expect((await sendsOf(b.runId))[0]).toMatchObject({ status: 'SKIPPED', reason: 'IMAGE_MISSING' })
    expect((await sendsOf(c.runId))[0]).toMatchObject({ status: 'SKIPPED', reason: 'EMPTY_MESSAGE' })
  })

  it('LINE โควตาเต็ม = SKIPPED/LINE_QUOTA_FULL ไม่ส่ง · โควตาปกติ/อ่านไม่ได้ = ส่ง', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w, { channelIds: [w.line] })
    const full = await mkRoom({ w, bot, channel: 'LINE' })
    mocks.quota.mockResolvedValue({ level: 'EXHAUSTED' })
    await tick(w)
    expect(mocks.transmit).not.toHaveBeenCalled()
    expect((await sendsOf(full.runId))[0]).toMatchObject({ status: 'SKIPPED', reason: 'LINE_QUOTA_FULL' })
    expect(mocks.quota).toHaveBeenCalledWith(w.line, { shopId: w.shop })

    const w2 = await mkWorld()
    const bot2 = await mkBot(w2, { channelIds: [w2.line] })
    const ok = await mkRoom({ w: w2, bot: bot2, channel: 'LINE' })
    mocks.quota.mockResolvedValue({ level: 'OK' })
    await tick(w2)
    expect((await sendsOf(ok.runId))[0].status).toBe('SENT')
  })

  it('Meta ปฏิเสธนอกกรอบ = SKIPPED/META_WINDOW_REJECTED + หยุด WINDOW_CLOSED + บรรทัดระบบ · ล้มอื่น = FAILED เดินขั้นต่อ ไม่ลองซ้ำ', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const r = await mkRoom({ w, bot })
    mocks.transmit.mockResolvedValue({ ...OK, failureReason: 'WINDOW_CLOSED' })
    await tick(w)
    expect((await sendsOf(r.runId))[0]).toMatchObject({ status: 'SKIPPED', reason: 'META_WINDOW_REJECTED' })
    expect(await runOf(r.runId)).toMatchObject({ status: 'STOPPED', stopReason: 'WINDOW_CLOSED' })
    expect(await notes(r.conv)).toHaveLength(1)

    const w2 = await mkWorld()
    const bot2 = await mkBot(w2)
    const r2 = await mkRoom({ w: w2, bot: bot2 })
    mocks.transmit.mockClear().mockResolvedValue({ ...OK, failureReason: 'boom' })
    const res = await tick(w2)
    expect(res.failed).toBe(1)
    expect((await sendsOf(r2.runId))[0]).toMatchObject({ status: 'FAILED', reason: 'PLATFORM_REJECTED' })
    expect((await runOf(r2.runId)).nextStep).toBe(1)
    await tick(w2)
    expect(mocks.transmit).toHaveBeenCalledTimes(1)
  })

  it('sweep: SENDING ไม่มีข้อความค้าง >10 นาที = FAILED/UNCERTAIN_SEND เดินขั้นต่อ ไม่ยิงซ้ำ · ยังไม่ครบ 10 นาทีไม่แตะ [M-sweep]', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const stale = await mkRoom({ w, bot })
    const fresh = await mkRoom({ w, bot })
    const mk = (r: { runId: string; conv: string }, age: number) =>
      db.salesFollowSend.create({ data: { shopId: w.shop, runId: r.runId, conversationId: r.conv, botId: bot.id, step: 0, stepCount: 2, status: 'SENDING', createdAt: ago(age) } })
    await mk(stale, 11 * MIN)
    await mk(fresh, 2 * MIN)
    const res = await tick(w)
    expect(res.swept).toBe(1)
    expect((await sendsOf(stale.runId))[0]).toMatchObject({ status: 'FAILED', reason: 'UNCERTAIN_SEND' })
    expect((await runOf(stale.runId)).nextStep).toBe(1)
    expect((await sendsOf(fresh.runId))[0].status).toBe('SENDING')
    expect((await runOf(fresh.runId)).nextStep).toBe(0)
    expect(mocks.transmit).not.toHaveBeenCalled() // ทั้งสองห้องไม่ถูกยิง (รอบเดิมห้ามซ้ำ · ขั้นถัดไปยังไม่ถึงกำหนด)
  })

  it('sweep ที่มีข้อความผูก: ทุกฟอง SENT = SENT · ฟองล้ม = เหตุผลของฟองแรกที่ล้ม · ยัง QUEUED = ปล่อยไว้', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const mkSending = async (deliveries: { delivery: string | null; reason?: string }[]) => {
      const r = await mkRoom({ w, bot })
      const ids: string[] = []
      for (const d of deliveries) {
        const m = await db.chatMessage.create({
          data: { conversationId: r.conv, senderRole: 'SHOP', type: 'TEXT', body: 'b', autoReplyKind: 'AUTO_FOLLOW', deliveryStatus: d.delivery, failureReason: d.reason ?? null },
          select: { id: true },
        })
        ids.push(m.id)
      }
      await db.salesFollowSend.create({
        data: { shopId: w.shop, runId: r.runId, conversationId: r.conv, botId: bot.id, step: 0, stepCount: 2, status: 'SENDING', chatMessageId: ids[0], messageIds: ids },
      })
      return r
    }
    const allSent = await mkSending([{ delivery: 'SENT' }, { delivery: null }])
    const failedSecond = await mkSending([{ delivery: 'SENT' }, { delivery: 'FAILED', reason: 'WINDOW_CLOSED' }, { delivery: 'FAILED', reason: 'x' }])
    const queued = await mkSending([{ delivery: 'SENT' }, { delivery: 'QUEUED' }])
    await tick(w)
    expect((await sendsOf(allSent.runId))[0]).toMatchObject({ status: 'SENT', reason: null })
    expect((await runOf(allSent.runId)).nextStep).toBe(1)
    expect((await sendsOf(failedSecond.runId))[0]).toMatchObject({ status: 'SKIPPED', reason: 'META_WINDOW_REJECTED' })
    expect(await runOf(failedSecond.runId)).toMatchObject({ status: 'STOPPED', stopReason: 'WINDOW_CLOSED' })
    expect((await sendsOf(queued.runId))[0].status).toBe('SENDING')
    expect((await runOf(queued.runId)).nextStep).toBe(0)
  })

  it('แนบห้องใหม่: ห้องที่ลูกค้าเพิ่งทัก + ตรงเงื่อนไข = ได้ run (stamp = ข้อความแรก) · ห้องเก่า/ร้านนอกนำร่อง/บอท CLOSED ไม่ได้', async () => {
    const w = await mkWorld()
    await mkBot(w)
    const fresh = await mkRoom({ w, buyerAgo: 10 * MIN, replyAgo: null })
    const old = await mkRoom({ w, buyerAgo: 5 * HOUR, replyAgo: null })
    const res = await tick(w)
    expect(res.attached).toBe(1)
    const runs = await db.salesFollowRun.findMany({ where: { shopId: w.shop } })
    expect(runs.map((x) => x.conversationId)).toEqual([fresh.conv])
    expect(runs[0]).toMatchObject({ stageKey: 'NOT_BOUGHT', nextStep: 0, status: 'ACTIVE' })
    expect(runs[0].stageStamp.getTime()).toBe(fresh.buyerAt.getTime())
    expect(old.conv).toBeTruthy()
    expect((await tick(w)).attached).toBe(0) // ซ้ำ = ไม่แนบซ้ำ (ห้องละ 1 ACTIVE)

    const w2 = await mkWorld()
    await mkBot(w2)
    await mkRoom({ w: w2, buyerAgo: 10 * MIN, replyAgo: null })
    process.env.SALES_FOLLOW_BOT_SHOP_IDS = 'ไม่ใช่ร้านนี้'
    expect((await tick(w2)).attached).toBe(0)
    process.env.SALES_FOLLOW_BOT_SHOP_IDS = worlds.join(',')
    const w3 = await mkWorld()
    await mkBot(w3, { status: 'CLOSED' })
    await mkRoom({ w: w3, buyerAgo: 10 * MIN, replyAgo: null })
    expect((await tick(w3)).attached).toBe(0)
  })

  it('tick ไม่ throw แม้ run พัง · เกินงบเวลา = timedOut:true ไม่ทำงานต่อ', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    await mkRoom({ w, bot })
    expect((await runSalesFollowTick(new Date(), { shopIds: [w.shop], budgetMs: -1 })).timedOut).toBe(true)
    expect(mocks.transmit).not.toHaveBeenCalled()
    mocks.transmit.mockRejectedValue(new Error('network down'))
    await expect(tick(w)).resolves.toMatchObject({ failed: 1 }) // ตัวยิงโยน = outbox ปิด FAILED · engine ไม่โยนต่อ
  })

  it('quick message ของร้านอื่น (มี body + รูป) ในรอบ = ข้ามทั้งข้อความและรูป [M-qm-shop]', async () => {
    const w = await mkWorld()
    const other = await mkWorld()
    const foreignImg = await mkFile(other.shop)
    const fqm = await db.quickMessage.create({ data: { shopId: other.shop, title: 'ร้านอื่น', body: 'ความลับของร้านอื่น', imageFileIds: [foreignImg], createdByUserId: S.user }, select: { id: true } })
    const bot = await mkBot(w, { steps: [{ delayMin: 30, parts: [TEXT('สวัสดีค่ะ'), { kind: 'QUICK_MESSAGE', quickMessageId: fqm.id }] }, { delayMin: 600, parts: [TEXT('x')] }] })
    await mkRoom({ w, bot })
    await tick(w)
    expect(sentParams().map((p) => p.text ?? p.attachment?.fileId)).toEqual(['สวัสดีค่ะ'])
  })

  it('ร้านเปลี่ยน vertical หลังแนบ = HOLD SHOP_NOT_ENABLED ไม่ส่ง (S1)', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const r = await mkRoom({ w, bot })
    await db.shop.update({ where: { id: w.shop }, data: { vertical: 'LODGING' } })
    await tick(w)
    expect(mocks.transmit).not.toHaveBeenCalled()
    expect(await runOf(r.runId)).toMatchObject({ status: 'ACTIVE', holdReason: 'SHOP_NOT_ENABLED', nextStep: 0 })
  })

  it('throw ก่อน enqueue ฟองแรก = คืนกุญแจ (ไม่มีแถว Send) แล้ว tick หน้าส่งได้ · throw หลังมีฟองแล้ว = ไปต่อด้วยฟองที่เกิด (S2)', async () => {
    const w = await mkWorld()
    const bot = await mkBot(w)
    const r = await mkRoom({ w, bot })
    mocks.failAt = 1
    await tick(w)
    expect(await sendsOf(r.runId)).toHaveLength(0)
    expect((await runOf(r.runId)).nextStep).toBe(0)
    expect(mocks.transmit).not.toHaveBeenCalled()
    mocks.failAt = null
    await tick(w)
    expect((await sendsOf(r.runId))[0].status).toBe('SENT')

    const w2 = await mkWorld()
    const bot2 = await mkBot(w2, { steps: [{ delayMin: 30, parts: [TEXT('หนึ่ง'), TEXT('สอง')] }, { delayMin: 600, parts: [TEXT('x')] }] })
    const r2 = await mkRoom({ w: w2, bot: bot2 })
    mocks.transmit.mockClear()
    mocks.calls = 0
    mocks.failAt = 2
    await tick(w2)
    expect(sentParams().map((p) => p.text)).toEqual(['หนึ่ง'])
    const [s2] = await sendsOf(r2.runId)
    expect(s2.status).toBe('SENT')
    expect(s2.messageIds).toHaveLength(1)
  })

  it('ไม่มี HUMAN_AGENT/message tag และไม่เรียก AutoNotifyLedger ในโค้ด engine (TFR-FB-13/15)', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/sales-follow-engine.service.ts'), 'utf8')
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/humanAgent|HUMAN_AGENT|messaging_type|\btag:/i)
    expect(code).not.toMatch(/autoNotifyLedger|auto-notify/i)
  })
})
