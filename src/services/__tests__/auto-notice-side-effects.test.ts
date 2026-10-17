/**
 * 00078 S-10 (TC-100/101/102/105/106) — ผลข้างเคียงของข้อความระบบแจ้ง `AUTO_NOTICE` บน Postgres จริง
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้างเอง (ห้าม deleteMany เปล่า)
 *
 * [blocker] 4 ข้อของ TC-100: (1) บอทไม่ถูกหยุด (2) เวลาตอบแอดมิน (00059) ไม่เปลี่ยน
 * (3) ป้าย DeepBot/DeepAI ไม่ขึ้น (4) โต๊ะ 00077 ไม่นับ
 * M-12 (mutation): รันด้วย M12_NOTICE_NULL=1 → ข้อความระบบถูกเก็บเป็น autoReplyKind=null → ต้องแดงครบ 4 ข้อ
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

import { previewPrefix } from '@/lib/preview-attribution'
import { buyerHasUnreadFromShop } from '@/lib/buyer-unread'
import { sendMessage, unreadConversationIdsForShops, listConversationsForBuyer } from '@/services/chat.service'
import { enrichWithAutoReplyBadge, sweepStuckJobs } from '@/services/auto-reply.service'
import { __resetDailyCacheForTests, getDeskSnapshot } from '@/services/chat-desk.service'
import { EMPTY_FILTERS } from '@/lib/chat-desk/filters'
import { isHumanAgentReply, isUnattributedShopReply } from '@/lib/agent-performance'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const MUTATE = process.env.M12_NOTICE_NULL === '1'

const ids = { users: [] as string[], shops: [] as string[], channels: [] as string[], convs: [] as string[], jobs: [] as string[] }
const S = { owner: '', shop: '', other: '', ch: '' }
const NOW = new Date()
const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000)

async function mkConv(shopId: string, o: { channel?: string; last?: 'BUYER' | 'SHOP'; inboundAgo?: number; lastMsgAgo?: number } = {}) {
  const c = await prisma.conversation.create({
    data: {
      shopId, alias: `an-${run}`, channel: o.channel ?? 'DEEP', shopChannelId: o.channel ? S.ch : null,
      lastSenderRole: o.last ?? 'BUYER', lastInboundAt: ago(o.inboundAgo ?? 300), lastMessageAt: ago(o.lastMsgAgo ?? 300),
    },
    select: { id: true },
  })
  ids.convs.push(c.id)
  return c.id
}

/** ส่งข้อความระบบผ่านทางจริง (sendMessage โหมด system) · M-12: ทำให้ kind หายหลังเขียน = ถดถอยที่เทสต้องจับ */
async function sendNotice(conversationId: string, shopId: string, extra: Record<string, unknown> = {}) {
  const m = await sendMessage({
    conversationId, senderUserId: null, senderRole: 'SHOP', type: 'TEXT', body: `แจ้งอัตโนมัติ ${run}`,
    system: { shopId, autoReplyKind: 'AUTO_NOTICE' }, ...extra,
  })
  if (MUTATE) {
    await prisma.chatMessage.update({ where: { id: m.id }, data: { autoReplyKind: null } })
    await prisma.conversation.update({ where: { id: conversationId }, data: { lastSenderRole: 'SHOP' } }) // ถดถอย: อัปเดต denorm
  }
  return prisma.chatMessage.findUniqueOrThrow({ where: { id: m.id } })
}

describe.skipIf(!isLocal)('AUTO_NOTICE side effects (DB จริง)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `an-o-${run}`, username: `an_o_${run}` }, select: { id: true } })
    S.owner = u.id; ids.users.push(u.id)
    for (const k of ['shop', 'other'] as const) {
      const s = await prisma.shop.create({ data: { userId: S.owner, shopName: `an-${k}-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })
      S[k] = s.id; ids.shops.push(s.id)
    }
    const ch = await prisma.shopChannel.create({
      data: { shopId: S.shop, provider: 'MESSENGER', externalId: `an-ch-${run}`, name: 'เพจ', accessTokenEnc: 'x', connectedByUserId: S.owner } as never,
      select: { id: true },
    })
    S.ch = ch.id; ids.channels.push(ch.id)
  })

  afterAll(async () => {
    await prisma.autoReplyJob.deleteMany({ where: { id: { in: ids.jobs } } })
    await prisma.conversation.deleteMany({ where: { id: { in: ids.convs } } })
    await prisma.shopChannel.deleteMany({ where: { id: { in: ids.channels } } })
    await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  beforeEach(() => { pause.mockClear(); detect.mockClear() })

  it('TC-100(1) [blocker] บอทไม่ถูกหยุด · ไม่ตรวจจับออเดอร์ · เก็บเป็น AUTO_NOTICE ผู้ส่ง null', async () => {
    const conv = await mkConv(S.shop)
    const row = await sendNotice(conv, S.shop)
    expect(row.autoReplyKind).toBe('AUTO_NOTICE')
    expect(row.senderUserId).toBeNull()
    expect(pause).not.toHaveBeenCalled()
    expect(detect).not.toHaveBeenCalled()
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv }, select: { autoReplyPausedUntil: true, handoffAt: true } })
    expect(c.autoReplyPausedUntil).toBeNull()
    expect(c.handoffAt).toBeNull()
  })

  it('ควบคุม: คนส่งปกติยังหยุดบอท (พิสูจน์ว่าเทสข้างบนไวพอ)', async () => {
    const conv = await mkConv(S.shop)
    await sendMessage({ conversationId: conv, senderUserId: S.owner, senderRole: 'SHOP', type: 'TEXT', body: 'คนพิมพ์' })
    expect(pause).toHaveBeenCalledTimes(1)
  })

  it('TC-105 ไม่มี replyToMid · ไม่แตะ lastAutoReplyAt/autoReplyCount', async () => {
    const conv = await mkConv(S.shop)
    const before = await prisma.conversation.findUniqueOrThrow({ where: { id: conv }, select: { lastAutoReplyAt: true, autoReplyCount: true } })
    const row = await sendNotice(conv, S.shop, { replyToMid: 'mid.should-be-ignored' })
    expect(row.replyToMid).toBeNull()
    const after = await prisma.conversation.findUniqueOrThrow({ where: { id: conv }, select: { lastAutoReplyAt: true, autoReplyCount: true } })
    expect(after).toEqual(before)
  })

  it('TC-106 system.shopId ≠ ห้อง → FORBIDDEN ไม่เขียนข้อความ · ไม่ระบุผู้ส่งโดยไม่ใช่โหมดระบบ → FORBIDDEN', async () => {
    const conv = await mkConv(S.shop)
    await expect(
      sendMessage({ conversationId: conv, senderUserId: null, senderRole: 'SHOP', type: 'TEXT', body: 'x', system: { shopId: S.other, autoReplyKind: 'AUTO_NOTICE' } }),
    ).rejects.toThrow('FORBIDDEN')
    await expect(
      sendMessage({ conversationId: conv, senderUserId: null, senderRole: 'SHOP', type: 'TEXT', body: 'x' }),
    ).rejects.toThrow('FORBIDDEN')
    // โหมดระบบต้องเป็นฝั่งร้านเท่านั้น
    await expect(
      sendMessage({ conversationId: conv, senderUserId: null, senderRole: 'BUYER', type: 'TEXT', body: 'x', system: { shopId: S.shop, autoReplyKind: 'AUTO_NOTICE' } }),
    ).rejects.toThrow('FORBIDDEN')
    expect(await prisma.chatMessage.count({ where: { conversationId: conv } })).toBe(0)
  })

  it('TC-100(2) [blocker] เวลาตอบแอดมิน (00059) ไม่เปลี่ยน — ไม่นับเป็นคน ไม่นับเป็น "ตอบนอกระบบ"', async () => {
    const conv = await mkConv(S.shop)
    const row = await sendNotice(conv, S.shop)
    expect(row.autoReplyKind).toBe('AUTO_NOTICE')
    const ev = { conversationId: conv, createdAt: row.createdAt, seq: row.seq, senderRole: row.senderRole, senderUserId: row.senderUserId, autoReplyKind: row.autoReplyKind, isDeleted: row.isDeleted }
    expect(isHumanAgentReply(ev)).toBe(false)
    expect(isUnattributedShopReply(ev)).toBe(false)
  })

  it('[blocker] ลูกค้าถามค้าง → ส่ง AUTO_NOTICE → ห้องยังรอตอบ (lastSenderRole คง BUYER · ขึ้น WAITING · ยังนับ unread) แต่ lastMessageAt/พรีวิวขยับ', async () => {
    const conv = await mkConv(S.shop, { channel: 'MESSENGER', last: 'BUYER', inboundAgo: 100, lastMsgAgo: 100 })
    await prisma.chatMessage.create({ data: { conversationId: conv, senderRole: 'BUYER', type: 'TEXT', body: 'ถามค้าง', createdAt: ago(100) } })
    const row = await sendNotice(conv, S.shop)
    expect(row.autoReplyKind).toBe('AUTO_NOTICE')
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv }, select: { lastSenderRole: true, lastMessageAt: true, lastMessagePreview: true } })
    expect(c.lastSenderRole).toBe('BUYER')
    expect(c.lastMessageAt!.getTime()).toBeGreaterThan(ago(100).getTime())
    expect(c.lastMessagePreview).toContain('แจ้งอัตโนมัติ')
    __resetDailyCacheForTests()
    const r = await getDeskSnapshot(S.shop, EMPTY_FILTERS, { now: new Date() })
    expect(r!.snapshot.rooms.find((x) => x.id === conv)?.state).toBe('WAITING')
    expect((await unreadConversationIdsForShops([S.shop])).includes(conv)).toBe(true)
  })

  it('ควบคุม: ข้อความร้านปกติทำให้ห้องหลุดจากรอตอบ (พิสูจน์ว่าเทสข้างบนไว)', async () => {
    const conv = await mkConv(S.shop, { channel: 'MESSENGER', last: 'BUYER', inboundAgo: 100, lastMsgAgo: 100 })
    await prisma.chatMessage.create({ data: { conversationId: conv, senderRole: 'BUYER', type: 'TEXT', body: 'ถาม', createdAt: ago(100) } })
    await sendMessage({ conversationId: conv, senderUserId: S.owner, senderRole: 'SHOP', type: 'TEXT', body: 'คนตอบ' })
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv }, select: { lastSenderRole: true } })
    expect(c.lastSenderRole).toBe('SHOP')
  })

  it('[blocker] DEEP: ผู้ซื้อถามค้าง → AUTO_NOTICE → ผู้ซื้อเห็นจุดแจ้งเตือน + ร้านยังรอตอบ · อ่านแล้วจุดหาย', async () => {
    const buyer = await prisma.user.create({ data: { displayName: `an-b-${run}`, username: `an_b_${run}` }, select: { id: true } })
    ids.users.push(buyer.id)
    const conv = await prisma.conversation.create({
      data: { shopId: S.shop, buyerUserId: buyer.id, channel: 'DEEP', lastSenderRole: 'BUYER', lastMessageAt: ago(100) },
      select: { id: true },
    })
    ids.convs.push(conv.id)
    await sendMessage({ conversationId: conv.id, senderUserId: buyer.id, senderRole: 'BUYER', type: 'TEXT', body: 'ถามค้าง' })
    await prisma.conversation.update({ where: { id: conv.id }, data: { buyerLastReadAt: new Date() } })
    await new Promise((r) => setTimeout(r, 15))
    expect(await prisma.chatMessage.count({ where: { conversationId: conv.id, senderRole: 'SHOP' } })).toBe(0)
    const before = (await listConversationsForBuyer(buyer.id)).items.find((i) => i.id === conv.id)!
    expect(buyerHasUnreadFromShop({ ...before, lastShopMessageAt: before.lastShopMessageAt })).toBe(false)

    const row = await sendNotice(conv.id, S.shop)
    expect(row.autoReplyKind).toBe('AUTO_NOTICE')
    const item = (await listConversationsForBuyer(buyer.id)).items.find((i) => i.id === conv.id)!
    expect(item.lastSenderRole).toBe('BUYER') // ร้านยังรอตอบ
    expect((await unreadConversationIdsForShops([S.shop])).includes(conv.id)).toBe(true)
    expect(buyerHasUnreadFromShop(item)).toBe(true) // ผู้ซื้อเห็นจุด
    expect(item.lastMessageIsSystem).toBe(true) // พรีวิวไม่ขึ้น "คุณ:"
    expect(previewPrefix('BUYER', { lastSenderRole: item.lastSenderRole, lastMessageIsSystem: item.lastMessageIsSystem, hasPreview: true })).toBeNull()

    await new Promise((r) => setTimeout(r, 15))
    await prisma.conversation.update({ where: { id: conv.id }, data: { buyerLastReadAt: new Date() } })
    const read = (await listConversationsForBuyer(buyer.id)).items.find((i) => i.id === conv.id)!
    expect(buyerHasUnreadFromShop(read)).toBe(false)
  })

  it('TC-101 sweepStuckJobs: AUTO_NOTICE หลัง claim ไม่ถือว่าบอทตอบแล้ว', async () => {
    const conv = await mkConv(S.shop)
    const buyerMsg = await prisma.chatMessage.create({ data: { conversationId: conv, senderRole: 'BUYER', type: 'TEXT', body: 'สอบถามครับ', createdAt: ago(900) }, select: { id: true } })
    const lockedAt = ago(600)
    const job = await prisma.autoReplyJob.create({
      data: { shopId: S.shop, conversationId: conv, chatMessageId: buyerMsg.id, status: 'PROCESSING', lockedAt, lockedBy: 't12', createdAt: ago(900) } as never,
      select: { id: true },
    })
    ids.jobs.push(job.id)
    await sendNotice(conv, S.shop)
    const r = await sweepStuckJobs({ shopId: S.shop, limit: 50 })
    expect(r.closedAlreadySent).toBe(0)
    // ควบคุม: ข้อความของบอทจริงหลัง claim → ปิดงาน (พิสูจน์ว่าเงื่อนไขยังจับบอทได้)
    const conv2 = await mkConv(S.shop)
    const b2 = await prisma.chatMessage.create({ data: { conversationId: conv2, senderRole: 'BUYER', type: 'TEXT', body: 'x', createdAt: ago(900) }, select: { id: true } })
    const job2 = await prisma.autoReplyJob.create({
      data: { shopId: S.shop, conversationId: conv2, chatMessageId: b2.id, status: 'PROCESSING', lockedAt: ago(600), lockedBy: 't12', createdAt: ago(900) } as never,
      select: { id: true },
    })
    ids.jobs.push(job2.id)
    await prisma.chatMessage.create({ data: { conversationId: conv2, senderRole: 'SHOP', type: 'TEXT', body: 'บอทตอบ', autoReplyKind: 'AUTO', createdAt: ago(300) } })
    const r2 = await sweepStuckJobs({ shopId: S.shop, limit: 50 })
    expect(r2.closedAlreadySent).toBeGreaterThanOrEqual(1)
  })

  it('TC-102 [blocker] ป้าย DeepBot/DeepAI ไม่ขึ้นเมื่อข้อความล่าสุดเป็น AUTO_NOTICE (แม้ก่อนหน้าเป็นบอท)', async () => {
    const conv = await mkConv(S.shop)
    await prisma.chatMessage.create({ data: { conversationId: conv, senderRole: 'SHOP', type: 'TEXT', body: 'บอท', autoReplyKind: 'AUTO', createdAt: ago(120) } })
    const row = await sendNotice(conv, S.shop)
    expect(row.autoReplyKind).toBe('AUTO_NOTICE')
    const [out] = await enrichWithAutoReplyBadge([{ id: conv }])
    expect(out.lastMessageAutoReplyKind).toBeNull()
    expect(out.lastMessageIsAiEnhanced).toBe(false)
    expect(out.lastMessageIsSystem).toBe(true) // แถวร้านต้องรู้ว่าเป็นข้อความระบบ ไม่ใช่ลูกค้าพิมพ์
  })

  it('TC-100(4) [blocker] โต๊ะ 00077: AUTO_NOTICE ไม่เป็นบอท/คน/นอกระบบ — ห้องที่มีแต่ข้อความระบบไม่ขึ้นโต๊ะ · ห้องที่มีคนตอบก่อนหน้าคงโต๊ะคนนั้น', async () => {
    const onlyNotice = await mkConv(S.shop, { channel: 'MESSENGER', last: 'SHOP', inboundAgo: 100, lastMsgAgo: 10 })
    const withHuman = await mkConv(S.shop, { channel: 'MESSENGER', last: 'SHOP', inboundAgo: 100, lastMsgAgo: 10 })
    await prisma.chatMessage.create({ data: { conversationId: withHuman, senderRole: 'BUYER', type: 'TEXT', body: 'ถาม', createdAt: ago(100) } })
    await prisma.chatMessage.create({ data: { conversationId: withHuman, senderRole: 'SHOP', senderUserId: S.owner, type: 'TEXT', body: 'คนตอบ', createdAt: ago(60) } })
    const n1 = await sendNotice(onlyNotice, S.shop)
    const n2 = await sendNotice(withHuman, S.shop)
    expect(n1.autoReplyKind).toBe('AUTO_NOTICE')
    expect(n2.autoReplyKind).toBe('AUTO_NOTICE')
    // sendMessage ตั้ง lastMessageAt = ตอนนี้จริง — ย้ายเวลาให้อยู่ในหน้าต่าง 180 วินาทีของ NOW ที่เทสใช้
    await prisma.conversation.updateMany({ where: { id: { in: [onlyNotice, withHuman] } }, data: { lastMessageAt: ago(10), lastSenderRole: 'SHOP' } })
    await prisma.chatMessage.updateMany({ where: { id: { in: [n1.id, n2.id] } }, data: { createdAt: ago(10) } })

    __resetDailyCacheForTests()
    const r = await getDeskSnapshot(S.shop, EMPTY_FILTERS, { now: NOW })
    const rooms = r!.snapshot.rooms.filter((x) => x.state === 'AT_DESK')
    expect(rooms.find((x) => x.id === onlyNotice)).toBeUndefined()
    const h = rooms.find((x) => x.id === withHuman)
    expect(h?.desk).toEqual({ kind: 'ADMIN', userId: S.owner })
  })
})
