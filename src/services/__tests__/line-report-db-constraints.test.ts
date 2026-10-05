/**
 * line-report-db-constraints.test.ts — เทส constraint ของ DB สำหรับ 00068 (DATABASE.md §5.2/§10)
 *
 * 🛑 HR13/HR14: integration กับฐานจริง ⇒ ปฏิเสธรันถ้า DATABASE_URL ไม่ใช่ localhost:5434
 * ข้อมูลทุกแถวสร้างด้วย id/prefix เฉพาะรอบเทส และลบ scope ด้วย id นั้นตามลำดับ
 * Delivery → BindCode → GroupShop → Group → Shop → User (Restrict บังคับลำดับ) — ไม่มี deleteMany เปล่า
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)

const run = randomUUID().slice(0, 8)
const ids = { users: [] as string[], shops: [] as string[], groups: [] as string[] }

async function mkUser(tag: string) {
  const u = await prisma.user.create({ data: { displayName: `lrt-${run}-${tag}`, username: `lrt_${run}_${tag}` }, select: { id: true } })
  ids.users.push(u.id)
  return u.id
}
async function mkGroup(ownerId: string, data: Record<string, unknown> = {}) {
  const g = await prisma.lineReportGroup.create({ data: { ownerId, ...data } as never, select: { id: true } })
  ids.groups.push(g.id)
  return g.id
}
async function mkCode(ownerId: string, groupId: string, codeHash: string, extra: Record<string, unknown> = {}) {
  return prisma.lineReportBindCode.create({
    data: { ownerId, groupId, codeHash, expiresAt: new Date(Date.now() + 600_000), ...extra },
    select: { id: true },
  })
}

describe.skipIf(!isLocal)('00068 line-report DB constraints', () => {
  let u1: string
  let u2: string

  beforeAll(async () => {
    u1 = await mkUser('a')
    u2 = await mkUser('b')
  })

  afterAll(async () => {
    const g = { in: ids.groups }
    await prisma.lineReportDelivery.deleteMany({ where: { groupId: g } })
    await prisma.lineReportBindCode.deleteMany({ where: { groupId: g } })
    await prisma.lineReportGroupShop.deleteMany({ where: { groupId: g } })
    await prisma.lineReportRateEvent.deleteMany({ where: { lineGroupId: { startsWith: `Ctest-${run}` } } })
    await prisma.lineReportGroup.deleteMany({ where: { id: g } })
    await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  it('partial unique: lineGroupId ACTIVE ซ้ำ 2 เจ้าของ -> ล้ม; INACTIVE/PENDING ซ้ำได้', async () => {
    const lg = `Ctest-${run}-g1`
    await mkGroup(u1, { lineGroupId: lg, status: 'ACTIVE' })
    await expect(mkGroup(u2, { lineGroupId: lg, status: 'ACTIVE' })).rejects.toThrow()
    await expect(mkGroup(u2, { lineGroupId: lg, status: 'INACTIVE' })).resolves.toBeTruthy()
    await expect(mkGroup(u2, { lineGroupId: lg, status: 'PENDING' })).resolves.toBeTruthy()
  })

  it('CHECK: ACTIVE ต้องมี lineGroupId', async () => {
    await expect(mkGroup(u1, { status: 'ACTIVE' })).rejects.toThrow()
  })

  it('partial unique: โค้ดสดชน codeHash / 2 โค้ดสดต่อเจ้าของ -> ล้ม; โค้ดที่ใช้แล้ว/revoke ซ้ำได้', async () => {
    const g1 = await mkGroup(u1)
    const g2 = await mkGroup(u2)
    const h = `h-${run}-1`
    const first = await mkCode(u1, g1, h)
    await expect(mkCode(u2, g2, h)).rejects.toThrow() // codeHash สดซ้ำข้ามเจ้าของ
    await expect(mkCode(u1, g1, `h-${run}-2`)).rejects.toThrow() // เจ้าของเดียว 2 โค้ดสด
    await prisma.lineReportBindCode.update({ where: { id: first.id }, data: { revokedAt: new Date() } })
    await expect(mkCode(u1, g1, h)).resolves.toBeTruthy() // revoke แล้ว ใช้ hash/เจ้าของเดิมได้
    await expect(mkCode(u2, g2, `h-${run}-3`, { usedAt: new Date() })).resolves.toBeTruthy()
    await expect(mkCode(u2, g2, `h-${run}-3`, { usedAt: new Date() })).resolves.toBeTruthy() // ใช้แล้วซ้ำ hash ได้
  })

  it('CHECK dailyTimes: 5 ค่า/31 นาที/0/1441 ล้ม; 4 ค่า+1440 ผ่าน', async () => {
    for (const bad of [[30, 60, 90, 120, 150], [31], [0], [1441]]) {
      await expect(mkGroup(u1, { dailyTimes: bad }), JSON.stringify(bad)).rejects.toThrow()
    }
    await expect(mkGroup(u1, { dailyTimes: [30, 720, 1410, 1440] })).resolves.toBeTruthy()
  })

  it('CHECK cutoffDay: 0/32 ล้ม; null/1/31 ผ่าน', async () => {
    for (const bad of [0, 32]) await expect(mkGroup(u1, { cutoffDay: bad })).rejects.toThrow()
    for (const ok of [null, 1, 31]) await expect(mkGroup(u1, { cutoffDay: ok })).resolves.toBeTruthy()
  })

  it('CHECK ปิด metric ทั้งหมดล้ม; เหลือ showProfit ตัวเดียวผ่าน', async () => {
    const off = { showOrders: false, showSales: false, showCancelled: false, showTopProducts: false, showProfit: false }
    await expect(mkGroup(u1, off)).rejects.toThrow()
    await expect(mkGroup(u1, { ...off, showProfit: true })).resolves.toBeTruthy()
  })

  it('Delivery: createMany skipDuplicates ซ้ำ (groupId, slotKey) -> count 0 ไม่ throw; CHECK attempt/pushMessageCount', async () => {
    const g = await mkGroup(u1)
    const row = { groupId: g, kind: 'DAILY' as const, slotKey: 'D:2026-10-05@18:00' }
    expect((await prisma.lineReportDelivery.createMany({ data: [row], skipDuplicates: true })).count).toBe(1)
    expect((await prisma.lineReportDelivery.createMany({ data: [row], skipDuplicates: true })).count).toBe(0)
    await expect(prisma.lineReportDelivery.create({ data: { ...row, slotKey: 'x1', attempt: 3 } })).rejects.toThrow()
    await expect(prisma.lineReportDelivery.create({ data: { ...row, slotKey: 'x2', pushMessageCount: -1 } })).rejects.toThrow()
  })

  it('Restrict: ลบกลุ่มที่มี Delivery / ลบ User ที่มีกลุ่ม -> ล้ม', async () => {
    const owner = await mkUser('r')
    const g = await mkGroup(owner)
    await prisma.lineReportDelivery.create({ data: { groupId: g, kind: 'TEST', slotKey: `T:${run}` } })
    await expect(prisma.lineReportGroup.delete({ where: { id: g } })).rejects.toThrow()
    await expect(prisma.user.delete({ where: { id: owner } })).rejects.toThrow()
  })

  it('GroupShop: unique (groupId, shopId); ร้านเดียวอยู่หลายกลุ่มได้', async () => {
    const owner = await mkUser('s')
    const shop = await prisma.shop.create({ data: { userId: owner, shopName: `lrt-${run}` }, select: { id: true } })
    ids.shops.push(shop.id)
    const ga = await mkGroup(owner)
    const gb = await mkGroup(owner)
    await prisma.lineReportGroupShop.create({ data: { groupId: ga, shopId: shop.id } })
    await expect(prisma.lineReportGroupShop.create({ data: { groupId: ga, shopId: shop.id } })).rejects.toThrow()
    await expect(prisma.lineReportGroupShop.create({ data: { groupId: gb, shopId: shop.id } })).resolves.toBeTruthy()
  })

  it('RateEvent: insert ซ้ำได้ไม่มี unique (ตัวนับแบบ insert-then-count)', async () => {
    const lg = `Ctest-${run}-rate`
    await prisma.lineReportRateEvent.createMany({ data: [{ lineGroupId: lg, kind: 'BIND_ATTEMPT' }, { lineGroupId: lg, kind: 'BIND_ATTEMPT' }] })
    expect(await prisma.lineReportRateEvent.count({ where: { lineGroupId: lg, kind: 'BIND_ATTEMPT' } })).toBe(2)
  })
})

// AC-LGS-06-5: ไม่เก็บ LINE userId/เนื้อข้อความของสมาชิก — ไม่ต้องใช้ DB
describe('00068 schema ไม่มีคอลัมน์ PII ของสมาชิก LINE', () => {
  it('โมเดล LineReport* ไม่มี field userId/lineUserId/message/text', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    const models = [...schema.matchAll(/^model (LineReport\w+) \{([\s\S]*?)^\}/gm)]
    expect(models.map((m) => m[1]).sort()).toEqual(
      ['LineReportBindCode', 'LineReportDelivery', 'LineReportGroup', 'LineReportGroupShop', 'LineReportRateEvent'],
    )
    for (const [, name, body] of models) {
      const fields = body.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((f) => f && !f.startsWith('@') && !f.startsWith('//'))
      for (const bad of ['userId', 'lineUserId', 'senderId', 'message', 'text', 'content']) {
        expect(fields, `${name}.${bad}`).not.toContain(bad)
      }
    }
  })
})
