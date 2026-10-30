/**
 * order-form-arrival — การตัดสินใจของฟอร์มสร้างออเดอร์ร้านบริการเรื่อง "ลูกค้ามาแบบไหน" (feature 00086 P2-T4)
 *
 * 🛑 ทุก boolean ที่ตัดสินว่าฟอร์มจะ "เปลี่ยนหน้าตา/ส่งอะไร" อยู่ที่นี่ ไม่ใช่ในเทอร์นารีกลาง JSX
 * (docs/conventions/ui-boolean-needs-a-testable-home.md) — ถ้าเขียนกลับด้าน ผลคือหน้าแก้ไขออเดอร์
 * หรือร้านที่ไม่ใช่บริการได้ฟอร์มใหม่ไปด้วย ซึ่ง tsc/build ไม่มีทางจับได้
 *
 * แยกจาก `src/lib/arrival-mode.ts` โดยตั้งใจ: ไฟล์นั้นตอบ "ออเดอร์ที่บันทึกแล้ว มาแบบไหน" (อ่าน)
 * ไฟล์นี้ตอบ "ฟอร์มกำลังจะส่งอะไร" (เขียน) — คำบนจอของ 2 ค่าที่ผู้ขายเลือกได้ใช้ชุดเดียวกับ
 * ป้ายของออเดอร์ที่บันทึกแล้ว ("จองล่วงหน้า" / "หน้าร้าน")
 */

import { walkInWindow } from './appointments'
import { formatTimeHM } from './format-date'
import { ARRIVAL_MODE_META } from './arrival-mode'

/** ค่าที่ผู้ขายเลือกได้ในฟอร์ม — `UNSCHEDULED` ไม่ใช่ตัวเลือก (เป็นผลของการ "ไม่ส่งนัด" เท่านั้น) */
export type OrderArrivalChoice = 'BOOKED' | 'WALK_IN'

export const DEFAULT_ARRIVAL_CHOICE: OrderArrivalChoice = 'BOOKED'

/** ป้ายของปุ่มเลือก 2 ใบ (prototype v13) */
export const ARRIVAL_CHOICE_COPY: Record<OrderArrivalChoice, { title: string; hint: string; icon: string }> = {
  BOOKED: { title: 'จองล่วงหน้า', hint: 'นัดวันและเวลา', icon: 'calendar-event' },
  WALK_IN: { title: 'หน้าร้าน', hint: 'ลูกค้าอยู่ที่ร้านตอนนี้', icon: 'walk' },
}

/**
 * หัวเรื่องของบล็อกนัด/คิว — มือถือ (การ์ด AppointmentBlock) กับเดสก์ท็อป (หัวบล็อกใน CartPanel)
 * ต้องพูดคำเดียวกัน (00086 P2-T5) · ไม่มี mode (ร้านอื่น/หน้าแก้ไข) = คำเดิม "วันเข้าใช้บริการ"
 */
export function arrivalBlockTitle(mode: OrderArrivalChoice | undefined): string {
  return mode === 'WALK_IN' ? 'เข้าคิววันนี้' : 'วันเข้าใช้บริการ'
}

/**
 * ไอคอนหน้าหัวเรื่องบล็อก "เข้าคิววันนี้" (prototype v13: ไอคอนเดินหน้าคำ) — ไอคอนชุดเดียวกับชิป "หน้าร้าน"
 * null = ไม่มีไอคอนประจำโหมด (จองล่วงหน้า/ร้านอื่น) — ผู้เรียกที่มีที่ไอคอนเสมอ (หัวบล็อกเดสก์ท็อป) ใส่ค่าเดิมเอง
 */
export function arrivalBlockIcon(mode: OrderArrivalChoice | undefined): string | null {
  return mode === 'WALK_IN' ? ARRIVAL_MODE_META.WALK_IN.icon : null
}

/**
 * คำบนปุ่มบันทึกของฟอร์มสร้าง (prototype v13) — หน้าร้าน = "บันทึกงานบริการ · เข้าคิววันนี้"
 * บอกผลของการกดล่วงหน้า (งานเข้าคิววันนี้ทันที ไม่ต้องเลือกวันเวลา) · จองล่วงหน้า/ไม่มี mode = คำเดิม
 */
export function arrivalSubmitLabel(baseLabel: string, mode: OrderArrivalChoice | undefined): string {
  return mode === 'WALK_IN' ? `${baseLabel} · ${arrivalBlockTitle('WALK_IN')}` : baseLabel
}

/**
 * ฟอร์มใช้ลำดับใหม่ของร้านบริการไหม (Controller decision 2)
 *
 * เฉพาะ "สร้าง" ของร้าน SERVICE_QUEUE — หน้าแก้ไข (และแก้ไขจากแชท) คงฟอร์มเดิมทุกตัวอักษร
 * เพราะออเดอร์ที่บันทึกแล้วมีวิธีมาถึงของมันแล้ว การเปลี่ยนต้องไปทางปุ่มนัด/เริ่มงานในหน้าออเดอร์
 */
export function usesServiceCreateLayout(shopVertical: string | undefined, editOrderToken: string | undefined): boolean {
  return shopVertical === 'SERVICE_QUEUE' && !editOrderToken
}

/**
 * ส่ง `arrivalMode` ไป API + แสดงปุ่มเลือกไหม
 *
 * ต้องมีคิวงานให้เลือกจริง — ร้านบริการที่ยังไม่ตั้งคิวงานไม่มีอะไรให้ "จอง" หรือ "เข้าคิว"
 * ถ้าบังคับเลือกจะไม่มีทางบันทึกออเดอร์ได้เลย (API: ไม่มี appointment + ไม่มี arrivalMode = legacy null)
 */
export function sendsArrivalMode(input: {
  serviceLayout: boolean
  resourcesEnabled: boolean
  resourceCount: number
}): boolean {
  return input.serviceLayout && input.resourcesEnabled && input.resourceCount > 0
}

/**
 * ค่าหลังมีวัน/เวลาพามาจากปฏิทิน (`?appointmentDate=` หรือ appointmentPrefill จากแชท)
 * ผู้ขายเพิ่งเลือก "วันนัด" มา ⇒ คือการจองล่วงหน้าเสมอ
 */
export function arrivalChoiceAfterPrefill(
  current: OrderArrivalChoice | undefined,
  hasCalendarPrefill: boolean,
): OrderArrivalChoice {
  if (hasCalendarPrefill) return 'BOOKED'
  return current ?? DEFAULT_ARRIVAL_CHOICE
}

export type ArrivalProblem =
  | { code: 'ARRIVAL_BOOKED_NEEDS_TIME'; field: 'appointment.resourceId' | 'appointment.endTime'; message: string }
  | { code: 'ARRIVAL_WALK_IN_NEEDS_QUEUE'; field: 'appointment.resourceId'; message: string }

/**
 * ช่อง error ที่ต้องล้างเมื่อผู้ขายสลับ "ลูกค้ามาแบบไหน" (review P2 NIT-3)
 *
 * error ของโหมดเดิม (เช่น "เลือกวันและเวลานัด" ใต้ช่องเวลาของจองล่วงหน้า) ไม่เกี่ยวกับโหมดใหม่แล้ว —
 * ถ้าไม่ล้าง ผู้ขายที่สลับไป "หน้าร้าน" จะเห็นคำเตือนค้างใต้บล็อกที่ไม่มีช่องเวลาให้แก้
 * ล้างทั้งก้อน `appointment` (resourceId/date/startTime/endTime) · ครั้งแรก (prev undefined) / ค่าเดิม = ไม่ล้าง
 * กดบันทึกรอบใหม่ arrivalAppointmentProblem จะตั้ง error ของโหมดใหม่เอง
 */
export function appointmentErrorsToClearOnArrivalChange(
  prev: OrderArrivalChoice | undefined,
  next: OrderArrivalChoice | undefined,
): readonly 'appointment'[] {
  return prev !== undefined && next !== undefined && prev !== next ? ['appointment'] : []
}

/** ข้อความชุดเดียวกับที่ API ตอบกลับ (appointment-api.ts) — จอกับ server ต้องพูดคำเดียวกัน */
export const ARRIVAL_BOOKED_NEEDS_TIME_MSG = 'เลือกวันและเวลานัด'
export const ARRIVAL_WALK_IN_NEEDS_QUEUE_MSG = 'เลือกคิวงาน'

/**
 * สิ่งที่ยังขาดก่อนบันทึก — null = ครบ
 *
 * BOOKED: ต้องมีคิวงาน + วัน (+ เวลาเริ่ม/สิ้นสุด เมื่อร้านรับนัดแบบระบุเวลา)
 * WALK_IN: ต้องมีคิวงานอย่างเดียว — server ตั้งเวลาเอง (walkInWindow) ไม่เก็บมัดจำ
 */
export function arrivalAppointmentProblem(
  mode: OrderArrivalChoice,
  ap: { resourceId?: string; date?: string; startTime?: string; endTime?: string } | undefined,
  granularity: 'DAY' | 'TIME',
): ArrivalProblem | null {
  if (mode === 'WALK_IN') {
    return ap?.resourceId
      ? null
      : { code: 'ARRIVAL_WALK_IN_NEEDS_QUEUE', field: 'appointment.resourceId', message: ARRIVAL_WALK_IN_NEEDS_QUEUE_MSG }
  }
  if (!ap?.resourceId) {
    return { code: 'ARRIVAL_BOOKED_NEEDS_TIME', field: 'appointment.resourceId', message: ARRIVAL_BOOKED_NEEDS_TIME_MSG }
  }
  if (!ap.date || (granularity === 'TIME' && !(ap.startTime && ap.endTime))) {
    return { code: 'ARRIVAL_BOOKED_NEEDS_TIME', field: 'appointment.endTime', message: ARRIVAL_BOOKED_NEEDS_TIME_MSG }
  }
  return null
}

/**
 * payload ของ walk-in — ส่งแค่คิวงาน ไม่มี start/end/deposit/durationMin
 *
 * ทำไมไม่ส่ง durationMin (review P2 MINOR-1): ระยะเวลามาตรฐานของคิวงานไม่มีเพดาน แต่ schema ของ API
 * รับ durationMin ได้ไม่เกิน 1440 นาที ⇒ คิวงานยาวกว่า 1 วันจะโดน 400 ทั้งที่ผู้ขายเลือกคิวถูกแล้ว
 * server อ่านระยะเวลาจากคิวงานเองอยู่แล้ว (createOrder: walkIn.durationMin ?? resource.durationMinutes)
 * ⇒ ไม่ต้องส่งซ้ำ และค่าที่ใช้จริงมาจากแหล่งเดียว
 */
export function walkInAppointmentPayload(resourceId: string): { resourceId: string } {
  return { resourceId }
}

/**
 * บรรทัดบอกเวลาที่จะถูกบันทึกจริงของงานหน้าร้าน — ตัวเดียวกับที่ server ใช้ (walkInWindow)
 * ผู้ขายต้องเห็นก่อนกดบันทึก ไม่ใช่ไปรู้ตอนเปิดตารางงาน (คำเดียวกับ StartWalkInSheet)
 */
export function walkInPreviewText(now: Date, durationMinutes: number | null | undefined): string {
  const { start, end } = walkInWindow(now, durationMinutes)
  return `เริ่ม ${formatTimeHM(start)} — ประมาณ ${formatTimeHM(end)} น. ของวันนี้ · ไม่ต้องเลือกวันเวลา · ไม่เก็บมัดจำ`
}
