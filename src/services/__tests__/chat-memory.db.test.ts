/**
 * chat-memory.db.test.ts — ความจำแชทบน Postgres จริง (00019-ext-mem T4)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))
vi.mock('@/services/chat-interested-product.service', () => ({ listInterestedProducts: vi.fn() }))

import { resolveEffectiveMemory, saveMemoryByAdmin } from '@/services/chat-memory.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)

const ids = {
  users: [] as string[], shops: [] as string[], channels: [] as string[], customers: [] as string[],
  contacts: [] as string[], convs: [] as string[],
}
const mkShop = async (tag: string) => {
  const u = await prisma.user.create({ data: { displayName: `cm-${run}-${tag}`, username: `cm_${run}_${tag}` }, select: { id: true } })
  const s = await prisma.shop.create({ data: { userId: u.id, shopName: `cm-${run}-${tag}`, kind: 'BUSINESS' } as never, select: { id: true } })
  const ch = await prisma.shopChannel.create({
    data: { shopId: s.id, provider: 'MESSENGER', externalId: `cm-${run}-${tag}`, name: tag, accessTokenEnc: 'x', connectedByUserId: u.id } as never, select: { id: true },
  })
  ids.users.push(u.id); ids.shops.push(s.id); ids.channels.push(ch.id)
  return { shop: s.id, channel: ch.id }
}
const mkRoom = async (shop: string, channel: string, customerId: string | null, tag: string) => {
  const e = await prisma.externalContact.create({
    data: { shopChannelId: channel, externalUserId: `cm-${run}-${tag}`, customerId }, select: { id: true },
  })
  const c = await prisma.conversation.create({
    data: { shopId: shop, shopChannelId: channel, externalContactId: e.id, channel: 'MESSENGER' } as never, select: { id: true },
  })
  ids.contacts.push(e.id); ids.convs.push(c.id)
  return { conv: c.id, contact: e.id }
}

let S1: { shop: string; channel: string }, S2: { shop: string; channel: string }
let A: { conv: string; contact: string }, B: { conv: string; contact: string }
let other: { conv: string }, deep: { conv: string }, otherShopRoom: { conv: string }
let customerId: string

describe.skipIf(!isLocal)('chat-memory (DB จริง)', () => {
  beforeAll(async () => {
    S1 = await mkShop('a'); S2 = await mkShop('b')
    const cu = await prisma.customer.create({ data: { phone: `09${run.replace(/\D/g, '').padEnd(8, '1').slice(0, 8)}` }, select: { id: true } })
    customerId = cu.id; ids.customers.push(cu.id)
    A = await mkRoom(S1.shop, S1.channel, customerId, 'A')
    B = await mkRoom(S1.shop, S1.channel, customerId, 'B')
    other = await mkRoom(S1.shop, S1.channel, null, 'N')
    otherShopRoom = await mkRoom(S2.shop, S2.channel, customerId, 'S2')
    const d = await prisma.conversation.create({ data: { shopId: S1.shop } as never, select: { id: true } })
    deep = { conv: d.id }; ids.convs.push(d.id)
  })

  afterAll(async () => {
    const w = (list: string[]) => ({ id: { in: list } })
    await prisma.chatMemory.deleteMany({ where: { conversationId: { in: ids.convs } } })
    await prisma.conversation.deleteMany({ where: w(ids.convs) })
    await prisma.externalContact.deleteMany({ where: w(ids.contacts) })
    await prisma.customer.deleteMany({ where: w(ids.customers) })
    await prisma.shopChannel.deleteMany({ where: w(ids.channels) })
    await prisma.shop.deleteMany({ where: w(ids.shops) })
    await prisma.user.deleteMany({ where: w(ids.users) })
    await prisma.$disconnect()
  })

  const put = (shopId: string, conversationId: string, text: string, expectedVersion: number | null) =>
    saveMemoryByAdmin({ shopId, conversationId, userId: ids.users[0], text, expectedVersion })

  it('สร้างแถวแรก v1 · ห้อง B (customer เดียวกัน) เห็นแถวเดียวกันเป็น shared', async () => {
    const r = await put(S1.shop, A.conv, 'ชอบสีดำ', null)
    expect(r.ok && r.memory.version).toBe(1)
    const viaB = await resolveEffectiveMemory(S1.shop, B.conv)
    expect(viaB?.row?.text).toBe('ชอบสีดำ')
    expect(viaB?.shared).toBe(true)
    expect((await resolveEffectiveMemory(S1.shop, A.conv))?.shared).toBe(false)
  })

  it('ห้องไม่มี customer / ห้อง DEEP / ร้านอื่นเบอร์เดียวกัน ไม่เห็น', async () => {
    expect((await resolveEffectiveMemory(S1.shop, other.conv))?.row).toBeNull()
    expect((await resolveEffectiveMemory(S1.shop, deep.conv))?.row).toBeNull()
    expect((await resolveEffectiveMemory(S2.shop, otherShopRoom.conv))?.row).toBeNull()
    // ห้องของร้าน 1 ถามด้วย shopId ร้าน 2 → null (ไม่ใช่ของร้าน)
    expect(await resolveEffectiveMemory(S2.shop, A.conv)).toBeNull()
  })

  it('แถวร้านอื่นที่ชี้ conversationId ห้อง A ต้องไม่ถูกอ่านโดยร้าน 1 (shopId ใน WHERE)', async () => {
    const stray = await prisma.chatMemory.create({
      data: { shopId: S2.shop, conversationId: other.conv, text: 'ของร้านอื่น', version: 9 },
    })
    expect((await resolveEffectiveMemory(S1.shop, other.conv))?.row).toBeNull()
    await prisma.chatMemory.deleteMany({ where: { id: stray.id } })
  })

  it('2 แอดมินแก้ v3 พร้อมกัน → ชนะ 1 · อีกคน VERSION_CONFLICT พร้อมข้อความคนแรก', async () => {
    await put(S1.shop, A.conv, 'v2', 1)
    await put(S1.shop, A.conv, 'v3', 2)
    const [x, y] = await Promise.all([put(S1.shop, A.conv, 'แอดมิน X', 3), put(S1.shop, B.conv, 'แอดมิน Y', 3)])
    const oks = [x, y].filter((r) => r.ok)
    const bad = [x, y].filter((r) => !r.ok)
    expect(oks).toHaveLength(1)
    expect(bad).toHaveLength(1)
    const winner = oks[0].ok ? oks[0].memory.text : ''
    expect(bad[0]).toMatchObject({ code: 'VERSION_CONFLICT', current: { text: winner, version: 4, source: 'ADMIN' } })
    const row = await prisma.chatMemory.findFirst({ where: { conversationId: A.conv } })
    expect(row).toMatchObject({ version: 4, previousText: 'v3' })
  })

  it('801 ตัว → INVALID_TEXT · \\n → บรรทัดเดียว · ข้อความเดิม ไม่ bump', async () => {
    expect(await put(S1.shop, A.conv, 'ก'.repeat(801), 4)).toEqual({ ok: false, code: 'INVALID_TEXT' })
    const r = await put(S1.shop, A.conv, 'บรรทัด1\nบรรทัด2', 4)
    expect(r.ok && r.memory).toMatchObject({ text: 'บรรทัด1 บรรทัด2', version: 5 })
    const same = await put(S1.shop, A.conv, 'บรรทัด1 บรรทัด2\n', 5)
    expect(same.ok && same.memory.version).toBe(5)
  })

  it('ว่าง → text "" แถวยังอยู่', async () => {
    const r = await put(S1.shop, A.conv, '   ', 5)
    expect(r.ok && r.memory).toMatchObject({ text: '', version: 6 })
    expect(await prisma.chatMemory.count({ where: { conversationId: A.conv } })).toBe(1)
  })

  it('cluster แตก (B ไม่ผูก customer) → B ไม่เห็นความจำ ห้อง A ยังเห็น', async () => {
    await prisma.externalContact.update({ where: { id: B.contact }, data: { customerId: null } })
    expect((await resolveEffectiveMemory(S1.shop, B.conv))?.row).toBeNull()
    expect((await resolveEffectiveMemory(S1.shop, A.conv))?.row).not.toBeNull()
  })
})
