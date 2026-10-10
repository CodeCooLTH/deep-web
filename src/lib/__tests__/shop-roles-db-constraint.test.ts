/**
 * shop-roles-db-constraint.test.ts — CHECK ของ roles (00071 S-8)
 * (a) source: migration มีครบ 4 role + 3 constraint · (b) DB local เท่านั้น (HR13/14): สร้างแถวเอง ลบด้วย id ที่สร้าง
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const sql = readFileSync(join(process.cwd(), 'prisma/migrations/20261010120000_shop_member_roles/migration.sql'), 'utf8')

describe('migration shop_member_roles (source)', () => {
  it.each(['MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN'])('มี %s', (r) => expect(sql).toContain(`'${r}'`))
  it.each(['ShopMember_roles_check', 'ShopInvite_roles_check', 'ShopInviteLink_roles_check'])('มี %s', (c) =>
    expect(sql).toContain(`ADD CONSTRAINT "${c}"`))
  it('ไม่มี DROP/TRUNCATE/DELETE', () => expect(sql.replace(/^--.*$/gm, '')).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i))
})

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const d = isLocal ? describe : describe.skip
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const ids = { users: [] as string[], shop: '' }
const memberIds: string[] = []

d('ShopMember_roles_check (DB local)', () => {
  beforeAll(async () => {
    for (let i = 0; i < 8; i++) {
      const u = await prisma.user.create({ data: { displayName: `sr-${run}-${i}`, username: `sr_${run}_${i}` }, select: { id: true } })
      ids.users.push(u.id)
    }
    const s = await prisma.shop.create({ data: { userId: ids.users[0], shopName: `sr-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })
    ids.shop = s.id
  })
  afterAll(async () => {
    if (memberIds.length) await prisma.shopMember.deleteMany({ where: { id: { in: memberIds } } })
    if (ids.shop) {
      await prisma.shopInvite.deleteMany({ where: { shopId: ids.shop } }) // scope ด้วย shop ที่เทสสร้าง
      await prisma.shop.delete({ where: { id: ids.shop } })
    }
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })
  let n = 1
  const add = async (role: string, roles: string[]) => {
    const m = await prisma.shopMember.create({ data: { shopId: ids.shop, userId: ids.users[n++], role, roles } })
    memberIds.push(m.id)
  }

  it.each([
    ['ADMIN', []],
    ['OWNER', ['CHAT']],
    ['ADMIN', ['WEIRD']],
    ['ADMIN', ['MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN', 'MANAGER']],
  ])('ปฏิเสธ %s %j', async (role, roles) => {
    await expect(add(role, roles)).rejects.toThrow(/roles_check|23514/)
  })
  it('ยอมรับ ADMIN [MANAGER] และ OWNER []', async () => {
    await add('ADMIN', ['MANAGER'])
    await add('OWNER', [])
  })
  it('ShopInvite roles ว่าง/นอกชุด ถูกปฏิเสธ', async () => {
    const base = { shopId: ids.shop, invitedContact: `x${run}@t.local`, contactType: 'EMAIL', invitedByUserId: ids.users[0] }
    await expect(prisma.shopInvite.create({ data: { ...base, roles: [] } })).rejects.toThrow(/roles_check|23514/)
    await expect(prisma.shopInvite.create({ data: { ...base, roles: ['X'] } })).rejects.toThrow(/roles_check|23514/)
  })
})
