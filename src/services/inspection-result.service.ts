import 'server-only'

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import {
  INSPECTION_CHECKS,
  computeExpiresAt,
  isInspectionCheckKey,
  isSellerSuppliable,
  checkScope,
  type InspectionCheckKey,
  type InspectionStep,
} from '@/lib/inspection/checks'
import { getFileMeta } from '@/lib/storage'
import { decideResultWrite } from '@/lib/inspection/record-decision'
import {
  latestResultPerCheck,
  resultScopeKey,
  type InspectionOutcome,
  type InspectionResultRow,
} from '@/lib/inspection/result-status'

/**
 * inspection-result.service.ts — **ผู้เขียน `InspectionResult` เพียงรายเดียวของทั้งระบบ**
 * (feature 00060 · T6)
 *
 * 🛑 ห้ามมีที่อื่นเรียก `prisma.inspectionResult.create/update/upsert/delete` เด็ดขาด
 *    ทุกเส้นทางการเขียน (endpoint ของผู้ตรวจ · cron ข้อตรวจอัตโนมัติ · เส้นทางฉ้อโกง ·
 *    ตัว invalidate ตอนร้านเปลี่ยนภาพ) ต้องผ่าน recordCheckOutcome() ตัวนี้
 *
 *    เหตุผล: การตัดสิน "สร้างแถวใหม่ หรือ เลื่อนเวลา" ตัดสินผิดแล้วเงียบทั้งสองทาง —
 *    ถ้าปล่อยให้ผู้เรียกแต่ละที่ตัดสินเอง จะมีบางเส้นทางเขียนแถวซ้ำทุกวันโดยไม่มีใครสังเกต
 *    จนกว่าจะเปิดไทม์ไลน์ของร้านแล้วเจอ 365 บรรทัดเหมือนกัน
 *
 * 🛑 ห้าม `delete` แถวผลตรวจไม่ว่ากรณีใด — เป็นตารางประวัติ (AC-INS-27-1)
 *    ไฟล์นี้จึงไม่มีฟังก์ชันลบเลยแม้แต่ตัวเดียวโดยเจตนา
 */

/** ขอบเขตของผลตรวจหนึ่งข้อ — roomId เป็น null สำหรับข้อที่ผูกกับร้าน */
export type ResultTarget = {
  shopId: string
  roomId: string | null
  checkKey: InspectionCheckKey
}

export type RecordCheckOutcomeInput = ResultTarget & {
  outcome: InspectionOutcome
  planStep: InspectionStep
  now: Date
  /** รอบตรวจที่ทำให้เกิดการเขียนครั้งนี้ — null สำหรับข้อตรวจอัตโนมัติที่ไม่มีรอบ */
  roundId?: string | null
  note?: string | null
  /** ใช้เมื่อการเขียนเกิดจากข้อมูลต้นทางเปลี่ยน ไม่ใช่การตรวจตามรอบ (FR-INS-028) */
  invalidation?: { at: Date; reason: string } | null
}

export type RecordCheckOutcomeResult = {
  /** true = มีข้อมูลใหม่ ⇒ ปรากฏในไทม์ไลน์สาธารณะ · false = ยืนยันผลเดิม */
  changed: boolean
  resultId: string
}

export class InspectionScopeMismatchError extends Error {
  constructor(checkKey: string, hasRoomId: boolean) {
    super(
      `checkKey "${checkKey}" มี scope ${checkScope(checkKey as InspectionCheckKey)} ` +
        `แต่ได้รับ roomId=${hasRoomId ? 'มีค่า' : 'null'}`,
    )
    this.name = 'InspectionScopeMismatchError'
  }
}

/**
 * ตรวจว่า `roomId` ตรงกับ scope ที่ checkKey ประกาศไว้ — fail-closed
 *
 * 🛑 ส่ง roomId มากับข้อที่ผูกร้าน = ผลระดับร้านจะกลายเป็นผลของห้องเดียว (ข้ออื่นของร้านนั้น
 *    จะกลายเป็น "ยังไม่มีข้อมูล" ทันที) · ไม่ส่ง roomId มากับข้อที่ผูกห้อง = ผลของห้องหนึ่ง
 *    จะกลายเป็นผลระดับร้านที่สืบทอดข้ามทุกหลัง ซึ่งผิด FR-INS-029 ตรง ๆ
 *    ทั้งสองทางไม่มี error ไม่มี type ผิด — ต้องกั้นที่นี่
 */
export function assertScopeMatches(checkKey: InspectionCheckKey, roomId: string | null): void {
  const scope = checkScope(checkKey)
  const hasRoom = roomId !== null
  if ((scope === 'ROOM') !== hasRoom) throw new InspectionScopeMismatchError(checkKey, hasRoom)
}

/** อ่านแถวเท่าที่ตรรกะสถานะต้องใช้ — ไม่ดึงคอลัมน์ลับติดมาโดยไม่จำเป็น */
const RESULT_ROW_SELECT = {
  id: true,
  checkKey: true,
  roomId: true,
  outcome: true,
  checkedAt: true,
  lastConfirmedAt: true,
  expiresAt: true,
  invalidatedAt: true,
} as const

function toRow(r: {
  id: string
  checkKey: string
  roomId: string | null
  outcome: InspectionOutcome
  checkedAt: Date
  lastConfirmedAt: Date
  expiresAt: Date | null
  invalidatedAt: Date | null
}): InspectionResultRow | null {
  // คีย์ที่ไม่รู้จัก (เช่นถูกถอดออกจาก SSOT ภายหลัง) ต้องไม่ทำให้ทั้งคำขอพัง แต่ก็ต้องไม่ถูก
  // ตีความเป็นแถวที่ใช้ได้ — คืน null เพื่อให้ถูกมองว่า "ยังไม่มีข้อมูล" ซึ่งเป็นด้านที่ปลอดภัย
  if (!isInspectionCheckKey(r.checkKey)) return null
  return { ...r, checkKey: r.checkKey }
}

/**
 * บันทึกผลตรวจหนึ่งข้อ — ตัวเดียวที่เขียน `InspectionResult` ได้
 *
 * ทำงานในทรานแซกชันเสมอ เพราะการอ่าน "แถวล่าสุด" กับการเขียนต้องเห็นภาพเดียวกัน
 * (สองรอบตรวจของข้อเดียวกันบันทึกพร้อมกันได้จริงเมื่อผู้ตรวจกดพร้อม cron)
 */
export async function recordCheckOutcome(
  input: RecordCheckOutcomeInput,
  tx?: Prisma.TransactionClient,
): Promise<RecordCheckOutcomeResult> {
  assertScopeMatches(input.checkKey, input.roomId)
  const run = async (db: Prisma.TransactionClient): Promise<RecordCheckOutcomeResult> => {
    // 🛑 เรียงด้วย checkedAt DESC, id DESC ให้ตรงกับ latestResultPerCheck() เป๊ะ
    //    (ดึงมาหลายแถวแล้วให้ฟังก์ชันเดียวกับฝั่งอ่านเป็นคนเลือก เพื่อไม่ให้สูตร "ล่าสุด"
    //     มีสองที่ที่เลื่อนออกจากกันได้)
    const rows = await db.inspectionResult.findMany({
      where: { shopId: input.shopId, roomId: input.roomId, checkKey: input.checkKey },
      orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
      take: 2,
      select: RESULT_ROW_SELECT,
    })
    const usable = rows.map(toRow).filter((r): r is InspectionResultRow => r !== null)
    const latest = latestResultPerCheck(usable).get(resultScopeKey(input.checkKey, input.roomId)) ?? null

    const decision = decideResultWrite({
      latest,
      outcome: input.outcome,
      checkKey: input.checkKey,
      planStep: input.planStep,
      now: input.now,
      invalidation: input.invalidation ?? null,
    })

    if (decision.kind === 'CONFIRM') {
      // 🛑 UPDATE ได้แค่ 2 คอลัมน์นี้เท่านั้น — `outcome` และ `checkedAt` ห้ามแตะเด็ดขาด
      //    (แตะเมื่อไหร่ = เขียนทับประวัติ ซึ่งเป็นสิ่งที่ทั้งฟีเจอร์นี้ออกแบบมาไม่ให้เกิด)
      const updated = await db.inspectionResult.update({
        where: { id: decision.targetId },
        data: {
          lastConfirmedAt: decision.lastConfirmedAt,
          expiresAt: decision.expiresAt,
          ...(input.roundId !== undefined ? { roundId: input.roundId } : {}),
        },
        select: { id: true },
      })
      return { changed: false, resultId: updated.id }
    }

    const created = await db.inspectionResult.create({
      data: {
        shopId: input.shopId,
        roomId: input.roomId,
        checkKey: input.checkKey,
        roundId: input.roundId ?? null,
        outcome: input.outcome,
        checkedAt: decision.checkedAt,
        lastConfirmedAt: decision.lastConfirmedAt,
        expiresAt: decision.expiresAt,
        invalidatedAt: decision.invalidatedAt,
        invalidatedReason: decision.invalidatedReason,
        note: input.note ?? null,
      },
      select: { id: true },
    })
    return { changed: true, resultId: created.id }
  }

  if (tx) return run(tx)
  return prisma.$transaction(run)
}

/**
 * ทำให้ข้อ `photos_match` ของที่พักหลังหนึ่งเป็นโมฆะเพราะร้านเปลี่ยนภาพประกาศ (FR-INS-028)
 *
 * 🛑 ต้องเรียกใน **ทรานแซกชันเดียวกับที่อัปเดต `Room.images`** ไม่ใช่ให้ cron ตามเก็บ —
 *    ระหว่างที่ยังไม่ถูกทำเป็นโมฆะ ป้ายบนโปรไฟล์จะยืนยันว่าภาพชุดใหม่ "ตรงกับของจริง"
 *    ทั้งที่ไม่มีใครเคยเห็นภาพชุดนั้น
 *
 * 🛑 ตัวตัดสินว่า "ภาพเปลี่ยนจริงไหม" ต้องเทียบ **เนื้อหาแบบเซต** ไม่ใช่ "มีคีย์ images
 *    ส่งมาไหม" — `RoomForm` ส่งฟิลด์ images กลับมาทุกครั้งที่กดบันทึกแม้ร้านแก้แค่ราคา
 *    ถ้าใช้เกณฑ์ "มีคีย์" ป้ายรูปจะตกเป็นรอตรวจซ้ำตลอดกาลและไม่มีวันกลับมาเป็นผ่าน
 */
export async function invalidatePhotosMatchForRoom(
  args: { shopId: string; roomId: string; planStep: InspectionStep; now: Date },
  tx: Prisma.TransactionClient,
): Promise<RecordCheckOutcomeResult | null> {
  const rows = await tx.inspectionResult.findMany({
    where: { shopId: args.shopId, roomId: args.roomId, checkKey: 'photos_match' },
    orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: RESULT_ROW_SELECT,
  })
  const latest = rows[0]
  // ไม่เคยตรวจข้อนี้ = ไม่มีอะไรให้ทำให้เป็นโมฆะ (สถานะยังเป็น "ยังไม่มีข้อมูล" ซึ่งถูกแล้ว)
  if (!latest) return null
  // เป็นโมฆะอยู่แล้ว = ไม่ต้องเขียนซ้ำทุกครั้งที่ร้านกดบันทึก
  if (latest.invalidatedAt !== null) return null

  return recordCheckOutcome(
    {
      shopId: args.shopId,
      roomId: args.roomId,
      checkKey: 'photos_match',
      outcome: latest.outcome,
      planStep: args.planStep,
      now: args.now,
      invalidation: { at: args.now, reason: 'ROOM_IMAGES_CHANGED' },
    },
    tx,
  )
}

/**
 * คำนวณ `expiresAt` ของผลตรวจที่ยังมีผลอยู่ใหม่ เมื่อขั้นของแผนเปลี่ยน (TFR-002 · TFR-019)
 *
 * 🛑 อายุผลตรวจบางข้อ **ผูกกับขั้นของแผน ไม่ใช่ผูกกับตัวข้อตรวจอย่างเดียว** (ขั้น 4 ตรวจซ้ำ
 *    `video_tour`/`operating_evidence` ถี่กว่าขั้น 3) ⇒ ร้านที่อัปเกรดแล้วไม่คิดใหม่ จะได้
 *    ป้าย "ผ่าน" ที่อ้างอิงรอบตรวจถี่ของขั้นใหม่ ทั้งที่วันหมดอายุยังเป็นของขั้นเก่า
 *    = ขายความถี่ที่ไม่ได้ส่งมอบ
 *
 * 🛑 อยู่ในไฟล์นี้เพราะไฟล์นี้เป็น **ผู้เขียน `InspectionResult` เพียงรายเดียว** — ตัวนี้แตะ
 *    เฉพาะ `expiresAt` เท่านั้น (ชุดคอลัมน์เดียวกับที่ CONFIRM แตะได้) ห้ามขยายไปแตะ
 *    `outcome`/`checkedAt` เด็ดขาด มิฉะนั้นการอัปเกรดแผนจะเขียนประวัติย้อนหลัง
 */
export async function recomputeExpiryForPlanStep(
  client: Prisma.TransactionClient,
  shopId: string,
  planStep: InspectionStep,
): Promise<number> {
  const rows = await client.inspectionResult.findMany({
    where: { shopId, outcome: 'PASS', invalidatedAt: null },
    select: { id: true, checkKey: true, lastConfirmedAt: true, expiresAt: true },
  })

  let changed = 0
  for (const row of rows) {
    if (!isInspectionCheckKey(row.checkKey)) continue
    const next = computeExpiresAt(row.lastConfirmedAt, row.checkKey, planStep)
    if (row.expiresAt !== null && next.getTime() === row.expiresAt.getTime()) continue
    await client.inspectionResult.update({ where: { id: row.id }, data: { expiresAt: next } })
    changed += 1
  }
  return changed
}

// ─────────────────────────────────────────────────────────────────────────────
// หลักฐานที่ "ร้าน" เป็นคนส่งเอง (feature 00060 · T9 · API §4.5)
// ─────────────────────────────────────────────────────────────────────────────

export type InspectionEvidenceErrorCode =
  | 'UNKNOWN_CHECK_KEY'
  | 'CHECK_NOT_SELLER_SUPPLIED'
  | 'CHECK_SCOPE_MISMATCH'
  | 'ROOM_NOT_IN_SHOP'
  | 'CHECK_NOT_IN_ROUND'
  | 'FILE_NOT_COMMITTED'

export class InspectionEvidenceError extends Error {
  readonly code: InspectionEvidenceErrorCode
  constructor(code: InspectionEvidenceErrorCode) {
    super(code)
    this.name = 'InspectionEvidenceError'
    this.code = code
  }
}

/**
 * ผูกไฟล์ที่ commit แล้วเข้ากับข้อตรวจหนึ่งข้อ
 *
 * 🛑 **`visibility` เป็น `PRIVATE` ตายตัว ไม่รับจาก client** — ของที่ร้านส่งเองในกลุ่มนี้คือ
 *    บัตรประชาชน เซลฟี่ โฉนด สัญญาเช่า ใบอนุญาต ⇒ ทางที่ข้อมูลจะหลุดคือคำขอเดียวที่พิมพ์
 *    `"PUBLIC"` ไม่ใช่ช่องโหว่ที่ต้องหาให้เจอ (FR-INS-017)
 *
 * 🛑 **ผูกกับ "รอบที่เปิดอยู่" ของกลุ่ม `(roomId, step, method)` นั้น** — `InspectionEvidence.roundId`
 *    เป็น NOT NULL ตามสคีมา และนั่นถูกแล้วในเชิงความหมาย: หลักฐานที่ไม่ผูกรอบคือหลักฐานที่
 *    **ไม่มีผู้ตรวจคนไหนเห็น** ร้านจะอัปโหลดแล้วรอเก้อโดยไม่มีอะไรฟ้อง
 *    ⇒ ยังไม่มีรอบเปิด = `CHECK_NOT_IN_ROUND` (บอกตรง ๆ ว่ายังไม่ถึงรอบตรวจของข้อนี้)
 *    หมายเหตุ: สัญญาใน API.md §4.5 ไม่ได้พูดถึงรอบเลย — ข้อจำกัดนี้มาจากสคีมา T3 ต้องบันทึก
 *    กลับเข้าเอกสาร
 */
export async function attachSellerDocument(input: {
  shopId: string
  checkKey: string
  roomId: string | null
  fileId: string
  kind: 'DOCUMENT' | 'PHOTO'
}): Promise<{ evidenceId: string; checkKey: InspectionCheckKey; roomId: string | null; visibility: 'PRIVATE' }> {
  const { shopId, fileId, kind } = input
  const roomId = input.roomId ?? null

  // 1) allow-list 18 คีย์
  if (!isInspectionCheckKey(input.checkKey)) throw new InspectionEvidenceError('UNKNOWN_CHECK_KEY')
  const checkKey = input.checkKey

  // 2) ข้อนี้ร้านส่งเองได้ไหม — ข้อที่ผู้ตรวจเป็นคนเก็บหลักฐาน ร้านแนบเองแปลว่าร้านผลิต
  //    หลักฐานที่ตัวเองถูกตรวจ
  if (!isSellerSuppliable(checkKey)) throw new InspectionEvidenceError('CHECK_NOT_SELLER_SUPPLIED')

  // 3) scope ตรงกับการมี/ไม่มี roomId — ตรวจ **สองทิศ** (assertScopeMatches ทำให้แล้ว)
  try {
    assertScopeMatches(checkKey, roomId)
  } catch {
    throw new InspectionEvidenceError('CHECK_SCOPE_MISMATCH')
  }

  // 4) roomId ต้องเป็นห้องของร้านนี้ — scope ใน WHERE ไม่ใช่ดึงมาเทียบทีหลัง
  if (roomId !== null) {
    const room = await prisma.room.findFirst({ where: { id: roomId, shopId }, select: { id: true } })
    if (room === null) throw new InspectionEvidenceError('ROOM_NOT_IN_SHOP')
  }

  // 5) ไฟล์ต้อง commit จริงแล้ว — ตัวเลขที่ client แจ้งไม่ใช่หลักฐาน
  const meta = await getFileMeta(fileId)
  if (meta === null) throw new InspectionEvidenceError('FILE_NOT_COMMITTED')

  // 6) รอบที่เปิดอยู่ของข้อนี้
  const def = INSPECTION_CHECKS[checkKey]
  const round = await prisma.inspectionRound.findFirst({
    where: { shopId, roomId, step: def.step, method: def.method, completedAt: null },
    select: { id: true },
    orderBy: { assignedAt: 'asc' },
  })
  if (round === null) throw new InspectionEvidenceError('CHECK_NOT_IN_ROUND')

  const evidence = await prisma.inspectionEvidence.create({
    data: { roundId: round.id, kind, fileId, visibility: 'PRIVATE' },
    select: { id: true },
  })
  return { evidenceId: evidence.id, checkKey, roomId, visibility: 'PRIVATE' }
}
