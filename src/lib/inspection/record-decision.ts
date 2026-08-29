// record-decision.ts — ตัดสินว่า "การตรวจครั้งนี้ต้องเขียนอะไรลงฐานข้อมูล" (feature 00060 · T6)
//
// แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพราะตรรกะนี้คือจุดที่พังแล้วเงียบที่สุดของทั้งฟีเจอร์:
// ตัดสินผิดทาง "ยืนยันซ้ำ" กลายเป็น "แถวใหม่" → ไทม์ไลน์ของข้อขั้น 1 จะมี 365 บรรทัด
// เหมือนกันทุกตัวอักษรต่อปี กลบรอบที่มีความหมายจนหมด (ไทม์ไลน์คือตัวสินค้าของฟีเจอร์นี้)
// ตัดสินผิดอีกทาง "ผลเปลี่ยน" กลายเป็น "ยืนยันซ้ำ" → ประวัติหาย ขัด AC-INS-16-3/27-1
//
// ทั้งสองทางไม่มี error ไม่มี type ผิด ไม่มี gate ไหนจับได้ — ต้องพิสูจน์ด้วยเทส + mutation
// (docs/conventions/ui-boolean-needs-a-testable-home.md: เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม"
//  แต่คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม")

import { computeExpiresAt, type InspectionCheckKey, type InspectionStep } from './checks'
import type { InspectionOutcome, InspectionResultRow } from './result-status'

export type ResultWriteDecision =
  | {
      /** สร้างแถวใหม่ = มีข้อมูลใหม่ให้ผู้ซื้ออ่าน ⇒ ปรากฏในไทม์ไลน์ */
      kind: 'INSERT'
      checkedAt: Date
      lastConfirmedAt: Date
      expiresAt: Date
      invalidatedAt: Date | null
      invalidatedReason: string | null
    }
  | {
      /** ยืนยันผลเดิม = ไม่มีข้อมูลใหม่ ⇒ ไม่ปรากฏในไทม์ไลน์ แต่ป้าย "ตรวจล่าสุด" ขยับ */
      kind: 'CONFIRM'
      targetId: string
      lastConfirmedAt: Date
      expiresAt: Date
    }

export type DecideResultWriteInput = {
  /** แถวล่าสุดของ (checkKey, roomId) นี้ — ต้องผ่าน latestResultPerCheck() มาแล้ว */
  latest: InspectionResultRow | null
  outcome: InspectionOutcome
  checkKey: InspectionCheckKey
  /** ขั้นของแผน ณ เวลาที่บันทึก — มีผลต่ออายุผลตรวจ (AC-INS-06-1) */
  planStep: InspectionStep
  /** ห้ามเรียก new Date() ในฟังก์ชัน — ไม่งั้นเทสค่าขอบเขียนไม่ได้ */
  now: Date
  /**
   * ระบุเมื่อการเขียนครั้งนี้เกิดจาก "ข้อมูลต้นทางเปลี่ยน" ไม่ใช่การตรวจตามรอบ
   * เช่นร้านเปลี่ยนภาพประกาศ (FR-INS-028) — บังคับให้เป็น INSERT เสมอแม้ผลจะเหมือนเดิม
   */
  invalidation?: { at: Date; reason: string } | null
}

/**
 * กติกา (TFR-005 — สองทรานซิชันที่ห้ามสับสนกัน)
 *
 * | | ยืนยันซ้ำ (ผลเดิม) | ผลเปลี่ยน |
 * | การเขียน | UPDATE แถวล่าสุด | INSERT แถวใหม่ |
 * | checkedAt | ไม่แตะ | = now |
 * | lastConfirmedAt | = now | = now |
 * | expiresAt | = now + ttlDays | = now + ttlDays |
 * | ไทม์ไลน์สาธารณะ | ไม่ปรากฏ | ปรากฏ |
 *
 * 🛑 `outcome` ของแถวเดิมไม่เคยถูก UPDATE ทับด้วยค่าอื่น — การเปลี่ยนผลคือการเขียนแถวใหม่เสมอ
 *    คอลัมน์ที่ UPDATE ได้มีแค่ `lastConfirmedAt` กับ `expiresAt` เท่านั้น
 */
export function decideResultWrite(input: DecideResultWriteInput): ResultWriteDecision {
  const { latest, outcome, checkKey, planStep, now } = input
  const invalidation = input.invalidation ?? null
  const expiresAt = computeExpiresAt(now, checkKey, planStep)

  const insert = (): ResultWriteDecision => ({
    kind: 'INSERT',
    checkedAt: now,
    lastConfirmedAt: now,
    expiresAt,
    invalidatedAt: invalidation?.at ?? null,
    invalidatedReason: invalidation?.reason ?? null,
  })

  // ตรวจครั้งแรกของข้อนี้
  if (latest === null) return insert()

  // ข้อมูลต้นทางเปลี่ยน (เช่นร้านเปลี่ยนภาพประกาศ) = เหตุการณ์จริงที่ผู้ซื้อควรเห็นในไทม์ไลน์
  // ⇒ INSERT เสมอแม้ผลจะเหมือนเดิม ไม่ใช่ UPDATE แถวเก่าให้กลายเป็นโมฆะ
  if (invalidation !== null) return insert()

  // ผลเปลี่ยน = ข้อมูลใหม่ ⇒ เขียนแถวใหม่ ห้าม UPDATE ทับ outcome เดิม (ประวัติจะหาย)
  if (latest.outcome !== outcome) return insert()

  // 🛑 แถวเดิมเป็นโมฆะอยู่แล้ว (สถานะที่แสดงคือ "รอตรวจซ้ำ") แล้วตรวจใหม่ได้ผลเดิม
  //    = การกลับมาผ่านอีกครั้ง ซึ่งเป็นข้อเท็จจริงใหม่ที่ผู้ซื้อควรเห็น ⇒ INSERT
  //    ถ้า CONFIRM ทับแถวเดิม แถวนั้นจะยังมี invalidatedAt ค้างอยู่ = สถานะไม่มีวันกลับเป็น
  //    "ผ่าน" อีกเลยไม่ว่าจะตรวจซ้ำกี่ครั้ง (สเปกไม่ได้เขียนเคสนี้ไว้ตรง ๆ — ตัดสินตามผลลัพธ์)
  if (latest.invalidatedAt !== null) return insert()

  // ผลเดิมทุกประการ = ไม่มีอะไรใหม่ให้ผู้ซื้ออ่าน ⇒ เลื่อนเวลาอย่างเดียว ไม่สร้างประวัติ
  return { kind: 'CONFIRM', targetId: latest.id, lastConfirmedAt: now, expiresAt }
}
