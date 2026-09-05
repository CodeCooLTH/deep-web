import 'server-only'

import { prisma } from '@/lib/prisma'
import { thaiDayKey } from '@/lib/format-date'
import {
  INSPECTION_CHECKS,
  checkScope,
  isInspectionCheckKey,
  type InspectionCheckKey,
  type InspectionMethod,
  type InspectionStep,
} from '@/lib/inspection/checks'
import { ROUND_LEAD_DAYS, UNASSIGNED_INSPECTOR_NAME } from '@/lib/inspection/round-planning'
import { buildBacklog, type OpenRoundRow } from '@/lib/inspection/admin-queue'
import { checkKeysOfRound, resolveInspectorDisplayName } from '@/services/inspection-round.service'
import { createScamReport } from '@/services/scam-report.service'
import { recordCheckOutcome } from '@/services/inspection-result.service'

/**
 * inspection-admin.service.ts — ฝั่งทีมปฏิบัติการ (feature 00060 · T10 · API §4.10-4.16)
 *
 * 🛑 ผู้เรียกทุกฟังก์ชันในไฟล์นี้ผ่าน `requireAdmin()` มาแล้ว — ที่นี่จึงรับ `shopId`/`userId`
 *    จาก input ได้ (ต่างจากฝั่งผู้ขายโดยสิ้นเชิง ซึ่งห้ามรับ `shopId` จาก client เด็ดขาด)
 */

export type InspectionAdminErrorCode =
  | 'QUOTA_INVALID'
  | 'SHOP_NOT_FOUND'
  | 'NOT_LODGING'
  | 'PLAN_NOT_FOUND'
  | 'INSPECTOR_NOT_FOUND'
  | 'UNKNOWN_CHECK_KEY'
  | 'CHECK_SCOPE_MISMATCH'
  | 'ROOM_NOT_IN_SHOP'
  | 'USER_NOT_FOUND'
  | 'INSPECTOR_HAS_OPEN_ROUNDS'
  | 'FILE_NOT_COMMITTED'

export class InspectionAdminError extends Error {
  readonly code: InspectionAdminErrorCode
  readonly details?: Record<string, unknown>
  constructor(code: InspectionAdminErrorCode, details?: Record<string, unknown>) {
    super(code)
    this.name = 'InspectionAdminError'
    this.code = code
    this.details = details
  }
}

const periodKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`

/** 🛑 เดือน "ปัจจุบัน" ต้องคิดด้วยเวลาไทย ไม่ใช่ UTC — ไม่งั้นโควตาเปิด/ปิดเหลื่อม 7 ชั่วโมง */
function currentPeriodKey(now: Date): string {
  return thaiDayKey(now).slice(0, 7)
}

// ── 4.10 อ่านโควตา ──────────────────────────────────────────────────────────

export type QuotaRow = {
  step: InspectionStep
  capacity: number
  used: number
  remaining: number
  /** false = ยังไม่มีแถวของเดือนนี้ (cron ยังไม่ทำงาน หรือแอดมินยังไม่ตั้ง) */
  seeded: boolean
}

/**
 * 🛑 `capacity` เป็น `number` ไม่ใช่ `number | null` — เดือนที่ยังไม่มีแถวคืน `0` (ปิดรับ)
 *    แล้วบอกความจริงว่า "ยังไม่ถูกตั้ง" ผ่าน `seeded` แยกกัน · ถ้าปล่อยให้เป็น `null` ได้
 *    ทุกจุดที่เอาไปคำนวณต้องจำว่า null แปลว่าอะไร แล้ววันหนึ่งจะมีที่หนึ่งตีความว่า "ไม่จำกัด"
 */
export async function getIntakeQuotaOverview(year: number, month: number): Promise<QuotaRow[]> {
  const rows = await prisma.inspectionIntakeQuota.findMany({
    where: { periodYearMonth: periodKey(year, month) },
    select: { step: true, capacity: true, usedCount: true },
  })
  const byStep = new Map(rows.map((r) => [r.step, r]))
  return ([1, 2, 3, 4] as InspectionStep[]).map((step) => {
    const row = byStep.get(step)
    const capacity = row?.capacity ?? 0
    const used = row?.usedCount ?? 0
    return { step, capacity, used, remaining: Math.max(0, capacity - used), seeded: row !== undefined }
  })
}

// ── 4.11 ตั้ง/แก้โควตา ──────────────────────────────────────────────────────

export async function setIntakeQuota(input: {
  year: number
  month: number
  step: InspectionStep
  capacity: number
  now: Date
}): Promise<{
  capacity: number
  used: number
  remaining: number
  overCommitted: boolean
  nextMonthCapacity: number | null
}> {
  const { year, month, step, capacity, now } = input
  if (capacity < 0 || !Number.isInteger(capacity)) throw new InspectionAdminError('QUOTA_INVALID')
  const key = periodKey(year, month)
  // เดือนที่ผ่านไปแล้วแก้ไม่ได้ — ตัวเลขย้อนหลังเป็นหลักฐานว่าเดือนนั้นเปิดรับเท่าไร
  if (key < currentPeriodKey(now)) throw new InspectionAdminError('QUOTA_INVALID')

  const row = await prisma.inspectionIntakeQuota.upsert({
    where: { periodYearMonth_step: { periodYearMonth: key, step } },
    create: { periodYearMonth: key, step, capacity, usedCount: 0 },
    update: { capacity },
    select: { capacity: true, usedCount: true },
  })

  // 🛑 การแก้เดือนปัจจุบัน **ไม่ย้อนไปแก้เดือนถัดไปที่ cron สร้างไว้แล้ว** (cron คัดลอกค่า
  //    ณ ตอนที่มันทำงาน ไม่ได้อ้างอิงสด) ⇒ คืนค่าของเดือนหน้ามาให้เห็น จะได้ไม่ต้องเดา
  const nextKey = month === 12 ? periodKey(year + 1, 1) : periodKey(year, month + 1)
  const next = await prisma.inspectionIntakeQuota.findUnique({
    where: { periodYearMonth_step: { periodYearMonth: nextKey, step } },
    select: { capacity: true },
  })

  return {
    capacity: row.capacity,
    used: row.usedCount,
    remaining: Math.max(0, row.capacity - row.usedCount),
    // 🛑 ลดเพดานต่ำกว่ายอดที่รับไปแล้วทำได้ (ทีมอาจกำลังคนหด) แต่ **ห้ามยกเลิกแผนย้อนหลัง** —
    //    ร้านที่จ่ายเงินแล้วยังอยู่ในแผน · ต้องบอกแอดมินตรง ๆ ว่ารับเกินไปแล้ว ไม่ใช่ยอมรับเงียบ ๆ
    overCommitted: row.usedCount > row.capacity,
    nextMonthCapacity: next?.capacity ?? null,
  }
}

// ── 4.12 สร้างรอบนอกกำหนด ───────────────────────────────────────────────────

export async function createAdHocRound(input: {
  shopId: string
  roomId: string | null
  step: InspectionStep
  method: Exclude<InspectionMethod, 'AUTO'>
  inspectorUserId: string | null
  checkKeys: string[]
  dueAt: Date | null
  now: Date
}) {
  const shop = await prisma.shop.findFirst({
    where: { id: input.shopId, deletedAt: null },
    select: { vertical: true },
  })
  if (shop === null) throw new InspectionAdminError('SHOP_NOT_FOUND')
  if (shop.vertical !== 'LODGING') throw new InspectionAdminError('NOT_LODGING')

  const plan = await prisma.inspectionPlan.findUnique({
    where: { shopId: input.shopId },
    select: { status: true },
  })
  if (plan === null || plan.status !== 'ACTIVE') throw new InspectionAdminError('PLAN_NOT_FOUND')

  const keys: InspectionCheckKey[] = []
  for (const k of input.checkKeys) {
    if (!isInspectionCheckKey(k)) throw new InspectionAdminError('UNKNOWN_CHECK_KEY', { checkKey: k })
    keys.push(k)
  }

  // 🛑 **ห้ามผสมคีย์ scope SHOP กับ ROOM ในรอบเดียว** — การบันทึกผลอ่าน `roomId` จากตัวรอบ
  //    ⇒ รอบที่ปนกันจะเขียน roomId ลงไปทั้งชุด แล้วผลระดับร้านกลายเป็นผลของหลังเดียว
  //    (หรือกลับกัน) โดยไม่มีอะไรฟ้อง
  const scopes = new Set(keys.map((k) => checkScope(k)))
  if (scopes.size > 1) throw new InspectionAdminError('CHECK_SCOPE_MISMATCH')
  const needsRoom = scopes.has('ROOM')
  if (needsRoom !== (input.roomId !== null)) throw new InspectionAdminError('CHECK_SCOPE_MISMATCH')

  if (input.roomId !== null) {
    const room = await prisma.room.findFirst({
      where: { id: input.roomId, shopId: input.shopId },
      select: { id: true },
    })
    if (room === null) throw new InspectionAdminError('ROOM_NOT_IN_SHOP')
  }

  let displayName = UNASSIGNED_INSPECTOR_NAME
  if (input.inspectorUserId !== null) {
    try {
      displayName = await resolveInspectorDisplayName(input.inspectorUserId)
    } catch {
      throw new InspectionAdminError('INSPECTOR_NOT_FOUND')
    }
  }

  const lead = ROUND_LEAD_DAYS[input.method]
  const dueAt =
    input.dueAt ?? (lead === null ? null : new Date(input.now.getTime() + lead * 24 * 60 * 60 * 1000))

  const round = await prisma.inspectionRound.create({
    data: {
      shopId: input.shopId,
      roomId: input.roomId,
      step: input.step,
      method: input.method,
      inspectorUserId: input.inspectorUserId,
      inspectorDisplayName: displayName,
      assignedAt: input.now,
      dueAt,
    },
    select: { id: true, assignedAt: true, dueAt: true },
  })

  return {
    roundId: round.id,
    step: input.step,
    method: input.method,
    shopId: input.shopId,
    roomId: input.roomId,
    inspectorDisplayName: input.inspectorUserId === null ? null : displayName,
    assignedAt: round.assignedAt,
    dueAt: round.dueAt,
    checkKeys: keys,
  }
}

// ── 4.14 คิวงานทั้งระบบ + งานค้าง ───────────────────────────────────────────

export async function listRoundsForAdmin(input: {
  assignment?: 'UNASSIGNED' | 'ASSIGNED' | 'ALL'
  overdueOnly?: boolean
  step?: InspectionStep
  method?: InspectionMethod
  shopId?: string
  hasFraudSignal?: boolean
  limit?: number
  cursor?: string | null
  now: Date
}) {
  const { now } = input
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  const assignment = input.assignment ?? 'ALL'

  const where = {
    ...(input.shopId === undefined ? {} : { shopId: input.shopId }),
    ...(input.step === undefined ? {} : { step: input.step }),
    ...(input.method === undefined ? {} : { method: input.method }),
    ...(assignment === 'UNASSIGNED' ? { inspectorUserId: null } : {}),
    ...(assignment === 'ASSIGNED' ? { NOT: { inspectorUserId: null } } : {}),
    ...(input.overdueOnly === true ? { completedAt: null, dueAt: { lt: now } } : {}),
    ...(input.hasFraudSignal === true ? { NOT: { suspectedFraudNote: null } } : {}),
  }

  const [rows, openRounds, fraudSignalCount] = await Promise.all([
    prisma.inspectionRound.findMany({
      where,
      // 🛑 เรียงตาม dueAt เก่า→ใหม่ ไม่ใช่ createdAt — รอบ ONSITE ที่สร้างล่วงหน้า 30 วัน
      //    จะลอยขึ้นหัวคิวเหนือรอบ DOCUMENT ที่เหลืออีก 2 วัน ทั้งที่อันหลังใกล้พลาดกำหนดกว่า
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true, shopId: true, roomId: true, step: true, method: true,
        dueAt: true, assignedAt: true, completedAt: true,
        inspectorUserId: true, inspectorDisplayName: true, suspectedFraudNote: true,
        shop: { select: { shopName: true } },
        room: { select: { name: true } },
      },
    }),
    prisma.inspectionRound.findMany({
      where: { completedAt: null },
      select: { step: true, method: true, dueAt: true, inspectorUserId: true },
    }),
    // 🛑 ยกขึ้นเป็นตัวเลขของตัวเองระดับบนสุด ไม่ซ่อนใน backlog — มันเป็นสิ่งเดียวในคิวนี้ที่
    //    **ความเร่งด่วนไม่ผูกกับ dueAt** ถ้าไม่ยกขึ้นมา รอบที่ผู้ตรวจเขียนว่า "เพื่อนบ้านบอกว่า
    //    บ้านร้างมา 2 ปี" จะจมอยู่ล่างสุดเพราะ dueAt ยังอีกไกล
    //    ⚠️ ยังนับ "ทุกรอบที่มีบันทึก" เพราะไม่มีคอลัมน์เชื่อมว่ารอบไหนถูกยกเป็นรายงานไปแล้ว
    //       (หนี้ที่บันทึกไว้ในเอกสาร — ต้องเพิ่มคอลัมน์ในรอบถัดไป)
    prisma.inspectionRound.count({ where: { NOT: { suspectedFraudNote: null } } }),
  ])

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  return {
    rounds: page.map((r) => ({
      roundId: r.id,
      shopId: r.shopId,
      shopName: r.shop.shopName,
      roomId: r.roomId,
      roomName: r.room?.name ?? null,
      step: r.step,
      method: r.method,
      checkKeys: checkKeysOfRound(r),
      dueAt: r.dueAt,
      assignedAt: r.inspectorUserId === null ? null : r.assignedAt,
      completedAt: r.completedAt,
      inspectorUserId: r.inspectorUserId,
      inspectorDisplayName: r.inspectorUserId === null ? null : r.inspectorDisplayName,
      isOverdue: r.completedAt === null && r.dueAt !== null && r.dueAt.getTime() < now.getTime(),
      suspectedFraudNote: r.suspectedFraudNote,
    })),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    fraudSignalCount,
    backlog: buildBacklog(openRounds as OpenRoundRow[], now),
  }
}

// ── 4.13 เส้นทางฉ้อโกง ──────────────────────────────────────────────────────

export type FraudIdentifier = { type: 'PHONE' | 'NAME' | 'NATIONAL_ID' | 'BANK_ACCOUNT'; value: string; bankName?: string }

/**
 * 🛑 **ไม่ใช่การบันทึก `outcome: 'FAIL'`** — `FAIL` แปลว่า "ตรวจแล้วข้อเท็จจริงไม่ตรงตามประกาศ"
 *    ซึ่งเป็นเรื่องภายในของแผน และห้ามขึ้นคำว่า "ไม่ผ่าน" ต่อสาธารณะ ⇒ ถ้าฉ้อโกงถูกบันทึกเป็น
 *    FAIL เฉย ๆ ผลคือ **ไม่มีใครนอกทีมเห็นอะไรเลย** ซึ่งตรงข้ามกับกฎ "สัญญาณอันตรายฟรีเสมอ"
 *
 * 🛑 เขียนเข้าฐาน `/check` ผ่าน service ของโดเมนนั้น **ห้ามเขียนตาราง ScamReport ตรงจากที่นี่** —
 *    ตัวระบุต้องเก็บเป็น hash ตามกฎ PDPA ที่โดเมนนั้นบังคับไว้แล้ว เขียนตรงคือข้ามกฎทั้งชุด
 *
 * 🛑 `status` เป็น `PENDING` เสมอ — ห้าม approve เองแม้ผู้เรียกเป็นแอดมิน คนที่พบเรื่องกับคนที่
 *    อนุมัติต้องไม่ใช่คนเดียวกัน (หลักเดียวกับแอดมินที่อนุมัติคำขอเติมเงินของตัวเองไม่ได้)
 */
export async function reportInspectionFraud(input: {
  actorUserId: string
  shopId: string
  roundId: string | null
  checkKey: string | null
  roomId: string | null
  scamType: string
  description: string
  evidenceFileIds: string[]
  identifiers: FraudIdentifier[]
  now: Date
}) {
  const shop = await prisma.shop.findFirst({ where: { id: input.shopId, deletedAt: null }, select: { id: true } })
  if (shop === null) throw new InspectionAdminError('SHOP_NOT_FOUND')

  let checkKey: InspectionCheckKey | null = null
  if (input.checkKey !== null) {
    if (!isInspectionCheckKey(input.checkKey)) throw new InspectionAdminError('UNKNOWN_CHECK_KEY')
    checkKey = input.checkKey
    const needsRoom = checkScope(checkKey) === 'ROOM'
    if (needsRoom !== (input.roomId !== null)) throw new InspectionAdminError('CHECK_SCOPE_MISMATCH')
    if (input.roomId !== null) {
      const room = await prisma.room.findFirst({
        where: { id: input.roomId, shopId: input.shopId },
        select: { id: true },
      })
      if (room === null) throw new InspectionAdminError('ROOM_NOT_IN_SHOP')
    }
  }

  const report = await createScamReport(input.actorUserId, {
    identifiers: input.identifiers,
    scamType: input.scamType,
    amountLost: 0,
    description: input.description,
    evidence: input.evidenceFileIds,
  })

  // ข้อที่เกี่ยวข้องถูกบันทึกเป็น FAIL **ควบคู่** ไม่ใช่แทนกัน (AC-INS-23-2)
  const linkedResultIds: string[] = []
  if (checkKey !== null) {
    const plan = await prisma.inspectionPlan.findUnique({ where: { shopId: input.shopId }, select: { step: true } })
    const outcome = await recordCheckOutcome({
      shopId: input.shopId,
      roomId: input.roomId,
      checkKey,
      outcome: 'FAIL',
      planStep: (plan?.step ?? INSPECTION_CHECKS[checkKey].step) as InspectionStep,
      now: input.now,
      roundId: input.roundId,
    })
    linkedResultIds.push(outcome.resultId)
  }

  return { scamReportId: report.id, status: 'PENDING' as const, linkedResultIds }
}

// ── 4.16 ตั้ง/ถอนบทบาทผู้ตรวจ ───────────────────────────────────────────────

/**
 * 🛑 ถอนบทบาททั้งที่ยังถือรอบอยู่ = **งานหายไปจากทุกหน้าจอพร้อมกัน** — ไม่โผล่ในคิวของใคร
 *    (เจ้าของเข้าไม่ได้แล้ว) และไม่นับเป็น `overdueUnassigned` (เพราะมันมีคนมอบหมายแล้ว)
 *    มันจะไปนอนอยู่ใน `overdueAssigned` ที่รอผู้ตรวจซึ่งไม่มีวันกลับมา และไม่มีอะไรฟ้อง
 */
export async function setInspectorRole(input: {
  targetUserId: string
  actorUserId: string
  isInspector: boolean
  reason: string
  now: Date
}) {
  const user = await prisma.user.findFirst({
    where: { id: input.targetUserId, deletedAt: null },
    select: { id: true },
  })
  if (user === null) throw new InspectionAdminError('USER_NOT_FOUND')

  const openRounds = await prisma.inspectionRound.findMany({
    where: { inspectorUserId: input.targetUserId, completedAt: null },
    select: { id: true },
  })
  if (!input.isInspector && openRounds.length > 0) {
    throw new InspectionAdminError('INSPECTOR_HAS_OPEN_ROUNDS', {
      roundIds: openRounds.map((r) => r.id),
      count: openRounds.length,
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: input.targetUserId }, data: { isInspector: input.isInspector } })
    // append-only เสมอ — คำถามตอนสอบสวนคือ "ตอนที่รอบนั้นถูกมอบหมาย คนนี้มีสิทธิ์อยู่ไหม"
    await tx.inspectorRoleChange.create({
      data: {
        targetUserId: input.targetUserId,
        actorUserId: input.actorUserId,
        isInspector: input.isInspector,
        reason: input.reason,
      },
    })
  })

  return {
    userId: input.targetUserId,
    isInspector: input.isInspector,
    changedAt: input.now,
    changedByUserId: input.actorUserId,
    openRounds: input.isInspector ? openRounds.length : 0,
  }
}
