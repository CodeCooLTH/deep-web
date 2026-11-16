/**
 * 00095 S-5 (TC-200..217) — ผลข้างเคียงของฟองบอทติดตามยอดขาย `AUTO_FOLLOW` + บรรทัดระบบ `FOLLOW_BOT_NOTE` บน Postgres จริง
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้างเอง
 * mutation: AF_MUTATE=1 → เก็บฟองเป็น autoReplyKind=null + lastSenderRole='SHOP' (เหมือนไม่รู้จักค่า) → ต้องแดง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))

const { pause, detect } = vi.hoisted(() => ({
  pause: vi.fn(async () => {}),
  detect: vi.fn(async () => ({ outcome: 'SKIPPED' })),
}))
vi.mock('@/services/auto-reply-takeover.service', async (orig) => ({
  ...(await orig<typeof import('@/services/auto-reply-takeover.service')>()),
  pauseForHumanTakeover: pause,
}))
vi.mock('@/services/auto-order-detect.service', async (orig) => ({
  ...(await orig<typeof import('@/services/auto-order-detect.service')>()),
  detectAutoOrderTrigger: detect,
}))

import { getMessages, unreadConversationIdsForShops } from '@/services/chat.service'
import { enrichWithAutoReplyBadge } from '@/services/auto-reply.service'
import { __resetDailyCacheForTests, getDeskSnapshot, getRoomPreview } from '@/services/chat-desk.service'
import { EMPTY_FILTERS } from '@/lib/chat-desk/filters'
import { isHumanAgentReply, isUnattributedShopReply } from '@/lib/agent-performance'
import { shopSendSenderRolePatch } from '@/lib/auto-reply-constants'
import { applyKeywordTags } from '@/services/shop-tag-auto.service'
import { FOLLOW_BOT_NOTE_TYPE } from '@/lib/auto-order-message-type'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const MUTATE = process.env.AF_MUTATE === '1'

const ids = { users: [] as string[], shops: [] as string[], channels: [] as string[], convs: [] as string[] }
const S = { owner: '', shop: '', ch: '' }
const NOW = new Date()
const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000)

async function mkConv(o: { channel?: string; last?: 'BUYER' | 'SHOP'; inboundAgo?: number; lastMsgAgo?: number } = {}) {
  const c = await prisma.conversation.create({
    data: {
      shopId: S.shop, alias: `af-${run}`, channel: o.channel ?? 'DEEP', shopChannelId: o.channel ? S.ch : null,
      lastSenderRole: o.last ?? 'BUYER', lastInboundAt: ago(o.inboundAgo ?? 300), lastMessageAt: ago(o.lastMsgAgo ?? 300),
    },
    select: { id: true },
  })
  ids.convs.push(c.id)
  return c.id
}

/** จำลองรอยเขียนของ enqueueOutbound: แถว AUTO_FOLLOW ผู้ส่ง null + denorm ตาม shopSendSenderRolePatch */
async function sendFollow(conversationId: string) {
  const m = await prisma.chatMessage.create({
    data: { conversationId, senderRole: 'SHOP', senderUserId: null, type: 'TEXT', body: `ติดตามยอด ${run}`, autoReplyKind: MUTATE ? null : 'AUTO_FOLLOW' },
  })
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: m.createdAt, lastMessagePreview: m.body, ...(MUTATE ? { lastSenderRole: 'SHOP' } : shopSendSenderRolePatch('AUTO_FOLLOW')) },
  })
  return m
}

describe.skipIf(!isLocal)('AUTO_FOLLOW consumers (DB จริง)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `af-o-${run}`, username: `af_o_${run}` }, select: { id: true } })
    S.owner = u.id; ids.users.push(u.id)
    const s = await prisma.shop.create({ data: { userId: S.owner, shopName: `af-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })
    S.shop = s.id; ids.shops.push(s.id)
    const ch = await prisma.shopChannel.create({
      data: { shopId: S.shop, provider: 'MESSENGER', externalId: `af-ch-${run}`, name: 'เพจ', accessTokenEnc: 'x', connectedByUserId: S.owner } as never,
      select: { id: true },
    })
    S.ch = ch.id; ids.channels.push(ch.id)
  })

  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { id: { in: ids.convs } } })
    await prisma.shopChannel.deleteMany({ where: { id: { in: ids.channels } } })
    await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  beforeEach(() => { pause.mockClear(); detect.mockClear() })

  it('#4 ไม่ตรวจจับออเดอร์ / ไม่ติดแท็กจากฟองบอท (ตัวจริง ไม่ mock)', async () => {
    const row = await sendFollow(await mkConv())
    expect(row.autoReplyKind).toBe('AUTO_FOLLOW')
    const real = await vi.importActual<typeof import('@/services/auto-order-detect.service')>('@/services/auto-order-detect.service')
    expect(await real.detectAutoOrderTrigger(row.id)).toEqual({ outcome: 'SKIPPED', reason: 'BOT_MESSAGE' })
    expect(await applyKeywordTags(row.id)).toEqual({ outcome: 'SKIPPED', reason: 'BOT_MESSAGE' })
  })

  it('#5 ไม่นับเป็นผลงานแอดมิน/ตอบนอกระบบ', async () => {
    const row = await sendFollow(await mkConv())
    const ev = { conversationId: row.conversationId, createdAt: row.createdAt, seq: row.seq, senderRole: row.senderRole, senderUserId: row.senderUserId, autoReplyKind: row.autoReplyKind, isDeleted: row.isDeleted }
    expect(isHumanAgentReply(ev)).toBe(false)
    expect(isUnattributedShopReply(ev)).toBe(false)
  })

  it('#1/#7 AC-FB-100: ลูกค้าถามค้าง → ฟองบอท → lastSenderRole คง BUYER · ขึ้น WAITING · ยังนับ unread · พรีวิวขยับ', async () => {
    const conv = await mkConv({ channel: 'MESSENGER', last: 'BUYER', inboundAgo: 100, lastMsgAgo: 100 })
    await prisma.chatMessage.create({ data: { conversationId: conv, senderRole: 'BUYER', type: 'TEXT', body: 'ถามค้าง', createdAt: ago(100) } })
    await sendFollow(conv)
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv }, select: { lastSenderRole: true, lastMessagePreview: true } })
    expect(c.lastSenderRole).toBe('BUYER')
    expect(c.lastMessagePreview).toContain('ติดตามยอด')
    __resetDailyCacheForTests()
    const r = await getDeskSnapshot(S.shop, EMPTY_FILTERS, { now: new Date() })
    expect(r!.snapshot.rooms.find((x) => x.id === conv)?.state).toBe('WAITING')
    expect((await unreadConversationIdsForShops([S.shop])).includes(conv)).toBe(true)
  })

  it('#8 ป้าย: kind=null (ไม่ขึ้น DeepBot) + lastMessageIsFollowBot (แม้ก่อนหน้าเป็นบอท 00023)', async () => {
    const conv = await mkConv()
    await prisma.chatMessage.create({ data: { conversationId: conv, senderRole: 'SHOP', type: 'TEXT', body: 'บอท', autoReplyKind: 'AUTO', createdAt: ago(120) } })
    await sendFollow(conv)
    const [out] = await enrichWithAutoReplyBadge([{ id: conv }])
    expect(out.lastMessageAutoReplyKind).toBeNull()
    expect(out.lastMessageIsAiEnhanced).toBe(false)
    expect(out.lastMessageIsSystem).toBe(false)
    expect(out.lastMessageIsFollowBot).toBe(true)
  })

  it('#6/#7 โต๊ะ 00077: ห้องที่มีแต่ฟองบอทติดตามไม่ขึ้นโต๊ะ · ห้องที่คนตอบก่อนหน้าคงโต๊ะคนนั้น', async () => {
    const onlyFollow = await mkConv({ channel: 'MESSENGER', last: 'SHOP', inboundAgo: 100, lastMsgAgo: 10 })
    const withHuman = await mkConv({ channel: 'MESSENGER', last: 'SHOP', inboundAgo: 100, lastMsgAgo: 10 })
    await prisma.chatMessage.create({ data: { conversationId: withHuman, senderRole: 'BUYER', type: 'TEXT', body: 'ถาม', createdAt: ago(100) } })
    await prisma.chatMessage.create({ data: { conversationId: withHuman, senderRole: 'SHOP', senderUserId: S.owner, type: 'TEXT', body: 'คนตอบ', createdAt: ago(60) } })
    const n1 = await sendFollow(onlyFollow)
    const n2 = await sendFollow(withHuman)
    await prisma.conversation.updateMany({ where: { id: { in: [onlyFollow, withHuman] } }, data: { lastMessageAt: ago(10), lastSenderRole: 'SHOP' } })
    await prisma.chatMessage.updateMany({ where: { id: { in: [n1.id, n2.id] } }, data: { createdAt: ago(10) } })
    __resetDailyCacheForTests()
    const r = await getDeskSnapshot(S.shop, EMPTY_FILTERS, { now: NOW })
    const rooms = r!.snapshot.rooms.filter((x) => x.state === 'AT_DESK')
    expect(rooms.find((x) => x.id === onlyFollow)).toBeUndefined()
    expect(rooms.find((x) => x.id === withHuman)?.desk).toEqual({ kind: 'ADMIN', userId: S.owner })
  })

  it('#7 WAITING: askedAt = ข้อความลูกค้าที่ยังไม่ได้รับคำตอบจริง ไม่ถูกดันโดยฟองบอท (lastInboundAt ต่างจากเวลาข้อความ)', async () => {
    const conv = await mkConv({ channel: 'MESSENGER', last: 'BUYER', inboundAgo: 50, lastMsgAgo: 50 })
    const asked = ago(200)
    await prisma.chatMessage.create({ data: { conversationId: conv, senderRole: 'SHOP', senderUserId: S.owner, type: 'TEXT', body: 'คนตอบเก่า', createdAt: ago(300) } })
    await prisma.chatMessage.create({ data: { conversationId: conv, senderRole: 'BUYER', type: 'TEXT', body: 'ถามค้าง', createdAt: asked } })
    const f = await sendFollow(conv)
    await prisma.chatMessage.update({ where: { id: f.id }, data: { createdAt: ago(100) } })
    __resetDailyCacheForTests()
    const r = await getDeskSnapshot(S.shop, EMPTY_FILTERS, { now: NOW })
    const room = r!.snapshot.rooms.find((x) => x.id === conv)
    expect(room?.state).toBe('WAITING')
    expect(room?.askedAt).toBe(asked.toISOString())
  })

  it('#7 getRoomPreview: ฟองล่าสุดเป็น AUTO_FOLLOW → by = null (ไม่ใช่โต๊ะ EXTERNAL/BOT)', async () => {
    const conv = await mkConv({ channel: 'MESSENGER' })
    await prisma.chatMessage.create({ data: { conversationId: conv, senderRole: 'BUYER', type: 'TEXT', body: 'ถาม', createdAt: ago(100) } })
    const f = await sendFollow(conv)
    const p = await getRoomPreview([S.shop], conv)
    const m = p!.messages.find((x) => x.id === f.id)
    expect(m).toBeDefined()
    expect(m!.by).toBeNull()
  })

  it('TFR-FB-17/#11 FOLLOW_BOT_NOTE: ผู้ซื้อไม่เห็น', async () => {
    const buyer = await prisma.user.create({ data: { displayName: `af-b-${run}`, username: `af_b_${run}` }, select: { id: true } })
    ids.users.push(buyer.id)
    const conv = await prisma.conversation.create({
      data: { shopId: S.shop, buyerUserId: buyer.id, channel: 'DEEP', lastSenderRole: 'BUYER', lastMessageAt: ago(100) },
      select: { id: true },
    })
    ids.convs.push(conv.id)
    await prisma.chatMessage.create({ data: { conversationId: conv.id, senderRole: 'BUYER', type: 'TEXT', body: 'สวัสดี' } })
    await prisma.chatMessage.create({ data: { conversationId: conv.id, senderRole: 'SHOP', type: FOLLOW_BOT_NOTE_TYPE, body: `โน้ตภายใน ${run}` } })
    const asBuyer = await getMessages(conv.id, buyer.id)
    expect(JSON.stringify(asBuyer)).not.toContain(`โน้ตภายใน ${run}`)
    // ควบคุม: แถวมีอยู่จริงในฐาน (ผู้ซื้อไม่เห็นเพราะตัวกรอง ไม่ใช่เพราะไม่ได้เขียน)
    expect(await prisma.chatMessage.count({ where: { conversationId: conv.id, type: FOLLOW_BOT_NOTE_TYPE } })).toBe(1)
  })
})
