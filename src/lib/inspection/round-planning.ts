// round-planning.ts — ตัดสินว่า "ต้องเปิดรอบตรวจอะไรบ้างในรอบ cron นี้" (feature 00060 · T5)
//
// 🛑 นี่คือกลไกที่ทำให้คำว่า "ตรวจสอบอย่างต่อเนื่อง" เป็นความจริง ไม่ใช่คำโฆษณา
//
// ข้อตรวจของขั้น 1 มี cron ขยับ lastConfirmedAt ให้เองทุกวัน แต่ข้อของขั้น 2-4 ขยับได้
// **ต่อเมื่อมีรอบตรวจจริง** ซึ่งเป็นงานที่ต้องมีคนไปทำ ⇒ ถ้าไม่มีตัวเปิดรอบอัตโนมัติ
// ร้านที่จ่ายเงินต่อเนื่องจะเห็นป้ายตัวเองร่วงทีละข้อโดยไม่มีใครมาตรวจ **ระบบทำงานถูก
// ทุกบรรทัด ผ่านทุก gate error rate เป็น 0 สวยงาม แล้วฟีเจอร์เสื่อมเองใน 6-12 เดือน**
// ซึ่งนานเกินกว่าที่ใครจะโยงกลับมาถึงต้นเหตุ
// (คลาสเดียวกับ docs/conventions/rule-must-be-enforced-not-described.md)

import { INSPECTION_CHECKS, type InspectionCheckKey, type InspectionMethod, type InspectionStep } from './checks'

/**
 * ระยะเวลาที่ต้องเปิดรอบล่วงหน้าก่อนข้อตรวจหมดอายุ (วัน)
 *
 * ONSITE ยาวกว่าเพราะต้องจ้างผู้ตรวจท้องถิ่นรายครั้งและจัดการเดินทาง — ใช้ 14 เท่ากันหมด
 * จะทำให้ขั้นที่แพงที่สุดกลายเป็นขั้นเดียวที่ทำไม่ทันประจำ
 * AUTO ไม่เปิดรอบเลย เพราะ cron ตรวจเองอยู่แล้วทุกวัน
 */
export const ROUND_LEAD_DAYS: Record<InspectionMethod, number | null> = {
  AUTO: null,
  DOCUMENT: 14,
  VIDEO_CALL: 14,
  ONSITE: 30,
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * ชื่อที่ใส่ใน `InspectionRound.inspectorDisplayName` ตอนรอบยังไม่ถูกมอบหมาย
 * 🛑 คอลัมน์นั้น NOT NULL และเป็น **snapshot ชื่อ ณ รอบนั้น** ไม่ใช่ join สด ⇒ ต้องมีคำที่
 *    อ่านรู้เรื่องตั้งแต่แถวถูกสร้าง ไม่ใช่สตริงว่างที่หน้าจอต้องเดาความหมายเอาเอง
 *    (ถ้อยคำเดียวทั้งระบบ — คิวแอดมิน หน้าผู้ตรวจ และไทม์ไลน์ฝั่งร้าน ต้องอ่านตัวนี้)
 */
export const UNASSIGNED_INSPECTOR_NAME = 'ยังไม่ได้มอบหมาย'

/** ข้อตรวจหนึ่งข้อที่ใกล้ถึงกำหนดตรวจซ้ำ (หรือยังไม่เคยตรวจเลย) */
export type DueCheck = {
  roomId: string | null
  checkKey: InspectionCheckKey
  /** null = ยังไม่เคยตรวจข้อนี้เลย ⇒ ถึงกำหนดทันที */
  expiresAt: Date | null
}

/** รอบตรวจหนึ่งรอบที่ต้องเปิด */
export type PlannedRound = {
  roomId: string | null
  step: InspectionStep
  method: InspectionMethod
  /** เร็วที่สุดในกลุ่ม — รอบต้องเสร็จก่อนข้อที่ด่วนที่สุดหมดอายุ */
  dueAt: Date
  checkKeys: InspectionCheckKey[]
}

/** คีย์ที่ใช้ทั้งจัดกลุ่มและกันสร้างซ้ำ — ต้องเป็นตัวเดียวกันเสมอ (ดูเหตุผลใน planDueRounds) */
export function roundGroupKey(roomId: string | null, step: InspectionStep, method: InspectionMethod): string {
  return `${roomId ?? ''}::${step}::${method}`
}

export type PlanDueRoundsInput = {
  dueChecks: readonly DueCheck[]
  /** คีย์ของรอบที่ยังเปิดค้างอยู่ (completedAt IS NULL) — จาก roundGroupKey() */
  openRoundKeys: ReadonlySet<string>
  now: Date
}

/**
 * เลือกว่าจะเปิดรอบไหนบ้าง
 *
 * 🛑 **จัดกลุ่มเป็นรอบ ไม่ใช่รายข้อ** — การลงพื้นที่ครั้งเดียวครอบข้อของขั้น 4 ได้ 6 ข้อ
 *    ถ้าเปิดรายข้อจะได้ 6 รอบให้มอบหมาย 6 ครั้งสำหรับการเดินทางครั้งเดียว และตัวชี้วัด
 *    งานค้างจะอ่านผิดเป็นเท่าตัว
 *
 * 🛑 **คีย์จัดกลุ่มต้องรวม `method` ด้วย ไม่ใช่แค่ (roomId, step)** — สเปกเดิมเขียนคีย์
 *    กันซ้ำไว้เป็น (shopId, roomId, step) ซึ่งพังกับขั้นที่ 3 พอดี เพราะขั้นนั้นมี 2 วิธี
 *    ตรวจอยู่ด้วยกัน (`video_tour` = VIDEO_CALL · `operating_evidence` = DOCUMENT)
 *    ⇒ ถ้ากันซ้ำด้วย step อย่างเดียว รอบที่สองจะถูกข้ามตลอดกาล แล้ว `operating_evidence`
 *    จะไม่มีวันได้รอบของตัวเอง = หมดอายุค้างเป็น "รอตรวจซ้ำ" ตลอดไป ซึ่งคือบั๊กชนิดเดียว
 *    กับที่ทั้งไฟล์นี้ถูกสร้างมาเพื่อป้องกัน
 *
 * 🛑 **กันซ้ำด้วย "มีรอบเปิดค้างอยู่ไหม" ไม่ใช่ "วันนี้สร้างไปหรือยัง"** — รอบที่ค้าง
 *    ข้ามวันจะถูกสร้างซ้ำทุกวันจนคิวบวม
 */
export function planDueRounds(input: PlanDueRoundsInput): PlannedRound[] {
  const { dueChecks, openRoundKeys, now } = input
  const groups = new Map<string, PlannedRound>()

  for (const due of dueChecks) {
    const def = INSPECTION_CHECKS[due.checkKey]
    const lead = ROUND_LEAD_DAYS[def.method]
    if (lead === null) continue // AUTO — cron ตรวจเองทุกวัน ไม่ต้องเปิดรอบ

    // ยังไม่เคยตรวจเลย = ถึงกำหนดทันที · เคยตรวจแล้ว = ถึงกำหนดเมื่อเข้าช่วง lead time
    const dueAt = due.expiresAt ?? now
    if (due.expiresAt !== null && due.expiresAt.getTime() - now.getTime() > lead * MS_PER_DAY) continue

    const key = roundGroupKey(due.roomId, def.step, def.method)
    if (openRoundKeys.has(key)) continue // มีรอบเปิดค้างอยู่แล้ว

    const existing = groups.get(key)
    if (existing === undefined) {
      groups.set(key, { roomId: due.roomId, step: def.step, method: def.method, dueAt, checkKeys: [due.checkKey] })
      continue
    }
    existing.checkKeys.push(due.checkKey)
    // รอบต้องเสร็จก่อนข้อที่ด่วนที่สุดในกลุ่มหมดอายุ
    if (dueAt.getTime() < existing.dueAt.getTime()) existing.dueAt = dueAt
  }

  return [...groups.values()]
}

/**
 * รอบที่เลยกำหนดแล้วยังไม่เสร็จ
 * 🛑 รอบที่ไม่มี `dueAt` (สร้างด้วยมือแบบ ad-hoc) ไม่นับว่าเลยกำหนด — ไม่มีกำหนดให้เลย
 */
export function isRoundOverdue(round: { dueAt: Date | null; completedAt: Date | null }, now: Date): boolean {
  if (round.completedAt !== null) return false
  if (round.dueAt === null) return false
  return round.dueAt.getTime() < now.getTime()
}
