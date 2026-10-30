/**
 * staff-flags-capability.db.test.ts — 00086 S-4/S-5: ธงสิทธิ์รายคนไหลผ่านด่านกลางบน Postgres จริง
 * - requireShopCapability(...).active / requireActiveShop มี canCloseJob · canRecordExpense จากแถว ShopMember
 * - เจ้าของเปลี่ยนธง → คำขอถัดไปเห็นทันที (ไม่ต้องออกจากระบบ: ด่านอ่าน ShopMember สด ไม่ใช่ JWT)
 * - canCloseJobInShop ตัดสินตามร้านบริการ/ไม่ใช่บริการ
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { canCloseJobInShop, requireShopCapability } from '@/lib/shop-capability'
import { requireActiveShop } from '@/lib/shop-context'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const d = isLocal ? describe : describe.skip
const run = randomUUID().slice(0, 8)

const ids = { users: [] as string[], shops: [] as string[], members: [] as string[] }
const f: Record<string, string> = {}

d('00086 ธงสิทธิ์รายคนผ่าน requireShopCapability (DB local)', () => {
  beforeAll(async () => {
    const mkUser = async (t: string) => {
      const u = await prisma.user.create({ data: { displayName: `sf-${run}-${t}`, username: `sf_${run}_${t}` }, select: { id: true } })
      ids.users.push(u.id)
      return u.id
    }
    const mkShop = async (t: string, vertical: string) => {
      const owner = await mkUser(`${t}-own`)
      const s = await prisma.shop.create({
        data: { userId: owner, shopName: `sf-${run}-${t}`, kind: 'BUSINESS', vertical } as never, select: { id: true },
      })
      ids.shops.push(s.id)
      const o = await prisma.shopMember.create({ data: { shopId: s.id, userId: owner, role: 'OWNER', roles: [] }, select: { id: true } })
      ids.members.push(o.id)
      f[`${t}Shop`] = s.id
      f[`${t}Owner`] = owner
    }
    const add = async (key: string, shopKey: string, roles: string[]) => {
      const uid = await mkUser(key)
      const x = await prisma.shopMember.create({ data: { shopId: f[shopKey], userId: uid, role: 'ADMIN', roles }, select: { id: true } })
      ids.members.push(x.id)
      f[key] = uid
      f[`${key}Member`] = x.id
    }
    await mkShop('svc', 'SERVICE_QUEUE')
    await add('chat', 'svcShop', ['CHAT'])
    await mkShop('onl', 'ONLINE_SALES')
    await add('onlChat', 'onlShop', ['CHAT'])
  })

  afterAll(async () => {
    if (ids.members.length) await prisma.shopMember.deleteMany({ where: { id: { in: ids.members } } })
    if (ids.shops.length) await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  const sessionOf = (userId: string, shopId: string) => ({ user: { id: userId, activeShopId: shopId } })

  it('ค่าเริ่มต้น = false ทั้งคู่ · CHAT ร้านบริการปิดงานไม่ได้', async () => {
    const r = await requireShopCapability(sessionOf(f.chat, f.svcShop), 'O1')
    expect(r.ok && { c: r.active.canCloseJob, e: r.active.canRecordExpense }).toEqual({ c: false, e: false })
    expect(await canCloseJobInShop(f.svcShop, f.chat)).toBe(false)
  })

  it('[blocker] เจ้าของติ๊กธง → คำขอถัดไปเห็นทันที (session เดิม ไม่ต้องล็อกอินใหม่) · เอาออกก็หายทันที', async () => {
    const session = sessionOf(f.chat, f.svcShop)
    await prisma.shopMember.update({ where: { id: f.chatMember }, data: { canCloseJob: true, canRecordExpense: true } })
    const r = await requireShopCapability(session, 'O1')
    expect(r.ok && { c: r.active.canCloseJob, e: r.active.canRecordExpense }).toEqual({ c: true, e: true })
    expect(await requireActiveShop(session)).toMatchObject({ canCloseJob: true, canRecordExpense: true })
    expect(await canCloseJobInShop(f.svcShop, f.chat)).toBe(true)

    await prisma.shopMember.update({ where: { id: f.chatMember }, data: { canCloseJob: false } })
    const r2 = await requireShopCapability(session, 'O1')
    expect(r2.ok && { c: r2.active.canCloseJob, e: r2.active.canRecordExpense }).toEqual({ c: false, e: true })
    expect(await canCloseJobInShop(f.svcShop, f.chat)).toBe(false)
  })

  it('เจ้าของ: active ธง false (CHECK) แต่ปิดงานได้เสมอ', async () => {
    const r = await requireShopCapability(sessionOf(f.svcOwner, f.svcShop), 'O1')
    expect(r.ok && { c: r.active.canCloseJob, e: r.active.canRecordExpense }).toEqual({ c: false, e: false })
    expect(await canCloseJobInShop(f.svcShop, f.svcOwner)).toBe(true)
  })

  it('ร้านขายของ: CHAT ไม่มีธงปิดงานได้ตาม O4 เดิม · คนนอกร้าน = false', async () => {
    expect(await canCloseJobInShop(f.onlShop, f.onlChat)).toBe(true)
    expect(await canCloseJobInShop(f.onlShop, f.chat)).toBe(false)
  })
})
