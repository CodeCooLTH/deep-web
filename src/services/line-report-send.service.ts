/**
 * line-report-send.service.ts — ส่งรายงานเข้ากลุ่ม LINE: claim → คำนวณ → เก็บ payload → push → จัดผล (00070 · SRS TFR-10/12/18/19 · SDS §3.4)
 *
 * 🛑 ที่เดียวที่เรียก `pushToGroup` (command.service ใช้ reply เท่านั้น)
 * 🛑 claim ใช้ `claimSlots` (createMany skipDuplicates) — ห้ามดัก error unique (insert-then-catch เขียน ERROR ลง log ทุกใบ)
 * 🛑 ทุกทางออกหลัง claim ต้องผ่าน `settleRows`/`pushAndSettle` (เขียน log) — เทส scan ตรวจ AC-23-1
 * 🛑 token ไม่เคยถูก log — มีแค่ `[line-report][OPS] TOKEN_INVALID` ให้ ops ตั้ง alert เอง
 */
import { createHash, randomUUID } from 'node:crypto'
import type { LineReportDelivery, LineReportGroup } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { todayThaiIsoDate } from '@/lib/date-range'
import { formatTimeHM } from '@/lib/format-date'
import { buildPlainNotice, buildSummaryReportFlex, fitToLimits } from '@/lib/line/flex-summary-report'
import type { LineErrorKind } from '@/lib/line/client'
import { assertReady, fetchGroupSummary, fetchMemberCount, pushToGroup } from '@/lib/line-report/line-client'
import { LineReportError } from '@/lib/line-report/errors'
import { FINAL_NOTICE_MESSAGE } from '@/lib/line-report/messages'
import { retryKeyFor } from '@/lib/line-report/retry-key'
import { parseSlot, resolveDailyWindow } from '@/lib/line-report/schedule'
import { cycleContaining, type monthlyFire } from '@/lib/line-report/cycle'
import type { DueSlot, GroupSummary, Window } from '@/lib/line-report/types'
import { isOwnerPaidForReports, readOwnerPaidState } from '@/services/line-report-access.service'
import {
  claimSlotRows, claimSlots, markFailed, markMissed, markRetry, markSent, markSkipped, savePendingPayload, testQuotaWhere, type DeliveryPatch,
} from '@/services/line-report-delivery.service'
import { raiseAlert, markInactive, resolveAlert, TEST_LIMIT_PER_DAY } from '@/services/line-report-group.service'
import { lockOwnedGroup, resolveSendableShops } from '@/services/line-report-shop.service'
import {
  buildCycleCumulative, buildGroupSummary, createSweepCache, type SummaryFlags, type SweepCache,
} from '@/services/line-report-summary.service'

type Group = LineReportGroup
type Row = LineReportDelivery
export type MonthlyDue = NonNullable<ReturnType<typeof monthlyFire>>
export type SweepCtx = { now: Date; cache: SweepCache }
/** `state` ใช้นับ/ตัดสินใน sweep + แปลงเป็น error ของ sendTest · ไม่ใช่ค่าที่เก็บใน DB */
export type Outcome = { state: string; reason?: string; lineKind?: LineErrorKind }

/** bubble ≤ 30KB ของ LINE — ตรวจซ้ำหลัง fitToLimits (ตัดแล้วยังเกิน = ส่งไม่ได้ ไม่ใช่ retry) */
const BUBBLE_MAX_BYTES = 30_000

const flagsOf = (g: Group): SummaryFlags => ({
  showOrders: g.showOrders, showSales: g.showSales, showCancelled: g.showCancelled, showTopProducts: g.showTopProducts, showProfit: g.showProfit,
})

const rowOf = (groupId: string, slotKey: string) =>
  prisma.lineReportDelivery.findUniqueOrThrow({ where: { groupId_slotKey: { groupId, slotKey } } })

type Finisher = (id: string, patch: DeliveryPatch) => Promise<unknown>
const asRetry: Finisher = (id, p) => markRetry(id, { ...p, reason: p.reason ?? 'INTERNAL' })

/**
 * จบทุกแถวของ push เดียวกัน — แถวแรก = ตัวจริง · แถวถัดไป (M: ที่ติดมากับ D:) pushMessageCount 0 (TFR-10)
 * `companion` = patch เพิ่มเฉพาะแถวที่ติดมา (SENT → reason IN_DAILY_PUSH)
 */
const settleRows = async (rows: Row[], fn: Finisher, patch: DeliveryPatch, out: Outcome, companion: DeliveryPatch = {}): Promise<Outcome> => {
  await Promise.all(rows.map((r, i) => fn(r.id, i === 0 ? patch : { ...patch, pushMessageCount: 0, ...companion })))
  return out
}

/** ยอดที่เห็นแล้ว "ไม่มีกิจกรรม" ทุกร้านที่ส่งได้ — ร้านล้ม (ERROR) ไม่ข้าม · ถ้าไม่ได้เปิดออเดอร์/ยอดขาย = ไม่รู้ ห้ามข้าม */
const isEmptyReport = (s: GroupSummary, f: SummaryFlags) =>
  (f.showOrders || f.showSales) && s.shops.every((x) => x.state === 'EXCLUDED' || (x.state === 'OK' && x.orders === 0 && x.cancelled === 0))

const lastKnownMembers = async (groupId: string) =>
  (await prisma.lineReportDelivery.findFirst({ where: { groupId, memberCount: { not: null } }, orderBy: { createdAt: 'desc' }, select: { memberCount: true } }))?.memberCount ?? null

/** 400 จาก push แยกสาเหตุไม่ได้ → ถาม summary: 404 = บอทไม่อยู่ในกลุ่ม · ถามไม่ได้ = ไม่ยืนยัน (ล้มธรรมดา) */
const botIsGone = async (lineGroupId: string) => {
  try {
    return (await fetchGroupSummary(lineGroupId)) === null
  } catch {
    return false
  }
}

type PushOpts = { canRetry: boolean; alerts: boolean; summary?: string }

/**
 * push ด้วย raw (JSON string) + key เดิมเสมอ แล้วจัดผลตามตาราง TFR-18 — ใช้ร่วมทั้งส่งครั้งแรก/retry/ทดสอบ/ข้อความสุดท้าย
 * `attempt` = งบ retry ที่ใช้ไปแล้ว (0 = ยังไม่เคยล้ม) · TEST/FINAL_NOTICE `canRetry:false` = ล้มแล้ว FAILED ทันที
 */
async function pushAndSettle(group: Group, rows: Row[], raw: string, key: string, attempt: number, o: PushOpts): Promise<Outcome> {
  const lineGroupId = group.lineGroupId
  if (!lineGroupId) return settleRows(rows, markFailed, { reason: 'INTERNAL' }, { state: 'FAILED', reason: 'INTERNAL' })
  const res = await pushToGroup(lineGroupId, raw, key)
  if (res.ok) {
    // memberCount ล้ม/ไม่มี = ใช้ค่าล่าสุดของกลุ่ม (ค่าประมาณขอบบน — LINE-API-Facts §5)
    let memberCount: number | null = null
    try {
      memberCount = await fetchMemberCount(lineGroupId)
    } catch {
      memberCount = null
    }
    const pushMessageCount = memberCount ?? (await lastKnownMembers(group.id)) ?? 0
    if (o.alerts) await resolveAlert(group.id, ['SEND_FAILED', 'NO_SENDABLE_SHOPS'])
    return settleRows(rows, markSent, { memberCount, pushMessageCount, summary: o.summary ?? null }, { state: 'SENT' }, { reason: 'IN_DAILY_PUSH' })
  }
  const patch: DeliveryPatch = { reason: res.reason, httpStatus: res.status || null }
  const failed = { state: 'FAILED', reason: res.reason, lineKind: res.kind }
  if (res.kind === 'TOKEN_INVALID') {
    console.error('[line-report][OPS] TOKEN_INVALID')
    // ไม่เพิ่ม attempt — token เสียไม่ใช่ความผิดของรอบนี้ (ห้ามเผา retry) · พ้น RETRY_WINDOW = MISSED
    if (o.canRetry) return settleRows(rows, asRetry, patch, { state: 'RETRY_PENDING', reason: res.reason, lineKind: res.kind })
    return settleRows(rows, markFailed, patch, failed)
  }
  if (res.status === 400 && (await botIsGone(lineGroupId))) {
    await markInactive(lineGroupId) // INACTIVE + alert BOT_REMOVED
    return settleRows(rows, markFailed, { reason: 'BOT_NOT_IN_GROUP', httpStatus: 400 }, { state: 'FAILED', reason: 'BOT_NOT_IN_GROUP' })
  }
  const transient = res.status === 0 || res.status === 429 || res.status >= 500
  if (transient && o.canRetry && attempt === 0) {
    return settleRows(rows, asRetry, { ...patch, attempt: 1 }, { state: 'RETRY_PENDING', reason: res.reason, lineKind: res.kind })
  }
  if (o.alerts) await raiseAlert(group.id, 'SEND_FAILED')
  return settleRows(rows, markFailed, { ...patch, attempt: transient && o.canRetry ? attempt + 1 : attempt }, failed)
}

type Part = { row: Row; kind: 'DAILY' | 'MONTHLY'; summary: GroupSummary }
type Plan = { daily?: { row: Row; slot: DueSlot }; monthly?: { row: Row; cycle: { startIso: string; endIso: string } } }

/**
 * ส่วนร่วมของ "ส่งครั้งแรก" และ "คำนวณใหม่ของแถวค้างที่ไม่เคยเก็บ payload" (CLAIMED ค้าง/ร้านล้มทุกร้านรอบก่อน)
 * แถวมาถึงที่นี่ถูก claim แล้ว — ทุกทางออกต้องจบด้วย settleRows/pushAndSettle
 */
async function runSlot(group: Group, ctx: SweepCtx, plan: Plan): Promise<Outcome> {
  const { now, cache } = ctx
  const rows = [plan.daily?.row, plan.monthly?.row].filter((r): r is Row => !!r)
  const attempt = Math.max(...rows.map((r) => r.attempt))
  const { sendable, excluded } = await resolveSendableShops(group)
  if (sendable.length === 0) {
    await raiseAlert(group.id, 'NO_SENDABLE_SHOPS')
    return settleRows(rows, (id, p) => markSkipped(id, 'NO_SENDABLE_SHOPS', p), { reason: 'NO_SENDABLE_SHOPS' }, { state: 'NO_SENDABLE_SHOPS' })
  }
  const flags = flagsOf(group)
  const excl = excluded.map((e) => ({ shop: e.shop, reason: e.reason }))
  const summarize = (window: Window) => buildGroupSummary({ shops: sendable, excluded: excl, window, flags, cache })
  const [dSummary, mSummary] = await Promise.all([
    plan.daily ? summarize(resolveDailyWindow(plan.daily.slot.minutes, plan.daily.slot.dateIso, now)) : undefined,
    plan.monthly ? summarize({ ...plan.monthly.cycle, computedAt: now.toISOString() }) : undefined,
  ])
  const parts: Part[] = []
  if (plan.daily && dSummary) parts.push({ row: plan.daily.row, kind: 'DAILY', summary: dSummary })
  if (plan.monthly && mSummary) parts.push({ row: plan.monthly.row, kind: 'MONTHLY', summary: mSummary })

  // ทุกร้านดึงข้อมูลไม่สำเร็จ = นับเป็นล้มเพื่อ retry (ไม่ใช่ส่งรายงานที่มีแต่ "ดึงไม่สำเร็จ")
  if (parts.some((p) => !p.summary.shops.some((s) => s.state === 'OK'))) {
    if (attempt === 0) return settleRows(rows, asRetry, { reason: 'ALL_SHOPS_FAILED', attempt: 1 }, { state: 'RETRY_PENDING', reason: 'ALL_SHOPS_FAILED' })
    await raiseAlert(group.id, 'SEND_FAILED')
    return settleRows(rows, markFailed, { reason: 'ALL_SHOPS_FAILED', attempt: attempt + 1 }, { state: 'FAILED', reason: 'ALL_SHOPS_FAILED' })
  }

  // skipWhenNoOrders ใช้กับตามตารางเท่านั้น (runSlot ไม่ถูกเรียกจาก sendTest) — ข้ามทีละข้อความ (รายวันว่างแต่รายเดือนมี = ส่งรายเดือนอย่างเดียว)
  const live = group.skipWhenNoOrders ? parts.filter((p) => !isEmptyReport(p.summary, flags)) : parts
  const skippedRows = parts.filter((p) => !live.includes(p)).map((p) => p.row)
  const skip = (rs: Row[]) => settleRows(rs, (id, p) => markSkipped(id, 'SKIPPED_NO_ORDERS', p), { reason: 'NO_ORDERS' }, { state: 'SKIPPED_NO_ORDERS' })
  if (live.length === 0) return skip(skippedRows)
  if (skippedRows.length > 0) await skip(skippedRows)

  const [head, ...rest] = live
  const rows2 = live.map((p) => p.row)
  // ยอดสะสมรอบถูกข้ามเมื่อมีรายเดือนใน push เดียวกัน (AC-11-7) · 24:00 = ครบทั้งวันไม่แนบ
  let cycleToDate: { startIso: string; endIso: string; totals: Awaited<ReturnType<typeof buildCycleCumulative>>['totals']; failedShops: number } | undefined
  if (head.kind === 'DAILY' && plan.daily && rest.length === 0 && group.attachCycleToDaily && plan.daily.slot.minutes !== 1440) {
    const cyc = cycleContaining(plan.daily.slot.dateIso, group.cutoffDay)
    const w: Window = { startIso: cyc.startIso, endIso: plan.daily.slot.dateIso, computedAt: now.toISOString() }
    const cum = await buildCycleCumulative({ shops: sendable, window: w, cache })
    // failedShops ต้องส่งต่อให้ข้อความบอก "ยอดไม่ครบ" — ไม่งั้นร้านที่ล้มหายไปเงียบ ๆ เหมือนยอด 0
    cycleToDate = { startIso: w.startIso, endIso: w.endIso, totals: cum.totals, failedShops: cum.failedShops }
  }
  // 🛑 fitToLimits ต้องรับ object จาก builder โดยตรง (ผูกด้วย identity) — ห้าม clone/parse ก่อน
  const messages = fitToLimits(
    buildSummaryReportFlex({ summary: head.summary, kind: head.kind, flags, cycleToDate, monthly: rest[0]?.summary }),
  )
  if (messages.some((m) => Buffer.byteLength(JSON.stringify(m)) > BUBBLE_MAX_BYTES)) {
    await raiseAlert(group.id, 'SEND_FAILED')
    return settleRows(rows2, markFailed, { reason: 'PAYLOAD_TOO_LARGE' }, { state: 'FAILED', reason: 'PAYLOAD_TOO_LARGE' })
  }

  // เก็บ payload ก่อน push เสมอ — retry/กู้ซาก crash ส่งไบต์เดิม + key เดิม (LINE บังคับ)
  const raw = JSON.stringify(messages)
  const key = retryKeyFor(group.id, head.row.slotKey)
  // แถว M: ที่ติดมาจำ key ไว้ เพื่อให้ตอน retry ของ D: ตามไปจบสถานะเดียวกันได้ (ไม่เก็บ payload ซ้ำ)
  // เขียนใน transaction เดียวกับ payload — ไม่มีช่วงที่ D: มี payload แต่ M: ยังไม่มี key (crash แล้ว M: ถูก retry แยกเป็น push ที่สอง)
  await prisma.$transaction([
    savePendingPayload(head.row.id, raw, key, createHash('sha256').update(raw).digest('hex')),
    prisma.lineReportDelivery.updateMany({ where: { id: { in: rest.map((p) => p.row.id) } }, data: { retryKey: key } }),
  ])
  const n = head.summary.shops.filter((s) => s.state === 'OK').length
  return pushAndSettle(group, rows2, raw, key, head.row.attempt, { canRetry: true, alerts: true, summary: `${n} ร้าน` })
}

/**
 * ส่งตามตาราง — `due.daily` + `due.monthly` พร้อมกัน = push เดียว 2 ข้อความ (TFR-10)
 * ผู้เรียก (sweep) จับคู่ monthly กับ daily slot ที่ fireAt ตรงกันเท่านั้น
 */
export async function sendScheduled(group: Group, due: { daily?: DueSlot; monthly?: MonthlyDue }, ctx: SweepCtx): Promise<Outcome> {
  const { daily, monthly } = due
  if (!daily && !monthly) return { state: 'NOOP' } // no-row: ไม่มีงาน
  // 🛑 AC-01-6: อ่านสิทธิ์สดทุกครั้ง ณ จุดส่ง ห้ามเชื่อแถวกลุ่ม/ผลของ sweep รอบก่อน · UNKNOWN (อ่านไม่ได้) = ไม่ทำอะไร
  if ((await readOwnerPaidState(group.ownerId)) !== 'PAID') return { state: 'PAUSED' } // no-row: ไม่ได้พยายามส่ง
  // claim D: + M: ใน statement เดียว (atomic) — ทั้งคู่หรือไม่ได้เลย ไม่เกิดสอง worker แบ่งกันถือจนเป็นสอง push
  const want = [
    ...(daily ? [{ groupId: group.id, kind: 'DAILY' as const, slotKey: daily.slotKey }] : []),
    ...(monthly ? [{ groupId: group.id, kind: 'MONTHLY' as const, slotKey: monthly.slotKey }] : []),
  ]
  const got = await claimSlotRows(want)
  const dRow = daily ? got.find((r) => r.slotKey === daily.slotKey) : undefined
  // ได้แต่ M: (D: มีคนถือไปก่อนแล้ว) = M: ยังไม่เคยมีแถว → ส่งเดี่ยว · ได้แต่ D: (M: มีแถวอยู่แล้ว) = ไม่ส่งรายเดือนซ้ำ
  const mRow = monthly ? got.find((r) => r.slotKey === monthly.slotKey) : undefined
  if (!dRow && !mRow) return { state: 'LOST' } // no-row: มีตัวอื่นถือ slot นี้แล้ว
  return runSlot(group, ctx, {
    daily: daily && dRow ? { row: dRow, slot: daily } : undefined,
    monthly: monthly && mRow ? { row: mRow, cycle: monthly.cycle } : undefined,
  })
}

const payloadRaw = (row: Row) => (row.pendingPayload as { raw?: unknown } | null)?.raw

/** แถวที่ติดมากับ push ของ D: (M: ที่จำ retryKey เดียวกันและไม่มี payload ของตัวเอง) */
const isCompanion = (row: Row) => row.kind === 'MONTHLY' && payloadRaw(row) === undefined && row.retryKey !== null

/**
 * ลองใหม่ของแถวค้าง (RETRY_PENDING / CLAIMED ค้าง) — ผู้เรียกกรองแถวที่หมดหน้าต่างออกแล้ว (`findRetryable`)
 * มี payload → ส่ง raw เดิม + key เดิม · ไม่มี (ยังไม่เคย push) → คำนวณใหม่จาก slotKey
 */
export async function retryDelivery(group: Group, row: Row, ctx: SweepCtx): Promise<Outcome> {
  if (isCompanion(row)) return { state: 'COMPANION' } // no-row: จบพร้อมแถวหลัก
  const paid = await readOwnerPaidState(group.ownerId)
  if (paid === 'UNKNOWN') return { state: 'UNKNOWN' } // no-row: อ่านไม่ได้ ไม่ตัดสินแทน — รอ tick ถัดไป
  if (paid === 'UNPAID') {
    return settleRows([row], markMissed, { reason: 'PACKAGE_PAUSED' }, { state: 'MISSED', reason: 'PACKAGE_PAUSED' })
  }
  const raw = payloadRaw(row)
  if (typeof raw === 'string' && row.retryKey) {
    const mates = await prisma.lineReportDelivery.findMany({
      where: { groupId: row.groupId, kind: 'MONTHLY', retryKey: row.retryKey, id: { not: row.id }, status: { in: ['CLAIMED', 'RETRY_PENDING'] } },
      orderBy: { createdAt: 'asc' },
    })
    return pushAndSettle(group, [row, ...mates], raw, row.retryKey, row.attempt, { canRetry: true, alerts: true })
  }
  const d = /^D:(\d{4}-\d{2}-\d{2})@(\d{2}:\d{2})$/.exec(row.slotKey)
  const m = /^M:(\d{4}-\d{2}-\d{2})$/.exec(row.slotKey)
  const minutes = d ? parseSlot(d[2]) : null
  if (d && minutes !== null) {
    return runSlot(group, ctx, { daily: { row, slot: { slotKey: row.slotKey, dateIso: d[1], minutes, fireAtMs: 0 } } })
  }
  if (m) return runSlot(group, ctx, { monthly: { row, cycle: cycleContaining(m[1], group.cutoffDay) } })
  return settleRows([row], markMissed, { reason: 'INTERNAL' }, { state: 'MISSED', reason: 'INTERNAL' }) // slotKey ไม่รู้จัก — ไม่ retry
}

export type TestResult = { deliveryId: string; sentAt: string; remaining: number; summary: string }

/**
 * ส่งทดสอบ (TFR-12 · AC-13-1) — push ครั้งเดียว ไม่ retry · ไม่ใช้ skipWhenNoOrders · นับโควตาเฉพาะ CLAIMED/RETRY_PENDING/SENT
 * `LineApiError` ไม่หลุดถึง route: แปลงเป็น LineReportError ทุกกรณี
 */
export async function sendTest(ownerId: string, groupId: string, now: Date = new Date()): Promise<TestResult> {
  assertReady()
  const pre = await prisma.lineReportGroup.findFirst({ where: { id: groupId, ownerId, status: { not: 'REMOVED' } } })
  if (!pre) throw new LineReportError('GROUP_NOT_FOUND')
  if (pre.status !== 'ACTIVE' || !pre.lineGroupId) throw new LineReportError('GROUP_NOT_ACTIVE')
  if (!(await isOwnerPaidForReports(ownerId))) throw new LineReportError('PACKAGE_REQUIRED')

  // lock แถวกลุ่มแล้วนับ+insert ใน tx เดียว — กดแข่งกันก็เกิน 5 ไม่ได้
  // นับด้วย tx (ไม่ใช้ countTestsToday ที่วิ่งผ่าน client อื่น: pool=1 ของ pooler จะค้างรอ connection ที่ tx ถืออยู่) แต่ predicate เดียวกัน (testQuotaWhere)
  const { row, used, group } = await prisma.$transaction(async (tx) => {
    await lockOwnedGroup(tx, ownerId, groupId)
    // 🛑 อ่านซ้ำหลังล็อก: ระหว่างด่านข้างบนกับตรงนี้กลุ่มอาจถูกลบ/ผูกใหม่ — ใช้ status/lineGroupId/ค่าตั้งจากแถวที่ล็อกแล้วเท่านั้น
    const group = await tx.lineReportGroup.findFirstOrThrow({ where: { id: groupId, ownerId } })
    if (group.status !== 'ACTIVE' || !group.lineGroupId) throw new LineReportError('GROUP_NOT_ACTIVE')
    const count = await tx.lineReportDelivery.count({ where: testQuotaWhere(groupId, now) })
    if (count >= TEST_LIMIT_PER_DAY) throw new LineReportError('TEST_QUOTA_EXCEEDED')
    const created = await tx.lineReportDelivery.create({ data: { groupId, kind: 'TEST', slotKey: `T:${randomUUID()}` } })
    return { row: created, used: count + 1, group }
  })

  try {
    const { sendable, excluded } = await resolveSendableShops(group)
    if (sendable.length === 0) {
      await markSkipped(row.id, 'NO_SENDABLE_SHOPS', { reason: 'NO_SENDABLE_SHOPS' })
      throw new LineReportError('NO_SENDABLE_SHOPS')
    }
    const window = resolveDailyWindow(0, todayThaiIsoDate(now), now)
    const summary = await buildGroupSummary({
      shops: sendable, excluded: excluded.map((e) => ({ shop: e.shop, reason: e.reason })), window, flags: flagsOf(group), cache: createSweepCache(),
    })
    if (!summary.shops.some((s) => s.state === 'OK')) {
      await markFailed(row.id, { reason: 'ALL_SHOPS_FAILED' })
      throw new LineReportError('INTERNAL')
    }
    // เช็คซ้ำก่อน push (กันลบ→ผูกใหม่ระหว่างคำนวณสรุป ที่ตัวเลขของ A จะไปตกกลุ่มของ B) · ช่องที่เหลือ = ระหว่างบรรทัดนี้ถึง push
    const still = await prisma.lineReportGroup.findFirst({
      where: { id: groupId, ownerId, status: 'ACTIVE', lineGroupId: group.lineGroupId }, select: { id: true },
    })
    if (!still) {
      await markFailed(row.id, { reason: 'GROUP_NOT_ACTIVE' })
      throw new LineReportError('GROUP_NOT_ACTIVE')
    }
    const messages = fitToLimits(buildSummaryReportFlex({ summary, kind: 'TEST', flags: flagsOf(group) }))
    const text = `${sendable.length} ร้าน · ช่วง 00:00–${formatTimeHM(now)}`
    const raw = JSON.stringify(messages)
    const out = await pushAndSettle(group, [row], raw, retryKeyFor(group.id, row.slotKey), 0, { canRetry: false, alerts: false, summary: text })
    if (out.state !== 'SENT') {
      if (out.reason === 'BOT_NOT_IN_GROUP') throw new LineReportError('BOT_NOT_IN_GROUP')
      throw new LineReportError(out.lineKind === 'TOKEN_INVALID' ? 'BOT_UNAVAILABLE' : 'LINE_UNAVAILABLE')
    }
    return { deliveryId: row.id, sentAt: now.toISOString(), remaining: TEST_LIMIT_PER_DAY - used, summary: text }
  } catch (e) {
    // ถ้าแถวยัง CLAIMED (throw ที่เราไม่ได้คาด) ปล่อยค้างจะกินโควตา — ปิดเป็น FAILED
    await prisma.lineReportDelivery.updateMany({ where: { id: row.id, status: 'CLAIMED' }, data: { status: 'FAILED', reason: 'INTERNAL' } })
    if (e instanceof LineReportError) throw e
    throw new LineReportError('INTERNAL')
  }
}

/**
 * ข้อความสุดท้ายตอนแพ็กเกจหยุด (TFR-19) — ผู้เรียกตรวจแล้วว่าเจ้าของไม่ ACTIVE ∧ กลุ่มเปิดรายงาน ∧ `finalNoticeSentAt` ว่าง
 * ไม่ผ่านด่านจ่ายเงินโดยตั้งใจ · push ครั้งเดียวไม่ retry · ไม่มีราคา/ลิงก์ · สำเร็จ → ตั้ง `finalNoticeSentAt`
 */
export async function sendFinalNotice(group: Group, ctx: SweepCtx): Promise<Outcome> {
  if (!group.lineGroupId) return { state: 'NOOP' } // no-row
  // อ่านซ้ำ ณ จุดส่ง: ส่งได้เมื่อ "ยืนยันแล้วว่าไม่ ACTIVE" เท่านั้น — อ่านไม่ได้ (UNKNOWN) ห้ามเดาว่าหยุด (ส่งข้อความผิดเข้ากลุ่มลูกค้า)
  if ((await readOwnerPaidState(group.ownerId)) !== 'UNPAID') return { state: 'ABORTED' } // no-row
  const sub = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: group.ownerId }, select: { status: true, lockedAt: true } })
  // key ต่อ "ช่วงที่หยุด": เวลาที่ล็อก (แพ็กเกจล็อก) · ไม่มีแถว/ไม่มีเวลา (ยกเลิก) = วันที่ไทย
  const part = sub?.status === 'LOCKED_RENEWAL_FAILED' && sub.lockedAt ? sub.lockedAt.toISOString() : todayThaiIsoDate(ctx.now)
  const slotKey = `F:${part}`
  if ((await claimSlots([{ groupId: group.id, kind: 'FINAL_NOTICE', slotKey }])) === 0) {
    // เคยส่งสำเร็จแต่ตั้งมาร์กเกอร์ไม่ทัน (crash) → ซ่อมมาร์กเกอร์ ไม่ให้ claim ซ้ำทุก tick
    const prev = await rowOf(group.id, slotKey)
    if (prev.status === 'SENT') await prisma.lineReportGroup.updateMany({ where: { id: group.id, finalNoticeSentAt: null }, data: { finalNoticeSentAt: prev.sentAt ?? ctx.now } })
    return { state: 'LOST' } // no-row: แถวเดิมเป็นของรอบที่แล้ว
  }
  const row = await rowOf(group.id, slotKey)
  const raw = JSON.stringify([buildPlainNotice(FINAL_NOTICE_MESSAGE)])
  const out = await pushAndSettle(group, [row], raw, retryKeyFor(group.id, slotKey), 0, { canRetry: false, alerts: false })
  if (out.state === 'SENT') await prisma.lineReportGroup.updateMany({ where: { id: group.id, finalNoticeSentAt: null }, data: { finalNoticeSentAt: ctx.now } })
  return out
}
