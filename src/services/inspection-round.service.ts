import 'server-only'

import type { Prisma } from '@prisma/client'
import {
  INSPECTION_CHECKS,
  checkScope,
  checksForStep,
  type InspectionCheckKey,
  type InspectionStep,
} from '@/lib/inspection/checks'
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
 * รอบนี้มีเฉพาะ `createDueRoundsForShop()` ซึ่งเป็นชิ้นที่ T4 ต้องใช้จริงตอนสมัคร/อัปเกรด
 * (ร้านที่เพิ่งจ่ายเงินต้องมีคิวตรวจทันที ไม่ใช่รอ cron รอบถัดไปอีกไม่เกิน 24 ชม.)
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
