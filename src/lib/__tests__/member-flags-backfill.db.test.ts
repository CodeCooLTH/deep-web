/**
 * member-flags-backfill.db.test.ts — backfill canCloseJob ของ 00086 (S-1) บน Postgres จริง
 * อ่านคำสั่ง UPDATE จากไฟล์ migration ตรง ๆ แล้วรันกับแถวที่เทสสร้างเท่านั้น (ต่อท้ายเงื่อนไข id)
 * ร้านบริการ: ADMIN ที่ถือ CHAT/TECHNICIAN → true · BILLING ล้วน/MANAGER/OWNER → false
 * ร้านขายของ/ที่พัก → false ทุกคน · คำเชิญ/ลิงก์ที่ค้าง → false (ไม่ backfill)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const migration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20261027100000_00086_member_permission_flags/migration.sql'),
  'utf8',
)
// คำสั่ง UPDATE ตัวเดียวในไฟล์ (ตัดคอมเมนต์ออกก่อน) — ไม่มี ; ท้าย เพื่อต่อเงื่อนไข id ได้
const backfill = (() => {
  const code = migration.replace(/^\s*--.*$/gm, '')
  const m = code.match(/UPDATE "ShopMember"[\s\S]*?;/)
  if (!m) throw new Error('ไม่พบ UPDATE "ShopMember" ใน migration')
  return m[0].replace(/;\s*$/, '')
})()

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const d = isLocal ? describe : describe.skip
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)

const ids = { users: [] as string[], shops: [] as string[], members: [] as string[], invites: [] as string[], links: [] as string[] }
const m: Record<string, string> = {}

d('00086 backfill canCloseJob (DB local)', () => {
  beforeAll(async () => {
    const mkUser = async (t: string) => {
      const u = await prisma.user.create({ data: { displayName: `mf-${run}-${t}`, username: `mf_${run}_${t}` }, select: { id: true } })
      ids.users.push(u.id)
      return u.id
    }
    const mkShop = async (t: string, vertical: string) => {
      const owner = await mkUser(`${t}-own`)
      const s = await prisma.shop.create({
        data: { userId: owner, shopName: `mf-${run}-${t}`, kind: 'BUSINESS', vertical } as never, select: { id: true },
      })
      ids.shops.push(s.id)
      const o = await prisma.shopMember.create({ data: { shopId: s.id, userId: owner, role: 'OWNER', roles: [] }, select: { id: true } })
      ids.members.push(o.id)
      return { shop: s.id, owner, ownerMember: o.id }
    }
    const add = async (key: string, shopId: string, roles: string[]) => {
      const uid = await mkUser(key)
      const x = await prisma.shopMember.create({ data: { shopId, userId: uid, role: 'ADMIN', roles }, select: { id: true } })
      ids.members.push(x.id)
      m[key] = x.id
    }

    const svc = await mkShop('svc', 'SERVICE_QUEUE')
    m.svcOwner = svc.ownerMember
    await add('svcChat', svc.shop, ['CHAT'])
    await add('svcTech', svc.shop, ['TECHNICIAN'])
    await add('svcChatBilling', svc.shop, ['CHAT', 'BILLING'])
    await add('svcBilling', svc.shop, ['BILLING'])
    await add('svcManager', svc.shop, ['MANAGER'])

    const online = await mkShop('onl', 'ONLINE_SALES')
    await add('onlChat', online.shop, ['CHAT'])
    await add('onlTech', online.shop, ['TECHNICIAN'])

    const lodging = await mkShop('lod', 'LODGING')
    await add('lodChat', lodging.shop, ['CHAT'])

    const inv = await prisma.shopInvite.create({
      data: { shopId: svc.shop, invitedContact: `mf${run}@t.local`, contactType: 'EMAIL', invitedByUserId: svc.owner, roles: ['CHAT'] },
      select: { id: true },
    })
    ids.invites.push(inv.id)
    const link = await prisma.shopInviteLink.create({
      data: { shopId: svc.shop, slug: `mf-${run}`, roles: ['TECHNICIAN'], createdByUserId: svc.owner, expiresAt: new Date(Date.now() + 86_400_000) },
      select: { id: true },
    })
    ids.links.push(link.id)

    // รัน backfill จริงจาก migration — จำกัดเฉพาะสมาชิกที่เทสนี้สร้าง
    await prisma.$executeRawUnsafe(`${backfill} AND m."id" = ANY($1::text[])`, ids.members)
  })

  afterAll(async () => {
    if (ids.links.length) await prisma.shopInviteLink.deleteMany({ where: { id: { in: ids.links } } })
    if (ids.invites.length) await prisma.shopInvite.deleteMany({ where: { id: { in: ids.invites } } })
    if (ids.members.length) await prisma.shopMember.deleteMany({ where: { id: { in: ids.members } } })
    if (ids.shops.length) await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  const flags = async (key: string) =>
    prisma.shopMember.findUniqueOrThrow({ where: { id: m[key] }, select: { canCloseJob: true, canRecordExpense: true } })

  it.each(['svcChat', 'svcTech', 'svcChatBilling'])('ร้านบริการ %s → canCloseJob = true', async (k) => {
    expect(await flags(k)).toEqual({ canCloseJob: true, canRecordExpense: false })
  })

  it.each(['svcOwner', 'svcBilling', 'svcManager', 'onlChat', 'onlTech', 'lodChat'])('%s → ไม่ถูกแตะ (false ทั้งคู่)', async (k) => {
    expect(await flags(k)).toEqual({ canCloseJob: false, canRecordExpense: false })
  })

  it('คำเชิญ/ลิงก์ที่ค้างไม่ถูก backfill', async () => {
    const inv = await prisma.shopInvite.findUniqueOrThrow({ where: { id: ids.invites[0] }, select: { canCloseJob: true, canRecordExpense: true } })
    const link = await prisma.shopInviteLink.findUniqueOrThrow({ where: { id: ids.links[0] }, select: { canCloseJob: true, canRecordExpense: true } })
    expect(inv).toEqual({ canCloseJob: false, canRecordExpense: false })
    expect(link).toEqual({ canCloseJob: false, canRecordExpense: false })
  })

  it('รันซ้ำไม่เปลี่ยนอะไร (แถวที่ติ๊กแล้วถูกข้าม)', async () => {
    const n = await prisma.$executeRawUnsafe(`${backfill} AND m."id" = ANY($1::text[])`, ids.members)
    expect(n).toBe(0)
  })

  it('มี index Expense_shopId_createdBy_expenseDate_idx (shopId, createdByUserId, expenseDate)', async () => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'Expense' AND indexname = 'Expense_shopId_createdBy_expenseDate_idx'`
    expect(rows).toHaveLength(1)
    expect(rows[0].indexdef).toContain('("shopId", "createdByUserId", "expenseDate")')
  })
})
