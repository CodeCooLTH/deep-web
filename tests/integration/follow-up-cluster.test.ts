/**
 * 00066 — cluster "ลูกค้าเดียวกัน" บน Postgres จริง (BR-ACT-10/16, AC-ACT-27..30)
 *
 * ต้องรันกับ local Docker Postgres เท่านั้น (Hard Rule 13/14) — ปักหมุด URL ในคำสั่งตรง ๆ:
 *   npx dotenv -e .env -- env DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
 *     DIRECT_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
 *     npx vitest run tests/integration/follow-up-cluster.test.ts
 * ไม่มีฐาน local ⇒ เทสทั้งไฟล์ skip (ไม่ได้รันในเซสชันที่เขียน — ดูรายงาน)
 *
 * ข้อมูลที่เทสสร้างเองทั้งหมด ลบด้วย id ที่บันทึกไว้ (ผ่าน deleteTestData + deleteMany ที่มี where id) ไม่มี deleteMany ไม่ scope
 */
import { describe, it, expect, afterEach } from 'vitest'
import { prisma, deleteTestData } from '../setup'
import {
  clusterKeysOf,
  conversationsByClusterKeys,
  expandClusters,
  openRowsByAnchor,
} from '@/services/follow-up-scope'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /^postgres(ql)?:\/\/[^@]*@?(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url)
const d = isLocal ? describe : describe.skip

const userIds: string[] = []
const shopIds: string[] = []
const customerIds: string[] = []
let seq = 0

afterEach(async () => {
  await deleteTestData({ userIds: [...userIds], shopIds: [...shopIds] }) // shop cascade → ช่อง/ห้อง/รายการ
  if (customerIds.length) await prisma.customer.deleteMany({ where: { id: { in: customerIds } } })
  userIds.length = 0
  shopIds.length = 0
  customerIds.length = 0
})

async function seedShop() {
  const n = `${Date.now()}${seq++}`.slice(-9)
  const user = await prisma.user.create({ data: { phone: `09${n}`, displayName: `fu ${n}`, username: `futest${n}` } })
  userIds.push(user.id)
  const shop = await prisma.shop.create({ data: { userId: user.id, shopName: `FU ${n}`, businessType: 'INDIVIDUAL' } })
  shopIds.push(shop.id)
  return { user, shop, n }
}

async function seedRoom(shopId: string, userId: string, provider: 'MESSENGER' | 'LINE', customerId: string | null, n: string) {
  const ch = await prisma.shopChannel.create({
    data: { shopId, provider, externalId: `ext-${provider}-${n}-${seq++}`, name: `เพจ ${provider}`, accessTokenEnc: 'x', connectedByUserId: userId },
  })
  const contact = await prisma.externalContact.create({
    data: { shopChannelId: ch.id, externalUserId: `psid-${seq++}`, customerId },
  })
  const conv = await prisma.conversation.create({
    data: { shopId, channel: provider, shopChannelId: ch.id, externalContactId: contact.id },
  })
  return { conv, contact }
}

async function seedCustomer(n: string) {
  const c = await prisma.customer.create({ data: { phone: `08${n}` } })
  customerIds.push(c.id)
  return c
}

const addOpen = (shopId: string, conversationId: string, dueAt: Date) =>
  prisma.customerFollowUp.create({ data: { shopId, conversationId, title: 't', dueAt } })

d('follow-up cluster (integration)', () => {
  it('Messenger + LINE ที่ contact ชี้ Customer เดียวกัน ปนกัน · ไม่ชี้ ไม่ปน', async () => {
    const { user, shop, n } = await seedShop()
    const cust = await seedCustomer(n)
    const a = await seedRoom(shop.id, user.id, 'MESSENGER', cust.id, n)
    const b = await seedRoom(shop.id, user.id, 'LINE', cust.id, n)
    const lone = await seedRoom(shop.id, user.id, 'MESSENGER', null, n)
    const lone2 = await seedRoom(shop.id, user.id, 'LINE', null, n) // ไม่มี customer ทั้งคู่ ต้องไม่รวมกันเอง

    const m = await expandClusters([a.conv.id, lone.conv.id], shop.id)
    expect(new Set(m.get(a.conv.id))).toEqual(new Set([a.conv.id, b.conv.id]))
    expect(m.get(lone.conv.id)).toEqual([lone.conv.id])
    expect(m.get(lone.conv.id)).not.toContain(lone2.conv.id)
  })

  it('relink แล้วรายการตามไปโดยไม่ย้ายแถว (AC-ACT-29)', async () => {
    const { user, shop, n } = await seedShop()
    const cust = await seedCustomer(n)
    const a = await seedRoom(shop.id, user.id, 'MESSENGER', cust.id, n)
    const b = await seedRoom(shop.id, user.id, 'LINE', null, n)
    await addOpen(shop.id, b.conv.id, new Date(Date.now() + 86400_000))
    expect((await openRowsByAnchor([a.conv.id], [shop.id])).length).toBe(0)
    await prisma.externalContact.update({ where: { id: b.contact.id }, data: { customerId: cust.id } })
    expect((await openRowsByAnchor([a.conv.id], [shop.id])).length).toBe(1) // เห็นจากห้อง a แล้ว ทั้งที่แถวยังผูกห้อง b
  })

  it('ห้อง DEEP = ห้องเดียว (มติ S-2) · ข้ามร้านไม่รวม (BR-ACT-16)', async () => {
    const s1 = await seedShop()
    const s2 = await seedShop()
    const cust = await seedCustomer(s1.n)
    const a = await seedRoom(s1.shop.id, s1.user.id, 'MESSENGER', cust.id, s1.n)
    const other = await seedRoom(s2.shop.id, s2.user.id, 'MESSENGER', cust.id, s2.n) // Customer เดียวกันแต่คนละร้าน
    const deep = await prisma.conversation.create({ data: { shopId: s1.shop.id, channel: 'DEEP', buyerUserId: s2.user.id } })

    const m = await expandClusters([a.conv.id, deep.id], s1.shop.id)
    expect(m.get(a.conv.id)).toEqual([a.conv.id])
    expect(m.get(a.conv.id)).not.toContain(other.conv.id)
    expect(m.get(deep.id)).toEqual([deep.id])
    // ห้องของอีกร้านถามผ่านร้านนี้ = ไม่มี key
    expect((await expandClusters([other.conv.id], s1.shop.id)).size).toBe(0)
  })

  it('clusterKeysOf/conversationsByClusterKeys ตรงกัน และไม่เห็นร้านนอก scope', async () => {
    const s1 = await seedShop()
    const s2 = await seedShop()
    const cust = await seedCustomer(s1.n)
    const a = await seedRoom(s1.shop.id, s1.user.id, 'MESSENGER', cust.id, s1.n)
    const b = await seedRoom(s1.shop.id, s1.user.id, 'LINE', cust.id, s1.n)
    const x = await seedRoom(s2.shop.id, s2.user.id, 'MESSENGER', cust.id, s2.n)
    const keys = await clusterKeysOf([a.conv.id, x.conv.id], [s1.shop.id])
    expect(keys.has(x.conv.id)).toBe(false)
    const rooms = await conversationsByClusterKeys([keys.get(a.conv.id)!], [s1.shop.id])
    expect(new Set(rooms.map((r) => r.id))).toEqual(new Set([a.conv.id, b.conv.id]))
  })

  it('[blocker] โหมดรวมหลายร้าน: สองร้านที่ห้องชี้ Customer เดียวกัน ต้องไม่ข้ามร้าน แม้เรียกด้วย shopIds ทั้งสอง (Q5/BR-ACT-16)', async () => {
    // input นี้มีไว้เพื่อ mutation: ถ้า clusterKeySql ตัด shopId ออก (คีย์ = customerId เปล่า) เคสข้างบนที่เรียกทีละร้านยังเขียว
    // เพราะ shopIds ใน WHERE กันไว้ให้ — จะโผล่ก็ต่อเมื่อเรียกพร้อมกันทั้งสองร้านแบบนี้เท่านั้น
    const s1 = await seedShop()
    const s2 = await seedShop()
    const cust = await seedCustomer(s1.n)
    const a = await seedRoom(s1.shop.id, s1.user.id, 'MESSENGER', cust.id, s1.n)
    const x = await seedRoom(s2.shop.id, s2.user.id, 'MESSENGER', cust.id, s2.n)
    await addOpen(s2.shop.id, x.conv.id, new Date(Date.now() + 86400_000))
    const both = [s1.shop.id, s2.shop.id]

    const keys = await clusterKeysOf([a.conv.id, x.conv.id], both)
    expect(keys.get(a.conv.id)).not.toBe(keys.get(x.conv.id))
    const rooms = await conversationsByClusterKeys([keys.get(a.conv.id)!], both)
    expect(rooms.map((r) => r.id)).toEqual([a.conv.id])
    // รายการของร้าน 2 ต้องไม่โผล่ในป้ายของห้องร้าน 1
    expect(await openRowsByAnchor([a.conv.id], both)).toHaveLength(0)
    expect(await openRowsByAnchor([x.conv.id], both)).toHaveLength(1)
  })
})
