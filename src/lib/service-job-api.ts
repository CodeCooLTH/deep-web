import { jsonNoStore } from '@/lib/shop-api-guard'
import {
  SERVICE_JOB_ERROR_MESSAGE,
  ServiceJobAlreadyClosedError,
  ServiceJobClosedLockedError,
  ServiceJobNoShowConfirmError,
  ServiceJobNoShowWithoutAppointmentError,
  ServiceJobNotClosableError,
  ServiceJobNotFoundError,
  ServiceJobNotReopenableError,
  ServiceJobNotStartableError,
} from '@/lib/service-job'

/**
 * แปลง error ของ "ปิดงาน/เปิดงานอีกครั้ง" (feature 00073) เป็น HTTP response — ข้อความภาษาธุรกิจเสมอ
 * คืน null ถ้าไม่ใช่ error ของโดเมนนี้ (ผู้เรียก log + 500 เอง) · แพตเทิร์นเดียวกับ appointment-api.ts
 */
export function serviceJobErrorResponse(e: unknown): Response | null {
  const pick = (code: string, status: number) =>
    jsonNoStore({ error: code, message: SERVICE_JOB_ERROR_MESSAGE[code] }, { status })
  if (e instanceof ServiceJobNotFoundError) return pick('SERVICE_JOB_NOT_FOUND', 404)
  if (e instanceof ServiceJobAlreadyClosedError) return pick('SERVICE_JOB_ALREADY_CLOSED', 409)
  if (e instanceof ServiceJobNotClosableError) return pick('SERVICE_JOB_NOT_CLOSABLE', 409)
  if (e instanceof ServiceJobNotStartableError) return pick('SERVICE_JOB_NOT_STARTABLE', 409)
  if (e instanceof ServiceJobNoShowWithoutAppointmentError) return pick('SERVICE_JOB_NO_SHOW_WITHOUT_APPOINTMENT', 400)
  if (e instanceof ServiceJobNotReopenableError) return pick('SERVICE_JOB_NOT_REOPENABLE', 409)
  if (e instanceof ServiceJobClosedLockedError) return pick('SERVICE_JOB_CLOSED_LOCKED', 409)
  if (e instanceof ServiceJobNoShowConfirmError) return pick('SERVICE_JOB_NO_SHOW_CONFIRM', 409)
  return null
}
