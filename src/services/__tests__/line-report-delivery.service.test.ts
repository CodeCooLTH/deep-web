/**
 * HR13/HR14: integration กับ DB จริง — รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 * cleanup ทดสอบด้วย `now` ปลอมในปี 2000 + แถวปี 2000 ⇒ predicate เวลาไม่แตะแถวจริงของฐาน
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'

const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(process.env.DATABASE_URL ?? '')
const run = randomUUID().slice(0, 8)

describe.skipIf(!isLocal)('00070 line-report-delivery.service', () => {
  let svc: typeof import('../line-report-delivery.service')
  let prisma: typeof import('@/lib/prisma').prisma
  let userId: string
  const groups: string[] = []
  const mkGroup = async () => {
    const g = await prisma.lineReportGroup.create({ data: { ownerId: userId }, select: { id: true } })
    groups.push(g.id)
    return g.id
  }
  const row = (groupId: string, slotKey: string, data: Record<string, unknown> = {}) =>
    prisma.lineReportDelivery.create({ data: { groupId, kind: 'DAILY', slotKey, ...data } as never })

  beforeAll(async () => {
    svc = await import('../line-report-delivery.service')
    prisma = (await import('@/lib/prisma')).prisma
    userId = (await prisma.user.create({ data: { displayName: `lrd-${run}`, username: `lrd_${run}` }, select: { id: true } })).id
  })
  afterAll(async () => {
    await prisma.lineReportDelivery.deleteMany({ where: { groupId: { in: groups } } })
    await prisma.lineReportGroup.deleteMany({ where: { id: { in: groups } } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it('claim ซ้ำ -> count 0 ไม่ throw · ขนาน 2 ตัว ผู้ชนะ 1', async () => {
    const g = await mkGroup()
    const r = { groupId: g, kind: 'DAILY' as const, slotKey: 'D:2026-10-05@18:00' }
    expect(await svc.claimSlots([r])).toBe(1)
    expect(await svc.claimSlots([r])).toBe(0)
    const r2 = { ...r, slotKey: 'D:2026-10-05@19:00' }
    const counts = await Promise.all([svc.claimSlots([r2]), svc.claimSlots([r2])])
    expect(counts.sort()).toEqual([0, 1])
    expect(await svc.claimSlots([])).toBe(0)
  })

  it('transition: payload เก็บแล้วล้างเมื่อจบ · retry เก็บไว้', async () => {
    const g = await mkGroup()
    const d = await row(g, 'D:x1')
    await svc.savePendingPayload(d.id, '[{"b":1,"a":2}]', 'key-1', 'sha-1')
    let cur = await prisma.lineReportDelivery.findUniqueOrThrow({ where: { id: d.id } })
    expect(cur.pendingPayload).toEqual({ raw: '[{"b":1,"a":2}]' })
    expect(cur.retryKey).toBe('key-1')

    await svc.markRetry(d.id, { reason: 'HTTP_500', attempt: 1, httpStatus: 500 })
    cur = await prisma.lineReportDelivery.findUniqueOrThrow({ where: { id: d.id } })
    expect(cur).toMatchObject({ status: 'RETRY_PENDING', attempt: 1, reason: 'HTTP_500' })
    expect(cur.pendingPayload).not.toBeNull()

    await svc.markSent(d.id, { memberCount: 3, pushMessageCount: 3 })
    cur = await prisma.lineReportDelivery.findUniqueOrThrow({ where: { id: d.id } })
    expect(cur).toMatchObject({ status: 'SENT', pushMessageCount: 3, payloadSha256: 'sha-1' })
    expect(cur.pendingPayload).toBeNull()
    expect(cur.sentAt).not.toBeNull()

    for (const [fn, status] of [
      [() => svc.markFailed(d.id, { reason: 'BOT_NOT_IN_GROUP' }), 'FAILED'],
      [() => svc.markMissed(d.id), 'MISSED'],
      [() => svc.markSkipped(d.id, 'SKIPPED_NO_ORDERS'), 'SKIPPED_NO_ORDERS'],
    ] as const) {
      await svc.savePendingPayload(d.id, '[]', 'k', 's')
      await fn()
      cur = await prisma.lineReportDelivery.findUniqueOrThrow({ where: { id: d.id } })
      expect(cur.status).toBe(status)
      expect(cur.pendingPayload).toBeNull()
    }
  })

  // slot D:2026-10-05@17:30 ยิง 17:30 ไทย = 10:30Z
  const FIRE = new Date('2026-10-05T10:30:00Z').getTime()
  const SLOT = 'D:2026-10-05@17:30'
  const at = (min: number) => new Date(FIRE + min * 60_000)
  const setUpdated = (id: string, d: Date) => prisma.$executeRaw`UPDATE "LineReportDelivery" SET "updatedAt" = ${d} WHERE id = ${id}`
  const status = async (id: string) => prisma.lineReportDelivery.findUniqueOrThrow({ where: { id } })

  it('findRetryable: หน้าต่างนับจาก fireAt (89/91) ไม่ใช่ createdAt', async () => {
    const g = await mkGroup()
    const d = await row(g, SLOT, { status: 'RETRY_PENDING', createdAt: at(5) })
    expect((await svc.findRetryable(g, at(89))).map((r) => r.id)).toEqual([d.id])
    expect(await svc.findRetryable(g, at(91))).toEqual([])
  })

  it('findRetryable: claim หลัง fireAt 55 นาที ที่ fireAt+100 ต้องไม่ retry', async () => {
    const g = await mkGroup()
    await row(g, SLOT, { status: 'RETRY_PENDING', createdAt: at(55) })
    expect(await svc.findRetryable(g, at(100))).toEqual([])
  })

  it('findRetryable: CLAIMED ค้าง 4/6 นาที', async () => {
    const g = await mkGroup()
    const now = at(30)
    const young = await row(g, 'D:2026-10-05@17:30', { createdAt: at(1) })
    await setUpdated(young.id, new Date(now.getTime() - 4 * 60_000))
    expect(await svc.findRetryable(g, now)).toEqual([])
    await setUpdated(young.id, new Date(now.getTime() - 6 * 60_000))
    expect((await svc.findRetryable(g, now)).map((r) => r.id)).toEqual([young.id])
  })

  it('findRetryable: เฉพาะ DAILY/MONTHLY — TEST/COMMAND/FINAL_NOTICE ไม่เคย retry · MONTHLY ใช้ slot แรกของกลุ่ม', async () => {
    const g = await mkGroup()
    await prisma.lineReportGroup.update({ where: { id: g }, data: { dailyTimes: [1050, 1200] } }) // 17:30, 20:00
    await row(g, 'T:a', { kind: 'TEST', status: 'RETRY_PENDING', createdAt: at(5) })
    await row(g, 'C:a', { kind: 'COMMAND', status: 'RETRY_PENDING', createdAt: at(5) })
    await row(g, 'F:a', { kind: 'FINAL_NOTICE', status: 'RETRY_PENDING', createdAt: at(5) })
    const m = await row(g, 'M:2026-10-04', { kind: 'MONTHLY', status: 'RETRY_PENDING', createdAt: at(5) })
    expect((await svc.findRetryable(g, at(89))).map((r) => r.id)).toEqual([m.id])
    expect(await svc.findRetryable(g, at(91))).toEqual([])
  })

  it('expireRetryable: เกินหน้าต่าง -> MISSED · CLAIMED ค้าง -> MISSED + STALE_CLAIM · ในหน้าต่างไม่แตะ', async () => {
    const g = await mkGroup()
    const retry = await row(g, SLOT, { status: 'RETRY_PENDING', reason: 'HTTP_500', createdAt: at(5), pendingPayload: { raw: '[]' } })
    const claim = await row(g, 'D:2026-10-05@17:00', { createdAt: at(-25) })
    await setUpdated(claim.id, at(-25))
    const test = await row(g, 'T:b', { kind: 'TEST', status: 'RETRY_PENDING', createdAt: at(5) })
    expect(await svc.expireRetryable(g, at(89))).toBe(1) // เฉพาะ CLAIMED 17:00 (fire = FIRE-30 หมดที่ FIRE+60)
    expect((await status(retry.id)).status).toBe('RETRY_PENDING')
    expect(await svc.expireRetryable(g, at(91))).toBe(1)
    const r = await status(retry.id)
    expect(r).toMatchObject({ status: 'MISSED', reason: 'HTTP_500' })
    expect(r.pendingPayload).toBeNull()
    expect(await status(claim.id)).toMatchObject({ status: 'MISSED', reason: 'STALE_CLAIM' })
    expect((await status(test.id)).status).toBe('RETRY_PENDING')
  })

  it('countTestsToday: ข้ามเที่ยงคืนไทย · นับทุกสถานะ (FAILED ก็กินโควตา)', async () => {
    const g = await mkGroup()
    // 2026-10-05 00:30 ไทย = 2026-10-04T17:30Z · 23:30 ไทยของวันก่อน = 16:30Z
    const now = new Date('2026-10-04T17:45:00Z')
    const t = (slot: string, status: string, createdAt: string) => row(g, slot, { kind: 'TEST', status, createdAt: new Date(createdAt) })
    await t('T:1', 'SENT', '2026-10-04T17:30:00Z') // วันนี้ (ไทย)
    await t('T:2', 'CLAIMED', '2026-10-04T17:00:00Z') // เที่ยงคืนไทยพอดี = นับ
    await t('T:3', 'RETRY_PENDING', '2026-10-04T16:59:59Z') // เมื่อวาน ไม่นับ
    await t('T:4', 'FAILED', '2026-10-04T17:31:00Z') // วันนี้ — ล้มก็นับ (security M1)
    await row(g, 'D:z', { status: 'SENT', createdAt: new Date('2026-10-04T17:31:00Z') }) // ไม่ใช่ TEST
    expect(await svc.countTestsToday(g, now)).toBe(3)
  })

  it('listRecent: ไม่มี pendingPayload · เรียงใหม่ก่อน · จำกัด take', async () => {
    const g = await mkGroup()
    for (let i = 0; i < 12; i++) await row(g, `L:${i}`, { pendingPayload: { raw: '[]' }, createdAt: new Date(Date.now() - i * 1000) })
    const list = await svc.listRecent(g, 10)
    expect(list).toHaveLength(10)
    expect(Object.keys(list[0]).sort()).toEqual(['createdAt', 'kind', 'pushMessageCount', 'reason', 'status'])
    expect(list[0].createdAt.getTime()).toBeGreaterThan(list[9].createdAt.getTime())
  })

  it('cleanup: เฉพาะเกินเวลา', async () => {
    const g = await mkGroup()
    const now = new Date('2000-06-01T00:00:00Z')
    const h = (n: number) => new Date(now.getTime() - n * 3_600_000)
    const veryOld = await row(g, 'C:old', { createdAt: h(24 * 91), pendingPayload: { raw: '[]' } })
    const midOld = await row(g, 'C:mid', { createdAt: h(25), pendingPayload: { raw: '[]' } })
    const fresh = await row(g, 'C:new', { createdAt: h(1), pendingPayload: { raw: '[]' } })
    const r = await svc.cleanupDeliveries(now)
    expect(r.deleted).toBe(1)
    expect(r.payloadCleared).toBeGreaterThanOrEqual(2)
    expect(await prisma.lineReportDelivery.findUnique({ where: { id: veryOld.id } })).toBeNull()
    expect((await prisma.lineReportDelivery.findUniqueOrThrow({ where: { id: midOld.id } })).pendingPayload).toBeNull()
    expect((await prisma.lineReportDelivery.findUniqueOrThrow({ where: { id: fresh.id } })).pendingPayload).not.toBeNull()
  })
})
