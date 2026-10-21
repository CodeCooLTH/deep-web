/**
 * shop-tag.db.test.ts — 00083 TC-012..025 (DB จริง)
 * 🛑 HR13/HR14: เฉพาะ localhost:5434 · สร้างข้อมูลเอง (randomUUID) · ลบด้วย id ที่สร้าง เรียงลูก→แม่
 */
import { describe, it, expect, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))

import { prisma as svcPrisma } from '@/lib/prisma'
import { createShopTag, updateShopTag, deleteShopTag, listShopTags, ShopTagError } from '@/services/shop-tag.service'
import { getShopTags } from '@/services/chat-crm.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const made = { users: [] as string[], shops: [] as string[], channels: [] as string[], contacts: [] as string[] }

async function newShop() {
  const u = await db.user.create({ data: { displayName: `st-${run}`, username: `st_${randomUUID().slice(0, 10)}` }, select: { id: true } })
  made.users.push(u.id)
  const s = await db.shop.create({ data: { userId: u.id, shopName: `st-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })
  made.shops.push(s.id)
  const ch = await db.shopChannel.create({
    data: { shopId: s.id, provider: 'MESSENGER', externalId: randomUUID(), name: 'x', accessTokenEnc: 'x', connectedByUserId: u.id },
    select: { id: true },
  })
  made.channels.push(ch.id)
  return { shopId: s.id, userId: u.id, channelId: ch.id }
}
type Shop = Awaited<ReturnType<typeof newShop>>
async function room(s: Shop, tags: string[]) {
  const c = await db.externalContact.create({ data: { shopChannelId: s.channelId, externalUserId: randomUUID(), tags }, select: { id: true } })
  made.contacts.push(c.id)
  return c.id
}
const tagsOf = async (id: string) => (await db.externalContact.findUniqueOrThrow({ where: { id }, select: { tags: true } })).tags
const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof ShopTagError ? e.code : `OTHER:${e}`))

describe.skipIf(!isLocal)('00083 shop-tag.service (DB จริง)', () => {
  afterAll(async () => {
    await db.shopTag.deleteMany({ where: { shopId: { in: made.shops } } })
    await db.externalContact.deleteMany({ where: { id: { in: made.contacts } } })
    await db.shopChannel.deleteMany({ where: { id: { in: made.channels } } })
    await db.shop.deleteMany({ where: { id: { in: made.shops } } })
    await db.user.deleteMany({ where: { id: { in: made.users } } })
    await db.$disconnect()
  })

  it('TC-012 เพิ่ม + ชื่อซ้ำไม่สนตัวพิมพ์ + ร้านอื่นผ่าน', async () => {
    const [a, b] = [await newShop(), await newShop()]
    const t = await createShopTag(a.shopId, a.userId, { name: 'VIP' })
    expect(t.nameKey).toBe('vip')
    expect(await code(createShopTag(a.shopId, a.userId, { name: 'vip' }))).toBe('TAG_NAME_TAKEN')
    expect(await code(createShopTag(b.shopId, b.userId, { name: 'VIP' }))).toBe('OK')
  })

  it('TC-013 เพดาน 50 tag', async () => {
    const [a, b] = [await newShop(), await newShop()]
    await createShopTag(b.shopId, b.userId, { name: 'other' })
    await db.shopTag.createMany({ data: Array.from({ length: 50 }, (_, i) => ({ shopId: a.shopId, name: `t${i}`, nameKey: `t${i}` })) })
    expect(await code(createShopTag(a.shopId, a.userId, { name: 'extra' }))).toBe('TAG_LIMIT_REACHED')
    expect(await db.shopTag.count({ where: { shopId: a.shopId } })).toBe(50)
  })

  it('TC-014 เพดาน 20 tag ที่มีคำ', async () => {
    const a = await newShop()
    await db.shopTag.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ shopId: a.shopId, name: `k${i}`, nameKey: `k${i}`, keywords: ['คำ'] })) })
    expect(await code(createShopTag(a.shopId, a.userId, { name: 'k21', keywords: ['คำ'] }))).toBe('KEYWORD_TAG_LIMIT_REACHED')
    const plain = await createShopTag(a.shopId, a.userId, { name: 'k21' })
    expect(await code(updateShopTag(a.shopId, plain.id, { keywords: ['คำ'] }))).toBe('KEYWORD_TAG_LIMIT_REACHED')
    const existing = await db.shopTag.findFirstOrThrow({ where: { shopId: a.shopId, nameKey: 'k0' } })
    expect(await code(updateShopTag(a.shopId, existing.id, { keywords: ['คำใหม่'] }))).toBe('OK')
  })

  it('TC-015 DB CHECK ชั้นสอง', async () => {
    const a = await newShop()
    await expect(db.shopTag.create({ data: { shopId: a.shopId, name: 'x'.repeat(31), nameKey: 'long' } })).rejects.toThrow()
    await expect(
      db.shopTag.create({ data: { shopId: a.shopId, name: 'kw', nameKey: 'kw', keywords: Array.from({ length: 11 }, (_, i) => `คำ${i}`) } }),
    ).rejects.toThrow()
  })

  it('TC-016 [blocker] race ที่ 49 → ได้ 50 พอดี', async () => {
    const a = await newShop()
    await db.shopTag.createMany({ data: Array.from({ length: 49 }, (_, i) => ({ shopId: a.shopId, name: `r${i}`, nameKey: `r${i}` })) })
    const res = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((n) => code(createShopTag(a.shopId, a.userId, { name: `new-${n}` }))))
    expect(res.filter((r) => r === 'OK')).toHaveLength(1)
    expect(res.filter((r) => r === 'TAG_LIMIT_REACHED')).toHaveLength(4)
    expect(await db.shopTag.count({ where: { shopId: a.shopId } })).toBe(50)
  })

  it('TC-017/018 รายการ: registered + unregistered + variant + ไม่นับซ้ำ', async () => {
    const [a, b] = [await newShop(), await newShop()]
    await room(a, ['VIP', 'x']); await room(a, ['vip']); await room(a, ['ghost']); await room(a, ['VIP', 'vip'])
    await room(b, ['VIP', 'other'])
    await createShopTag(a.shopId, a.userId, { name: 'VIP' })
    const { tags, counts } = await listShopTags(a.shopId)
    const vip = tags.find((t) => t.name === 'VIP')!
    expect(vip).toMatchObject({ registered: true, rooms: 3 }) // ห้อง 4 มีสอง variant นับครั้งเดียว
    for (const n of ['x', 'ghost']) expect(tags.find((t) => t.name === n)).toMatchObject({ registered: false, id: null, rooms: 1 })
    expect(tags.find((t) => t.name === 'other')).toBeUndefined()
    expect(counts.registered).toBe(1)
  })

  it('TC-019 rename ไล่ทุกห้อง + dedupe + ร้านอื่นไม่ถูกแตะ', async () => {
    const [a, b] = [await newShop(), await newShop()]
    const r1 = await room(a, ['รอคีย์']); const r2 = await room(a, ['รอคีย์', 'y'])
    const r3 = await room(a, ['รอคีย์ออเดอร์', 'รอคีย์', 'z']); const rb = await room(b, ['รอคีย์'])
    const t = await createShopTag(a.shopId, a.userId, { name: 'รอคีย์' })
    const out = await updateShopTag(a.shopId, t.id, { name: 'รอคีย์ออเดอร์' })
    expect(out.renamedRooms).toBe(3)
    expect(await tagsOf(r1)).toEqual(['รอคีย์ออเดอร์'])
    expect(await tagsOf(r2)).toEqual(['รอคีย์ออเดอร์', 'y'])
    expect(await tagsOf(r3)).toEqual(['รอคีย์ออเดอร์', 'z'])
    expect(await tagsOf(rb)).toEqual(['รอคีย์'])
    expect(out.tag).toMatchObject({ name: 'รอคีย์ออเดอร์', nameKey: 'รอคีย์ออเดอร์' })
  })

  it('TC-020 [blocker] rename rollback ทั้งก้อนเมื่อ update ShopTag ล้ม', async () => {
    const a = await newShop()
    const r1 = await room(a, ['เก่า', 'k']); const r2 = await room(a, ['เก่า'])
    const t = await createShopTag(a.shopId, a.userId, { name: 'เก่า' })
    const orig = svcPrisma.$transaction.bind(svcPrisma) as unknown as (fn: (tx: never) => unknown, o?: unknown) => Promise<unknown>
    const spy = vi.spyOn(svcPrisma, '$transaction').mockImplementationOnce(((fn: (tx: unknown) => unknown, o?: unknown) =>
      orig((tx) => fn(new Proxy(tx as object, {
        get(target, p) {
          if (p === 'shopTag') return { ...(target as never as { shopTag: object }).shopTag, findFirst: (target as never as { shopTag: { findFirst: Function } }).shopTag.findFirst.bind((target as never as { shopTag: object }).shopTag), findUnique: (target as never as { shopTag: { findUnique: Function } }).shopTag.findUnique.bind((target as never as { shopTag: object }).shopTag), update: () => { throw new Error('boom') } }
          const v = (target as Record<string | symbol, unknown>)[p]
          return typeof v === 'function' ? (v as Function).bind(target) : v
        },
      })) as never, o)) as never)
    await expect(updateShopTag(a.shopId, t.id, { name: 'ใหม่' })).rejects.toThrow('boom')
    spy.mockRestore()
    expect(await tagsOf(r1)).toEqual(['เก่า', 'k'])
    expect(await tagsOf(r2)).toEqual(['เก่า'])
    expect((await db.shopTag.findUniqueOrThrow({ where: { id: t.id } })).name).toBe('เก่า')
  })

  it('TC-021 rename ซ้ำ tag อื่น / รวมชื่อที่มีแต่ในห้อง / เปลี่ยนตัวพิมพ์', async () => {
    const a = await newShop()
    const ta = await createShopTag(a.shopId, a.userId, { name: 'A' })
    await createShopTag(a.shopId, a.userId, { name: 'B' })
    const r = await room(a, ['A'])
    expect(await code(updateShopTag(a.shopId, ta.id, { name: 'b' }))).toBe('TAG_NAME_TAKEN')
    expect(await tagsOf(r)).toEqual(['A'])
    const r2 = await room(a, ['A', 'C']); await room(a, ['C'])
    await updateShopTag(a.shopId, ta.id, { name: 'C' })
    expect(await tagsOf(r2)).toEqual(['C'])
    const tv = await createShopTag(a.shopId, a.userId, { name: 'VIP' })
    const r3 = await room(a, ['VIP']); const r4 = await room(a, ['Vip'])
    await updateShopTag(a.shopId, tv.id, { name: 'vip' })
    expect(await tagsOf(r3)).toEqual(['vip']); expect(await tagsOf(r4)).toEqual(['vip'])
  })

  it('TC-022 ลบ → หายทุกห้อง/ทุก variant, ลำดับอื่นคงเดิม, ร้านอื่นไม่แตะ', async () => {
    const [a, b] = [await newShop(), await newShop()]
    const r1 = await room(a, ['p', 'VIP', 'q']); const r2 = await room(a, ['vip']); const r3 = await room(a, ['p'])
    const rb = await room(b, ['VIP'])
    const t = await createShopTag(a.shopId, a.userId, { name: 'VIP', keywords: ['วีไอพี'] })
    const out = await deleteShopTag(a.shopId, t.id)
    expect(out.removedFromRooms).toBe(2)
    expect(await tagsOf(r1)).toEqual(['p', 'q']); expect(await tagsOf(r2)).toEqual([]); expect(await tagsOf(r3)).toEqual(['p'])
    expect(await tagsOf(rb)).toEqual(['VIP'])
    expect(await db.shopTag.count({ where: { id: t.id } })).toBe(0)
  })

  it('TC-023 id ของร้านอื่น = TAG_NOT_FOUND', async () => {
    const [a, b] = [await newShop(), await newShop()]
    const rb = await room(b, ['X'])
    const tb = await createShopTag(b.shopId, b.userId, { name: 'X' })
    expect(await code(updateShopTag(a.shopId, tb.id, { name: 'Y' }))).toBe('TAG_NOT_FOUND')
    expect(await code(deleteShopTag(a.shopId, tb.id))).toBe('TAG_NOT_FOUND')
    expect(await code(deleteShopTag(a.shopId, randomUUID()))).toBe('TAG_NOT_FOUND')
    expect(await tagsOf(rb)).toEqual(['X']); expect(await db.shopTag.count({ where: { id: tb.id } })).toBe(1)
  })

  it('TC-024 getShopTags union ลงทะเบียน + ห้อง ไม่เกิน scope', async () => {
    const [a, b] = [await newShop(), await newShop()]
    await createShopTag(a.shopId, a.userId, { name: 'ใหม่' }); await room(a, ['เก่า', 'ใหม่'])
    await createShopTag(b.shopId, b.userId, { name: 'ร้านบี' })
    expect(await getShopTags([a.shopId])).toEqual(['เก่า', 'ใหม่'])
    expect(await getShopTags([a.shopId, b.shopId])).toEqual(['เก่า', 'ใหม่', 'ร้านบี'])
  })

  it('TC-025 ค่าเริ่มต้น + อ่านกลับตรง', async () => {
    const a = await newShop()
    const t = await createShopTag(a.shopId, a.userId, { name: 'D', keywords: ['A'] })
    expect(t.removeOnOrderCreate).toBe(false)
    await updateShopTag(a.shopId, t.id, { removeOnOrderCreate: true })
    const row = (await listShopTags(a.shopId)).tags.find((x) => x.id === t.id)!
    expect(row).toMatchObject({ removeOnOrderCreate: true, keywords: ['A'] })
  })
})
