// feature 00078 — เงื่อนไข "ควรส่งอัตโนมัติไหม" predicate เดียวทั้งตัวจอง/ตัวส่ง/แถบแจ้ง (TFR-027, TC-321) · pure module
import { isTerminalAppointmentStatus } from '@/lib/appointments'
import { getWindowState } from '@/lib/messaging-window'
import { isKindAvailable } from './kinds'
import type { AutoNotifyKind } from './ledger-constants'
import { thaiDayIndex } from './ledger'

type When = Date | number

const ms = (d: When): number => +d

/** D-13: "ย้อนหลัง" = createdAt กับเวลาที่คีย์จริงตกคนละวันปฏิทินไทย (ไม่ใช่ต่างกันกี่ ms — ฟอร์มส่ง createdAt เสมอ) */
export function isBackdatedForNotice(createdAt: When | null | undefined, keyedInAt: When | null | undefined): boolean {
  if (createdAt == null || keyedInAt == null) return false // ไม่ได้ส่งวันที่มา = server ใช้ now = ไม่ย้อน
  return thaiDayIndex(ms(createdAt)) !== thaiDayIndex(ms(keyedInAt))
}

export interface AutoNotifyEligibilityInput {
  kind: AutoNotifyKind
  vertical: string
  switchEnabled: boolean
  enabledAt: When | null
  /** เวลาเกิดเหตุการณ์ที่เป็นจังหวะส่ง */
  eventAt: When
  conversationId: string | null
  isDryRun: boolean
  /** ฟอร์มสร้างใหม่ vs แก้ของเดิม (ใช้กับจังหวะ "ตอนสร้าง") — ไม่ระบุ = CREATE */
  mode?: 'CREATE' | 'EDIT'
  createdAt?: When | null
  keyedInAt?: When | null
  orderStatus?: string | null
  // TRACKING
  trackingNo?: string | null
  shipmentFailed?: boolean
  // SERVICE_*
  serviceStart?: When | null
  appointmentStatus?: string | null
  serviceClosedAt?: When | null
  /** ผลปิดงาน (SERVICE_CLOSED): ส่งเฉพาะ SERVED */
  closeOutcome?: 'SERVED' | 'NO_SHOW' | null
  /** เวลาปัจจุบัน — ใช้กับ "นัดต้องอยู่หลัง now" (D-3) ไม่ระบุ = eventAt */
  nowMs?: number
}

export type NotEligibleReason =
  | 'KIND_NOT_FOR_VERTICAL'
  | 'SWITCH_OFF'
  | 'BEFORE_ENABLED'
  | 'NO_CONVERSATION'
  | 'DRY_RUN'
  | 'BACKDATED'
  | 'EDIT_MODE'
  | 'ORDER_NOT_PENDING'
  | 'ORDER_CANCELLED'
  | 'NO_TRACKING_NO'
  | 'SHIPMENT_FAILED'
  | 'NO_APPOINTMENT'
  | 'APPOINTMENT_NOT_FUTURE'
  | 'APPOINTMENT_TERMINAL'
  | 'ALREADY_CLOSED'
  | 'NOT_SERVED'

export type AutoNotifyEligibility = { eligible: true } | { eligible: false; reason: NotEligibleReason }

const no = (reason: NotEligibleReason): AutoNotifyEligibility => ({ eligible: false, reason })

export function evaluateAutoNotifyEligibility(i: AutoNotifyEligibilityInput): AutoNotifyEligibility {
  if (!isKindAvailable(i.vertical, i.kind)) return no('KIND_NOT_FOR_VERTICAL')
  if (!i.switchEnabled) return no('SWITCH_OFF')
  if (i.enabledAt == null || ms(i.eventAt) < ms(i.enabledAt)) return no('BEFORE_ENABLED')
  if (!i.conversationId) return no('NO_CONVERSATION') // ห้าม fallback หาห้องจากลูกค้า (BR-CS-S01)
  if (i.isDryRun) return no('DRY_RUN')
  if (isBackdatedForNotice(i.createdAt, i.keyedInAt)) return no('BACKDATED')

  const now = i.nowMs ?? ms(i.eventAt)
  switch (i.kind) {
    case 'ORDER_SUMMARY':
      if (i.mode === 'EDIT') return no('EDIT_MODE')
      if (i.orderStatus != null && i.orderStatus !== 'PENDING') return no('ORDER_NOT_PENDING')
      return { eligible: true }
    case 'TRACKING':
      if (!i.trackingNo || i.trackingNo.trim() === '') return no('NO_TRACKING_NO')
      if (i.shipmentFailed) return no('SHIPMENT_FAILED')
      if (i.orderStatus === 'CANCELLED') return no('ORDER_CANCELLED')
      return { eligible: true }
    case 'SERVICE_BOOKED':
      if (i.mode === 'EDIT') return no('EDIT_MODE')
      if (i.serviceStart == null) return no('NO_APPOINTMENT')
      if (ms(i.serviceStart) <= now) return no('APPOINTMENT_NOT_FUTURE') // walk-in "เริ่มตอนนี้" (D-3)
      if (isTerminalAppointmentStatus(i.appointmentStatus)) return no('APPOINTMENT_TERMINAL')
      return { eligible: true }
    case 'SERVICE_STARTED':
      if (i.orderStatus === 'CANCELLED') return no('ORDER_CANCELLED')
      if (i.serviceClosedAt != null) return no('ALREADY_CLOSED')
      if (isTerminalAppointmentStatus(i.appointmentStatus)) return no('APPOINTMENT_TERMINAL')
      return { eligible: true }
    case 'SERVICE_CLOSED':
      if (i.closeOutcome !== 'SERVED') return no('NOT_SERVED') // NO_SHOW ไม่ส่ง
      return { eligible: true }
  }
}

export type AutoNotifyStripChannel = 'MESSENGER' | 'INSTAGRAM' | 'LINE' | 'DEEP'

export interface AutoNotifyStripInput extends Omit<AutoNotifyEligibilityInput, 'eventAt'> {
  /** ไม่ระบุ = nowMs (แถบดูเหตุการณ์ "ถ้ากดตอนนี้") */
  eventAt?: When
  channel: AutoNotifyStripChannel | null
  /** ข้อความล่าสุดของลูกค้า — ใช้เฉพาะ MESSENGER/INSTAGRAM (หน้าต่าง 24 ชม.) */
  lastInboundAt: When | null
}

export type AutoNotifyStripState = 'HIDDEN' | 'WILL_SEND' | 'WINDOW_CLOSED'

export function autoNotifyStripState(input: AutoNotifyStripInput, nowMs: number): AutoNotifyStripState {
  const { channel, lastInboundAt, eventAt, ...rest } = input
  const e = evaluateAutoNotifyEligibility({ ...rest, eventAt: eventAt ?? nowMs, nowMs })
  if (!e.eligible) return 'HIDDEN'
  if (channel === 'MESSENGER' || channel === 'INSTAGRAM') {
    // ตัวเดียวกับด่านส่ง — ตัวส่งอัตโนมัติใช้ HUMAN_AGENT ไม่ได้ จึงดูเฉพาะ 24 ชม.
    const open = getWindowState(lastInboundAt == null ? null : new Date(lastInboundAt), new Date(nowMs)).open
    return open ? 'WILL_SEND' : 'WINDOW_CLOSED'
  }
  return 'WILL_SEND'
}
