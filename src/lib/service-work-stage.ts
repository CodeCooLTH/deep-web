/**
 * ขั้นงานของร้านบริการ — ไทล์ "งานบริการ" บนหน้าแรก + ตัวกรอง `/orders?work=` (user เคาะ 2026-10-10)
 *
 * 🛑 ตัวตัดสินเดียวของทั้งตัวนับและตัวกรอง — กดไทล์ที่บอก 5 ต้องเจอ 5 ใบ (บทเรียน Command Center)
 * แต่ละใบตกได้ขั้นเดียว (ไม่นับซ้ำ) · ใบที่ปิดแล้ว/ยกเลิก/ร่าง/ไม่มาตามนัด = null (ไม่อยู่ในไทล์ไหน)
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
  now?: Date
}): ServiceWorkStage | null {
  const { status, appointmentStatus } = input
  // ร้านเริ่ม/ให้บริการแล้ว (SHIPPED = fulfillLabel "เริ่มให้บริการแล้ว") แต่ลูกค้ายังไม่กดยืนยัน
  if (status === 'SHIPPED' || (status === 'PENDING' && appointmentStatus === 'COMPLETED')) return 'AWAITING_BUYER'
  if (status !== 'PENDING') return null
  if (appointmentStatus === 'NO_SHOW') return null
  if (appointmentStatus && OPEN_APPOINTMENT.has(appointmentStatus) && isAppointmentPast(input.serviceEnd, input.now)) {
    return 'AWAITING_CLOSE'
  }
  if (appointmentStatus === 'CONFIRMED_BY_BUYER') return 'APPT_CONFIRMED'
  return 'AWAITING_SERVICE'
}

export function isServiceWorkStage(v: string | null | undefined): v is ServiceWorkStage {
  return !!v && (SERVICE_WORK_STAGES as readonly string[]).includes(v)
}
