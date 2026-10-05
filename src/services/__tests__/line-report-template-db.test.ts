/**
 * line-report-template-db.test.ts — CHECK ของคอลัมน์ template/templateVersion (00070 EXT T2a)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้าง (Group → User)
 */
import { describe, it, expect, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const ids = { users: [] as string[], groups: [] as string[] }

const mk = async (data: Record<string, unknown> = {}) => {
  if (!ids.users.length) {
    const u = await prisma.user.create({ data: { displayName: `lrt-${run}`, username: `lrt_${run}` }, select: { id: true } })
    ids.users.push(u.id)
  }
  const g = await prisma.lineReportGroup.create({ data: { ownerId: ids.users[0], ...data } as never, select: { id: true } })
  ids.groups.push(g.id)
  return g.id
}
const fails = async (p: Promise<unknown>) => { try { await p; return false } catch { return true } }

describe.skipIf(!isLocal)('LineReportGroup template columns', () => {
  afterAll(async () => {
    if (ids.groups.length) await prisma.lineReportGroup.deleteMany({ where: { id: { in: ids.groups } } })
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  it('แถวใหม่ได้ template NULL / templateVersion 0', async () => {
    const id = await mk()
    const g = await prisma.lineReportGroup.findUniqueOrThrow({ where: { id }, select: { template: true, templateVersion: true } })
    expect(g.template).toBeNull()
    expect(g.templateVersion).toBe(0)
  })

  it('template ขนาดพอดี/เล็ก ผ่าน · เกิน 16KB โดน CHECK', async () => {
    const ok = await mk({ template: { v: 1, pad: 'a'.repeat(1000) } })
    expect(ok).toBeTruthy()
    expect(await fails(mk({ template: { v: 1, pad: 'a'.repeat(17000) } }))).toBe(true)
  })

  it('templateVersion ติดลบโดน CHECK', async () => {
    expect(await fails(mk({ templateVersion: -1 }))).toBe(true)
    const id = await mk()
    expect(await fails(prisma.lineReportGroup.update({ where: { id }, data: { templateVersion: -1 } }))).toBe(true)
  })
})
