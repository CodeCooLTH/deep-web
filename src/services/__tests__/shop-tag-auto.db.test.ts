/**
 * shop-tag-auto.db.test.ts — ตัวติด/ถอด tag อัตโนมัติบน Postgres จริง (00083 T4, TC-026..039 + TC-044)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))

import { applyKeywordTags, removeTagsOnOrderCreated } from '@/services/shop-tag-auto.service'
import { prisma as appPrisma } from '@/lib/prisma'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)

const ids = {
  users: [] as string[], shops: [] as string[], channels: [] as string[], contacts: [] as string[],
  convs: [] as string[], msgs: [] as string[], orders: [] as string[],
}
type Shop = { shop: string; channel: string }
let A: Shop, B: Shop

const mkShop = async (t: string): Promise<Shop> => {
  const u = await prisma.user.create({ data: { displayName: `st-${run}-${t}`, username: `st_${run}_${t}` }, select: { id: true } })
  const s = await prisma.shop.create({ data: { userId: u.id, shopName: `st-${run}-${t}`, kind: 'BUSINESS' } as never, select: { id: true } })
  const ch = await prisma.shopChannel.create({
    data: { shopId: s.id, provider: 'MESSENGER', externalId: `st-${run}-${t}`, name: t, accessTokenEnc: 'x', connectedByUserId: u.id } as never, select: { id: true },
  })
  ids.users.push(u.id); ids.shops.push(s.id); ids.channels.push(ch.id)
  return { shop: s.id, channel: ch.id }
}
const mkRoom = async (s: Shop, tags: string[] = []) => {
  const e = await prisma.externalContact.create({
    data: { shopChannelId: s.channel, externalUserId: `st-${run}-${randomUUID()}`, tags }, select: { id: true },
  })
  const c = await prisma.conversation.create({
    data: { shopId: s.shop, shopChannelId: s.channel, externalContactId: e.id, channel: 'MESSENGER' } as never, select: { id: true },
  })
  ids.contacts.push(e.id); ids.convs.push(c.id)
  return { conv: c.id, contact: e.id }
}
const mkMsg = async (conv: string, over: Record<string, unknown> = {}) => {
  const m = await prisma.chatMessage.create({
    data: { conversationId: conv, senderRole: 'SHOP', type: 'TEXT', body: 'สั่งเลย VIP นะคะ', ...over } as never, select: { id: true },
  })
  ids.msgs.push(m.id)
  return m.id
}
const mkRule = (s: Shop, name: string, keywords: string[], removeOnOrderCreate = false) =>
  prisma.shopTag.create({ data: { shopId: s.shop, name, nameKey: name.normalize('NFC').toLowerCase().trim(), keywords, removeOnOrderCreate } })
const tagsOf = async (contact: string) => (await prisma.externalContact.findUniqueOrThrow({ where: { id: contact } })).tags
const eventsOf = (contact: string) => prisma.shopTagEvent.findMany({ where: { externalContactId: contact } })
const outcomeOf = (r: { outcome: string; reason?: string }) => (r.outcome === 'SKIPPED' ? `SKIPPED:${r.reason}` : r.outcome)

describe.skipIf(!isLocal)('shop-tag-auto (DB จริง)', () => {
  beforeAll(async () => {
    A = await mkShop('a'); B = await mkShop('b')
    await mkRule(A, 'VIP', ['vip'])
  })

  afterAll(async () => {
    const w = (list: string[]) => ({ id: { in: list } })
    await prisma.shopTagEvent.deleteMany({ where: { shopId: { in: ids.shops } } })
    await prisma.order.deleteMany({ where: w(ids.orders) })
    await prisma.chatMessage.deleteMany({ where: w(ids.msgs) })
    await prisma.conversation.deleteMany({ where: w(ids.convs) })
    await prisma.externalContact.deleteMany({ where: w(ids.contacts) })
    await prisma.shopTag.deleteMany({ where: { shopId: { in: ids.shops } } })
    await prisma.shopChannel.deleteMany({ where: w(ids.channels) })
    await prisma.shop.deleteMany({ where: w(ids.shops) })
    await prisma.user.deleteMany({ where: w(ids.users) })
    await prisma.$disconnect()
    await appPrisma.$disconnect()
  })
  afterEach(() => vi.restoreAllMocks())

  it('TC-026 ร้านพิมพ์ TEXT ที่มีคำ → ติด + event 1 แถว ไม่มีเนื้อข้อความ', async () => {
    const r = await mkRoom(A); const id = await mkMsg(r.conv)
    expect(await applyKeywordTags(id)).toEqual({ outcome: 'APPLIED', added: ['VIP'], alreadyHad: [] })
    expect(await tagsOf(r.contact)).toEqual(['VIP'])
    const ev = await eventsOf(r.contact)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ action: 'ADD', source: 'KEYWORD', chatMessageId: id, matchedKeyword: 'vip', tagName: 'VIP', conversationId: r.conv, shopId: A.shop })
    expect(Object.values(ev[0]).some((v) => typeof v === 'string' && v.includes('สั่งเลย'))).toBe(false)
  })

  it('TC-027 ข้อความลูกค้าไม่ติด', async () => {
    const r = await mkRoom(A); const id = await mkMsg(r.conv, { senderRole: 'BUYER' })
    expect(outcomeOf(await applyKeywordTags(id))).toBe('SKIPPED:NOT_SHOP')
    expect(await tagsOf(r.contact)).toEqual([])
  })

  it('TC-028 ข้อความบอท/ระบบไม่ติด (AUTO, AUTO_TEST, AUTO_NOTICE)', async () => {
    for (const kind of ['AUTO', 'AUTO_TEST', 'AUTO_NOTICE']) {
      const r = await mkRoom(A); const id = await mkMsg(r.conv, { autoReplyKind: kind })
      expect(outcomeOf(await applyKeywordTags(id))).toBe('SKIPPED:BOT_MESSAGE')
      expect(await tagsOf(r.contact)).toEqual([])
    }
  })

  it('TC-029 ไม่ใช่ TEXT ไม่ติด', async () => {
    for (const type of ['IMAGE', 'STICKER', 'FILE', 'META_NOTICE']) {
      const r = await mkRoom(A); const id = await mkMsg(r.conv, { type })
      expect(outcomeOf(await applyKeywordTags(id))).toBe('SKIPPED:NOT_TEXT')
      expect(await tagsOf(r.contact)).toEqual([])
    }
  })

  it('TC-030 standby + AI echo ไม่ติด · echo มนุษย์ติด', async () => {
    const a = await mkRoom(A); const b = await mkRoom(A); const c = await mkRoom(A)
    expect(outcomeOf(await applyKeywordTags(await mkMsg(a.conv, { viaStandby: true })))).toBe('SKIPPED:STANDBY')
    expect(outcomeOf(await applyKeywordTags(await mkMsg(b.conv, { echoAiGenerated: true })))).toBe('SKIPPED:META_AI_ECHO')
    expect((await applyKeywordTags(await mkMsg(c.conv, { echoAiGenerated: false, echoAppId: '263902037430900' }))).outcome).toBe('APPLIED')
    expect(await tagsOf(a.contact)).toEqual([]); expect(await tagsOf(b.contact)).toEqual([])
    expect(await tagsOf(c.contact)).toEqual(['VIP'])
  })

  it('TC-031 ห้อง DEEP / ไม่มี contact → SKIPPED NO_CONTACT ไม่ throw ไม่มี event', async () => {
    const d = await prisma.conversation.create({ data: { shopId: A.shop } as never, select: { id: true } })
    ids.convs.push(d.id)
    const id = await mkMsg(d.id)
    expect(outcomeOf(await applyKeywordTags(id))).toBe('SKIPPED:NO_CONTACT')
    expect(await prisma.shopTagEvent.count({ where: { chatMessageId: id } })).toBe(0)
  })

  it('TC-032 ติดซ้ำไม่ได้ + ไม่เขียน event ซ้ำ', async () => {
    const r = await mkRoom(A); const id = await mkMsg(r.conv)
    await applyKeywordTags(id); await applyKeywordTags(id)
    expect(await applyKeywordTags(await mkMsg(r.conv))).toEqual({ outcome: 'APPLIED', added: [], alreadyHad: ['VIP'] })
    expect(await tagsOf(r.contact)).toEqual(['VIP'])
    expect(await eventsOf(r.contact)).toHaveLength(1)
  })

  it('TC-033 พร้อมกัน N=10 (ข้อความเดียว และ 10 ข้อความ) ไม่ซ้ำ', async () => {
    const r1 = await mkRoom(A); const one = await mkMsg(r1.conv)
    await Promise.all(Array.from({ length: 10 }, () => applyKeywordTags(one)))
    expect(await tagsOf(r1.contact)).toEqual(['VIP'])
    expect(await eventsOf(r1.contact)).toHaveLength(1)

    const r2 = await mkRoom(A)
    const many = await Promise.all(Array.from({ length: 10 }, () => mkMsg(r2.conv)))
    await Promise.all(many.map((m) => applyKeywordTags(m)))
    expect(await tagsOf(r2.contact)).toEqual(['VIP'])
    expect(await eventsOf(r2.contact)).toHaveLength(1)
  })

  it('TC-034 ถอดเองแล้วเจอคำ → ติดกลับ (event ADD 2 แถว)', async () => {
    const r = await mkRoom(A)
    await applyKeywordTags(await mkMsg(r.conv))
    await prisma.$executeRaw`UPDATE "ExternalContact" SET "tags" = array_remove("tags", 'VIP') WHERE "id" = ${r.contact}`
    expect((await applyKeywordTags(await mkMsg(r.conv))).outcome).toBe('APPLIED')
    expect(await tagsOf(r.contact)).toEqual(['VIP'])
    expect(await eventsOf(r.contact)).toHaveLength(2)
  })

  it('TC-035 ติดด้วยมือพร้อมกัน tag มือไม่หาย', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await mkRoom(A)
      const id = await mkMsg(r.conv)
      await Promise.all([
        applyKeywordTags(id),
        prisma.externalContact.updateMany({ where: { id: r.contact }, data: { tags: { push: 'มือ' } } }),
      ])
      expect([...(await tagsOf(r.contact))].sort()).toEqual(['VIP', 'มือ'])
    }
  })

  it('TC-036 variant ถือว่ามีแล้ว', async () => {
    const r = await mkRoom(A, ['vip']); const id = await mkMsg(r.conv)
    expect(await applyKeywordTags(id)).toEqual({ outcome: 'APPLIED', added: [], alreadyHad: ['VIP'] })
    expect(await tagsOf(r.contact)).toEqual(['vip'])
    expect(await eventsOf(r.contact)).toHaveLength(0)
  })

  it('TC-037 ข้อความที่กลายเป็นคำสั่งซื้อจริงแล้ว → ไม่ติด · DRAFTED / dry-run ติด', async () => {
    const mkOrder = async (msgId: string, status: string, isDryRun: boolean) => {
      const o = await prisma.order.create({
        data: { shopId: A.shop, totalAmount: 100, status, isDryRun, sourceChatMessageId: msgId } as never, select: { id: true },
      })
      ids.orders.push(o.id)
    }
    const a = await mkRoom(A); const ma = await mkMsg(a.conv); await mkOrder(ma, 'PENDING', false)
    const b = await mkRoom(A); const mb = await mkMsg(b.conv); await mkOrder(mb, 'DRAFTED', false)
    const c = await mkRoom(A); const mc = await mkMsg(c.conv); await mkOrder(mc, 'PENDING', true)
    expect(outcomeOf(await applyKeywordTags(ma))).toBe('SKIPPED:ORDER_ALREADY_CREATED')
    expect((await applyKeywordTags(mb)).outcome).toBe('APPLIED')
    expect((await applyKeywordTags(mc)).outcome).toBe('APPLIED')
    expect(await tagsOf(a.contact)).toEqual([])
    expect(await tagsOf(b.contact)).toEqual(['VIP']); expect(await tagsOf(c.contact)).toEqual(['VIP'])
  })

  it('TC-038 ไม่ข้ามร้าน — กติการ้าน B คำเดียวกันไม่ติดในห้องร้าน A', async () => {
    await mkRule(B, 'ของB', ['vip'])
    const r = await mkRoom(A); await applyKeywordTags(await mkMsg(r.conv))
    expect(await tagsOf(r.contact)).toEqual(['VIP'])
    expect(await prisma.shopTagEvent.count({ where: { shopId: B.shop } })).toBe(0)
  })

  it('TC-039 ตัวติดล้ม → ห่อ .catch แล้วไม่มี unhandled · ข้อความยังอยู่', async () => {
    const r = await mkRoom(A); const id = await mkMsg(r.conv)
    // vi.spyOn + restore บน delegate ของ Prisma (Proxy) ทำ findMany หายถึงเทสถัดไป ⇒ สลับค่าเองแล้วคืนเอง
    const d = appPrisma.shopTag as unknown as Record<string, unknown>
    const orig = d.findMany
    d.findMany = () => Promise.reject(new Error('boom'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await applyKeywordTags(id).catch((e) => console.error('[shop-tag-auto]', e))
    } finally {
      d.findMany = orig
    }
    expect(err).toHaveBeenCalled()
    expect(await prisma.chatMessage.count({ where: { id } })).toBe(1)
    expect(await tagsOf(r.contact)).toEqual([])
  })

  it('TC-044 ถอด: เฉพาะ tag เปิดสวิตช์ · ห้องไม่มี tag = ไม่ error ไม่มี event · ร้านอื่นไม่ถูกแตะ', async () => {
    await mkRule(A, 'ลูกค้าใหม่', [], true)
    await mkRule(B, 'ลูกค้าใหม่', [], true)
    const a = await mkRoom(A, ['ลูกค้าใหม่', 'VIP'])
    const none = await mkRoom(A, ['VIP'])
    const b = await mkRoom(B, ['ลูกค้าใหม่'])
    const ord = (conv: string | null, shopId = A.shop, isDryRun = false) => ({ id: randomUUID(), shopId, conversationId: conv, isDryRun })

    expect(await removeTagsOnOrderCreated(ord(a.conv))).toEqual({ outcome: 'REMOVED', removed: ['ลูกค้าใหม่'] })
    expect(await tagsOf(a.contact)).toEqual(['VIP'])
    const ev = await eventsOf(a.contact)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ action: 'REMOVE', source: 'ORDER_CREATED', tagName: 'ลูกค้าใหม่' })

    expect(await removeTagsOnOrderCreated(ord(none.conv))).toEqual({ outcome: 'REMOVED', removed: [] })
    expect(await eventsOf(none.contact)).toHaveLength(0)

    // สวมห้องร้าน B ด้วย shopId ร้าน A → scope ร้านกันไว้
    expect(outcomeOf(await removeTagsOnOrderCreated(ord(b.conv)))).toBe('SKIPPED:NO_CONTACT')
    expect(await tagsOf(b.contact)).toEqual(['ลูกค้าใหม่'])
    expect(outcomeOf(await removeTagsOnOrderCreated(ord(a.conv, A.shop, true)))).toBe('SKIPPED:DRY_RUN')
    expect(outcomeOf(await removeTagsOnOrderCreated(ord(null)))).toBe('SKIPPED:NO_CONVERSATION')
  })

  it('ไฟล์ service ไม่เขียนอาร์เรย์ tags ทั้งก้อน', () => {
    const src = readFileSync('src/services/shop-tag-auto.service.ts', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    expect(src).not.toMatch(/tags:\s*\[/)
  })
})
