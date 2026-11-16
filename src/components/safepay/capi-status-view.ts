// 00097 — ไอคอน/โทนของสถานะ CAPI ใช้ร่วมบรรทัดในแชท · การ์ดออเดอร์ · หน้าบันทึกการส่ง (โทนเดียวกับ STATUS_TONE เดิมของ LogClient)
import type { CapiStatus } from '@/lib/meta-capi/chat-lines'

export const CAPI_STATUS_ICON: Record<CapiStatus, string> = {
  SENT: 'circle-check',
  PENDING: 'clock',
  FAILED: 'circle-x',
  SKIPPED: 'player-track-next',
}
/** สีตัวอักษรของคำผล (บรรทัด/รายการ) */
export const CAPI_STATUS_TEXT: Record<CapiStatus, string> = {
  SENT: 'text-success-ink font-medium',
  PENDING: 'text-warning-ink font-medium',
  FAILED: 'text-danger-ink font-medium',
  SKIPPED: 'text-default-700 font-medium',
}
/** ป้าย/วงกลมพื้นอ่อน */
export const CAPI_STATUS_BADGE: Record<CapiStatus, string> = {
  PENDING: 'bg-warning/15 text-warning-ink',
  SENT: 'bg-success/15 text-success-ink',
  FAILED: 'bg-danger/15 text-danger-ink',
  SKIPPED: 'bg-default-100 text-default-800',
}
