/**
 * shop-roles-db-constraint.test.ts — CHECK ของ roles (00071 S-8)
 * (a) source: migration มีครบ 4 role + 3 constraint · (b) DB local เท่านั้น (HR13/14): สร้างแถวเอง ลบด้วย id ที่สร้าง
 * + 00086 S-1: ShopMember_flags_admin_only_check (OWNER ห้ามติ๊ก canCloseJob/canRecordExpense)
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

const flagsSql = readFileSync(join(process.cwd(), 'prisma/migrations/20261027100000_00086_member_permission_flags/migration.sql'), 'utf8')

describe('migration 00086_member_permission_flags (source)', () => {
  const code = flagsSql.replace(/^\s*--.*$/gm, '')
  it('มี ShopMember_flags_admin_only_check', () => expect(code).toContain('ADD CONSTRAINT "ShopMember_flags_admin_only_check"'))
  it.each(['ShopMember', 'ShopInvite', 'ShopInviteLink'])('%s ได้ 2 คอลัมน์ default false', (t) =>
    expect(code).toMatch(new RegExp(`ALTER TABLE "${t}"\\s+ADD COLUMN IF NOT EXISTS "canCloseJob" BOOLEAN NOT NULL DEFAULT false,\\s+ADD COLUMN IF NOT EXISTS "canRecordExpense" BOOLEAN NOT NULL DEFAULT false`)))
  it('backfill กั้นด้วยร้านบริการ + ADMIN และไม่แตะคำเชิญ/ลิงก์', () => {
    expect(code).toMatch(/UPDATE "ShopMember"[\s\S]*s\."vertical" = 'SERVICE_QUEUE'[\s\S]*m\."role" = 'ADMIN'/)
    expect(code).not.toMatch(/UPDATE "ShopInvite(Link)?"/)
  })
  it('ไม่มี DROP TABLE/COLUMN, TRUNCATE, DELETE FROM', () =>
    expect(code).not.toMatch(/\b(DROP\s+(TABLE|COLUMN|SCHEMA)|TRUNCATE|DELETE\s+FROM)\b/i))
})

// 00086 — ความปลอดภัยของ lock ตอน migrate deploy (ทั้ง 3 ไฟล์ของ batch P1)
const migSrc = (dir: string) =>
  readFileSync(join(process.cwd(), `prisma/migrations/${dir}/migration.sql`), 'utf8').replace(/^\s*--.*$/gm, '')

describe('migration 00086 — lock safety (source)', () => {
  it.each([
    '20261027100000_00086_member_permission_flags',
    '20261027100100_00086_expense_creator_idx',
    '20261027100150_00086_notification_shop',
  ])('%s ตั้ง lock_timeout เป็นคำสั่งแรก', (dir) =>
    expect(migSrc(dir).trimStart()).toMatch(/^SET LOCAL lock_timeout = '5s';/))

  it('notification_shop: FK เป็น NOT VALID + idempotent (เช็ก pg_constraint) และไม่มี VALIDATE', () => {
    const code = migSrc('20261027100150_00086_notification_shop')
    expect(code).toMatch(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'Notification_shopId_fkey'\)/)
    expect(code).toMatch(/REFERENCES "Shop"\("id"\) ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;/)
    expect(code).not.toMatch(/VALIDATE CONSTRAINT/)
    expect(code).toContain('ADD COLUMN IF NOT EXISTS "shopId" TEXT')
    expect(code).toContain('CREATE INDEX IF NOT EXISTS "Notification_userId_shopId_createdAt_idx"')
    expect(code).not.toMatch(/\b(DROP\s+(TABLE|COLUMN|SCHEMA)|TRUNCATE|DELETE\s+FROM)\b/i)
  })

  it('member_flags_check_reapply: lock_timeout → DROP IF EXISTS → ADD NOT VALID → UPDATE OWNER → VALIDATE (review P2 NIT-1)', () => {
    const code = migSrc('20261027100210_00086_member_flags_check_reapply')
    const at = (re: RegExp) => {
      const m = code.match(re)
      expect(m, String(re)).not.toBeNull()
      return m!.index!
    }
    const order = [
      at(/SET LOCAL lock_timeout = '5s';/),
      at(/DROP CONSTRAINT IF EXISTS "ShopMember_flags_admin_only_check"/),
      at(/ADD CONSTRAINT "ShopMember_flags_admin_only_check"[\s\S]*?NOT VALID;/),
      at(/UPDATE "ShopMember" SET "canCloseJob" = false, "canRecordExpense" = false\s+WHERE "role" = 'OWNER'/),
      at(/VALIDATE CONSTRAINT "ShopMember_flags_admin_only_check"/),
    ]
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(code.trimStart()).toMatch(/^SET LOCAL lock_timeout/)
    expect(code).not.toMatch(/\b(DROP\s+(TABLE|COLUMN|SCHEMA)|TRUNCATE|DELETE\s+FROM)\b/i)
  })

  it('expense_creator_idx: index เดียว แบบ IF NOT EXISTS', () =>
    expect(migSrc('20261027100100_00086_expense_creator_idx')).toContain(
      'CREATE INDEX IF NOT EXISTS "Expense_shopId_createdBy_expenseDate_idx"'))
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
    for (let i = 0; i < 11; i++) {
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
  it('OWNER ติ๊ก canCloseJob/canRecordExpense ไม่ได้ (ShopMember_flags_admin_only_check · 00086)', async () => {
    const mk = (data: Record<string, unknown>) =>
      prisma.shopMember.create({ data: { shopId: ids.shop, userId: ids.users[n++], role: 'OWNER', roles: [], ...data } })
    await expect(mk({ canCloseJob: true })).rejects.toThrow(/flags_admin_only_check|23514/)
    await expect(mk({ canRecordExpense: true })).rejects.toThrow(/flags_admin_only_check|23514/)
  })
  it('ADMIN ติ๊กได้ทั้งคู่', async () => {
    const m = await prisma.shopMember.create({
      data: { shopId: ids.shop, userId: ids.users[n++], role: 'ADMIN', roles: ['CHAT'], canCloseJob: true, canRecordExpense: true },
    })
    memberIds.push(m.id)
  })
  it('ShopInvite roles ว่าง/นอกชุด ถูกปฏิเสธ', async () => {
    const base = { shopId: ids.shop, invitedContact: `x${run}@t.local`, contactType: 'EMAIL', invitedByUserId: ids.users[0] }
    await expect(prisma.shopInvite.create({ data: { ...base, roles: [] } })).rejects.toThrow(/roles_check|23514/)
    await expect(prisma.shopInvite.create({ data: { ...base, roles: ['X'] } })).rejects.toThrow(/roles_check|23514/)
  })
})
