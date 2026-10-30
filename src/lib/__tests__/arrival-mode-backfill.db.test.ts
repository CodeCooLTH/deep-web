/**
 * arrival-mode-backfill.db.test.ts — Order.arrivalMode ของ 00086 (S-1) บน Postgres จริง
 * อ่านคำสั่ง UPDATE จากไฟล์ migration 20261027100200 ตรง ๆ แล้วรันกับแถวที่เทสสร้างเท่านั้น (ต่อท้ายเงื่อนไข id)
 *   · CHECK Order_arrivalMode_check: มีค่าโดยไม่มี serviceStart / ค่านอกชุด → ปฏิเสธ
 *   · ร้านบริการ: นัดหลังเปิดบิล > 30 นาที → BOOKED · ≤ 30 (รวมเปิดบิลย้อนหลัง) → WALK_IN · ไม่มีเวลา → NULL
 *   · ร้านขายของ/ที่พัก: ไม่แตะแม้มี serviceStart
 *   · ผลตรงกับ resolveArrivalMode (สูตรที่จอใช้อยู่) ทุกใบ · รันซ้ำ = 0 แถว
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 *
 * Mutation (ทำแล้ว 2026-10-27): เปลี่ยน `> interval '30 minutes'` เป็น `>=` ในสำเนาคำสั่ง → "30 นาทีพอดี" แดง
 *   (ทำกับสตริงในเทส ไม่แตะไฟล์ migration ที่ freeze แล้ว)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { resolveArrivalMode } from '@/lib/arrival-mode'

const migration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20261027100200_00086_order_arrival_mode/migration.sql'),
  'utf8',
)
// คำสั่ง UPDATE ตัวเดียวในไฟล์ (ตัดคอมเมนต์ออกก่อน) — ไม่มี ; ท้าย เพื่อต่อเงื่อนไข id ได้
const backfill = (() => {
  const code = migration.replace(/^\s*--.*$/gm, '')
  const m = code.match(/UPDATE "Order"[\s\S]*?;/)
  if (!m) throw new Error('ไม่พบ UPDATE "Order" ใน migration')
  return m[0].replace(/;\s*$/, '')
})()

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const d = isLocal ? describe : describe.skip
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)

const ids = { user: '', shops: [] as string[], resource: '', orders: [] as string[] }
const o: Record<string, string> = {}
let seat = 0

const MIN = 60_000
// วันเปิดบิลคงที่ในอดีต (ร้านย้อนวันได้) — เวลานัดเว้นห่างกันวันละช่อง ไม่ชน EXCLUDE ของที่นั่ง
const BASE = new Date('2026-01-05T03:00:00.000Z')

async function mkOrder(shopId: string, createdAt: Date, startOffsetMin: number | null) {
  seat += 1
  const start = startOffsetMin === null ? null : new Date(createdAt.getTime() + startOffsetMin * MIN)
  const row = await prisma.order.create({
    data: {
      shopId, type: 'SERVICE', status: 'PENDING', totalAmount: 100, createdAt,
      // 4 ฟิลด์นัดต้องมาด้วยกันเสมอ (CHECK ของ 00024)
      ...(start
        ? { serviceResourceId: ids.resource, serviceSeat: seat, serviceStart: start, serviceEnd: new Date(start.getTime() + 60 * MIN), appointmentStatus: 'SCHEDULED' }
        : {}),
    } as never,
    select: { id: true },
  })
  ids.orders.push(row.id)
  return row.id
}

const runBackfill = () => prisma.$executeRawUnsafe(`${backfill} AND o."id" = ANY($1::text[])`, ids.orders)
const modeOf = async (id: string) =>
  (await prisma.order.findUniqueOrThrow({ where: { id }, select: { arrivalMode: true } })).arrivalMode

d('00086 Order.arrivalMode — CHECK + backfill (DB local)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `amb-${run}`, username: `amb_${run}` }, select: { id: true } })
    ids.user = u.id
    const mkShop = async (t: string, vertical: string) => {
      const s = await prisma.shop.create({ data: { userId: u.id, shopName: `amb-${t}-${run}`, kind: 'BUSINESS', vertical } as never, select: { id: true } })
      ids.shops.push(s.id)
      return s.id
    }
    const svc = await mkShop('svc', 'SERVICE_QUEUE')
    const online = await mkShop('online', 'ONLINE_SALES')
    const lodging = await mkShop('lodging', 'LODGING')
    const r = await prisma.serviceResource.create({ data: { shopId: svc, name: `amb-${run}`, capacity: 20 }, select: { id: true } })
    ids.resource = r.id

    const day = (n: number) => new Date(BASE.getTime() + n * 86_400_000)
    o.booked31 = await mkOrder(svc, day(0), 31) //       > 30 นาที → BOOKED
    o.edge30 = await mkOrder(svc, day(1), 30) //         = 30 นาทีพอดี → WALK_IN
    o.walk5 = await mkOrder(svc, day(2), 5) //           เปิดบิลตอนมาถึง → WALK_IN
    o.backdated = await mkOrder(svc, day(10), -3 * 1440) // เปิดบิลย้อนหลัง 3 วัน (ห้าม abs) → WALK_IN
    o.farBooked = await mkOrder(svc, day(4), 3 * 1440) //  จองล่วงหน้า 3 วัน → BOOKED
    o.noStart = await mkOrder(svc, day(5), null) //       ยังไม่ระบุเวลา → NULL
    o.online = await mkOrder(online, day(6), 3 * 1440) //  ร้านขายของมีเวลา → ไม่แตะ
    o.lodging = await mkOrder(lodging, day(7), 5) //      ร้านที่พักมีเวลา → ไม่แตะ
  })

  afterAll(async () => {
    if (!isLocal) return
    await prisma.order.deleteMany({ where: { id: { in: ids.orders } } })
    await prisma.serviceResource.deleteMany({ where: { id: ids.resource } })
    await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    await prisma.user.deleteMany({ where: { id: ids.user } })
    await prisma.$disconnect()
  })

  it('[blocker] CHECK: มีค่าแต่ไม่มี serviceStart → ปฏิเสธ', async () => {
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "Order" SET "arrivalMode" = 'BOOKED' WHERE "id" = $1`, o.noStart),
    ).rejects.toThrow(/Order_arrivalMode_check/)
    expect(await modeOf(o.noStart)).toBeNull()
  })

  it('[blocker] CHECK: ค่านอกชุด → ปฏิเสธ แม้มี serviceStart', async () => {
    for (const bad of ['LATER', 'walk_in', 'UNSCHEDULED', '']) {
      await expect(
        prisma.$executeRawUnsafe(`UPDATE "Order" SET "arrivalMode" = $2 WHERE "id" = $1`, o.walk5, bad),
      ).rejects.toThrow(/Order_arrivalMode_check/)
    }
    expect(await modeOf(o.walk5)).toBeNull()
  })

  it('[blocker] backfill: >30 นาที BOOKED · ≤30 (รวมย้อนหลัง) WALK_IN · ไม่มีเวลา NULL · ร้านอื่นไม่แตะ', async () => {
    const changed = await runBackfill()
    expect(changed).toBe(5)
    expect(await modeOf(o.booked31)).toBe('BOOKED')
    expect(await modeOf(o.farBooked)).toBe('BOOKED')
    expect(await modeOf(o.edge30)).toBe('WALK_IN')
    expect(await modeOf(o.walk5)).toBe('WALK_IN')
    expect(await modeOf(o.backdated)).toBe('WALK_IN')
    expect(await modeOf(o.noStart)).toBeNull()
    expect(await modeOf(o.online)).toBeNull()
    expect(await modeOf(o.lodging)).toBeNull()
  })

  it('[blocker] ผลตรงกับ resolveArrivalMode (สูตรที่จอใช้) ทุกใบของร้านบริการ — จอไม่เปลี่ยนสักใบ', async () => {
    const rows = await prisma.order.findMany({
      where: { id: { in: [o.booked31, o.edge30, o.walk5, o.backdated, o.farBooked, o.noStart] } },
      select: { arrivalMode: true, serviceStart: true, createdAt: true },
    })
    expect(rows).toHaveLength(6)
    for (const r of rows) {
      const derived = resolveArrivalMode(r)
      expect(r.arrivalMode ?? 'UNSCHEDULED').toBe(derived)
    }
  })

  it('รันซ้ำ = 0 แถว (ไม่ทับค่าที่มีอยู่)', async () => {
    expect(await runBackfill()).toBe(0)
  })
})
