/**
 * ขั้นงานของร้านบริการ — ไทล์ "งานบริการ" บนหน้าแรก + ตัวกรอง `/orders?work=` (user เคาะ 2026-10-10)
 *
 * 🛑 ตัวตัดสินเดียวของทั้งตัวนับและตัวกรอง — กดไทล์ที่บอก 5 ต้องเจอ 5 ใบ (บทเรียน Command Center)
 * แต่ละใบตกได้ขั้นเดียว (ไม่นับซ้ำ) · ใบที่จบแล้ว (ปิดงาน+ลูกค้ายืนยัน)/ยกเลิก/ร่าง/ไม่มาตามนัด = null
 *
 * feature 00073: "ปิดงาน" อ่านจาก Order.serviceClosedAt (ไม่ใช่ SHIPPED — ร้านบริการไม่มีขั้นนั้นแล้ว)
 * ลูกค้ายืนยันก่อนร้านปิด = รอปิดงาน (ร้านยังต้องปิดเพื่อให้ยอดเข้า)
 *
 * pure — ไม่ import prisma ใช้ได้ทั้ง server/client
 */
import { isAppointmentPast } from './appointments'

export const SERVICE_WORK_STAGES = ['AWAITING_SERVICE', 'APPT_CONFIRMED', 'AWAITING_CLOSE', 'AWAITING_BUYER'] as const
export type ServiceWorkStage = (typeof SERVICE_WORK_STAGES)[number]

// ป้ายอยู่ใน i18n dictionary (dashboard.workStage*) ไม่ใช่ค่าคงที่ระดับ module — กับดัก 00047 (ภาษาเดียวตลอด bundle)

/** นัดที่ยังรอผล — ร้านยังไม่กด "ให้บริการแล้ว"/"ไม่มาตามนัด" */
const OPEN_APPOINTMENT = new Set(['SCHEDULED', 'CONFIRMED_BY_BUYER', 'RESCHEDULE_REQUESTED'])

export function deriveServiceWorkStage(input: {
  status: string
  appointmentStatus: string | null | undefined
  serviceEnd: Date | string | null | undefined
  /**
   * feature 00073 — วันที่ร้านปิดงาน · **บังคับ** (ลืม select แล้ว compile ไม่ผ่าน)
   * ปิดแล้ว = ขั้น 3 ผ่านแล้ว ⇒ เหลือแค่รอลูกค้ายืนยัน (หรือจบ)
   */
  serviceClosedAt: Date | string | null
  now?: Date
}): ServiceWorkStage | null {
  const { status, appointmentStatus } = input
  if (status === 'CANCELLED' || status === 'DRAFTED' || status === 'RETURNED') return null
  // ไม่มาตามนัด = ร้านปิดงานแล้วแบบไม่ได้ให้บริการ — จบ ไม่มีอะไรรอใคร
  if (appointmentStatus === 'NO_SHOW') return null

  if (input.serviceClosedAt != null || appointmentStatus === 'COMPLETED') {
    // ปิดงานแล้ว: ลูกค้ายืนยันแล้ว = จบ · ยังไม่ยืนยัน = รอลูกค้ายืนยัน
    return status === 'CONFIRMED' ? null : 'AWAITING_BUYER'
  }

  // ยังไม่ปิด แต่ลูกค้ายืนยันรับบริการไปก่อนแล้ว ⇒ งานรอร้านปิด (ยอดยังไม่เข้าจนกว่าจะปิด)
  if (status === 'CONFIRMED') return 'AWAITING_CLOSE'
  if (appointmentStatus && OPEN_APPOINTMENT.has(appointmentStatus) && isAppointmentPast(input.serviceEnd, input.now)) {
    return 'AWAITING_CLOSE'
  }
  if (appointmentStatus === 'CONFIRMED_BY_BUYER') return 'APPT_CONFIRMED'
  return 'AWAITING_SERVICE'
}

export function isServiceWorkStage(v: string | null | undefined): v is ServiceWorkStage {
  return !!v && (SERVICE_WORK_STAGES as readonly string[]).includes(v)
}
