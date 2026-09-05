import 'server-only'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  INSPECTION_CHECKS,
  checkScope,
  checksForStep,
  type InspectionCheckKey,
  type InspectionStep,
} from '@/lib/inspection/checks'
import { decideRoundCompletion } from '@/lib/inspection/round-completion'
import {
  UNASSIGNED_INSPECTOR_NAME,
  planDueRounds,
  roundGroupKey,
  type DueCheck,
} from '@/lib/inspection/round-planning'
import {
  latestResultPerCheck,
  resolveResultStatus,
  resultScopeKey,
  type InspectionResultRow,
} from '@/lib/inspection/result-status'

/**
 * inspection-round.service.ts — รอบตรวจ (feature 00060 · T5 บางส่วน)
 *
 * `createDueRoundsForShop()` เขียนไปตั้งแต่ T4 เพราะร้านที่เพิ่งจ่ายเงินต้องมีคิวตรวจทันที
 * ไม่ใช่รอ cron รอบถัดไปอีกไม่เกิน 24 ชม. · ส่วนที่เหลือของ T5 (มอบหมาย/คิว/งานค้าง/ปิดรอบ/
 * ขอบเขตผู้ตรวจ) อยู่ครึ่งล่างของไฟล์นี้
 *
 * 🛑 เขียนไว้ที่นี่ตั้งแต่ต้น **ไม่ใช่เขียนซ้ำใน plan.service แล้วค่อยรวมทีหลัง** — cron ของ
 *    T8 จะเรียกตัวเดียวกันนี้ ถ้าปล่อยให้มีสองชุด เกณฑ์ "ถึงกำหนดตรวจ" จะ drift กันแล้ว
 *    ร้านที่สมัครใหม่กับร้านที่ต่ออายุจะได้คิวคนละแบบโดยไม่มีอะไรฟ้อง (HR16)
 */

type Tx = Prisma.TransactionClient

export type CreateDueRoundsInput = {
  shopId: string
  planStep: InspectionStep
  now: Date
}

/**
 * เปิดรอบตรวจของข้อที่ถึงกำหนด — idempotent
 *
 * 🛑 กันซ้ำด้วยเกณฑ์ **"มีรอบเปิดค้างอยู่ไหม"** ไม่ใช่ "วันนี้รันไปหรือยัง" — รอบที่ค้างข้ามวัน
 *    (ปกติมาก งาน ONSITE ใช้เวลาเป็นสัปดาห์) จะถูกสร้างซ้ำทุกวันจนคิวบวมและตัวชี้วัดงานค้าง
 *    อ่านไม่ได้อีกเลย
 *
 * 🛑 ตรวจเฉพาะที่พักที่ยัง `isActive` — หลังที่ปิดรับจองอยู่ ผู้ซื้อจองไม่ได้ ผลตรวจค้างของมัน
 *    จึงหลอกใครไม่ได้ และการส่งผู้ตรวจไปดูหลังที่ไม่ได้เปิดขายคือการเผางบของร้านที่จ่ายเงิน
 *    วันที่ร้านเปิดขายหลังนั้นใหม่ มันจะไม่มีผลที่ยังไม่หมดอายุ ⇒ ถึงกำหนดทันทีเองในรอบถัดไป
 */
export async function createDueRoundsForShop(tx: Tx, input: CreateDueRoundsInput): Promise<number> {
  const { shopId, planStep, now } = input

  const [rooms, rawResults, openRounds] = await Promise.all([
    tx.room.findMany({ where: { shopId, isActive: true }, select: { id: true } }),
    tx.inspectionResult.findMany({
      where: { shopId },
      select: {
        id: true,
        checkKey: true,
        roomId: true,
        outcome: true,
        checkedAt: true,
        lastConfirmedAt: true,
        expiresAt: true,
        invalidatedAt: true,
      },
      orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
    }),
    tx.inspectionRound.findMany({
      where: { shopId, completedAt: null },
      select: { roomId: true, step: true, method: true },
    }),
  ])

  const latest = latestResultPerCheck(rawResults as InspectionResultRow[])
  const openRoundKeys = new Set(
    openRounds.map((r) => roundGroupKey(r.roomId, r.step as InspectionStep, r.method)),
  )

  const dueChecks: DueCheck[] = []
  for (const checkKey of checksForStep(planStep)) {
    const targets: (string | null)[] = checkScope(checkKey) === 'SHOP' ? [null] : rooms.map((r) => r.id)
    for (const roomId of targets) {
      const row = latest.get(resultScopeKey(checkKey, roomId)) ?? null
      const status = resolveResultStatus(row, now)
      // ผ่านและยังไม่หมดอายุ = ยังไม่ต้องเปิดรอบ แต่ส่ง expiresAt ไปให้ตัววางแผนตัดสิน lead time
      // ทุกสถานะที่เหลือ (ยังไม่มีข้อมูล / รอตรวจซ้ำ / ไม่ผ่าน) = ถึงกำหนดทันที
      // 🛑 "ไม่เกี่ยวข้องกับที่พักประเภทนี้" ต้องไม่เปิดรอบ ไม่งั้นผู้ตรวจได้งานที่ไม่มีอะไรให้ตรวจ
      if (status === 'NOT_APPLICABLE') continue
      dueChecks.push({ roomId, checkKey, expiresAt: status === 'PASS' ? (row?.expiresAt ?? null) : null })
    }
  }

  const planned = planDueRounds({ dueChecks, openRoundKeys, now })
  if (planned.length === 0) return 0

  await tx.inspectionRound.createMany({
    data: planned.map((p) => ({
      shopId,
      roomId: p.roomId,
      step: p.step,
      method: p.method,
      inspectorUserId: null,
      inspectorDisplayName: UNASSIGNED_INSPECTOR_NAME,
      assignedAt: now,
      dueAt: p.dueAt,
    })),
  })
  return planned.length
}

/** ข้อตรวจที่รอบหนึ่งครอบ — ใช้ตอนแสดงงานให้ผู้ตรวจและตอนปิดรอบ (T5 เต็มรูปจะใช้ต่อ) */
export function checkKeysOfRound(round: {
  step: number
  method: string
}): InspectionCheckKey[] {
  return checksForStep(round.step as InspectionStep).filter(
    (k) => INSPECTION_CHECKS[k].step === round.step && INSPECTION_CHECKS[k].method === round.method,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// T5 (ส่วนที่เหลือ) — มอบหมาย · คิวงาน · งานค้าง · ปิดรอบ · ขอบเขตของผู้ตรวจ
// ─────────────────────────────────────────────────────────────────────────────

export type InspectionRoundErrorCode =
  | 'ROUND_NOT_FOUND'
  | 'ROUND_ALREADY_COMPLETED'
  | 'ROUND_NOT_COMPLETABLE'
  | 'INSPECTOR_NOT_ELIGIBLE'
  | 'INSPECTOR_NAME_UNUSABLE'
  | 'ROUND_NOT_ASSIGNED_TO_YOU'

export class InspectionRoundError extends Error {
  readonly code: InspectionRoundErrorCode
  /** ข้อที่ยังไม่ถูกยืนยันในรอบนี้ — มีค่าเฉพาะ ROUND_NOT_COMPLETABLE */
  readonly missing: InspectionCheckKey[]
  constructor(code: InspectionRoundErrorCode, missing: InspectionCheckKey[] = []) {
    super(code)
    this.name = 'InspectionRoundError'
    this.code = code
    this.missing = missing
  }
}

/**
 * มอบหมายรอบให้ผู้ตรวจ + snapshot ชื่อที่จะปรากฏต่อสาธารณะ (TFR-011)
 *
 * 🛑 **ห้ามเขียนทับ `assignedAt` เด็ดขาด** — คอลัมน์นั้นแปลว่า "รอบนี้เปิดเมื่อไร" และเป็น
 *    เส้นแบ่งที่เกณฑ์ปิดรอบใช้ (TD-018) ถ้าเลื่อนมันตอนมอบหมาย ผลที่ถูกยืนยันไปแล้วก่อนหน้า
 *    จะหลุดออกจากเกณฑ์ ⇒ งานที่ทำไปแล้ว "หายไป" และรอบจะปิดไม่ได้ทั้งที่ตรวจครบ
 *
 * 🛑 ชื่อที่ snapshot ต้องเป็น `User.displayName` **ห้ามใช้ `username`** — username ของผู้ใช้ที่
 *    สมัครผ่าน Facebook คือ `fb1234567890` ซึ่งจะไปโผล่บนโปรไฟล์สาธารณะเป็นชื่อผู้ตรวจ
 *    ชื่อว่างก็ห้ามผ่าน (หน้าจอจะได้ช่องว่างที่ดูเหมือนข้อมูลหาย ไม่ใช่ข้อมูลที่หายจริง)
 */
export async function assignRound(input: {
  roundId: string
  inspectorUserId: string
  now: Date
}): Promise<{ inspectorDisplayName: string }> {
  const displayName = await resolveInspectorDisplayName(input.inspectorUserId)

  // 🛑 completedAt: null อยู่ใน WHERE ไม่ใช่ if หลังอ่าน — รอบที่เพิ่งถูกปิดระหว่างที่แอดมิน
  //    เปิดหน้าค้างไว้ ต้องมอบหมายไม่ได้ ไม่ใช่มอบหมายทับ
  const updated = await prisma.inspectionRound.updateMany({
    where: { id: input.roundId, completedAt: null },
    data: { inspectorUserId: input.inspectorUserId, inspectorDisplayName: displayName },
  })
  if (updated.count === 0) {
    const exists = await prisma.inspectionRound.findUnique({
      where: { id: input.roundId },
      select: { completedAt: true },
    })
    throw new InspectionRoundError(exists === null ? 'ROUND_NOT_FOUND' : 'ROUND_ALREADY_COMPLETED')
  }
  return { inspectorDisplayName: displayName }
}

/**
 * ผู้ใช้คนนี้เป็นผู้ตรวจที่ใช้งานได้อยู่ไหม — ตรวจ**ทุกคำขอ** ไม่ใช่ตอน login (TFR-012)
 * ผู้ตรวจเป็นคนนอกที่จ้างรายครั้ง ถอดสิทธิ์แล้วต้องเข้าไม่ได้ทันทีแม้มีงานค้างอยู่
 */
export async function resolveInspectorDisplayName(userId: string): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { id: userId, isInspector: true, deletedAt: null },
    select: { displayName: true },
  })
  if (user === null) throw new InspectionRoundError('INSPECTOR_NOT_ELIGIBLE')
  const name = user.displayName.trim()
  if (name === '') throw new InspectionRoundError('INSPECTOR_NAME_UNUSABLE')
  return name
}

/** คิวงานของแอดมิน — รอบที่ยังไม่มีคนรับ เรียงตามความเร่งด่วนจริง ไม่ใช่ตามเวลาที่ระบบสร้างแถว */
export async function listUnassignedRounds(limit = 100) {
  return prisma.inspectionRound.findMany({
    where: { completedAt: null, inspectorUserId: null },
    // 🛑 เรียงด้วย dueAt ไม่ใช่ createdAt — รอบ ONSITE ถูกสร้างล่วงหน้า 30 วัน ถ้าเรียงด้วย
    //    เวลาที่สร้าง มันจะลอยขึ้นเหนือรอบ DOCUMENT ที่เหลืออีก 2 วัน
    //    รอบที่ไม่มีกำหนด (สร้างด้วยมือ) ไปท้ายแถว ไม่ใช่ขึ้นหัวแถวเพราะ null เรียงก่อน
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: limit,
    select: {
      id: true,
      shopId: true,
      roomId: true,
      step: true,
      method: true,
      dueAt: true,
      createdAt: true,
      shop: { select: { shopName: true } },
    },
  })
}

export type OverdueRoundBucket = { step: number; method: string; count: number }

/**
 * ตัวชี้วัดงานค้าง — **ส่วนที่ขาดไม่ได้ของ TD-017**
 *
 * 🛑 การสร้างรอบทิ้งไว้โดยไม่มีใครเห็นว่ามันกองอยู่ = ย้ายที่ของปัญหา ไม่ใช่แก้ปัญหา
 *    (เดิม "ไม่มีใครรู้ว่าต้องตรวจ" ใหม่ "ไม่มีใครรู้ว่ามีงานค้าง" — ผลต่อร้านเหมือนกันเป๊ะ)
 *
 * 🛑 แยกตาม **ขั้นและวิธีตรวจ** ไม่ใช่ตัวเลขก้อนเดียว — คิวที่ตันเพราะหาผู้ตรวจท้องถิ่นไม่ได้
 *    (ONSITE) เป็นคนละปัญหากับคิวที่ตันเพราะไม่มีคนกดมอบหมาย (DOCUMENT) ตัวเลขรวมกลบทั้งคู่
 */
export async function countOverdueRounds(now: Date): Promise<{
  total: number
  buckets: OverdueRoundBucket[]
}> {
  const grouped = await prisma.inspectionRound.groupBy({
    by: ['step', 'method'],
    where: { completedAt: null, dueAt: { lt: now } },
    _count: { _all: true },
  })
  const buckets = grouped
    .map((g) => ({ step: g.step, method: g.method as string, count: g._count._all }))
    .sort((a, b) => a.step - b.step || a.method.localeCompare(b.method))
  return { total: buckets.reduce((sum, b) => sum + b.count, 0), buckets }
}

/**
 * ปิดรอบ — เกณฑ์คือ `lastConfirmedAt >= assignedAt` ของ **ทุกข้อที่รอบนี้ครอบ** (TD-018)
 *
 * idempotent: รอบที่ปิดไปแล้วคืน `alreadyCompleted` ไม่ throw (ผู้ตรวจกดซ้ำเพราะไม่แน่ใจว่าติดไหม
 * เป็นพฤติกรรมปกติ — แพตเทิร์นเดียวกับ openDispute)
 */
export async function completeRound(input: {
  roundId: string
  now: Date
}): Promise<{ completed: boolean; alreadyCompleted: boolean }> {
  const round = await prisma.inspectionRound.findUnique({
    where: { id: input.roundId },
    select: { id: true, shopId: true, roomId: true, step: true, method: true, assignedAt: true, completedAt: true },
  })
  if (round === null) throw new InspectionRoundError('ROUND_NOT_FOUND')
  if (round.completedAt !== null) return { completed: false, alreadyCompleted: true }

  const requiredChecks = checkKeysOfRound(round)
  const rows = await prisma.inspectionResult.findMany({
    where: { shopId: round.shopId, roomId: round.roomId, checkKey: { in: requiredChecks } },
    select: {
      id: true,
      checkKey: true,
      roomId: true,
      outcome: true,
      checkedAt: true,
      lastConfirmedAt: true,
      expiresAt: true,
      invalidatedAt: true,
    },
    orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
  })

  // ใช้ตัวเลือก "แถวล่าสุด" ตัวเดียวกับฝั่งอ่าน — สูตรนี้มีที่เดียวเสมอ
  const latest = latestResultPerCheck(rows as InspectionResultRow[])
  const latestByCheck = new Map<InspectionCheckKey, InspectionResultRow | null>(
    requiredChecks.map((k) => [k, latest.get(resultScopeKey(k, round.roomId)) ?? null]),
  )

  const decision = decideRoundCompletion({ requiredChecks, latestByCheck, assignedAt: round.assignedAt })
  if (!decision.ok) throw new InspectionRoundError('ROUND_NOT_COMPLETABLE', decision.missing)

  // completedAt: null ใน WHERE อีกชั้น — กันสองคำขอปิดรอบพร้อมกัน
  const updated = await prisma.inspectionRound.updateMany({
    where: { id: round.id, completedAt: null },
    data: { completedAt: input.now },
  })
  return { completed: updated.count > 0, alreadyCompleted: updated.count === 0 }
}

/**
 * งานของผู้ตรวจคนหนึ่ง — 🛑 ขอบเขตอยู่ใน `WHERE` ของคิวรีแรก ห้ามดึงมาแล้วกรองใน TypeScript
 * (TFR-012) การกรองหลังดึงยังทำให้ข้อมูลร้านอื่นถูกอ่านออกมาจากฐานและหลุดผ่าน log/error ได้
 */
export async function listAssignmentsForInspector(inspectorUserId: string, opts?: { includeCompleted?: boolean }) {
  await resolveInspectorDisplayName(inspectorUserId)
  return prisma.inspectionRound.findMany({
    where: {
      inspectorUserId,
      ...(opts?.includeCompleted === true ? {} : { completedAt: null }),
    },
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    select: {
      id: true,
      shopId: true,
      roomId: true,
      step: true,
      method: true,
      dueAt: true,
      completedAt: true,
      shop: { select: { shopName: true } },
    },
  })
}

/** ด่านของทุก endpoint ใต้ `/api/inspector/**` — ขอบเขตผูกใน WHERE ไม่ใช่เทียบทีหลัง */
export async function assertRoundAssignedTo(roundId: string, inspectorUserId: string) {
  await resolveInspectorDisplayName(inspectorUserId)
  const round = await prisma.inspectionRound.findFirst({
    where: { id: roundId, inspectorUserId },
    select: { id: true, shopId: true, roomId: true, step: true, method: true, assignedAt: true, completedAt: true },
  })
  if (round === null) throw new InspectionRoundError('ROUND_NOT_ASSIGNED_TO_YOU')
  return round
}
