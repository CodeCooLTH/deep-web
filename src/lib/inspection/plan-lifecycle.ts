// plan-lifecycle.ts — วงจรชีวิตของแผนการตรวจสอบ + คีย์รอบโควตา (feature 00060 · T4)
//
// ส่วนที่ "ตัดสิน" แยกออกมาเป็นฟังก์ชันบริสุทธิ์ ส่วนที่ "ทำ" (หักเครดิต/เขียน DB) อยู่ที่ service
// เพราะลำดับการตัดสินในไฟล์นี้มีข้อที่ผิดแล้วเป็นเรื่องเงิน ไม่ใช่แค่เรื่องแสดงผล

import { thaiDayKey } from '@/lib/format-date'

/** รอบบิล 30 วันเท่ากับสินค้าตัวอื่นของร้าน (Business Package / Deep Stock) */
export const INSPECTION_RENEWAL_PERIOD_DAYS = 30

/**
 * วันผ่อนผันเมื่อเครดิตไม่พอ ก่อนแผนถูกปรับเป็น LAPSED
 * 🛑 ค่านี้ยังไม่เคาะ (อยู่ในรายการ "รอเคาะ" ของ PRD) — ตั้ง 7 ไว้เป็นค่าตั้งต้นให้ระบบเดินได้
 *    ห้ามอ้างตัวเลขนี้เป็นมติ และห้ามคัดลอกไปเขียนซ้ำที่อื่น
 */
export const INSPECTION_GRACE_DAYS = 7

const MS_PER_DAY = 24 * 60 * 60 * 1000
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * MS_PER_DAY)

/**
 * คีย์รอบโควตารายเดือน "YYYY-MM"
 *
 * 🛑 ตัดเดือนด้วย **เวลาไทย** ไม่ใช่ UTC — ร้านที่กดสมัครเวลา 00:00-07:00 น. ของวันที่ 1
 *    จะตกไปนับเป็นโควตาของเดือนก่อนหน้าถ้าใช้ UTC ซึ่งเดือนนั้นอาจเต็มไปแล้ว
 *    (คลาสเดียวกับบั๊กที่ 00033 §5.3 เจอกับการตัดวันของยอดขาย)
 */
export function intakePeriodKey(at: Date): string {
  return thaiDayKey(at).slice(0, 7)
}

/** คีย์ของเดือนถัดไป — cron ใช้สร้างแถวโควตาล่วงหน้า */
export function nextIntakePeriodKey(at: Date): string {
  const [y, m] = intakePeriodKey(at).split('-').map(Number)
  const ny = m === 12 ? y! + 1 : y!
  const nm = m === 12 ? 1 : m! + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/**
 * เวลาที่โควตารอบถัดไปจะเปิด = **เที่ยงคืนวันที่ 1 ของเดือนถัดไป ตามเวลาไทย**
 *
 * 🛑 ต้องคืนค่านี้คู่กับข้อความ "เต็มแล้ว" เสมอ (AC-INS-09-2) — การบอกว่าเต็มเฉย ๆ คือการ
 *    ปล่อยให้คนรอโดยไม่มีกำหนด · ครอบกรณี "ยังไม่มีแถวโควตา" ด้วย เพราะ cron เป็นคนสร้าง
 *    แถวของเดือนถัดไปให้เอง
 *
 * 🛑 ตัดเดือนด้วยเวลาไทย (UTC+7) ไม่ใช่ UTC — ไม่งั้นวันที่ 1 ช่วง 00:00-07:00 น. จะคำนวณ
 *    เป็นเดือนก่อนหน้า แล้วบอกวันเปิดรับที่ผ่านไปแล้ว
 */
const THAI_UTC_OFFSET_MS = 7 * 60 * 60 * 1000

export function nextIntakeOpensAt(at: Date): Date {
  const [y, m] = nextIntakePeriodKey(at).split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, 1) - THAI_UTC_OFFSET_MS)
}

/**
 * วันที่เหลือของช่วงผ่อนผัน — AC-INS-08-3 บังคับว่าร้านต้อง **เห็นการนับถอยหลัง** ไม่ใช่แค่รู้ว่าค้าง
 *
 * 🛑 ปัดขึ้น (`ceil`) โดยตั้งใจ — เหลือ 6 ชั่วโมงต้องอ่านว่า "เหลือ 1 วัน" ไม่ใช่ "0 วัน"
 *    (ศูนย์อ่านได้ว่า "หมดแล้ว" ทั้งที่ยังจ่ายทัน) · เลยเส้นตายแล้วคืน 0 ไม่ใช่เลขติดลบ
 */
export function graceDaysRemaining(graceUntil: Date, now: Date): number {
  const ms = graceUntil.getTime() - now.getTime()
  return ms <= 0 ? 0 : Math.ceil(ms / MS_PER_DAY)
}

export type PlanRenewalDecision =
  | { kind: 'NOOP' }
  /** ครบรอบแล้วและเครดิตพอ → ต่ออายุ */
  | { kind: 'RENEW'; currentPeriodStart: Date; nextRenewalAt: Date }
  /** เครดิตไม่พอครั้งแรก → เริ่มนับผ่อนผัน (ยังไม่ตัดป้าย) */
  | { kind: 'START_GRACE'; graceUntil: Date }
  /** พ้นสถานะแล้ว */
  | { kind: 'LAPSE'; reason: 'OWNER_CANCELLED' | 'RENEWAL_FAILED' }

export type PlanRenewalInput = {
  status: 'ACTIVE' | 'LAPSED'
  nextRenewalAt: Date
  /** OWNER กดยกเลิกแล้วแต่ยังไม่ถึงสิ้นรอบบิล */
  canceledAt: Date | null
  /** เส้นตายผ่อนผันที่ตั้งไว้แล้วจากรอบก่อน */
  graceUntil: Date | null
  /** เครดิตในกระเป๋าพอจ่ายค่ารอบถัดไปไหม — service เป็นคนถาม ไม่ใช่ฟังก์ชันนี้ */
  hasEnoughCredit: boolean
  now: Date
}

/**
 * ตัดสินว่ารอบ cron นี้ต้องทำอะไรกับแผนหนึ่งแผน
 *
 * 🛑 **ลำดับสำคัญ: เช็ค "ยกเลิกแล้ว" ก่อนเช็คเครดิตเสมอ** — สลับเมื่อไหร่ระบบจะหักเงิน
 *    ร้านที่กดยกเลิกไปแล้วสำหรับรอบที่เขาไม่ต้องการ ซึ่งเป็นการเก็บเงินโดยไม่มีสิทธิ์
 *    ไม่ใช่แค่บั๊กแสดงผล และร้านจะรู้ตัวก็ต่อเมื่อเปิดดูกระเป๋าเครดิตเอง
 *
 * 🛑 การยกเลิก **มีผลตอนสิ้นรอบบิล ไม่ใช่ทันที** (AC-INS-26-3) — ระหว่าง canceledAt
 *    ถึง nextRenewalAt สถานะยังเป็น ACTIVE และป้ายยังแสดงตามปกติ เพราะร้านจ่ายเงิน
 *    ค่ารอบนั้นไปแล้ว
 */
export function decidePlanRenewal(input: PlanRenewalInput): PlanRenewalDecision {
  const { status, nextRenewalAt, canceledAt, graceUntil, hasEnoughCredit, now } = input
  if (status !== 'ACTIVE') return { kind: 'NOOP' }

  // อยู่ในช่วงผ่อนผันที่ตั้งไว้แล้ว — ตัดสินด้วยเส้นตาย ไม่ใช่ด้วยรอบบิล
  if (graceUntil !== null) {
    if (hasEnoughCredit) {
      return { kind: 'RENEW', currentPeriodStart: now, nextRenewalAt: addDays(now, INSPECTION_RENEWAL_PERIOD_DAYS) }
    }
    if (graceUntil.getTime() < now.getTime()) return { kind: 'LAPSE', reason: 'RENEWAL_FAILED' }
    return { kind: 'NOOP' }
  }

  // ยังไม่ถึงรอบ
  if (nextRenewalAt.getTime() > now.getTime()) return { kind: 'NOOP' }

  // 🛑 ต้องมาก่อนการเช็คเครดิต — ห้ามหักเงินร้านที่กดยกเลิกไปแล้ว
  if (canceledAt !== null) return { kind: 'LAPSE', reason: 'OWNER_CANCELLED' }

  if (hasEnoughCredit) {
    return { kind: 'RENEW', currentPeriodStart: now, nextRenewalAt: addDays(now, INSPECTION_RENEWAL_PERIOD_DAYS) }
  }
  return { kind: 'START_GRACE', graceUntil: addDays(now, INSPECTION_GRACE_DAYS) }
}

/** ผลของการจองสิทธิ์โควตา — แยก "เต็ม" ออกจาก "ยังไม่เปิดรับ" โดยเจตนา */
export type IntakeAvailability = 'OPEN' | 'FULL' | 'NOT_OPEN'

/**
 * 🛑 ไม่มีแถวโควตาของเดือนนั้น = **ยังไม่เปิดรับ** ไม่ใช่ "เต็มแล้ว" และไม่ใช่ "ไม่จำกัด"
 *
 * fail-closed ถูกต้องแล้ว (ห้ามตีเป็นไม่จำกัด) แต่ถ้าแสดงข้อความว่า "เต็มแล้ว" มันจะเป็น
 * **การโกหกด้วยความจริง**: วันที่ทีมลืมตั้งโควตา ทุกขั้นจะขึ้นว่าเต็มทั้งที่ยังไม่มีใคร
 * สมัครสักคน และจะไม่มีใครเอะใจไปสืบต่อ
 * (คลาสเดียวกับ docs/conventions/partial-data-must-be-labeled-or-filled.md — `0` ที่แปลว่า
 *  "ยังไม่รู้" ห้ามแสดงเป็น `0` ที่แปลว่า "ไม่มี")
 */
export function intakeAvailability(quota: { capacity: number; usedCount: number } | null): IntakeAvailability {
  if (quota === null) return 'NOT_OPEN'
  return quota.usedCount < quota.capacity ? 'OPEN' : 'FULL'
}
