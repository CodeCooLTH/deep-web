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
import { resolveEvidenceVisibility, type EvidenceKind } from '@/lib/inspection/evidence-visibility'
import { getFileMeta } from '@/lib/storage'
import { recordCheckOutcome } from '@/services/inspection-result.service'
import {
  UNASSIGNED_INSPECTOR_NAME,
  isRoundOverdue,
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
  | 'CHECK_NOT_IN_ROUND'
  | 'EVIDENCE_VISIBILITY_FORBIDDEN'
  | 'FILE_NOT_COMMITTED'
  | 'ROUND_NOT_FOUND'
  | 'ROUND_ALREADY_COMPLETED'
  | 'ROUND_ALREADY_ASSIGNED'
  | 'ROUND_NOT_ASSIGNABLE'
  | 'ROUND_NOT_COMPLETABLE'
  | 'INSPECTOR_NOT_ELIGIBLE'
  | 'INSPECTOR_NAME_UNUSABLE'
  | 'ROUND_NOT_ASSIGNED_TO_YOU'

export class InspectionRoundError extends Error {
  readonly code: InspectionRoundErrorCode
  /** ข้อที่เกี่ยวข้องกับ error นี้ (ยังไม่ถูกยืนยัน / ไม่อยู่ในรอบ / หลักฐานผิดชนิด) */
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
  /**
   * 🛑 ต้องส่ง `true` มาโดยตั้งใจถึงจะเปลี่ยนตัวผู้ตรวจของรอบที่มอบหมายไปแล้วได้ — การทับเงียบ ๆ
   *    คือการดึงงานออกจากมือผู้ตรวจที่อาจนัดหมายเดินทางไปแล้วจริง (ONSITE มี lead time 30 วัน)
   *    เขาจะพบว่ารอบหายจากคิวตัวเองโดยไม่มีคำอธิบาย
   */
  reassign?: boolean
}): Promise<{ inspectorDisplayName: string; reassignedFrom: string | null; assignedAt: Date; dueAt: Date | null }> {
  const existing = await prisma.inspectionRound.findUnique({
    where: { id: input.roundId },
    select: { completedAt: true, method: true, inspectorUserId: true, inspectorDisplayName: true, assignedAt: true, dueAt: true },
  })
  if (existing === null) throw new InspectionRoundError('ROUND_NOT_FOUND')
  if (existing.completedAt !== null) throw new InspectionRoundError('ROUND_ALREADY_COMPLETED')
  // รอบอัตโนมัติไม่มีคนตรวจ — cron เป็นคนปิดเอง
  if (existing.method === 'AUTO') throw new InspectionRoundError('ROUND_NOT_ASSIGNABLE')
  if (existing.inspectorUserId !== null && input.reassign !== true) {
    throw new InspectionRoundError('ROUND_ALREADY_ASSIGNED')
  }

  const displayName = await resolveInspectorDisplayName(input.inspectorUserId)

  // 🛑 completedAt: null อยู่ใน WHERE ไม่ใช่ if หลังอ่าน — รอบที่เพิ่งถูกปิดระหว่างที่แอดมิน
  //    เปิดหน้าค้างไว้ ต้องมอบหมายไม่ได้ ไม่ใช่มอบหมายทับ
  const updated = await prisma.inspectionRound.updateMany({
    where: { id: input.roundId, completedAt: null },
    data: { inspectorUserId: input.inspectorUserId, inspectorDisplayName: displayName },
  })
  if (updated.count === 0) throw new InspectionRoundError('ROUND_ALREADY_COMPLETED')

  return {
    inspectorDisplayName: displayName,
    // คืนชื่อเดิมกลับไปให้หน้าจอยืนยันกับแอดมินว่าเพิ่งดึงงานออกจากมือใคร
    reassignedFrom: existing.inspectorUserId === null ? null : existing.inspectorDisplayName,
    assignedAt: existing.assignedAt,
    dueAt: existing.dueAt,
  }
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
  /** บันทึกสรุปงาน — ไม่ส่ง = ไม่แตะค่าเดิม */
  summary?: string
  /**
   * 🛑 **ไม่ส่ง = ไม่แตะค่าเดิม ห้ามเขียน null ทับ** — endpoint นี้ถูกยิงได้หลายครั้งต่อรอบ
   *    ถ้าคำขอที่สองซึ่งไม่ได้ตั้งใจแตะเรื่องนี้ล้างค่า บันทึกที่ผู้ตรวจพิมพ์ไว้ตอนแรกจะหาย
   *    โดยไม่มีใครรู้ (คลาสเดียวกับคอลัมน์ที่มีผู้เขียนสองราย: ค่าที่หายจาก payload
   *    แปลว่า "ไม่รู้" ไม่ใช่ "ถูกลบ")
   */
  suspectedFraudNote?: string
}): Promise<{
  completed: boolean
  alreadyCompleted: boolean
  checksConfirmed: number
  checksChanged: number
  hasFraudSignal: boolean
}> {
  const round = await prisma.inspectionRound.findUnique({
    where: { id: input.roundId },
    select: {
      id: true, shopId: true, roomId: true, step: true, method: true,
      assignedAt: true, completedAt: true, suspectedFraudNote: true,
    },
  })
  if (round === null) throw new InspectionRoundError('ROUND_NOT_FOUND')
  if (round.completedAt !== null) {
    return {
      completed: false,
      alreadyCompleted: true,
      checksConfirmed: 0,
      checksChanged: 0,
      hasFraudSignal: (round.suspectedFraudNote ?? '') !== '',
    }
  }

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
      roundId: true,
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

  // 🛑 แยกสองตัวนับด้วยเหตุผลเดียวกับ `changed` ของการบันทึกผล — `checksChanged: 0` เป็น
  //    ผลลัพธ์ **ปกติและดี** ของรอบที่ทุกอย่างยังเหมือนเดิม ไม่ใช่สัญญาณว่าอะไรพลาด
  //    ตัวนับรวมตัวเดียวจะทำให้แยกสองความหมายนี้ไม่ออก
  const changedKeys = requiredChecks.filter((k) => {
    const row = latestByCheck.get(k) as (InspectionResultRow & { roundId?: string | null }) | null
    return row != null && row.roundId === round.id
  })

  const fraudNote = input.suspectedFraudNote ?? round.suspectedFraudNote

  // completedAt: null ใน WHERE อีกชั้น — กันสองคำขอปิดรอบพร้อมกัน
  const updated = await prisma.inspectionRound.updateMany({
    where: { id: round.id, completedAt: null },
    data: {
      completedAt: input.now,
      // undefined = ไม่แตะ (Prisma ข้าม field นี้) — ต่างจาก null ที่แปลว่าล้างค่า
      ...(input.summary === undefined ? {} : { summary: input.summary }),
      ...(input.suspectedFraudNote === undefined ? {} : { suspectedFraudNote: input.suspectedFraudNote }),
    },
  })
  return {
    completed: updated.count > 0,
    alreadyCompleted: updated.count === 0,
    checksConfirmed: requiredChecks.length - changedKeys.length,
    checksChanged: changedKeys.length,
    hasFraudSignal: (fraudNote ?? '') !== '',
  }
}

/**
 * งานของผู้ตรวจคนหนึ่ง — 🛑 ขอบเขตอยู่ใน `WHERE` ของคิวรีแรก ห้ามดึงมาแล้วกรองใน TypeScript
 * (TFR-012) การกรองหลังดึงยังทำให้ข้อมูลร้านอื่นถูกอ่านออกมาจากฐานและหลุดผ่าน log/error ได้
 */
export async function listAssignmentsForInspector(
  inspectorUserId: string,
  opts?: { includeCompleted?: boolean; now?: Date },
) {
  await resolveInspectorDisplayName(inspectorUserId)
  const rounds = await prisma.inspectionRound.findMany({
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
      assignedAt: true,
      dueAt: true,
      completedAt: true,
      shop: { select: { shopName: true } },
      // 🛑 ชื่อที่พักต้องมากับคิว ไม่ใช่ให้หน้าจอไปหาเอง — ผู้ตรวจที่ได้งานของร้านเดียวกัน
      //    หลายหลังในวันเดียว ต้องแยกออกตั้งแต่หน้ารายการว่าใบไหนของหลังไหน
      //    (สัญญา API.md §4.6 บังคับ `roomName` · รอบแรกที่ implement ลืมไปทั้งฟิลด์)
      room: { select: { name: true } },
    },
  })
  // 🛑 "เลยกำหนดหรือยัง" ตัดสินที่นี่ด้วย `isRoundOverdue()` ซึ่งเป็น SSOT เดิม — ห้ามให้หน้าจอ
  //    เรียก `Date.now()` เองในตัว render (ผลไม่เสถียรเมื่อ re-render และเป็นนิยามที่สองของคำเดียวกัน)
  const now = opts?.now ?? new Date()
  return rounds.map((r) => ({
    id: r.id,
    shopId: r.shopId,
    shopName: r.shop.shopName,
    roomId: r.roomId,
    roomName: r.room?.name ?? null,
    step: r.step,
    method: r.method,
    assignedAt: r.assignedAt,
    dueAt: r.dueAt,
    completedAt: r.completedAt,
    isOverdue: isRoundOverdue(r, now),
    // ข้อตรวจที่รอบนี้ต้องบันทึก — คำนวณจาก SSOT เดียวกับตอนปิดรอบ ห้ามให้หน้าจอเดาจาก step
    checkKeys: checkKeysOfRound(r),
  }))
}

/** ด่านของทุก endpoint ใต้ `/api/inspector/**` — ขอบเขตผูกใน WHERE ไม่ใช่เทียบทีหลัง */
export async function assertRoundAssignedTo(roundId: string, inspectorUserId: string) {
  await resolveInspectorDisplayName(inspectorUserId)
  const round = await prisma.inspectionRound.findFirst({
    where: { id: roundId, inspectorUserId },
    select: {
      id: true, shopId: true, roomId: true, step: true, method: true,
      assignedAt: true, completedAt: true, suspectedFraudNote: true,
    },
  })
  if (round === null) throw new InspectionRoundError('ROUND_NOT_ASSIGNED_TO_YOU')
  return round
}

// ─────────────────────────────────────────────────────────────────────────────
// ฝั่งผู้ตรวจ — อ่านรายละเอียดรอบ + บันทึกผลทั้งชุด (feature 00060 · T10 · API §4.7-4.8)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * รายละเอียดรอบสำหรับผู้ตรวจเจ้าของรอบ
 *
 * 🛑 **ไม่มีฟิลด์การเงินสักตัว** — ยอดเครดิต ประวัติชำระเงิน สลิป ราคาแผน ห้ามอยู่ใน payload นี้
 *    ไม่ว่าร้านนั้นจะเป็นร้านที่ผู้ตรวจได้รับมอบหมายหรือไม่ (AC-INS-24-3) · ผู้ตรวจเป็นบุคคล
 *    ภายนอกที่จ้างรายครั้ง ไม่ใช่พนักงาน
 *
 * 🛑 `room.images` ต้องส่งไปด้วยเพราะข้อ `photos_match` ต้องเทียบภาพประกาศ **ปัจจุบัน** กับของจริง
 *    ขณะผู้ตรวจยืนอยู่หน้างาน ไม่ใช่ให้สลับแอปไปเปิดโปรไฟล์เอง
 */
export async function getRoundDetailForInspector(roundId: string, inspectorUserId: string) {
  const round = await assertRoundAssignedTo(roundId, inspectorUserId)

  const [shop, room, results, evidence] = await Promise.all([
    prisma.shop.findUnique({ where: { id: round.shopId }, select: { shopName: true, vertical: true } }),
    round.roomId === null
      ? Promise.resolve(null)
      : prisma.room.findFirst({
          where: { id: round.roomId, shopId: round.shopId },
          select: { id: true, name: true, images: true, maxGuests: true, facilities: true },
        }),
    prisma.inspectionResult.findMany({
      where: { shopId: round.shopId, roomId: round.roomId },
      select: {
        id: true, checkKey: true, roomId: true, outcome: true,
        checkedAt: true, lastConfirmedAt: true, expiresAt: true, invalidatedAt: true,
      },
      orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.inspectionEvidence.findMany({
      where: { roundId },
      select: { id: true, kind: true, visibility: true, fileId: true, resultId: true },
    }),
  ])

  const latest = latestResultPerCheck(results as InspectionResultRow[])
  const now = new Date()
  const checkKeys = checkKeysOfRound(round)

  return {
    round: {
      id: round.id,
      step: round.step,
      method: round.method,
      shopName: shop?.shopName ?? '',
      roomName: room?.name ?? null,
      assignedAt: round.assignedAt,
      // รอบที่ปิดแล้วต้องอ่านได้จากตัว payload — ไม่งั้นหน้าจอต้องยิงซ้ำอีกรอบเพื่อรู้ว่ากดบันทึกได้ไหม
      completedAt: round.completedAt,
      checkKeys,
    },
    shop: { shopName: shop?.shopName ?? '', vertical: shop?.vertical ?? null },
    room:
      room === null
        ? null
        : {
            id: room.id,
            name: room.name,
            listingImages: room.images,
            declaredMaxGuests: room.maxGuests,
            declaredFacilities: room.facilities,
          },
    checks: checkKeys.map((k) => ({
      checkKey: k,
      label: INSPECTION_CHECKS[k].labelTh,
      scope: INSPECTION_CHECKS[k].scope,
      currentDisplayStatus: resolveResultStatus(latest.get(resultScopeKey(k, round.roomId)) ?? null, now),
      // หลักฐานของรอบนี้ทั้งหมด — ยังไม่แยกรายข้อเพราะ InspectionEvidence.resultId ผูกกับ
      // "แถวผล" ไม่ใช่ "คีย์ข้อตรวจ" และแถวผลของข้อที่ยังไม่เคยตรวจยังไม่มีอยู่
      evidence: evidence.map((e) => ({
        evidenceId: e.id,
        kind: e.kind,
        visibility: e.visibility,
        fileId: e.fileId,
      })),
    })),
    suspectedFraudNote: round.suspectedFraudNote ?? null,
  }
}

export type RecordRoundResultInput = {
  checkKey: InspectionCheckKey
  outcome: 'PASS' | 'FAIL' | 'NOT_APPLICABLE'
  note?: string
  evidence?: { kind: EvidenceKind; fileId?: string; lat?: number; lng?: number }[]
}

/**
 * บันทึกผลทั้งชุดของรอบหนึ่ง — **ทรานแซกชันเดียว** (API §4.8)
 *
 * 🛑 สำเร็จบางส่วนคือสถานะที่ผู้ตรวจ **มองไม่ออกว่าต้องยิงซ้ำข้อไหน** ขณะยืนอยู่หน้างาน
 *    (อาการเดียวกับที่เคยเกิดตอนแนบรูปกริดแล้วบางใบขึ้นบางใบไม่ขึ้น)
 *
 * 🛑 **`roomId` อ่านจากตัวรอบ ไม่รับจาก body** — รับจาก client เมื่อไรก็แปลว่าผู้ตรวจที่ได้รับ
 *    มอบหมายให้ตรวจหลัง A เขียนผลลงหลัง B ที่ตัวเองไม่เคยไปเห็นได้
 *
 * 🛑 การตัดสิน UPDATE/INSERT อยู่ที่ `recordCheckOutcome()` ตัวเดียว — ที่นี่ห้ามเขียนเงื่อนไข
 *    "ผลเปลี่ยนไหม" ซ้ำ (ตรรกะนี้ถูกเรียกจาก 3 ทาง: endpoint นี้ · cron ขั้น 1 · เส้นทางฉ้อโกง)
 */
export async function recordRoundResults(input: {
  roundId: string
  inspectorUserId: string
  results: RecordRoundResultInput[]
  suspectedFraudNote?: string
  now: Date
}) {
  const round = await assertRoundAssignedTo(input.roundId, input.inspectorUserId)
  if (round.completedAt !== null) throw new InspectionRoundError('ROUND_ALREADY_COMPLETED')

  // 🛑 อายุผลตรวจของบางข้อผูกกับ **ขั้นของแผน** ไม่ใช่ขั้นของรอบ (ร้านขั้น 4 ทวนข้อของขั้น 3
  //    ทุก 90 วันแทน 180) ⇒ ต้องอ่านขั้นปัจจุบันของแผน ไม่ใช่ใช้ round.step
  //    แผนที่ LAPSED ไปแล้วระหว่างรอบยังต้องบันทึกผลได้ — ถอยไปใช้ขั้นของรอบ
  const plan = await prisma.inspectionPlan.findUnique({
    where: { shopId: round.shopId },
    select: { step: true },
  })
  const planStep = (plan?.step ?? round.step) as InspectionStep

  const allowed = new Set(checkKeysOfRound(round))
  for (const r of input.results) {
    if (!allowed.has(r.checkKey)) throw new InspectionRoundError('CHECK_NOT_IN_ROUND', [r.checkKey])
    for (const ev of r.evidence ?? []) {
      const decision = resolveEvidenceVisibility(ev.kind, r.checkKey)
      if (!decision.ok) throw new InspectionRoundError('EVIDENCE_VISIBILITY_FORBIDDEN', [r.checkKey])
      if (ev.kind !== 'GEO') {
        // ตัวเลขที่ client แจ้งไม่ใช่หลักฐานว่าไฟล์ถึงที่เก็บแล้ว
        if (ev.fileId === undefined || (await getFileMeta(ev.fileId)) === null) {
          throw new InspectionRoundError('FILE_NOT_COMMITTED', [r.checkKey])
        }
      }
    }
  }

  const saved: {
    checkKey: InspectionCheckKey
    outcome: 'PASS' | 'FAIL' | 'NOT_APPLICABLE'
    changed: boolean
    resultId: string
    evidenceIds: string[]
  }[] = []

  await prisma.$transaction(async (tx) => {
    for (const r of input.results) {
      const outcome = await recordCheckOutcome(
        {
          shopId: round.shopId,
          // 🛑 มาจากตัวรอบเสมอ
          roomId: round.roomId,
          checkKey: r.checkKey,
          outcome: r.outcome,
          planStep,
          now: input.now,
          roundId: round.id,
          note: r.note ?? null,
        },
        tx,
      )

      const evidenceIds: string[] = []
      for (const ev of r.evidence ?? []) {
        const decision = resolveEvidenceVisibility(ev.kind, r.checkKey)
        if (!decision.ok) continue // ถูกปฏิเสธไปแล้วตั้งแต่ด่านข้างบน
        const row = await tx.inspectionEvidence.create({
          data: {
            roundId: round.id,
            resultId: outcome.resultId,
            kind: ev.kind,
            visibility: decision.visibility,
            fileId: ev.fileId ?? null,
            lat: ev.lat ?? null,
            lng: ev.lng ?? null,
          },
          select: { id: true },
        })
        evidenceIds.push(row.id)
      }

      saved.push({ checkKey: r.checkKey, outcome: r.outcome, changed: outcome.changed, resultId: outcome.resultId, evidenceIds })
    }

    if (input.suspectedFraudNote !== undefined) {
      await tx.inspectionRound.update({
        where: { id: round.id },
        data: { suspectedFraudNote: input.suspectedFraudNote },
      })
    }
  })

  return { saved, roomId: round.roomId, shopId: round.shopId }
}
