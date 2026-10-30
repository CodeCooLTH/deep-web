import * as v from 'valibot'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { ServiceJobStepSchema } from '@/lib/validations'
import {
  AssigneeNotTechnicianError,
  SERVICE_JOB_ERROR_MESSAGE,
  ServiceJobAlreadyAssignedError,
  ServiceJobAlreadyClosedError,
  ServiceJobClaimTechnicianOnlyError,
  ServiceJobClosedLockedError,
  ServiceJobNoShowAfterStartError,
  ServiceJobNoShowConfirmError,
  ServiceJobNoShowWithoutAppointmentError,
  ServiceJobNotAssigneeError,
  ServiceJobNotClosableError,
  ServiceJobNotFinishedError,
  ServiceJobNotFoundError,
  ServiceJobNotReopenableError,
  ServiceJobNotStartableError,
  ServiceJobNotStartedError,
  ServiceJobPhotoMissingError,
  ServiceJobPhotoRequiredError,
  ServiceJobPhotosDisabledError,
  ServiceJobTooManyPhotosError,
  ServiceJobUnassignedError,
  serviceJobErrorMessage,
} from '@/lib/service-job'

/**
 * แปลง error ของ "ปิดงาน/เปิดงานอีกครั้ง" (feature 00073) + งานของช่าง (00086 P3) เป็น HTTP response — ข้อความภาษาธุรกิจเสมอ
 * คืน null ถ้าไม่ใช่ error ของโดเมนนี้ (ผู้เรียก log + 500 เอง) · แพตเทิร์นเดียวกับ appointment-api.ts
 *
 * 00086: ตาราง error → HTTP ใน 00086-p3-plan §1.1 · สองรหัสที่มีชื่อคน (NOT_ASSIGNEE / ALREADY_ASSIGNED)
 * คืน `assigneeName` ใน body ด้วย (ชื่อพนักงานในร้าน — route เหล่านี้เป็นของสมาชิกร้านเท่านั้น)
 */
export function serviceJobErrorResponse(e: unknown): Response | null {
  const pick = (code: string, status: number) =>
    jsonNoStore({ error: code, message: SERVICE_JOB_ERROR_MESSAGE[code] }, { status })
  if (e instanceof ServiceJobNotFoundError) return pick('SERVICE_JOB_NOT_FOUND', 404)
  if (e instanceof ServiceJobAlreadyClosedError) return pick('SERVICE_JOB_ALREADY_CLOSED', 409)
  if (e instanceof ServiceJobNotClosableError) return pick('SERVICE_JOB_NOT_CLOSABLE', 409)
  if (e instanceof ServiceJobNotStartableError) return pick('SERVICE_JOB_NOT_STARTABLE', 409)
  if (e instanceof ServiceJobNoShowWithoutAppointmentError) return pick('SERVICE_JOB_NO_SHOW_WITHOUT_APPOINTMENT', 400)
  if (e instanceof ServiceJobNoShowAfterStartError) return pick('SERVICE_JOB_NO_SHOW_AFTER_START', 409)
  if (e instanceof ServiceJobNotReopenableError) return pick('SERVICE_JOB_NOT_REOPENABLE', 409)
  if (e instanceof ServiceJobClosedLockedError) return pick('SERVICE_JOB_CLOSED_LOCKED', 409)
  if (e instanceof ServiceJobNoShowConfirmError) return pick('SERVICE_JOB_NO_SHOW_CONFIRM', 409)
  // ─── 00086 P3 ───
  if (e instanceof ServiceJobNotAssigneeError) {
    const code = 'SERVICE_JOB_NOT_ASSIGNEE'
    return jsonNoStore(
      { error: code, message: serviceJobErrorMessage(code, e), assigneeName: e.assigneeName },
      { status: 403 },
    )
  }
  if (e instanceof ServiceJobAlreadyAssignedError) {
    const code = 'SERVICE_JOB_ALREADY_ASSIGNED'
    return jsonNoStore(
      { error: code, message: serviceJobErrorMessage(code, e), assigneeName: e.assigneeName },
      { status: 409 },
    )
  }
  if (e instanceof ServiceJobUnassignedError) return pick('SERVICE_JOB_UNASSIGNED', 409)
  if (e instanceof ServiceJobNotStartedError) return pick('SERVICE_JOB_NOT_STARTED', 409)
  if (e instanceof ServiceJobNotFinishedError) return pick('SERVICE_JOB_NOT_FINISHED', 409)
  if (e instanceof ServiceJobPhotoRequiredError) return pick('SERVICE_JOB_PHOTO_REQUIRED', 400)
  if (e instanceof ServiceJobPhotosDisabledError) return pick('SERVICE_JOB_PHOTOS_DISABLED', 400)
  if (e instanceof ServiceJobPhotoMissingError) return pick('SERVICE_JOB_PHOTO_MISSING', 400)
  if (e instanceof ServiceJobTooManyPhotosError) return pick('SERVICE_JOB_TOO_MANY_PHOTOS', 400)
  if (e instanceof ServiceJobClaimTechnicianOnlyError) return pick('SERVICE_JOB_CLAIM_TECHNICIAN_ONLY', 403)
  if (e instanceof AssigneeNotTechnicianError) return pick('ASSIGNEE_NOT_TECHNICIAN', 400)
  return null
}

/**
 * body ของ เริ่มงาน/ทำเสร็จแล้ว (00086 API §4.5/§4.6) — ไม่บังคับ: ไม่มี body = `{}` (client เดิมของ /start ยิงเปล่า)
 * มี body แต่ไม่ใช่ JSON / ผิดรูป / เกิน 10 รูป / note เกิน 1000 → 400 VALIDATION_ERROR
 */
export async function parseServiceJobStepBody(
  request: Request,
): Promise<{ ok: true; value: { photoFileIds?: string[]; note?: string | null } } | { ok: false; response: Response }> {
  const bad = () => ({ ok: false as const, response: jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 }) })
  const text = await request.text().catch(() => '')
  let raw: unknown = {}
  if (text.trim() !== '') {
    try {
      raw = JSON.parse(text)
    } catch {
      return bad()
    }
  }
  const parsed = v.safeParse(ServiceJobStepSchema, raw ?? {})
  return parsed.success ? { ok: true, value: parsed.output } : bad()
}
