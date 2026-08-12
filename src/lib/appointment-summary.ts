/**
 * appointment-summary — SSOT ของ "สรุปนัดหมาย" ที่ร้านส่งให้ลูกค้า (ส่วนขยาย 00024, 2026-08-11)
 *
 * user report: ร้านคิวงานพิมพ์ข้อความยืนยันนัดเองทุกใบ (วันที่/เวลา/ชื่อ/เบอร์/คำปิดท้าย) เพราะปุ่ม
 * "ส่งเข้าแชท" ที่มีอยู่ประกอบข้อความด้วย **ภาษาการซื้อของ** ("คำสั่งซื้อ: … / ยอดสุทธิ …")
 * ซึ่งไม่มีวันนัด ไม่มีเวลา ไม่มีเบอร์ — ทั้งที่ค่าพวกนั้นอยู่บนออเดอร์ใบเดียวกันหมด
 *
 * ไฟล์นี้เป็น **pure module** — ห้าม import prisma/storage/component ใด ๆ ผู้เรียกมี 4 ทาง
 * (route ที่ส่งออก · ชีตพรีวิว · flex ของ LINE · template ของ Meta) ทุกทางต้องได้คำชุดเดียวกัน
 *
 * 🛑 HR16 — สิ่งที่ **ห้ามเขียนซ้ำที่อื่น** เด็ดขาด:
 *   - สูตรแปลงช่วงเวลานัดเป็นข้อความ → `appointmentRangeText()` (เดิมฝังอยู่ใน
 *     `OrderProgressBar.tsx` ที่เดียว งานนี้ย้ายมาที่นี่แล้วให้ไฟล์นั้น import กลับ)
 *   - คำว่า "มัดจำที่ตกลงไว้" → `APPOINTMENT_SUMMARY_LABEL.deposit`
 *   เลขเดียวกันที่ถูกเรียกคนละคำในสองหน้าจอ ไม่มี tsc/build ตัวไหนฟ้อง เพราะทั้งคู่ "ถูก" ในตัวเอง
 */

import { formatDateTH, formatTimeHM } from './format-date'
import { isAllDayAppointment } from './appointments'

export type AppointmentSummaryKey =
  | 'when'
  | 'service'
  | 'customer'
  | 'phone'
  | 'amount'
  | 'deposit'

export const APPOINTMENT_SUMMARY_LABEL: Record<AppointmentSummaryKey, string> = {
  when: 'วันและเวลา',
  service: 'บริการ',
  customer: 'ชื่อลูกค้า',
  phone: 'เบอร์ติดต่อ',
  amount: 'ยอดรวม',
  /**
   * 🛑 "มัดจำที่ตกลงไว้" ไม่ใช่ "มัดจำ" เฉย ๆ — คำหลังอ่านได้ทั้ง "เก็บแล้ว" และ "ต้องเก็บ"
   * แต่ระบบ **ไม่มีคอลัมน์ `depositReceivedAt`** จึงไม่รู้ว่าจ่ายหรือยัง (BR-RSV-49/50 ตั้งใจ
   * ไม่กั้นคิวด้วยมัดจำ ไม่มี flow แนบสลิปแบบบ้านพัก) — คำตัดสินนี้เกิดที่ `OrderProgressBar`
   * มาก่อนแล้ว การ์ดที่ส่งออกไปหาลูกค้ายิ่งพูดเกินจริงไม่ได้
   */
  deposit: 'มัดจำที่ตกลงไว้',
}

/** ลำดับบรรทัดบนการ์ด — คงที่ ไม่ผันตามลำดับที่ร้านติ๊ก */
export const APPOINTMENT_SUMMARY_ORDER: readonly AppointmentSummaryKey[] = [
  'when',
  'service',
  'customer',
  'phone',
  'amount',
  'deposit',
]

/**
 * 🛑 `when` ปิดไม่ได้ — การ์ดชื่อ "ยืนยันนัดหมาย" ที่ไม่มีวันนัดคือการ์ดที่ไม่มีเหตุผลจะมีอยู่
 * และเปิดช่องให้ส่งของที่ทำให้ลูกค้ามาผิดวัน. ค่านี้ถูกใช้เป็น allow-list ของ API ด้วย
 * (ด่านที่สอง — UI กันได้แค่คนที่เดินผ่านประตู)
 */
export const HIDEABLE_APPOINTMENT_SUMMARY_KEYS: readonly AppointmentSummaryKey[] = [
  'service',
  'customer',
  'phone',
  'amount',
  'deposit',
]

export const APPOINTMENT_SUMMARY_TITLE = 'ยืนยันนัดหมาย'
export const DEFAULT_APPOINTMENT_CLOSING = 'ยืนยันคิวเรียบร้อยค่ะ'
export const APPOINTMENT_CLOSING_MAX = 120

export function isHideableAppointmentSummaryKey(v: string): v is AppointmentSummaryKey {
  return (HIDEABLE_APPOINTMENT_SUMMARY_KEYS as readonly string[]).includes(v)
}

/**
 * ช่วงเวลานัดเป็นข้อความ — "8 ส.ค. 2569 · 19:00–20:00" / "8 ส.ค. 2569 · ทั้งวัน" / "8 ส.ค. 2569"
 *
 * ตัดสิน "ทั้งวัน" จาก **ข้อมูลของแถวนั้น** ด้วย `isAllDayAppointment` (BR-RSV-57) ไม่ใช่จาก
 * โหมดปัจจุบันของร้าน — ร้านที่สลับโหมดไปแล้วต้องเห็นนัดเก่าตามรูปแบบที่มันถูกบันทึกไว้
 *
 * ย้ายมาจาก `OrderProgressBar.tsx::appointmentText` (2026-08-11) — ไฟล์นั้น import ตัวนี้แล้ว
 * ห้ามเขียนสูตรนี้ซ้ำที่ไหนอีก (HR16)
 */
export function appointmentRangeText(
  startISO: string | Date,
  endISO: string | Date | null | undefined,
): string {
  const s = startISO instanceof Date ? startISO : new Date(startISO)
  if (Number.isNaN(s.getTime())) return ''
  const e = endISO ? (endISO instanceof Date ? endISO : new Date(endISO)) : null
  const dateLabel = formatDateTH(s)
  if (!e || Number.isNaN(e.getTime())) return dateLabel
  if (isAllDayAppointment(s, e)) return `${dateLabel} · ทั้งวัน`
  return `${dateLabel} · ${formatTimeHM(s)}–${formatTimeHM(e)}`
}

export interface AppointmentSummaryInput {
  serviceStart: string | Date
  serviceEnd: string | Date | null
  /** ชื่อรายการแรกของออเดอร์ (สิ่งที่ลูกค้าจอง) */
  serviceName: string | null
  /** ชื่อคิวงาน/ช่างที่รับงาน — ต่อท้ายชื่อบริการด้วย " · " ถ้ามีทั้งคู่ */
  resourceName: string | null
  customerName: string | null
  phone: string | null
  /** ยอดรวมที่ผ่าน `formatBaht` มาแล้ว — 🛑 ไฟล์นี้ไม่ฟอร์แมตเงินเอง (HR16) */
  totalText: string | null
  /** มัดจำที่ผ่าน `formatBaht` มาแล้ว — `null` = ไม่มีมัดจำ (บรรทัดหายไปเลย) */
  depositText: string | null
}

export interface AppointmentSummaryLine {
  key: AppointmentSummaryKey
  label: string
  value: string
}

export interface AppointmentSummary {
  title: string
  lines: AppointmentSummaryLine[]
  closing: string | null
  /** ข้อความล้วน — `ChatMessage.body` ที่ร้านค้นหาเจอ + ทางถอยของช่องทางที่ไม่รองรับการ์ด */
  text: string
  /** บรรทัดเดียว — subtitle ของ Meta / ส่วนหนึ่งของ altText ของ LINE */
  compact: string
}

/**
 * ประกอบสรุปนัด
 *
 * @param opts.hiddenKeys บรรทัดที่ร้านติ๊กปิด — `'when'` ที่หลุดมาจะถูก **เพิกเฉย** (ดู
 *   `HIDEABLE_APPOINTMENT_SUMMARY_KEYS`) ไม่ throw เพราะฟังก์ชันนี้เป็น pure formatter
 *   การปฏิเสธคำขอเป็นหน้าที่ของ route (fail-closed ที่ชั้นที่รับ input จากภายนอก)
 * @param opts.url ลิงก์หน้านัดสาธารณะ `/o/{token}` — ต่อท้าย `text` ถ้ามี
 */
export function buildAppointmentSummary(
  input: AppointmentSummaryInput,
  opts?: {
    hiddenKeys?: readonly string[]
    closing?: string | null
    url?: string | null
  },
): AppointmentSummary {
  const hidden = new Set(
    (opts?.hiddenKeys ?? []).filter(isHideableAppointmentSummaryKey),
  )

  const when = appointmentRangeText(input.serviceStart, input.serviceEnd)
  const service = [input.serviceName?.trim(), input.resourceName?.trim()]
    .filter(Boolean)
    .join(' · ')

  const raw: Record<AppointmentSummaryKey, string | null> = {
    when: when || null,
    service: service || null,
    customer: input.customerName?.trim() || null,
    phone: input.phone?.trim() || null,
    amount: input.totalText?.trim() || null,
    deposit: input.depositText?.trim() || null,
  }

  const lines: AppointmentSummaryLine[] = []
  for (const key of APPOINTMENT_SUMMARY_ORDER) {
    if (hidden.has(key)) continue
    const value = raw[key]
    // 🛑 ค่าว่าง = บรรทัดหายไปเลย ห้ามแสดง "—" : การ์ดนี้ออกไปหาลูกค้า ขีดกลางบนเอกสาร
    // ยืนยันอ่านเป็น "ระบบพัง" ไม่ใช่ "ร้านไม่ได้กรอก"
    if (!value) continue
    lines.push({ key, label: APPOINTMENT_SUMMARY_LABEL[key], value })
  }

  const closingRaw = opts?.closing === undefined ? DEFAULT_APPOINTMENT_CLOSING : opts.closing
  const closing = closingRaw?.trim().slice(0, APPOINTMENT_CLOSING_MAX) || null

  const compact = [when, service].filter(Boolean).join(' · ')

  const textParts = [
    APPOINTMENT_SUMMARY_TITLE,
    ...lines.map((l) => `${l.label}: ${l.value}`),
  ]
  if (closing) textParts.push('', closing)
  if (opts?.url) textParts.push(opts.url)

  return {
    title: APPOINTMENT_SUMMARY_TITLE,
    lines,
    closing,
    text: textParts.join('\n'),
    compact,
  }
}
