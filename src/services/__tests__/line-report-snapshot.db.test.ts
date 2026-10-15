/**
 * 00070 EXT-LINK U8 — createDetailSnapshot / getSnapshotView บน DB local
 * 🛑 HR13/14: เฉพาะ DATABASE_URL = localhost:5434 · ลบด้วย id ที่เทสสร้าง · summary ไม่มีร้าน ⇒ ไม่ query order
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { randomUUID, createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { TemplateV1 } from '@/lib/line-report/template'
import type { GroupSummary, Window } from '@/lib/line-report/types'
import { createSweepCache } from '@/services/line-report-summary.service'
import { createDetailSnapshot, getSnapshotView } from '@/services/line-report-snapshot.service'

const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(process.env.DATABASE_URL ?? '')
const run = randomUUID().slice(0, 8)
const NOW = new Date() // เวลาจริง: CHECK expiresAt > createdAt (createdAt = now ของ DB)
const W: Window = { startIso: '2026-10-14', endIso: '2026-10-14', computedAt: NOW.toISOString() }
const summary: GroupSummary = { window: W, shops: [], profitSummable: true, mixedFinanceRules: false }
const tpl = (target: 'DASHBOARD' | 'DETAIL', show = true): TemplateV1 => ({
  v: 1,
  button: { show, label: 'ดู', target },
  blocks: [{ type: 'orders', runs: [{ t: 'ออเดอร์' }] }] as never,
})
const input = (groupId: string, template: TemplateV1) => ({
  groupId, kind: 'DAILY' as const, template, summary, title: 'รายงาน', window: W, now: NOW, cache: createSweepCache(),
})
const tokenOf = (url: string) => url.split('/lr/')[1]

describe.skipIf(!isLocal)('00070 snapshot service (DB)', () => {
  let userId = ''
  let gActive = ''
  let gRemoved = ''
  const snapIds: string[] = []

  beforeAll(async () => {
    vi.stubEnv('NEXT_PUBLIC_SELLER_URL', 'https://seller.example.test')
    userId = (await prisma.user.create({ data: { displayName: `lrs-${run}`, username: `lrs_${run}` }, select: { id: true } })).id
    gActive = (await prisma.lineReportGroup.create({ data: { ownerId: userId, status: 'ACTIVE', lineGroupId: `Clrs${run}a` } })).id
    gRemoved = (await prisma.lineReportGroup.create({ data: { ownerId: userId, status: 'ACTIVE', lineGroupId: `Clrs${run}b` } })).id
  })
  afterAll(async () => {
    const g = { in: [gActive, gRemoved] }
    await prisma.lineReportSnapshot.deleteMany({ where: { groupId: g } })
    await prisma.lineReportGroup.deleteMany({ where: { id: g } })
    await prisma.user.deleteMany({ where: { id: userId } })
  })

  const make = async (groupId = gActive) => {
    const r = await createDetailSnapshot(input(groupId, tpl('DETAIL')))
    expect(r).not.toBeNull()
    const token = tokenOf(r!.url)
    const row = await prisma.lineReportSnapshot.findUniqueOrThrow({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } })
    snapIds.push(row.id)
    return { token, row }
  }

  it('สร้างแล้วอ่านได้จนก่อน expiresAt 1ms · ที่ expiresAt พอดี = EXPIRED (ไม่ส่ง payload)', async () => {
    const { token, row } = await make()
    expect(await getSnapshotView(token, new Date(row.expiresAt.getTime() - 1))).toMatchObject({ kind: 'OK' })
    const ex = await getSnapshotView(token, row.expiresAt)
    expect(ex).toEqual({ kind: 'EXPIRED', expiresAt: row.expiresAt, reportKind: 'DAILY' })
  })

  it('token ผิดรูปแบบ / ไม่มี / กลุ่ม REMOVED → NOT_FOUND เหมือนกัน', async () => {
    const { token } = await make(gRemoved)
    expect(await getSnapshotView(token, NOW)).toMatchObject({ kind: 'OK' })
    await prisma.lineReportGroup.update({ where: { id: gRemoved }, data: { status: 'REMOVED' } })
    const miss = await getSnapshotView('A'.repeat(22), NOW)
    expect(await getSnapshotView(token, NOW)).toEqual(miss)
    expect(await getSnapshotView('short', NOW)).toEqual(miss)
    expect(miss).toEqual({ kind: 'NOT_FOUND' })
  })

  it('payload ถูกล้างแล้ว → EXPIRED แม้ยังไม่ถึงเวลา', async () => {
    const { token, row } = await make()
    await prisma.lineReportSnapshot.update({ where: { id: row.id }, data: { payload: Prisma.DbNull, purgedAt: NOW } })
    expect(await getSnapshotView(token, new Date(row.expiresAt.getTime() - 1))).toMatchObject({ kind: 'EXPIRED' })
  })

  it('คอลัมน์ไม่มี token ดิบ · log ไม่มี token', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { token, row } = await make()
    await prisma.lineReportSnapshot.update({ where: { id: row.id }, data: { payload: { bad: 1 } } })
    expect(await getSnapshotView(token, NOW)).toEqual({ kind: 'NOT_FOUND' })
    expect(spy).toHaveBeenCalledWith('[line-report] detail snapshot unreadable')
    expect(JSON.stringify(spy.mock.calls)).not.toContain(token)
    spy.mockRestore()
    const fresh = await prisma.lineReportSnapshot.findUniqueOrThrow({ where: { id: row.id } })
    expect(JSON.stringify(fresh)).not.toContain(token)
    expect(fresh.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('ปุ่ม DASHBOARD / show=false / ไม่มีฐาน https → null ไม่มีแถวใหม่', async () => {
    const before = await prisma.lineReportSnapshot.count({ where: { groupId: gActive } })
    expect(await createDetailSnapshot(input(gActive, tpl('DASHBOARD')))).toBeNull()
    expect(await createDetailSnapshot(input(gActive, tpl('DETAIL', false)))).toBeNull()
    vi.stubEnv('NEXT_PUBLIC_SELLER_URL', 'http://insecure.test')
    expect(await createDetailSnapshot(input(gActive, tpl('DETAIL')))).toBeNull()
    vi.stubEnv('NEXT_PUBLIC_SELLER_URL', 'https://seller.example.test')
    expect(await prisma.lineReportSnapshot.count({ where: { groupId: gActive } })).toBe(before)
  })
})
