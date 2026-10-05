/**
 * line-report-sweep.service.ts — กวาดส่งรายงานตามเวลาทุก 30 นาที + cleanup (00068 · SRS TFR-17/19/23 · SDS §4.1)
 *
 * ทำทีละกลุ่ม (TD-009) · try/catch ต่อกลุ่ม (AC-19-5) · หยุด "เริ่ม" กลุ่มใหม่เมื่อเกิน budget — slot ที่เหลือรอ tick ถัดไปในหน้าต่าง 60 นาที
 */
import type { LineReportGroup } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { thaiTodayBounds } from '@/lib/date-range'
import { isReportBotReady } from '@/lib/line-report/config'
import { monthlyFire } from '@/lib/line-report/cycle'
import { dueSlots } from '@/lib/line-report/schedule'
import type { DueSlot } from '@/lib/line-report/types'
import { readOwnerPaidState } from '@/services/line-report-access.service'
import { cleanupDeliveries, expireRetryable, findRetryable, markMissed } from '@/services/line-report-delivery.service'
import { createSweepCache } from '@/services/line-report-summary.service'
import { retryDelivery, sendFinalNotice, sendScheduled, type MonthlyDue, type SweepCtx } from '@/services/line-report-send.service'

export const SWEEP_BUDGET_MS = 240_000
const DAY_MS = 86_400_000
const CLEANUP_FROM_MIN = 3 * 60
/** cron ทุก 30 นาที ⇒ tick ที่ตกใน [03:00, 03:30) คือ "tick แรกหลัง 03:00" */
const CLEANUP_WINDOW_MIN = 30

type Group = LineReportGroup
type Work = { daily: DueSlot[]; monthly: MonthlyDue | null; missed: DueSlot[] }

const workOf = (g: Group, now: Date): Work => {
  const { send, missed } = dueSlots(g, now)
  return { daily: send, missed, monthly: monthlyFire(g, now) }
}

/** retry ที่ค้างอยู่ก่อน · due ก่อนรอง (ใช้ createdAt ของแถวค้างเป็นตัวแทนเวลา slot — claim เกิดหลัง fireAt เสมอ) */
const oldestOf = (w: Work, stuckAt: number | undefined) =>
  Math.min(stuckAt ?? Infinity, ...w.daily.map((s) => s.fireAtMs), w.monthly?.fireAtMs ?? Infinity)

type CleanupResult = Awaited<ReturnType<typeof runCleanup>>
export type SweepResult =
  | { skipped: 'NOT_CONFIGURED' }
  | { groups: number; processed: number; paused: number; unknown: number; errors: number; budgetStopped: boolean; cleanup: CleanupResult | 'SKIPPED' | 'FAILED' }

/** log เฉพาะชื่อ/โค้ดของ error — message ของ DB/LINE อาจมีข้อมูลร้าน/ลูกค้าปน (security L3) */
const errTag = (e: unknown) => {
  const code = (e as { code?: unknown } | null)?.code
  return `${e instanceof Error ? e.name : 'NonError'}${typeof code === 'string' ? `:${code}` : ''}`
}

async function sweepGroup(group: Group, ctx: SweepCtx, over: () => boolean): Promise<'paused' | 'done' | 'unknown' | 'budget'> {
  const { now } = ctx
  // อ่านสดต่อกลุ่ม ไม่ cache ข้ามกลุ่ม (AC-01-6)
  const paid = await readOwnerPaidState(group.ownerId)
  if (paid === 'UNKNOWN') {
    // อ่านแพ็กเกจไม่ได้ ≠ แพ็กเกจหยุด: ห้ามเขียนอะไร/ส่งอะไร (ไม่ MISSED ไม่ final notice) รอ tick ถัดไป
    console.error('[line-report] PAID_STATE_UNKNOWN', group.id)
    return 'unknown'
  }
  if (paid === 'UNPAID') {
    // แพ็กเกจหยุด: งานค้างทิ้งไม่ส่งย้อนหลัง (ล้าง payload ด้วย) แล้วบอกกลุ่ม 1 ครั้ง
    for (const r of await findRetryable(group.id, now)) await markMissed(r.id, { reason: 'PACKAGE_PAUSED' })
    await expireRetryable(group.id, now)
    // slot ที่ถึงกำหนดระหว่างหยุดถูก "ใช้ไปแล้ว" (MISSED) — กลับ ACTIVE ในหน้าต่าง 60 นาทีเดียวกันก็ไม่ส่งย้อนหลัง (AC-21-5)
    const w = workOf(group, now)
    const dueKeys: { kind: 'DAILY' | 'MONTHLY'; slotKey: string }[] = [...w.daily, ...w.missed].map((s) => ({ kind: 'DAILY', slotKey: s.slotKey }))
    if (w.monthly) dueKeys.push({ kind: 'MONTHLY', slotKey: w.monthly.slotKey })
    if (dueKeys.length > 0) {
      await prisma.lineReportDelivery.createMany({
        data: dueKeys.map((k) => ({ groupId: group.id, ...k, status: 'MISSED' as const, reason: 'PACKAGE_PAUSED' })),
        skipDuplicates: true,
      })
    }
    if (!group.finalNoticeSentAt) await sendFinalNotice(group, ctx)
    return 'paused'
  }
  // กลับมา ACTIVE → ล้างมาร์กเกอร์ (lazy reset — ช่วงหยุดครั้งหน้าจะได้ข้อความสุดท้ายอีกครั้ง)
  if (group.finalNoticeSentAt) await prisma.lineReportGroup.updateMany({ where: { id: group.id }, data: { finalNoticeSentAt: null } })

  await expireRetryable(group.id, now)
  for (const row of await findRetryable(group.id, now)) {
    if (over()) return 'budget' // กลุ่มเดียวมีหลาย slot ก็ต้องไม่เริ่มงานใหม่เมื่อเกิน budget (security L4)
    await retryDelivery(group, row, ctx)
  }

  const { daily, missed, monthly } = workOf(group, now)
  // slot ที่พลาด: บันทึก MISSED ครั้งเดียว (createMany skipDuplicates — แถวที่เคยมีแล้วไม่ถูกแตะ) ไม่ส่งย้อนหลัง
  if (missed.length > 0) {
    await prisma.lineReportDelivery.createMany({
      data: missed.map((s) => ({ groupId: group.id, kind: 'DAILY' as const, slotKey: s.slotKey, status: 'MISSED' as const })),
      skipDuplicates: true,
    })
  }
  // รายเดือนไปกับ daily slot ที่ยิงเวลาเดียวกัน (slot แรกของวัน) · ไม่มีคู่ = ส่งเดี่ยว
  const paired = monthly ? daily.find((s) => s.fireAtMs === monthly.fireAtMs) : undefined
  for (const slot of daily) {
    if (over()) return 'budget'
    await sendScheduled(group, { daily: slot, monthly: slot === paired ? (monthly ?? undefined) : undefined }, ctx)
  }
  if (monthly && !paired) {
    if (over()) return 'budget'
    await sendScheduled(group, { monthly }, ctx)
  }
  return 'done'
}

/** `groupIds` = จำกัดวงกวาด (เทสบนฐาน local ที่มีข้อมูลอื่นปนอยู่ — ไม่ส่ง = ทุกกลุ่ม) */
export async function runSweep(opts: { now?: Date; budgetMs?: number; clock?: () => number; groupIds?: readonly string[] } = {}): Promise<SweepResult> {
  if (!isReportBotReady()) return { skipped: 'NOT_CONFIGURED' }
  const now = opts.now ?? new Date()
  const budgetMs = opts.budgetMs ?? SWEEP_BUDGET_MS
  const clock = opts.clock ?? Date.now
  const startedAt = clock()
  const ctx: SweepCtx = { now, cache: createSweepCache() }

  const groups = await prisma.lineReportGroup.findMany({
    where: {
      status: 'ACTIVE',
      lineGroupId: { not: null },
      OR: [{ dailyEnabled: true }, { monthlyEnabled: true }],
      ...(opts.groupIds ? { id: { in: [...opts.groupIds] } } : {}),
    },
  })
  const stuck = await prisma.lineReportDelivery.groupBy({
    by: ['groupId'],
    where: {
      groupId: { in: groups.map((g) => g.id) },
      kind: { in: ['DAILY', 'MONTHLY'] },
      status: { in: ['RETRY_PENDING', 'CLAIMED'] },
      createdAt: { gte: new Date(now.getTime() - 4 * 3_600_000) },
    },
    _min: { createdAt: true },
  })
  const stuckAt = new Map(stuck.map((s) => [s.groupId, s._min.createdAt?.getTime()]))
  // slot เก่าสุดก่อน — กลุ่มที่ไม่มีงานเลยไปท้าย (ยังต้องเข้าเพื่อตรวจแพ็กเกจ/ข้อความสุดท้าย)
  const ordered = groups
    .map((g) => ({ g, at: oldestOf(workOf(g, now), stuckAt.get(g.id)) }))
    // เทียบตรง ๆ — `a.at - b.at` ของ Infinity − Infinity = NaN (กลุ่มที่ไม่มีงานทั้งคู่) ทำให้ลำดับไม่แน่นอน
    .sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? -1 : 1))

  let processed = 0
  let paused = 0
  let unknown = 0
  let errors = 0
  let budgetStopped = false
  for (const { g } of ordered) {
    // 🛑 ตรวจเฉพาะ "ก่อนเริ่มกลุ่ม" — กลุ่มที่เริ่มแล้วทำให้จบ (เหลือ 60s กันงานค้างกลางทาง)
    const over = () => clock() - startedAt >= budgetMs
    if (over()) {
      budgetStopped = true
      break
    }
    try {
      const r = await sweepGroup(g, ctx, over)
      if (r === 'paused') paused++
      if (r === 'unknown') unknown++
      processed++
      if (r === 'budget') {
        budgetStopped = true
        break
      }
    } catch (e) {
      errors++
      // ไม่ log payload/token/message — id กลุ่ม + ชื่อ/โค้ด error พอให้สืบ
      console.error('[line-report] sweep group failed', g.id, errTag(e))
    }
  }

  let cleanup: CleanupResult | 'SKIPPED' | 'FAILED' = 'SKIPPED'
  const minutesIntoThaiDay = (now.getTime() - thaiTodayBounds(now).from.getTime()) / 60_000
  if (minutesIntoThaiDay >= CLEANUP_FROM_MIN && minutesIntoThaiDay < CLEANUP_FROM_MIN + CLEANUP_WINDOW_MIN) {
    try {
      cleanup = await runCleanup(now)
    } catch (e) {
      cleanup = 'FAILED' // ล้มไม่ทำให้ sweep ล้ม (TD-001)
      console.error('[line-report] cleanup failed', errTag(e))
    }
  }
  return { groups: groups.length, processed, paused, unknown, errors, budgetStopped, cleanup }
}

/**
 * TFR-23 — ทุกคำสั่งมี predicate เวลา (ห้าม deleteMany เปล่า)
 * กลุ่ม PENDING ที่ไม่เคยผูก: COALESCE(max(code.expiresAt), createdAt) < now−7d → REMOVED (ทำก่อนลบโค้ด ไม่งั้น expiresAt หาย)
 */
export async function runCleanup(now: Date) {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS)
  const pending = await prisma.lineReportGroup.findMany({
    where: { status: 'PENDING', boundAt: null, createdAt: { lt: weekAgo } },
    select: { id: true, createdAt: true, bindCodes: { select: { expiresAt: true } } },
  })
  const stale = pending
    .filter((g) => (g.bindCodes.length > 0 ? Math.max(...g.bindCodes.map((c) => c.expiresAt.getTime())) : g.createdAt.getTime()) < weekAgo.getTime())
    .map((g) => g.id)
  const removed =
    stale.length === 0
      ? { count: 0 }
      : await prisma.lineReportGroup.updateMany({
          where: { id: { in: stale }, status: 'PENDING', boundAt: null },
          data: { status: 'REMOVED', removedAt: now },
        })
  const deliveries = await cleanupDeliveries(now)
  const rate = await prisma.lineReportRateEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - DAY_MS) } } })
  const codes = await prisma.lineReportBindCode.deleteMany({ where: { createdAt: { lt: weekAgo } } })
  return { ...deliveries, rateEvents: rate.count, bindCodes: codes.count, pendingRemoved: removed.count }
}
