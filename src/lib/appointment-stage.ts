/**
 * appointment-stage — แกน "สถานะนัดหมาย" ของหน้า /orders สำหรับร้าน SERVICE_QUEUE (feature 00036)
 *
 * คู่ขนานกับ ShippingStageKey ใน order-stage.ts แบบตั้งใจ: ร้านขายออนไลน์ไล่ "ของอยู่ไหน"
 * ร้านคิวงานไล่ "นัดถึงขั้นไหน" — แต่ละร้านมีแกนเสริมได้แกนเดียว จึงไม่มีวันชนกันบนจอเดียว
 *
 * pure module — ห้าม import prisma/server-only (ใช้ทั้งฝั่ง server enrich และ client render)
 *
 * [สำคัญ] ฟังก์ชันในไฟล์นี้ต้องเป็นตัวเดียวที่ทั้ง "ตัวนับบนชิป/ดรอปดาวน์" และ "ตัวกรองในหน้ารายการ"
 * เรียกใช้ (BR-SOV-06) ถ้าแยกกันเขียนวันหนึ่งจะกดชิปที่บอก 5 แล้วเข้าไปเจอ 4 ใบโดยไม่มีอะไรเตือน —
 * บทเรียนตรงจาก deriveShippingStage (order-stage.ts บรรทัด 82-84)
 *
 * [สำคัญ] ข้อความของป้ายมาจาก APPOINTMENT_STATUS_LABEL ที่เดียว (BR-SOV-03) ที่นี่เติมแค่ cls/icon
 * ห้ามตั้งคำใหม่ — ปฏิทินคิวงานกับหน้านี้ต้องเรียกสถานะเดียวกันด้วยคำเดียวกัน
 */

import {
  APPOINTMENT_STATUS,
  APPOINTMENT_STATUS_LABEL,
  type AppointmentStatus,
} from './appointments'

/**
 * สีของแต่ละสถานะ — pattern เดียวกับ ORDER_STAGE_META (`bg-{semantic}/15 text-{semantic}-ink`)
 * ใช้ token "หมึก" เพราะสี semantic ของ Paces ถูกเลือกมาให้เป็น *พื้น* ไม่ใช่ *หมึก*
 * (`text-{semantic}` ตรงตัวตกคอนทราสต์ AA ทุกช่อง — วัดจริงไว้ที่ order-stage.ts บรรทัด 40-47)
 *
 * [สำคัญ] Verified-Means-Green (BR-SOV-07) — จุดที่ตัดสินใจสำคัญที่สุดของไฟล์นี้:
 *   COMPLETED = เขียว เพราะเป็นข้อเท็จจริงที่ผู้ขายยืนยันเองแล้วว่าให้บริการจริง
 *   CONFIRMED_BY_BUYER = ห้ามเขียว แม้ชื่อจะฟังดูเหมือน "ยืนยันแล้ว" — มันคือคำยืนยันของ *ผู้ซื้อ*
 *   ว่าจะมา ไม่ใช่สิ่งที่ *เกิดขึ้นแล้ว* (ยังไม่ถึงวันนัดด้วยซ้ำ) จึงใช้ primary = "กำลังเดินหน้า"
 *
 * ปฏิทินคิวงาน (queues/components/AppointmentCalendar.tsx) ถูกแก้ให้ใช้ชุดสีเดียวกันนี้แล้ว
 * (user เคาะ 2026-08-07) — เดิมปฏิทินให้ CONFIRMED_BY_BUYER เป็นเขียวและ COMPLETED เป็นเทา
 * ซึ่งขัดกับกฎข้างบนตรงตัว และทำให้จอเดียวกันของผู้ใช้พูดสีคนละภาษา
 *
 * ไอคอน: user เคาะชุดนี้ 2026-08-07 (HR12 ห้ามเดาเอง)
 */
export const APPOINTMENT_STAGE_META: Record<
  AppointmentStatus,
  { label: string; cls: string; icon: string }
> = {
  SCHEDULED: {
    label: APPOINTMENT_STATUS_LABEL.SCHEDULED,
    cls: 'bg-warning/15 text-warning-ink',
    icon: 'calendar-event',
  },
  CONFIRMED_BY_BUYER: {
    label: APPOINTMENT_STATUS_LABEL.CONFIRMED_BY_BUYER,
    cls: 'bg-primary/15 text-primary-ink',
    icon: 'calendar-check',
  },
  RESCHEDULE_REQUESTED: {
    label: APPOINTMENT_STATUS_LABEL.RESCHEDULE_REQUESTED,
    cls: 'bg-info/15 text-info-ink',
    icon: 'repeat',
  },
  COMPLETED: {
    label: APPOINTMENT_STATUS_LABEL.COMPLETED,
    cls: 'bg-success/15 text-success-ink',
    icon: 'circle-check-filled',
  },
  NO_SHOW: {
    label: APPOINTMENT_STATUS_LABEL.NO_SHOW,
    cls: 'bg-danger/15 text-danger-ink',
    icon: 'clock-off',
  },
}

/**
 * ลำดับที่ใช้เรียงชิป/ดรอปดาวน์ — เรียงตามเส้นทางที่นัดหนึ่งใบเดินจริง
 * (นัดแล้ว → ลูกค้ายืนยัน → [ขอเลื่อน] → จบด้วยให้บริการแล้ว/ไม่มาตามนัด)
 */
export const APPOINTMENT_STAGE_KEYS: readonly AppointmentStatus[] = [
  APPOINTMENT_STATUS.SCHEDULED,
  APPOINTMENT_STATUS.CONFIRMED_BY_BUYER,
  APPOINTMENT_STATUS.RESCHEDULE_REQUESTED,
  APPOINTMENT_STATUS.COMPLETED,
  APPOINTMENT_STATUS.NO_SHOW,
]

export function isAppointmentStatus(v: string | null | undefined): v is AppointmentStatus {
  return !!v && v in APPOINTMENT_STAGE_META
}

/**
 * แถวหนึ่งอยู่กองไหน — null = ไม่มีนัด (walk-in) ซึ่ง *ไม่ใช่* กองหนึ่ง แต่คือ "ไม่อยู่ในแกนนี้เลย"
 *
 * ตัดสินจาก serviceStart ก่อน appointmentStatus โดยตั้งใจ: appointmentStatus เป็นคอลัมน์ nullable
 * ที่ไม่มีอะไรบังคับว่าต้องมีคู่กับ serviceStart เสมอ — ตัวที่นิยาม "ใบนี้เป็นนัด" คือการมีช่วงเวลา
 * (เงื่อนไขเดียวกับที่ setAppointmentOutcome ใช้ตัดสิน 404 ที่ appointment.service.ts:319)
 * ใบที่มีนัดแต่ยังไม่มีสถานะ ถือเป็น SCHEDULED ตาม default เดียวกับปฏิทิน (AppointmentCalendar.tsx:273)
 */
export function deriveAppointmentStage(input: {
  serviceStart: Date | string | null | undefined
  appointmentStatus: string | null | undefined
}): AppointmentStatus | null {
  if (!input.serviceStart) return null
  return isAppointmentStatus(input.appointmentStatus)
    ? input.appointmentStatus
    : APPOINTMENT_STATUS.SCHEDULED
}

/**
 * นับจำนวนต่อกอง — ตัวเดียวกับที่ตัวกรองใช้ (BR-SOV-06)
 *
 * รับ stage ที่ derive มาแล้ว ไม่ใช่ row ดิบ เพื่อบังคับให้ผู้เรียกใช้ deriveAppointmentStage
 * ตัวเดียวกับที่ใช้กรอง — ปิดช่องที่จะเผลอนับจากเงื่อนไขอื่น
 */
export function countAppointmentStages(
  stages: readonly (AppointmentStatus | null)[],
): Record<AppointmentStatus, number> {
  const counts = {
    SCHEDULED: 0,
    CONFIRMED_BY_BUYER: 0,
    RESCHEDULE_REQUESTED: 0,
    COMPLETED: 0,
    NO_SHOW: 0,
  } satisfies Record<AppointmentStatus, number>
  for (const s of stages) if (s) counts[s] += 1
  return counts
}
