// round-completion.ts — เกณฑ์ปิดรอบตรวจ (feature 00060 · T5)
//
// 🛑 **เกณฑ์คือ `lastConfirmedAt >= assignedAt` ไม่ใช่ "มีแถวผลที่ roundId = รอบนี้"** (TD-018)
//
//    รอบที่ตรวจแล้วได้ผล **เหมือนเดิม** จะไม่ผลิตแถวใหม่เลยสักแถว (TD-002 — ผลเดิมที่ยืนยันซ้ำ
//    เป็น UPDATE ที่เลื่อน lastConfirmedAt ในที่) และนั่นคือ **ผลลัพธ์ปกติของร้านที่ดี**
//    ไม่ใช่เคสขอบ ⇒ เกณฑ์ที่มองหา roundId จะปิดรอบไม่ได้ตลอดกาล แล้วเกิดลูกโซ่:
//      ปิดรอบไม่ได้ → completedAt ค้าง null → ตัวกันสร้างซ้ำเห็นว่ายังมีรอบเปิดอยู่
//      → ไม่สร้างรอบถัดไป → **การตรวจของร้านนั้นหยุดถาวร** โดยทุกจอดูปกติทุกประการ
//
// แยกเป็นฟังก์ชันบริสุทธิ์เพราะเป็นตรรกะที่เขียนกลับด้านได้ง่ายและกลับด้านแล้วไม่มีอะไรฟ้อง
// (docs/conventions/ui-boolean-needs-a-testable-home.md — เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม"
//  แต่คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม")

import type { InspectionCheckKey } from './checks'
import type { InspectionResultRow } from './result-status'

export type RoundCompletionDecision =
  | { ok: true }
  /** รอบที่ไม่ครอบข้อตรวจใดเลย — ปิดไม่ได้ เพราะการปิดจะแปลว่า "ตรวจแล้ว" ทั้งที่ไม่มีอะไรถูกตรวจ */
  | { ok: false; reason: 'NO_CHECKS'; missing: InspectionCheckKey[] }
  | { ok: false; reason: 'NOT_CONFIRMED'; missing: InspectionCheckKey[] }

export type RoundCompletionInput = {
  /** ข้อตรวจที่รอบนี้ครอบ — มาจาก checkKeysOfRound() ไม่ใช่จากสิ่งที่ผู้ตรวจบังเอิญกดบันทึก */
  requiredChecks: readonly InspectionCheckKey[]
  /** แถวล่าสุดต่อข้อ (null/ไม่มีคีย์ = ยังไม่เคยมีผลของข้อนั้นเลย) */
  latestByCheck: ReadonlyMap<InspectionCheckKey, InspectionResultRow | null>
  /** เวลาที่รอบนี้ "เปิด/เข้าคิว" — คอลัมน์ assignedAt ตั้งตอนสร้างแถวและห้ามเขียนทับตอนมอบหมาย */
  assignedAt: Date
}

/**
 * รอบนี้ปิดได้หรือยัง
 *
 * 🛑 ข้อที่ถูกยืนยัน "ก่อน" รอบเปิด ไม่นับ — ไม่งั้นรอบที่เปิดเพราะผลใกล้หมดอายุจะปิดตัวเอง
 *    ได้ทันทีด้วยผลชุดเดิมที่เป็นเหตุให้ต้องเปิดรอบตั้งแต่แรก (ตรวจซ้ำจะไม่เคยเกิดขึ้นเลย)
 *
 * 🛑 ผลที่ถูก invalidate หลังการยืนยันในรอบนี้ยังนับว่า "รอบนี้ทำงานเสร็จแล้ว" — ผู้ตรวจตรวจจริง
 *    และมีหลักฐานจริง สิ่งที่เกิดทีหลัง (ร้านเปลี่ยนภาพ) เป็นเหตุการณ์ใหม่ที่จะเปิดรอบใหม่เอง
 *    ถ้าหักล้างย้อนหลัง รอบจะค้างเปิดโดยที่ไม่มีงานอะไรให้ผู้ตรวจทำเพิ่มได้อีก
 */
export function decideRoundCompletion(input: RoundCompletionInput): RoundCompletionDecision {
  const { requiredChecks, latestByCheck, assignedAt } = input
  if (requiredChecks.length === 0) return { ok: false, reason: 'NO_CHECKS', missing: [] }

  const missing: InspectionCheckKey[] = []
  for (const checkKey of requiredChecks) {
    const row = latestByCheck.get(checkKey) ?? null
    // เทียบด้วย `<` (ไม่ใช่ `<=`) — ยืนยันในวินาทีเดียวกับที่รอบเปิดพอดี ถือว่าอยู่ในรอบนี้
    if (row === null || row.lastConfirmedAt.getTime() < assignedAt.getTime()) missing.push(checkKey)
  }
  return missing.length === 0 ? { ok: true } : { ok: false, reason: 'NOT_CONFIRMED', missing }
}
