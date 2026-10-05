/**
 * line-report-delivery.service.ts — claim / log / transition ของ LineReportDelivery (SRS TFR-18/21/23)
 *
 * 🛑 claim ใช้ `createMany({skipDuplicates})` เท่านั้น — ห้ามดัก error unique (insert-then-catch เขียน ERROR ลง log ทุกใบ)
 * 🛑 ทุก transition ที่จบงานล้าง `pendingPayload` (ข้อมูลยอดขายร้าน เก็บเท่าที่จำเป็นต่อ retry)
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { thaiTodayBounds } from '@/lib/date-range'
import { RETRY_WINDOW_MIN, fireAt, parseSlot } from '@/lib/line-report/schedule'
import { shiftIsoDate } from '@/lib/date-range'
import type { LineReportDeliveryStatus, ReportKind } from '@/lib/line-report/types'

const MIN_MS = 60_000
const DAY_MS = 86_400_000
export const STALE_CLAIM_MIN = 5
export const DELIVERY_RETENTION_DAYS = 90
export const PAYLOAD_TTL_HOURS = 24

export type ClaimRow = { groupId: string; kind: ReportKind; slotKey: string }

/** คืนจำนวนแถวที่ claim ได้จริง — 0 = มีคนอื่นถือ slot นี้แล้ว (ไม่ throw) */
export async function claimSlots(rows: ClaimRow[]): Promise<number> {
  if (rows.length === 0) return 0
  const r = await prisma.lineReportDelivery.createMany({ data: rows, skipDuplicates: true })
  return r.count
}

export type DeliveryPatch = {
  status?: LineReportDeliveryStatus
  reason?: string | null
  attempt?: number
  httpStatus?: number | null
  memberCount?: number | null
  pushMessageCount?: number
  summary?: string | null
  sentAt?: Date | null
}

/** เขียนผลของแถว (ไม่แตะ pendingPayload — ใช้ markX ที่ล้างให้เมื่อจบ) */
export function writeDelivery(id: string, patch: DeliveryPatch) {
  return prisma.lineReportDelivery.update({ where: { id }, data: patch })
}

/** เขียน payload ก่อน push ครั้งแรก · `raw` = JSON string ของ messages (เก็บเป็น string เพื่อรักษาไบต์ใน jsonb) */
export function savePendingPayload(id: string, raw: string, retryKey: string, sha: string) {
  return prisma.lineReportDelivery.update({
    where: { id },
    data: { pendingPayload: { raw }, retryKey, payloadSha256: sha },
  })
}

const finish = (id: string, status: LineReportDeliveryStatus, patch: DeliveryPatch) =>
  prisma.lineReportDelivery.update({ where: { id }, data: { ...patch, status, pendingPayload: Prisma.DbNull } })

export const markSent = (id: string, patch: DeliveryPatch = {}) => finish(id, 'SENT', { sentAt: new Date(), ...patch })
export const markFailed = (id: string, patch: DeliveryPatch = {}) => finish(id, 'FAILED', patch)
export const markMissed = (id: string, patch: DeliveryPatch = {}) => finish(id, 'MISSED', patch)
export const markSkipped = (id: string, status: 'SKIPPED_NO_ORDERS' | 'NO_SENDABLE_SHOPS', patch: DeliveryPatch = {}) =>
  finish(id, status, patch)

/** รอ retry — เก็บ payload ไว้ · `attempt` ผู้เรียกกำหนด (TOKEN_INVALID ไม่เพิ่ม) */
export function markRetry(id: string, patch: DeliveryPatch & { reason: string }) {
  return prisma.lineReportDelivery.update({ where: { id }, data: { ...patch, status: 'RETRY_PENDING' } })
}

/**
 * instant ที่ slot ยิงจริง — RETRY_WINDOW นับจากตรงนี้ ไม่ใช่เวลา claim (SRS TFR-18)
 * D:<date>@<HH:MM> → fireAt · M:<endIso> → วันถัดไปที่ slot แรกสุดของกลุ่ม (สูตรเดียวกับ monthlyFire)
 * รูปไม่รู้จัก → null (ไม่ retry)
 */
function slotFireAtMs(slotKey: string, dailyTimes: readonly number[]): number | null {
  const d = /^D:(\d{4}-\d{2}-\d{2})@(\d{2}:\d{2})$/.exec(slotKey)
  if (d) {
    const m = parseSlot(d[2])
    return m === null ? null : fireAt(d[1], m)
  }
  const m = /^M:(\d{4}-\d{2}-\d{2})$/.exec(slotKey)
  if (m && dailyTimes.length > 0) return fireAt(shiftIsoDate(m[1], 1), dailyTimes.includes(1440) ? 0 : Math.min(...dailyTimes))
  return null
}

const RETRYABLE_KINDS: ReportKind[] = ['DAILY', 'MONTHLY']

/** แถวค้าง (RETRY_PENDING / CLAIMED ค้าง >5 นาที) ของ DAILY/MONTHLY พร้อม fireAt — TEST/COMMAND/FINAL_NOTICE ไม่เคย retry */
async function stuckRows(groupId: string, now: Date, createdSince?: Date) {
  const stale = new Date(now.getTime() - STALE_CLAIM_MIN * MIN_MS)
  const [group, rows] = await Promise.all([
    prisma.lineReportGroup.findUnique({ where: { id: groupId }, select: { dailyTimes: true } }),
    prisma.lineReportDelivery.findMany({
      where: {
        groupId,
        kind: { in: RETRYABLE_KINDS },
        ...(createdSince ? { createdAt: { gte: createdSince } } : {}),
        OR: [{ status: 'RETRY_PENDING' }, { status: 'CLAIMED', updatedAt: { lt: stale } }],
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  const times = group?.dailyTimes ?? []
  return rows.flatMap((r) => {
    const fireAtMs = slotFireAtMs(r.slotKey, times)
    return fireAtMs === null ? [] : [{ row: r, fireAtMs }]
  })
}

const windowEnd = (fireAtMs: number) => fireAtMs + RETRY_WINDOW_MIN * MIN_MS

/**
 * งานที่ต้องส่งซ้ำ: `now < fireAt + RETRY_WINDOW` — เรียงเก่าสุดก่อน
 * createdAt ≤ 4 ชม. เป็นแค่ตัวกรองหยาบฝั่ง DB (claim เกิดหลัง fireAt เสมอ) ตัวตัดสินจริงคือ fireAt ใน JS
 */
export async function findRetryable(groupId: string, now: Date) {
  const since = new Date(now.getTime() - 4 * 3_600_000)
  return (await stuckRows(groupId, now, since)).filter((x) => now.getTime() < windowEnd(x.fireAtMs)).map((x) => x.row)
}

/** พ้น RETRY_WINDOW (นับจาก fireAt) → MISSED + ล้าง payload · CLAIMED ค้างเกินหน้าต่าง = reason STALE_CLAIM · คืนจำนวนแถว */
export async function expireRetryable(groupId: string, now: Date): Promise<number> {
  const over = (await stuckRows(groupId, now)).filter((x) => now.getTime() >= windowEnd(x.fireAtMs))
  for (const { row } of over) {
    await prisma.lineReportDelivery.update({
      where: { id: row.id },
      data: { status: 'MISSED', pendingPayload: Prisma.DbNull, ...(row.status === 'CLAIMED' ? { reason: 'STALE_CLAIM' } : {}) },
    })
  }
  return over.length
}

/** โควตาส่งทดสอบ: นับวันตามปฏิทินไทย (TFR-12) */
export function countTestsToday(groupId: string, now: Date): Promise<number> {
  return prisma.lineReportDelivery.count({
    where: {
      groupId,
      kind: 'TEST',
      status: { in: ['CLAIMED', 'RETRY_PENDING', 'SENT'] },
      createdAt: { gte: thaiTodayBounds(now).from },
    },
  })
}

/** ประวัติล่าสุด — ไม่ select pendingPayload (TFR-21) · ผู้เรียกต้องตรวจ ownership ของกลุ่มก่อน */
export function listRecent(groupId: string, take = 10) {
  return prisma.lineReportDelivery.findMany({
    where: { groupId },
    orderBy: { createdAt: 'desc' },
    take,
    select: { createdAt: true, kind: true, status: true, reason: true, pushMessageCount: true },
  })
}

/** TFR-23: ลบแถวเก่า 90 วัน + ล้าง payload ที่เก่ากว่า 24 ชม. — ทุกคำสั่งมี predicate เวลา */
export async function cleanupDeliveries(now: Date) {
  const payload = await prisma.lineReportDelivery.updateMany({
    where: { pendingPayload: { not: Prisma.DbNull }, createdAt: { lt: new Date(now.getTime() - PAYLOAD_TTL_HOURS * 3_600_000) } },
    data: { pendingPayload: Prisma.DbNull },
  })
  const deleted = await prisma.lineReportDelivery.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - DELIVERY_RETENTION_DAYS * DAY_MS) } },
  })
  return { payloadCleared: payload.count, deleted: deleted.count }
}
