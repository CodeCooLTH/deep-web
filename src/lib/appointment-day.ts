/**
 * appointment-day — SSOT ของคำว่า "นัดของวันนี้" (feature 00024 ส่วนขยาย 2026-08-10)
 *
 * pure module — ห้าม import prisma/server-only (ใช้ทั้งฝั่ง server ที่ประกอบ where และฝั่ง client
 * ที่กรองแถวในตาราง)
 *
 * ทำไมต้องมี: ไทล์ "นัดวันนี้" บนหน้าแรกลิงก์เข้า `/orders?apptDay=today` แล้ว ตัวเลขบนไทล์กับ
 * จำนวนแถวที่กรองได้ต้องตรงกันเสมอ (BR-SOV-06 — บทเรียนจาก deriveShippingStage ที่เคยนับด้วย SQL
 * แล้วกรองด้วย TS จนกดไทล์ที่บอก 5 เข้าไปเจอ 4). ตัวนับอยู่ฝั่ง DB ส่วนตัวกรองอยู่ฝั่ง client
 * จึงใช้ "ฟังก์ชันเดียวกัน" ตรง ๆ ไม่ได้ — ที่ทำได้คือให้ทั้งคู่ประกอบจาก **นิยามเดียว** ในไฟล์นี้
 * แล้วผูกเทส `[blocker]` ที่เดินทั้งสองทางบน fixture ชุดเดียวกันไว้กันเพี้ยน
 *
 * 🛑 นิยามนี้แก้ความไม่ตรงที่มีอยู่ก่อนแล้ว: `getTodayAppointmentCount` เดิมคัดด้วย
 *   `serviceResourceId != null` ส่วนแถวใน /orders คัดด้วย `serviceStart` (ตาม deriveAppointmentStage)
 *   → นัดที่ resource ถูกถอดออกภายหลังจะนับไม่เท่ากันทั้งที่เป็นใบเดียวกัน. ยึด **serviceStart**
 *   ทั้งคู่ (เกณฑ์เดียวกับที่ใช้นิยามคำว่า "ใบนี้เป็นนัด" ทั้งระบบ — appointment-stage.ts:89-92)
 */

import { thaiMidnightUtc, todayThaiIsoDate } from './date-range'

/** ค่าที่ `?apptDay=` รับได้ — มีค่าเดียวเพราะยังไม่มีใครขอ "พรุ่งนี้/สัปดาห์นี้" */
export const APPOINTMENT_DAY_KEYS = ['today'] as const
export type AppointmentDayKey = (typeof APPOINTMENT_DAY_KEYS)[number]

export function isAppointmentDayKey(v: string | null | undefined): v is AppointmentDayKey {
  return !!v && (APPOINTMENT_DAY_KEYS as readonly string[]).includes(v)
}

/**
 * ขอบวันตามปฏิทินไทย [from, to) ของคีย์ที่รับมา
 *
 * ห้ามตัดวันด้วย UTC — บทเรียน 00033: /sales กับ /orders เคยตัดคนละแบบกับ dashboard
 * แล้วตัวเลขสองหน้าไม่ตรงกันทั้งที่คำนวณจากข้อมูลชุดเดียวกัน
 *
 * `now` รับเข้ามาได้เพื่อให้เทสกำหนดเวลาเองได้ (ไม่ส่ง = เวลาจริง)
 */
export function appointmentDayBounds(
  key: AppointmentDayKey,
  now?: Date,
): { from: Date; to: Date } {
  // ตอนนี้มีคีย์เดียว — เมื่อเพิ่มคีย์ใหม่ให้ switch ที่นี่ที่เดียว ห้ามคำนวณขอบวันที่อื่น
  void key
  const iso = todayThaiIsoDate(now)
  const [y, m, d] = iso.split('-').map(Number)
  const from = thaiMidnightUtc(y, m - 1, d)
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) }
}

/**
 * where fragment สำหรับ prisma.order — ต้อง **มิเรอร์** `appointmentOverlapsDay` บรรทัดต่อบรรทัด
 *
 * เขียนเป็น OR สองสาขาเพราะข้อมูลเก่าบางแถวไม่มี `serviceEnd` (ฟีเจอร์ช่วงเวลามาทีหลัง) —
 * สาขาบน = นัดที่มีช่วงเวลาจริง (คาบเกี่ยววันนั้นแบบ half-open) · สาขาล่าง = นัดที่มีแต่จุดเริ่ม
 * ซึ่งถือว่าอยู่ในวันที่จุดนั้นตกอยู่
 *
 * ประกาศ return เป็น object ธรรมดา (ไม่ผูก type ของ Prisma) เพื่อให้ไฟล์นี้ยังเป็น pure module
 * ที่ client import ได้ — ผู้เรียกฝั่ง server spread เข้า where ของตัวเองได้เลย
 */
export function appointmentDayWhere(key: AppointmentDayKey, now?: Date) {
  const { from, to } = appointmentDayBounds(key, now)
  return {
    serviceStart: { not: null },
    status: { not: 'CANCELLED' },
    OR: [
      { serviceEnd: { gt: from }, serviceStart: { lt: to } },
      { serviceEnd: null, serviceStart: { gte: from, lt: to } },
    ],
  }
  // ไม่ใส่ `as const` โดยตั้งใจ — Prisma รับ `OrderWhereInput[]` ที่เป็น mutable array
  // ถ้าตรึงเป็น readonly tuple จะ assign เข้า where ไม่ได้ (TS2322)
}

/**
 * predicate ฝั่ง client — ต้องให้ผลเท่ากับ `appointmentDayWhere` ทุกกรณี
 *
 * รับ ISO string (รูปที่แถวในตารางถืออยู่จริง) หรือ Date ก็ได้ · `status` ไม่บังคับเพราะบางผู้เรียก
 * กรองใบยกเลิกทิ้งไปก่อนแล้ว — ส่งมาก็ตัดให้ ไม่ส่งก็ไม่ตัด (ห้ามเดาว่าใบนั้นไม่ใช่ CANCELLED)
 */
export function appointmentOverlapsDay(
  row: {
    startISO: string | Date | null | undefined
    endISO: string | Date | null | undefined
    status?: string | null
  },
  key: AppointmentDayKey,
  now?: Date,
): boolean {
  if (!row.startISO) return false
  if (row.status === 'CANCELLED') return false

  const start = new Date(row.startISO).getTime()
  if (Number.isNaN(start)) return false

  const { from, to } = appointmentDayBounds(key, now)
  const fromMs = from.getTime()
  const toMs = to.getTime()

  if (row.endISO == null) return start >= fromMs && start < toMs

  const end = new Date(row.endISO).getTime()
  // endISO ที่ parse ไม่ได้ = ข้อมูลเสีย ถอยไปใช้สาขา "มีแต่จุดเริ่ม" (เท่ากับที่ DB ทำกับ null)
  if (Number.isNaN(end)) return start >= fromMs && start < toMs

  return start < toMs && end > fromMs
}
