/**
 * 00095-ext FR-FA-7 — เมื่อลูกค้าตอบกลับ (run หยุด CUSTOMER_REPLIED) ส่งห้องต่อให้แอดมิน/Meta AI บน Postgres จริง
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · tick ปักหมุด shopIds · ลบเฉพาะร้าน/ผู้ใช้ที่เทสสร้าง
 * Graph (claim/pass) + ตัวส่ง Meta ถูก mock — ห้ามยิงจริง
 *
 * Mutation (ทำมือแล้วคืน — ดู report):
 *   M-gate   เอาเงื่อนไข reason === 'CUSTOMER_REPLIED' ออกจาก evaluateRun → "หยุดเพราะเหตุอื่น = ไม่แตะ Graph/ไม่เขียนบรรทัด" แดง
 *   M-pass   passThreadControlToMetaAi ส่ง targets ว่าง/เพิ่ม Page Inbox                  → "ส่ง Business AI เท่านั้น" แดง
 *   M-owner  log take ไม่ส่ง newOwnerAppId                                                → "metaOwnerAppId จริง" แดง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const mocks = vi.hoisted(() => ({ transmit: vi.fn(), claim: vi.fn(), pass: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/services/channel-chat.service', async (orig) => ({
  ...(await orig<typeof import('@/services/channel-chat.service')>()),
  transmitOutbound: mocks.transmit,
}))
vi.mock('@/lib/facebook/graph', async (orig) => ({
  ...(await orig<typeof import('@/lib/facebook/graph')>()),
  claimThreadControl: mocks.claim,
  passThreadControlToMetaAi: mocks.pass,
}))
vi.mock('@/services/line-quota.service', async (orig) => ({
  ...(await orig<typeof import('@/services/line-quota.service')>()),
  getLineQuotaByChannelId: vi.fn().mockResolvedValue(null), // ห้ามยิง LINE จริง
}))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: () => 'tok', encryptToken: (x: string) => x }))

import { runSalesFollowTick } from '@/services/sales-follow-engine.service'
import { attachRun } from '@/services/sales-follow-bot.service'
import { META_BUSINESS_AI_APP_ID } from '@/lib/facebook/graph'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const MIN = 60_000
const HOUR = 3_600_000
const OURS = '555000111'
const OK = { externalMessageId: 'mid-x', outboundResponse: {}, failureReason: null, sendMethod: null, sendBatchId: null }
const NOTE = (s: string) => `ลูกค้าตอบแล้ว — ${s}`

let user = ''
const worlds: string[] = []

/** ห้อง: ลูกค้าทัก → ร้านตอบ → บอทส่งรอบแรก (tick 1) → ลูกค้าตอบ (พร้อมให้ tick 2 หยุด) */
async function mkRepliedRoom(o: { setting: 'ADMIN' | 'META_AI'; channel?: 'MESSENGER' | 'LINE'; metaAiHolds?: boolean }) {
  const isLine = o.channel === 'LINE'
  const shop = await db.shop.create({ data: { userId: user, shopName: `rh-${randomUUID().slice(0, 6)}-${run}`, kind: 'BUSINESS', vertical: 'ONLINE_SALES' } as never, select: { id: true } })
  worlds.push(shop.id)
  process.env.SALES_FOLLOW_BOT_SHOP_IDS = worlds.join(',')
  await db.shopMember.create({ data: { shopId: shop.id, userId: user, role: 'OWNER', roles: [] } })
  const ch = await db.shopChannel.create({
    data: { shopId: shop.id, provider: isLine ? 'LINE' : 'MESSENGER', externalId: `rh-${randomUUID().slice(0, 8)}`, name: 'ch', accessTokenEnc: 'x', connectedByUserId: user } as never,
    select: { id: true, externalId: true },
  })
  const bot = await db.salesFollowBot.create({
    data: {
      shopId: shop.id, name: `บอท-${run}`, status: 'ACTIVE', conditionRules: [{ field: 'stage', op: 'is', values: ['NOT_BOUGHT'] }] as never, replyHandoff: o.setting,
      steps: [{ delayMin: 30, parts: [{ kind: 'TEXT', text: 'สวัสดีค่ะ' }] }, { delayMin: 600, parts: [{ kind: 'TEXT', text: 'ยังสนใจไหมคะ' }] }] as never,
      channels: { create: [{ shopChannelId: ch.id }] },
    },
    select: { id: true, structureRev: true },
  })
  const buyerAt = new Date(Date.now() - 3 * HOUR)
  const psid = `u-${randomUUID().slice(0, 8)}`
  const ec = await db.externalContact.create({ data: { shopChannelId: ch.id, externalUserId: psid, name: 'สมชาย' } as never, select: { id: true } })
  const conv = await db.conversation.create({
    data: { shopId: shop.id, channel: isLine ? 'LINE' : 'MESSENGER', shopChannelId: ch.id, externalContactId: ec.id, lastInboundAt: buyerAt, lastMessageAt: buyerAt },
    select: { id: true },
  })
  await db.chatMessage.create({ data: { conversationId: conv.id, senderRole: 'BUYER', type: 'TEXT', body: 'สนใจค่ะ', createdAt: buyerAt } })
  await db.chatMessage.create({ data: { conversationId: conv.id, senderRole: 'SHOP', type: 'TEXT', body: 'ค่ะ', createdAt: new Date(Date.now() - 2 * HOUR), senderUserId: user } })
  const runId = await attachRun({ shopId: shop.id, botId: bot.id, conversationId: conv.id, stageKey: 'NOT_BOUGHT', stageStamp: buyerAt, structureRev: bot.structureRev })
  const tick = (now = new Date()) => runSalesFollowTick(now, { shopIds: [shop.id] })
  await tick() // บอทส่งรอบแรก
  if (o.metaAiHolds) await db.conversation.update({ where: { id: conv.id }, data: { metaOwnerAppId: META_BUSINESS_AI_APP_ID, metaOwnerObservedAt: new Date(Date.now() - 10 * MIN) } })
  await db.chatMessage.create({ data: { conversationId: conv.id, senderRole: 'BUYER', type: 'TEXT', body: 'เอาค่ะ', createdAt: new Date(Date.now() + MIN) } })
  return { shop: shop.id, conv: conv.id, runId: runId!, psid, pageId: ch.externalId, tick }
}
const handoverMeta = (pageId: string, psid: string) =>
  db.chatHandoverEvent.findMany({ where: { pageExternalId: pageId, contactExternalId: psid, metadata: { startsWith: 'deep-follow-bot-handoff:' } }, orderBy: { createdAt: 'asc' } })
const noteBodies = async (conv: string) =>
  (await db.chatMessage.findMany({ where: { conversationId: conv, type: 'FOLLOW_BOT_NOTE' }, orderBy: { createdAt: 'asc' } })).map((m) => m.body)

describe.skipIf(!isLocal)('ส่งห้องต่อหลังลูกค้าตอบ (FR-FA-7 · DB จริง · Graph mock)', () => {
  const prevEnv = { shops: process.env.SALES_FOLLOW_BOT_SHOP_IDS, app: process.env.FB_CHAT_APP_ID }
  beforeAll(async () => {
    process.env.FB_CHAT_APP_ID = OURS
    user = (await db.user.create({ data: { displayName: `rh-${run}`, username: `rh_${run}` }, select: { id: true } })).id
  })
  afterAll(async () => {
    if (prevEnv.shops === undefined) delete process.env.SALES_FOLLOW_BOT_SHOP_IDS
    else process.env.SALES_FOLLOW_BOT_SHOP_IDS = prevEnv.shops
    if (prevEnv.app === undefined) delete process.env.FB_CHAT_APP_ID
    else process.env.FB_CHAT_APP_ID = prevEnv.app
    // scope ด้วยร้าน/ผู้ใช้ที่เทสสร้างเอง (HR13) — handover event ผูกกับ page ของร้านเหล่านั้น ลบตาม externalId ของช่องที่เทสสร้าง
    const chans = await db.shopChannel.findMany({ where: { shopId: { in: worlds } }, select: { externalId: true } })
    await db.chatHandoverEvent.deleteMany({ where: { pageExternalId: { in: chans.map((c) => c.externalId) } } })
    await db.shop.deleteMany({ where: { id: { in: worlds } } })
    await db.user.deleteMany({ where: { id: user } })
    await db.$disconnect()
  })
  beforeEach(() => {
    mocks.transmit.mockReset().mockResolvedValue(OK)
    mocks.claim.mockReset().mockResolvedValue({ outcome: 'TAKEN', raw: {} })
    mocks.pass.mockReset().mockResolvedValue({ outcome: 'RELEASED', targetAppId: META_BUSINESS_AI_APP_ID, raw: {} })
  })

  it('ADMIN + Meta AI ถือห้อง → ดึงคืน (claim) · log take พร้อม metaOwnerAppId = แอปเรา · บรรทัดส่งต่อให้แอดมิน · ซ้ำ tick = ไม่ทำซ้ำ', async () => {
    const r = await mkRepliedRoom({ setting: 'ADMIN', metaAiHolds: true })
    expect((await r.tick()).stopped).toBe(1)
    expect(mocks.claim).toHaveBeenCalledTimes(1)
    expect(mocks.claim.mock.calls[0].slice(0, 2)).toEqual(['tok', r.psid])
    expect(mocks.pass).not.toHaveBeenCalled()
    const ev = await handoverMeta(r.pageId, r.psid)
    expect(ev.map((e) => [e.kind, e.metadata, e.newOwnerAppId])).toEqual([['take', 'deep-follow-bot-handoff:TAKEN', OURS]])
    expect((await db.conversation.findUniqueOrThrow({ where: { id: r.conv } })).metaOwnerAppId).toBe(OURS)
    expect((await noteBodies(r.conv)).slice(-1)).toEqual([NOTE('ส่งต่อให้แอดมิน')])
    await r.tick()
    expect(mocks.claim).toHaveBeenCalledTimes(1)
    expect((await noteBodies(r.conv)).filter((b) => b?.startsWith('ลูกค้าตอบแล้ว'))).toHaveLength(1)
  })

  it('ADMIN + ไม่มีหลักฐาน Meta AI → ไม่ยิง Graph แต่เขียนบรรทัดส่งต่อให้แอดมิน', async () => {
    const r = await mkRepliedRoom({ setting: 'ADMIN' })
    await r.tick()
    expect(mocks.claim).not.toHaveBeenCalled()
    expect(mocks.pass).not.toHaveBeenCalled()
    expect((await noteBodies(r.conv)).slice(-1)).toEqual([NOTE('ส่งต่อให้แอดมิน')])
  })

  it('META_AI → pass ให้ Business AI เท่านั้น · log pass พร้อม owner = Business AI', async () => {
    const r = await mkRepliedRoom({ setting: 'META_AI' })
    await r.tick()
    expect(mocks.pass).toHaveBeenCalledTimes(1)
    expect(mocks.pass.mock.calls[0][3]).toEqual([META_BUSINESS_AI_APP_ID])
    expect(mocks.claim).not.toHaveBeenCalled()
    const ev = await handoverMeta(r.pageId, r.psid)
    expect(ev.map((e) => [e.kind, e.metadata, e.newOwnerAppId])).toEqual([['pass', 'deep-follow-bot-handoff:PASSED', META_BUSINESS_AI_APP_ID]])
    expect((await db.conversation.findUniqueOrThrow({ where: { id: r.conv } })).metaOwnerAppId).toBe(META_BUSINESS_AI_APP_ID)
    expect((await noteBodies(r.conv)).slice(-1)).toEqual([NOTE('ส่งต่อให้ Meta AI')])
  })

  it('META_AI แต่ pass ล้ม → บรรทัดแบบล้มเหลว (ห้องอยู่กับแอดมิน) · tick ไม่โยน', async () => {
    mocks.pass.mockResolvedValue({ outcome: 'FAILED', message: 'no routing', tried: [] })
    const r = await mkRepliedRoom({ setting: 'META_AI' })
    await expect(r.tick()).resolves.toMatchObject({ stopped: 1 })
    expect((await noteBodies(r.conv)).slice(-1)).toEqual([NOTE('ส่งต่อให้ Meta AI ไม่สำเร็จ (เพจยังไม่ได้ตั้ง Conversation Routing) ห้องอยู่กับแอดมิน')])
    expect((await handoverMeta(r.pageId, r.psid)).map((e) => e.metadata)).toEqual(['deep-follow-bot-handoff:PASS_FAILED'])
  })

  it('LINE ทุกค่าตั้ง = ไม่ยิง Graph · บรรทัดส่งต่อให้แอดมิน', async () => {
    const r = await mkRepliedRoom({ setting: 'META_AI', channel: 'LINE' })
    await r.tick()
    expect(mocks.claim).not.toHaveBeenCalled()
    expect(mocks.pass).not.toHaveBeenCalled()
    expect((await noteBodies(r.conv)).slice(-1)).toEqual([NOTE('ส่งต่อให้แอดมิน')])
  })

  it('หยุดเพราะเหตุอื่น (STAGE_CHANGED) = ไม่แตะ Graph ไม่เขียนบรรทัดส่งต่อ', async () => {
    const r = await mkRepliedRoom({ setting: 'META_AI' })
    // ลูกค้ายังไม่ตอบ: ลบข้อความตอบ แล้วเปลี่ยนสถานะการขายให้หยุดด้วยเหตุอื่น
    await db.chatMessage.deleteMany({ where: { conversationId: r.conv, senderRole: 'BUYER', body: 'เอาค่ะ' } })
    await db.salesFollowRun.update({ where: { id: r.runId }, data: { stageKey: 'BILLED' } })
    await r.tick()
    expect(await db.salesFollowRun.findUniqueOrThrow({ where: { id: r.runId } })).toMatchObject({ status: 'STOPPED', stopReason: 'STAGE_CHANGED' })
    expect(mocks.pass).not.toHaveBeenCalled()
    expect(mocks.claim).not.toHaveBeenCalled()
    expect((await noteBodies(r.conv)).filter((b) => b?.startsWith('ลูกค้าตอบแล้ว'))).toHaveLength(0)
  })
})
