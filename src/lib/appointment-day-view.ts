/**
 * appointment-day-view — ตรรกะของ "การ์ดคิวงานรายวัน" (ส่วนขยาย 2026-08-11)
 *
 * pure module — ห้าม import prisma/react/DOM (ใช้ทั้งฝั่ง client render และฝั่งเทส)
 *
 * 🛑 ทำไมทุกอย่างในนี้ต้องเป็นฟังก์ชัน ไม่ใช่เทอร์นารีกลาง JSX: เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม" แต่คือ
 * **"ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม"** — guard ปุ่ม "ย่อกลับ" ที่เขียนกลับด้านเคยผ่าน
 * tsc/build/detector/theme-guard ครบทุกด่านแล้วปุ่มไม่ทำงานเลยทุกกรณี เพราะสิ่งที่ผิดคือ
 * *ความหมาย* ไม่ใช่ *รูปแบบ* (docs/conventions/ui-boolean-needs-a-testable-home.md)
 *
 * ทุกฟังก์ชันในไฟล์นี้มีเทส [blocker] คู่กันที่ __tests__/appointment-day-view.test.ts และ
 * ต้องพิสูจน์ด้วย mutation (คืนตรรกะผิดกลับไปแล้วต้องแดง) ไม่ใช่แค่เขียนให้เขียว
 */

import {
  isAllDayAppointment,
  isTerminalAppointmentStatus,
  APPOINTMENT_STATUS,
  type AppointmentStatus,
} from './appointments'
import { formatTimeHM } from './format-date'

/** ทรงขั้นต่ำที่ตรรกะกลุ่มต้องใช้ — ผู้เรียกส่ง item เต็มมาได้ (structural typing) */
export type DayViewItem = {
  orderToken: string
  /** ISO string จาก API */
  start: string
  end: string
  appointmentStatus: string | null
}

export type DaySlotGroup<T extends DayViewItem> = {
  /** คีย์เสถียรสำหรับ React — ประกอบจากช่วงเวลา ไม่ใช่ index (ลำดับเปลี่ยนได้เมื่อข้อมูลอัปเดต) */
  key: string
  /** true = กลุ่ม "ทั้งวัน" ซึ่งไม่มีช่วงเวลาให้แสดง */
  allDay: boolean
  /** "09:00 – 10:00" · กลุ่มทั้งวันเป็นสตริงว่าง (ผู้เรียกใส่คำว่า "ทั้งวัน" เอง พร้อมไอคอน) */
  label: string
  items: T[]
}

/**
 * จัดกลุ่มนัดของวันตาม "ช่วงเวลาที่เหมือนกันเป๊ะ"
 *
 * 🛑 คีย์ต้องเป็น **คู่ start+end** ไม่ใช่ start อย่างเดียว — ร้านที่รับงาน 09:00–10:00 กับ
 * 09:00–11:00 ในเวลาเดียวกันเป็นเรื่องปกติ (คนละบริการ) การจับด้วย start จะยุบสองช่วงนั้นเป็น
 * กลุ่มเดียวแล้วหัวกลุ่มจะโกหกว่าทุกใบจบ 10:00
 *
 * กลุ่ม "ทั้งวัน" อยู่บนสุดเสมอ — มันไม่มีตำแหน่งในลำดับเวลา การปล่อยให้เรียงตาม start (00:00)
 * ทำให้มันไปนอนปนกับนัดเช้าโดยไม่มีอะไรบอกว่ามันคนละชนิด
 */
export function groupAppointmentsBySlot<T extends DayViewItem>(
  items: readonly T[],
): DaySlotGroup<T>[] {
  const allDay: T[] = []
  const timed = new Map<string, { start: number; end: number; items: T[] }>()

  for (const it of items) {
    const start = new Date(it.start)
    const end = new Date(it.end)
    if (isAllDayAppointment(start, end)) {
      allDay.push(it)
      continue
    }
    const key = `${start.getTime()}|${end.getTime()}`
    const bucket = timed.get(key)
    if (bucket) bucket.items.push(it)
    else timed.set(key, { start: start.getTime(), end: end.getTime(), items: [it] })
  }

  const groups: DaySlotGroup<T>[] = []
  if (allDay.length > 0) {
    groups.push({ key: 'allday', allDay: true, label: '', items: allDay })
  }

  const sorted = [...timed.entries()].sort(
    (a, b) => a[1].start - b[1].start || a[1].end - b[1].end,
  )
  for (const [key, bucket] of sorted) {
    groups.push({
      key,
      allDay: false,
      // ช่วงเวลาผ่าน formatTimeHM ตัวเดียวกับที่แถวเดิมใช้ (date-format.md — ห้าม toLocaleTimeString เอง)
      label: `${formatTimeHM(new Date(bucket.start))} – ${formatTimeHM(new Date(bucket.end))}`,
      items: bucket.items,
    })
  }
  return groups
}

/** สถานะที่ถือว่า "จบแล้ว" — ห่อ isTerminalAppointmentStatus ให้รับค่าดิบจาก API ที่เป็น null ได้ */
export function isClosedAppointment(status: string | null | undefined): boolean {
  return !!status && isTerminalAppointmentStatus(status as AppointmentStatus)
}

/**
 * การ์ดใบนี้ให้กดอะไรได้
 *
 * - `reschedule` — ลูกค้าขอเลื่อนแล้วรออยู่ เป็นสถานะเดียวในชุดที่ **ร้านต้องลงมือ** จึงชนะทุกอย่าง
 *   (แม้ยังไม่ถึงเวลานัด — service ไม่ได้ห้ามเลื่อนนัดที่ยังมาไม่ถึง ต่างจากการปิดผล)
 * - `close` — ถึงเวลานัดแล้วและยังไม่ปิดผล ⇒ โชว์ปุ่ม "ให้บริการแล้ว" + `⋯`
 * - `none` — ยังไม่ถึงเวลา (BR-RSV-34 ห้ามปิดผลก่อนถึงเวลา) หรือปิดผลไปแล้ว
 *
 * 🛑 "ยังไม่ถึงเวลา" ต้องได้ `none` ไม่ใช่ปุ่ม disabled — หน้ารายละเอียดออเดอร์โชว์ปุ่มเทา
 * พร้อมคำอธิบายได้เพราะมีใบเดียวทั้งจอ แต่ในลิสต์ 9 ใบมันจะกลายเป็นปุ่มตายเรียงกันเก้าปุ่ม
 *
 * 🛑 เกณฑ์เวลาใช้ `>=` ไม่ใช่ `>` — ให้ตรงกับ `AppointmentCard.tsx` ที่คิดกลับด้านว่า
 * "ยังไม่เริ่ม = start > now" (ดังนั้น "เริ่มแล้ว" คือ start <= now) ถ้าสองที่ไม่ตรงกัน
 * จะมีหนึ่งวินาทีที่ลิสต์โชว์ปุ่มแต่หน้ารายละเอียดยังกดไม่ได้
 */
export type DayCardAction = 'reschedule' | 'close' | 'none'

export function appointmentCardAction(input: {
  startISO: string
  appointmentStatus: string | null
  now: Date
}): DayCardAction {
  if (input.appointmentStatus === APPOINTMENT_STATUS.RESCHEDULE_REQUESTED) {
    return 'reschedule'
  }
  if (isClosedAppointment(input.appointmentStatus)) return 'none'
  const start = new Date(input.startISO).getTime()
  if (Number.isNaN(start)) return 'none'
  return input.now.getTime() >= start ? 'close' : 'none'
}

/**
 * ปุ่มบนแถวลงมือของการ์ดคิว + เมนู `⋯` ตามสิทธิ์ผู้ดู (00071 P3 + 00086 S-5)
 *
 * - `primary` — `close` ปุ่มปิดงาน · `reschedule` ลิงก์เลือกเวลาใหม่ · `reschedule-hint` ข้อความบอกว่าให้ใครเลือก
 *   · null = ไม่มีปุ่มหลัก (ถึงเวลานัดแต่ผู้ดูปิดงานไม่ได้ — 00086 FR-005: ไม่โชว์ปุ่มที่กดแล้ว 403)
 * - `menu` — รายการใน `⋯`: เลื่อนนัด (O3) · ไม่มาตามนัด (= ปิดงานแบบ NO_SHOW ⇒ ต้องมีสิทธิ์ปิดงาน)
 *   null = ไม่มีอะไรในเมนู ⇒ ไม่ render ปุ่ม `⋯` (เมนูที่มีแต่ "ยกเลิก" คือปุ่มหลอก)
 * แถวลงมือทั้งแถว render เมื่อ primary หรือ menu มีค่า
 */
export type DayCardControls = {
  primary: 'close' | 'reschedule' | 'reschedule-hint' | null
  menu: { reschedule: boolean; noShow: boolean } | null
}

export function dayCardControls(
  action: DayCardAction,
  caps: {
    canClose: boolean
    canReschedule: boolean
    /** 00086 P3 — ผู้ดูเป็นฝ่ายช่างล้วน (`isTechnicianOnly`) · ผู้เรียกต้องส่งเสมอ (ไม่มีค่าตั้งต้น) */
    technicianOnly: boolean
  },
  /**
   * 00086 P3 — ความคืบหน้าของงานใบนี้ (มาจากแถวเอง — permission-gate-follows-the-row)
   * `isMine` = ผู้รับผิดชอบคือผู้ดู (เทียบ userId) · `started`/`finished` = มี serviceStartedAt/serviceFinishedAt
   */
  job: { isMine: boolean; started: boolean; finished: boolean },
): DayCardControls {
  if (action === 'none') return { primary: null, menu: null }
  /**
   * 00086 P3 (SDS TD-004 · BRD §8.1 · FR-011): ช่างล้วนปิดได้เฉพาะ "งานของตัวเองที่ทำเสร็จแล้ว"
   * คนอื่นที่ปิดได้ ปิดก่อนเริ่ม/ก่อนทำเสร็จได้เหมือนเดิม (FR-010) — ด่านจริงอยู่ที่ closeServiceJob
   */
  const closeAllowed = caps.canClose && (!caps.technicianOnly || (job.isMine && job.finished))
  /**
   * "ไม่มาตามนัด" = ลูกค้าไม่มา ⇒ ขัดกับงานที่เริ่มแล้ว (เริ่มงาน = ลูกค้ามาแล้ว · Controller decision 2026-10-29)
   * ช่างล้วนไม่มีเสมอ — ช่างล้วนปิดได้หลังทำเสร็จเท่านั้น ซึ่งแปลว่าลูกค้ามาแล้ว
   */
  const noShow = caps.canClose && !caps.technicianOnly && !job.started
  const primary =
    action === 'reschedule' ? (caps.canReschedule ? 'reschedule' : 'reschedule-hint') : closeAllowed ? 'close' : null
  const menu = caps.canReschedule || noShow ? { reschedule: caps.canReschedule, noShow } : null
  return { primary, menu }
}

/**
 * กลุ่มนี้ยุบเหลือบรรทัดเดียวได้ไหม
 *
 * 🛑 ยุบเฉพาะตอน **ทุกใบ** ปิดผลแล้ว — เหลือค้างใบเดียวก็ต้องกางทั้งกลุ่ม เพราะใบที่ยังต้องทำ
 * ถูกซ่อนคือความเสียหายที่หนักกว่า "อ่านยาก" มาก (ผู้ขายจะไม่รู้ว่ามีงานค้าง)
 *
 * กลุ่มว่างคืน false — ไม่มีอะไรให้ยุบ และ `every` บนอาเรย์ว่างคืน true ซึ่งจะกลายเป็น
 * "ยุบกลุ่มที่ไม่มีสมาชิก" (กับดักคลาสสิกของ vacuous truth)
 */
export function isSlotFullyClosed(items: readonly DayViewItem[]): boolean {
  if (items.length === 0) return false
  return items.every((it) => isClosedAppointment(it.appointmentStatus))
}

/** สรุปความคืบหน้าของวันสำหรับหัวชีต — derive จาก items ที่มีอยู่แล้ว ไม่ต้องขอ API เพิ่ม */
export function summarizeDay(items: readonly DayViewItem[]): {
  total: number
  completed: number
  noShow: number
  closed: number
} {
  let completed = 0
  let noShow = 0
  for (const it of items) {
    if (it.appointmentStatus === APPOINTMENT_STATUS.COMPLETED) completed += 1
    else if (it.appointmentStatus === APPOINTMENT_STATUS.NO_SHOW) noShow += 1
  }
  return { total: items.length, completed, noShow, closed: completed + noShow }
}

/**
 * เลื่อนวันไป N วันบนปฏิทินไทย — คีย์รูป "YYYY-MM-DD" ตรงกับ `localDateKey`
 *
 * ต้องคำนวณด้วยส่วนประกอบของวัน ไม่ใช่บวก 86400000 ms กับ Date ตรง ๆ: ตัวหลังถูกต้องในไทย
 * (ไม่มี DST) แต่จะพังทันทีถ้ามีใครเอาไปใช้กับโซนที่มี DST — และมันอ่านไม่ออกว่าตั้งใจอะไร
 */
export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const mm = `${dt.getUTCMonth() + 1}`.padStart(2, '0')
  const dd = `${dt.getUTCDate()}`.padStart(2, '0')
  return `${dt.getUTCFullYear()}-${mm}-${dd}`
}
