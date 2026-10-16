/**
 * chat-desk.service.db.test.ts — Postgres จริง (00077 T4)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ข้อมูลที่เทสสร้างลบด้วย id ของตัวเองเท่านั้น (ห้าม deleteMany เปล่า)
 * ครอบ AC-CD-02/03/04/09/11/17/20/40/43/49 และ AC-CD-05..08 ตอนผ่านฐานจริง
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))

import {
  __resetDailyCacheForTests,
  getDeskSnapshot,
  getRoomPreview,
  countResolvedToday,
  loadDeskMembers,
} from '@/services/chat-desk.service'
import { presenceKeyFor } from '@/lib/chat-desk/presence-key'
import { EMPTY_FILTERS } from '@/lib/chat-desk/filters'
import { startOfBangkokDay } from '@/lib/chat-desk/rules'
import { INTERNAL_MESSAGE_TYPES } from '@/lib/auto-order-message-type'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)

const ids = {
  users: [] as string[], shops: [] as string[], channels: [] as string[],
  contacts: [] as string[], convs: [] as string[], members: [] as string[],
}
const S = {
  owner: '', admin: '', billing: '', buyer: '',
  shop: '', other: '', capShop: '', cap200Shop: '', resolvedShop: '', emptyShop: '',
  chMsg: '', chLine: '', otherCh: '',
}

const NOW = new Date()
const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000)

async function mkConv(
  shopId: string,
  o: {
    alias?: string; channel?: string; shopChannelId?: string | null; externalContactId?: string | null
    last: 'BUYER' | 'SHOP'; inboundAgo?: number | null; lastMsgAgo: number
    resolvedAt?: Date | null; isHidden?: boolean; isSpam?: boolean; shopLastReadAt?: Date | null
  },
) {
  const c = await prisma.conversation.create({
    data: {
      shopId, alias: o.alias, channel: o.channel ?? 'MESSENGER', shopChannelId: o.shopChannelId ?? null,
      externalContactId: o.externalContactId ?? null,
      lastSenderRole: o.last, lastInboundAt: o.inboundAgo == null ? null : ago(o.inboundAgo), lastMessageAt: ago(o.lastMsgAgo),
      resolvedAt: o.resolvedAt ?? null, isHidden: o.isHidden ?? false, isSpam: o.isSpam ?? false,
      shopLastReadAt: o.shopLastReadAt ?? null,
    },
    select: { id: true },
  })
  ids.convs.push(c.id)
  return c.id
}

const msg = (
  conversationId: string, senderRole: 'BUYER' | 'SHOP', agoSec: number,
  x: { by?: string | null; type?: string; body?: string; autoReplyKind?: string | null; viaStandby?: boolean; isDeleted?: boolean } = {},
) =>
  prisma.chatMessage.create({
    data: {
      conversationId, senderRole, createdAt: ago(agoSec), senderUserId: x.by ?? null, type: x.type ?? 'TEXT',
      body: x.body ?? 'x', autoReplyKind: x.autoReplyKind ?? null, viaStandby: x.viaStandby ?? false, isDeleted: x.isDeleted ?? false,
    },
    select: { id: true },
  })

const byAlias = <T extends { name: string }>(rooms: T[], alias: string) => rooms.find((r) => r.name === alias)

describe.skipIf(!isLocal)('chat-desk.service (DB จริง)', () => {
  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET ??= 'chat-desk-db-test-secret'
    const mkUser = async (n: string) => {
      const u = await prisma.user.create({ data: { displayName: `cd-${n}-${run}`, username: `cd_${n}_${run}` }, select: { id: true } })
      ids.users.push(u.id)
      return u.id
    }
    S.owner = await mkUser('owner'); S.admin = await mkUser('admin'); S.billing = await mkUser('billing')
    S.buyer = await mkUser('buyer')
    const mkShop = async (n: string, userId = S.owner) => {
      const s = await prisma.shop.create({ data: { userId, shopName: `cd-${n}-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })
      ids.shops.push(s.id)
      return s.id
    }
    S.shop = await mkShop('main'); S.other = await mkShop('other'); S.capShop = await mkShop('cap')
    S.cap200Shop = await mkShop('cap200'); S.resolvedShop = await mkShop('resolved'); S.emptyShop = await mkShop('empty')
    // เจ้าของมีแถว ShopMember ของตัวเองด้วย (ต้องไม่นับซ้ำ) + แอดมินแชท + ผู้ดูแลบิล (ไม่มี H1)
    for (const [userId, role, roles] of [[S.owner, 'OWNER', []], [S.admin, 'ADMIN', ['CHAT']], [S.billing, 'ADMIN', ['BILLING']]] as const) {
      const m = await prisma.shopMember.create({ data: { shopId: S.shop, userId, role, roles: [...roles] }, select: { id: true } })
      ids.members.push(m.id)
    }
    const mkCh = async (shopId: string, provider: string, name: string) => {
      const c = await prisma.shopChannel.create({
        data: { shopId, provider, externalId: `cd-${name}-${run}`, name, accessTokenEnc: 'x', connectedByUserId: S.owner } as never, select: { id: true },
      })
      ids.channels.push(c.id)
      return c.id
    }
    S.chMsg = await mkCh(S.shop, 'MESSENGER', 'เพจหลัก'); S.chLine = await mkCh(S.shop, 'LINE', 'ไลน์'); S.otherCh = await mkCh(S.other, 'MESSENGER', 'เพจร้านอื่น')
  })

  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { id: { in: ids.convs } } }) // ข้อความ cascade
    await prisma.externalContact.deleteMany({ where: { id: { in: ids.contacts } } })
    await prisma.shopChannel.deleteMany({ where: { id: { in: ids.channels } } })
    await prisma.shopMember.deleteMany({ where: { id: { in: ids.members } } })
    await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  const snap = async (shopId: string, f = EMPTY_FILTERS) => {
    __resetDailyCacheForTests()
    const r = await getDeskSnapshot(shopId, f, { now: NOW })
    expect(r).not.toBeNull()
    return r!.snapshot
  }

  it('สมาชิก: เจ้าของนับคนเดียว · canChat ตาม H1 · presenceKey ตรง presenceKeyFor (AC-CD-17/30)', async () => {
    const s = await snap(S.shop)
    expect(s.members.map((m) => m.userId).sort()).toEqual([S.owner, S.admin, S.billing].sort())
    expect(s.members[0]).toMatchObject({ userId: S.owner, role: 'OWNER', canChat: true })
    expect(s.members.find((m) => m.userId === S.admin)).toMatchObject({ role: 'ADMIN', canChat: true })
    expect(s.members.find((m) => m.userId === S.billing)?.canChat).toBe(false)
    for (const m of s.members) {
      expect(m.presenceKey).toBe(presenceKeyFor(S.shop, m.userId))
      expect(m.presenceKey).not.toContain(m.userId)
    }
  })

  it('loadDeskMembers: แถวเจ้าของซ้ำใน ShopMember ถูกตัด', () => {
    const shop = {
      kind: 'BUSINESS', vertical: 'GENERAL', userId: 'o', user: { displayName: 'O' },
      members: [
        { userId: 'o', role: 'OWNER', roles: [], user: { displayName: 'O' } },
        { userId: 'a', role: 'ADMIN', roles: ['CHAT'], user: { displayName: 'A' } },
      ],
    }
    expect(loadDeskMembers('s', shop as never).map((m) => m.userId)).toEqual(['o', 'a'])
  })

  it('ห้อง: เลานจ์/โต๊ะ 4 ชนิด · ตัดซ่อน/สแปม/ปิดงาน/เกิน 7 วัน · askedAt = ใบแรกของช่วงที่ยังไม่ถูกตอบ (AC-CD-01/05..09)', async () => {
    const W1 = await mkConv(S.shop, { alias: 'W1', last: 'BUYER', inboundAgo: 60, lastMsgAgo: 60, shopChannelId: S.chMsg })
    await msg(W1, 'SHOP', 600, { by: S.admin }); await msg(W1, 'BUYER', 300); await msg(W1, 'BUYER', 60)
    await mkConv(S.shop, { alias: 'OLD8D', last: 'BUYER', inboundAgo: 8 * 86400, lastMsgAgo: 8 * 86400 })
    await mkConv(S.shop, { alias: 'RESOLVED', last: 'BUYER', inboundAgo: 60, lastMsgAgo: 60, resolvedAt: ago(10) })
    await mkConv(S.shop, { alias: 'HIDDEN', last: 'BUYER', inboundAgo: 60, lastMsgAgo: 60, isHidden: true })
    await mkConv(S.shop, { alias: 'SPAM', last: 'BUYER', inboundAgo: 60, lastMsgAgo: 60, isSpam: true })
    const mkDesk = async (alias: string, x: Parameters<typeof msg>[3]) => {
      const c = await mkConv(S.shop, { alias, last: 'SHOP', inboundAgo: 100, lastMsgAgo: 30, shopChannelId: S.chMsg })
      await msg(c, 'BUYER', 100); await msg(c, 'SHOP', 30, x)
    }
    await mkDesk('D-ADMIN', { by: S.admin })
    await mkDesk('D-EXT', {})
    await mkDesk('D-BOT', { autoReplyKind: 'AUTO' })
    await mkDesk('D-META', { viaStandby: true })
    await mkDesk('D-FORMER', { by: S.buyer }) // ไม่ใช่สมาชิกร้านนี้ = ตอบนอก Deep

    const s = await snap(S.shop)
    const names = s.rooms.map((r) => r.name)
    for (const gone of ['OLD8D', 'RESOLVED', 'HIDDEN', 'SPAM']) expect(names).not.toContain(gone)
    const w1 = byAlias(s.rooms, 'W1')!
    expect(w1).toMatchObject({ state: 'WAITING', desk: null, repliedAt: null, platform: 'MESSENGER', pageId: S.chMsg })
    expect(new Date(w1.askedAt!).getTime()).toBe(ago(300).getTime())
    expect(new Date(w1.lastInboundAt!).getTime()).toBe(ago(60).getTime())
    expect(byAlias(s.rooms, 'D-ADMIN')).toMatchObject({ state: 'AT_DESK', desk: { kind: 'ADMIN', userId: S.admin }, askedAt: null })
    expect(byAlias(s.rooms, 'D-EXT')?.desk).toEqual({ kind: 'EXTERNAL' })
    expect(byAlias(s.rooms, 'D-BOT')?.desk).toEqual({ kind: 'BOT' })
    expect(byAlias(s.rooms, 'D-META')?.desk).toEqual({ kind: 'META_AI' })
    expect(byAlias(s.rooms, 'D-FORMER')?.desk).toEqual({ kind: 'EXTERNAL' })
    expect(s.awaiting.capped).toBe(false)
  })

  it('ขอบ 180 วินาที: 179/180 อยู่ · 181 ออก (AC-CD-03)', async () => {
    for (const sec of [179, 180, 181]) {
      const c = await mkConv(S.shop, { alias: `EDGE-${sec}`, last: 'SHOP', inboundAgo: 400, lastMsgAgo: sec })
      await msg(c, 'SHOP', sec, { by: S.admin })
    }
    const s = await snap(S.shop)
    expect(byAlias(s.rooms, 'EDGE-179')?.state).toBe('AT_DESK')
    expect(byAlias(s.rooms, 'EDGE-180')?.state).toBe('AT_DESK')
    expect(byAlias(s.rooms, 'EDGE-181')).toBeUndefined()
  })

  it('บรรทัดระบบไม่ใช่คนตอบ: โต๊ะตามใบจริง · ไม่มีใบจริงเลย = ไม่ขึ้นหน้าโต๊ะ (AC-CD-04, M-1)', async () => {
    expect(INTERNAL_MESSAGE_TYPES.length).toBeGreaterThanOrEqual(2)
    for (const type of INTERNAL_MESSAGE_TYPES) {
      const withReal = await mkConv(S.shop, { alias: `SYS-REAL-${type}`, last: 'SHOP', inboundAgo: 200, lastMsgAgo: 50 })
      await msg(withReal, 'BUYER', 200); await msg(withReal, 'SHOP', 50, { by: S.admin }); await msg(withReal, 'SHOP', 10, { type })
      const onlySys = await mkConv(S.shop, { alias: `SYS-ONLY-${type}`, last: 'SHOP', inboundAgo: 200, lastMsgAgo: 10 })
      await msg(onlySys, 'BUYER', 200); await msg(onlySys, 'SHOP', 10, { type })
    }
    const s = await snap(S.shop)
    for (const type of INTERNAL_MESSAGE_TYPES) {
      const r = byAlias(s.rooms, `SYS-REAL-${type}`)!
      expect(r.desk).toEqual({ kind: 'ADMIN', userId: S.admin })
      expect(new Date(r.repliedAt!).getTime()).toBe(ago(50).getTime())
      expect(byAlias(s.rooms, `SYS-ONLY-${type}`)).toBeUndefined()
    }
  })

  it('ลูกค้าส่งหลังร้านตอบ 30 วินาที = เลานจ์ ไม่ใช่โต๊ะ (AC-CD-09)', async () => {
    const c = await mkConv(S.shop, { alias: 'REPLY-THEN-BUYER', last: 'BUYER', inboundAgo: 5, lastMsgAgo: 5 })
    await msg(c, 'SHOP', 35, { by: S.admin }); await msg(c, 'BUYER', 5)
    const r = byAlias((await snap(S.shop)).rooms, 'REPLY-THEN-BUYER')!
    expect(r.state).toBe('WAITING')
    expect(new Date(r.askedAt!).getTime()).toBe(ago(5).getTime())
  })

  it('ตัวกรอง: แพลตฟอร์ม/เพจ/แอดมิน · id แปลกถูกทิ้งไม่ 500 · ทิ้งหมด = ไม่กรอง (AC-CD-48/49)', async () => {
    const lineRoom = await mkConv(S.shop, { alias: 'F-LINE', channel: 'LINE', shopChannelId: S.chLine, last: 'BUYER', inboundAgo: 20, lastMsgAgo: 20 })
    expect(lineRoom).toBeTruthy()
    const byPlatform = await snap(S.shop, { ...EMPTY_FILTERS, platforms: ['LINE'] })
    expect(byPlatform.rooms.length).toBeGreaterThan(0)
    expect(byPlatform.rooms.every((r) => r.platform === 'LINE')).toBe(true)

    const byPage = await snap(S.shop, { ...EMPTY_FILTERS, pages: [S.chLine] })
    expect(byPage.rooms.map((r) => r.name)).toEqual(['F-LINE'])

    // เพจของร้านอื่น + แอดมินที่ไม่ใช่สมาชิก → ถูกทิ้ง → ไม่กรอง และไม่ได้ห้องร้านอื่น
    const stranger = await snap(S.shop, { platforms: [], pages: [S.otherCh, randomUUID()], admins: [S.buyer, randomUUID()] })
    expect(stranger.filters).toEqual(EMPTY_FILTERS)
    expect(stranger.rooms.length).toBeGreaterThan(byPage.rooms.length)

    const byAdmin = await snap(S.shop, { ...EMPTY_FILTERS, admins: [S.admin] })
    expect(byAdmin.filters.admins).toEqual([S.admin])
    const desks = byAdmin.rooms.filter((r) => r.state === 'AT_DESK').map((r) => r.desk?.kind)
    expect(desks).toContain('EXTERNAL') // โต๊ะที่ไม่ใช่แอดมินไม่ถูกกรองด้วยแอดมิน
    expect(byAdmin.rooms.some((r) => r.state === 'WAITING')).toBe(true) // เลานจ์ไม่ถูกกรองด้วยแอดมิน
    for (const r of byAdmin.rooms) if (r.desk?.kind === 'ADMIN') expect(r.desk.userId).toBe(S.admin)
  })

  it('ไม่มีห้องร้านอื่นรั่วเข้า snapshot (AC-CD-23 ฝั่งข้อมูล)', async () => {
    const o = await mkConv(S.other, { alias: 'OTHER-SHOP-ROOM', last: 'BUYER', inboundAgo: 10, lastMsgAgo: 10 })
    expect(o).toBeTruthy()
    const s = await snap(S.shop)
    expect(s.rooms.map((r) => r.name)).not.toContain('OTHER-SHOP-ROOM')
    expect(s.shop.id).toBe(S.shop)
  })

  it('เพดาน: 201 ห้องรอ → 200 + capped · 200 พอดี → ไม่ capped (AC-CD-02)', async () => {
    const mk = (shopId: string, n: number) =>
      prisma.conversation.createMany({
        data: Array.from({ length: n }, (_, i) => ({
          shopId, channel: 'DEEP', alias: `cap-${run}-${i}`, lastSenderRole: 'BUYER',
          lastInboundAt: ago(1000 + i), lastMessageAt: ago(1000 + i),
        })),
      })
    await mk(S.capShop, 201); await mk(S.cap200Shop, 200)
    // createMany ไม่คืน id → จดแถวตาม shop เพื่อ afterAll ลบด้วย id
    for (const shopId of [S.capShop, S.cap200Shop]) {
      const rows = await prisma.conversation.findMany({ where: { shopId }, select: { id: true } })
      ids.convs.push(...rows.map((r) => r.id))
    }
    const big = await snap(S.capShop)
    const waiting = big.rooms.filter((r) => r.state === 'WAITING')
    expect(waiting).toHaveLength(200)
    expect(big.awaiting.capped).toBe(true)
    // ที่เหลือคือ 200 ห้องที่รอนานสุด — ห้อง i=0 (ใหม่สุด ของ 201) ต้องหลุด
    expect(waiting.map((r) => r.name)).not.toContain(`cap-${run}-0`)
    const exact = await snap(S.cap200Shop)
    expect(exact.rooms).toHaveLength(200)
    expect(exact.awaiting.capped).toBe(false)
  })

  it('ปิดงานวันนี้: นับเฉพาะ resolvedAt ตั้งแต่เที่ยงคืนไทย และยังไม่ถูกล้าง (AC-CD-20)', async () => {
    const dayStart = startOfBangkokDay(NOW)
    await mkConv(S.resolvedShop, { last: 'SHOP', lastMsgAgo: 5000, resolvedAt: NOW })
    await mkConv(S.resolvedShop, { last: 'SHOP', lastMsgAgo: 5000, resolvedAt: new Date(dayStart.getTime() + 1000) })
    await mkConv(S.resolvedShop, { last: 'SHOP', lastMsgAgo: 5000, resolvedAt: new Date(dayStart.getTime() - 1000) }) // เมื่อวาน
    await mkConv(S.resolvedShop, { last: 'BUYER', inboundAgo: 5000, lastMsgAgo: 5000, resolvedAt: null }) // ลูกค้าทักกลับ (ถูกล้าง)
    expect(await countResolvedToday(S.resolvedShop, NOW)).toBe(2)
    __resetDailyCacheForTests()
    const s = (await getDeskSnapshot(S.resolvedShop, EMPTY_FILTERS, { now: NOW }))!.snapshot
    expect(s.daily.resolvedToday).toBe(2)
  })

  it('รายวันไม่มีตัวอย่าง = null ไม่ใช่ 0 · ไม่ throw (AC-CD-13)', async () => {
    const s = await snap(S.emptyShop)
    expect(s.daily).toMatchObject({
      status: 'OK', firstResponseAvgSec: null, responseAvgSec: null, responseSampleCount: 0, unattributedReplyCount: 0,
    })
    expect(s.rooms).toEqual([])
    expect(s.sla.firstResponseSec).toBeGreaterThan(0)
  })

  it('ไม่มี PII/โทเคน/avatar ใน snapshot และ preview — เทียบ allow-list ทุกระดับ (AC-CD-43, M-6)', async () => {
    const ec = await prisma.externalContact.create({
      data: { shopChannelId: S.chMsg, externalUserId: `pii-${run}`, name: `คุณพีไอ-${run}`, phones: ['0812345678'], note: 'โน้ตลับ', address: 'ที่อยู่ลับ', avatarUrl: 'file-avatar' },
      select: { id: true },
    })
    ids.contacts.push(ec.id)
    const c = await mkConv(S.shop, { channel: 'MESSENGER', shopChannelId: S.chMsg, externalContactId: ec.id, last: 'BUYER', inboundAgo: 15, lastMsgAgo: 15 })
    await msg(c, 'BUYER', 15, { body: 'ข้อความ' })
    const s = await snap(S.shop)
    const room = s.rooms.find((r) => r.id === c)!
    expect(room.name).toBe(`คุณพีไอ-${run}`)
    const allow = {
      top: ['v', 'serverNow', 'shop', 'sla', 'filters', 'awaiting', 'rooms', 'members', 'channels', 'daily'],
      room: ['id', 'name', 'platform', 'pageId', 'state', 'askedAt', 'lastInboundAt', 'repliedAt', 'desk'],
      member: ['userId', 'name', 'role', 'canChat', 'presenceKey'],
      channel: ['id', 'name', 'provider'],
      daily: ['status', 'asOf', 'firstResponseAvgSec', 'responseAvgSec', 'responseSampleCount', 'unattributedReplyCount', 'answeredOutsideSystemConversations', 'resolvedToday'],
    }
    expect(Object.keys(s).sort()).toEqual([...allow.top].sort())
    for (const r of s.rooms) expect(Object.keys(r).sort()).toEqual([...allow.room].sort())
    for (const m of s.members) expect(Object.keys(m).sort()).toEqual([...allow.member].sort())
    for (const ch of s.channels) expect(Object.keys(ch).sort()).toEqual([...allow.channel].sort())
    expect(Object.keys(s.daily).sort()).toEqual([...allow.daily].sort())
    const json = JSON.stringify(s)
    for (const secret of ['0812345678', 'โน้ตลับ', 'ที่อยู่ลับ', 'file-avatar', 'accessToken', 'ข้อความ']) expect(json).not.toContain(secret)

    const p = (await getRoomPreview([S.shop], c))!
    expect(Object.keys(p).sort()).toEqual(['messages', 'room', 'truncated'])
    expect(Object.keys(p.room).sort()).toEqual(['id', 'name', 'pageName', 'platform'])
    for (const m of p.messages) expect(Object.keys(m).sort()).toEqual(['body', 'by', 'createdAt', 'id', 'isDeleted', 'senderRole', 'type'])
    expect(JSON.stringify(p)).not.toMatch(/0812345678|โน้ตลับ|ที่อยู่ลับ|file-avatar/)
  })

  it('preview: 31→30 เรียงเก่า→ใหม่ + truncated · isDeleted → body null · บรรทัดระบบไม่ออก · by ตามชนิด (AC-CD-41/42)', async () => {
    const readAt = ago(7777)
    const c = await mkConv(S.shop, { alias: 'PREV', last: 'SHOP', inboundAgo: 5000, lastMsgAgo: 5, shopLastReadAt: readAt })
    for (let i = 31; i >= 1; i--) await msg(c, i % 2 ? 'BUYER' : 'SHOP', 100 + i, { body: `m${i}`, by: i % 2 ? null : S.admin })
    await msg(c, 'SHOP', 90, { body: 'ลับ-ลบแล้ว', by: S.admin, isDeleted: true })
    await msg(c, 'SHOP', 80, { type: 'AUTO_ORDER_RESULT', body: 'ภายใน' })
    await msg(c, 'SHOP', 70, { type: 'IMAGE', body: 'cap', autoReplyKind: 'AUTO' })
    await msg(c, 'SHOP', 60, { body: 'meta', viaStandby: true })
    await msg(c, 'SHOP', 50, { body: 'ext' })
    const p = (await getRoomPreview([S.shop], c))!
    expect(p.messages).toHaveLength(30)
    expect(p.truncated).toBe(true)
    const times = p.messages.map((m) => Date.parse(m.createdAt))
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    const deleted = p.messages.find((m) => m.isDeleted)!
    expect(deleted.body).toBeNull()
    expect(JSON.stringify(p)).not.toContain('ลับ-ลบแล้ว')
    expect(JSON.stringify(p)).not.toContain('ภายใน')
    expect(p.messages.map((m) => m.type)).not.toContain('AUTO_ORDER_RESULT')
    const img = p.messages.find((m) => m.type === 'IMAGE')!
    expect(img.body).toBeNull()
    expect(img.by).toEqual({ kind: 'BOT' })
    expect(p.messages.find((m) => m.body === 'meta')?.by).toEqual({ kind: 'META_AI' })
    expect(p.messages.find((m) => m.body === 'ext')?.by).toEqual({ kind: 'EXTERNAL' })
    expect(deleted.by).toEqual({ kind: 'ADMIN', name: `cd-admin-${run}` })
    expect(p.messages.find((m) => m.senderRole === 'BUYER')?.by).toBeNull()
    // อ่านอย่างเดียว: shopLastReadAt ต้องไม่ขยับ (AC-CD-40)
    const after = await prisma.conversation.findUnique({ where: { id: c }, select: { shopLastReadAt: true } })
    expect(after?.shopLastReadAt?.getTime()).toBe(readAt.getTime())
  })

  it('preview: ห้องร้านอื่น/ไม่มีห้อง → null (route → 404)', async () => {
    const o = await mkConv(S.other, { alias: 'OTHER-PREV', last: 'BUYER', inboundAgo: 10, lastMsgAgo: 10 })
    expect(await getRoomPreview([S.shop], o)).toBeNull()
    expect(await getRoomPreview([S.shop], randomUUID())).toBeNull()
  })
})
