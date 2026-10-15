/**
 * 00070 U4 — CHECK/FK ของ LineReportSnapshot (unmanaged SQL ใน migration 20261015090000)
 *
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 (นอกนั้น skip) · ทุก fixture สร้างเองและลบด้วย id ที่สร้าง
 */
import { describe, it, expect, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'

const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(process.env.DATABASE_URL ?? '')
const run = randomUUID().slice(0, 8)
const ids = { users: [] as string[], groups: [] as string[], deliveries: [] as string[], snaps: [] as string[] }

const mkGroup = async () => {
  const u = await prisma.user.create({ data: { displayName: `lrs-${run}`, username: `lrs_${run}_${ids.users.length}` }, select: { id: true } })
  ids.users.push(u.id)
  const g = await prisma.lineReportGroup.create({ data: { ownerId: u.id }, select: { id: true } })
  ids.groups.push(g.id)
  return g.id
}
const snap = async (groupId: string, over: Record<string, unknown> = {}) => {
  const now = new Date()
  const s = await prisma.lineReportSnapshot.create({
    data: {
      groupId, kind: 'DAILY', tokenHash: `lrs-${run}-${randomUUID()}`, windowStart: '2000-03-10', windowEnd: '2000-03-10',
      computedAt: now, createdAt: now, expiresAt: new Date(now.getTime() + 86_400_000), payload: { v: 1 }, ...over,
    } as never,
    select: { id: true },
  })
  ids.snaps.push(s.id)
  return s.id
}
const codeOf = async (p: Promise<unknown>) => {
  try { await p } catch (e) { return JSON.stringify(e) + String((e as Error).message) }
  return null
}

describe.skipIf(!isLocal)('LineReportSnapshot constraints', () => {
  afterAll(async () => {
    await prisma.lineReportSnapshot.deleteMany({ where: { id: { in: ids.snaps } } })
    await prisma.lineReportDelivery.deleteMany({ where: { id: { in: ids.deliveries } } })
    await prisma.lineReportGroup.deleteMany({ where: { id: { in: ids.groups } } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  it('payload เกิน 512KB -> 23514 · ขอบ 512KB ผ่าน', async () => {
    const g = await mkGroup()
    expect(await codeOf(snap(g, { payload: { pad: 'x'.repeat(524_288) } }))).toMatch(/23514|payload_size_chk/)
    expect(await snap(g, { payload: { pad: 'x'.repeat(524_000) } })).toBeTruthy()
  })

  it('expiresAt <= createdAt -> 23514', async () => {
    const g = await mkGroup()
    const t = new Date()
    expect(await codeOf(snap(g, { createdAt: t, expiresAt: t }))).toMatch(/23514|expiry_chk/)
    expect(await codeOf(snap(g, { createdAt: t, expiresAt: new Date(t.getTime() - 1000) }))).toMatch(/23514|expiry_chk/)
  })

  it('payload NULL (แถวโครงเปล่า) ผ่าน', async () => {
    const g = await mkGroup()
    expect(await snap(g, { payload: null })).toBeTruthy()
  })

  it('ลบกลุ่ม -> snapshot หาย (Cascade)', async () => {
    const g = await mkGroup()
    const s = await snap(g)
    await prisma.lineReportGroup.delete({ where: { id: g } })
    expect(await prisma.lineReportSnapshot.findUnique({ where: { id: s } })).toBeNull()
  })

  it('ลบ delivery -> deliveryId เป็น null (SetNull) แต่ snapshot อยู่', async () => {
    const g = await mkGroup()
    const d = await prisma.lineReportDelivery.create({ data: { groupId: g, kind: 'DAILY', slotKey: `lrs-${run}` }, select: { id: true } })
    ids.deliveries.push(d.id)
    const s = await snap(g, { deliveryId: d.id })
    await prisma.lineReportDelivery.delete({ where: { id: d.id } })
    const row = await prisma.lineReportSnapshot.findUnique({ where: { id: s }, select: { id: true, deliveryId: true } })
    expect(row).toEqual({ id: s, deliveryId: null })
  })
})
