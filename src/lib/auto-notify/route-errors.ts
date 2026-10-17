// feature 00078 — แปลง error ของ auto-notify-config.service เป็น HTTP (SDS §7.4) · ใช้ร่วมสวิตช์/เทมเพลต
import { jsonNoStore } from '@/lib/shop-api-guard'
import {
  AutoNotifyKindNotAvailableError,
  AutoNotifyTemplateConflictError,
  AutoNotifyTemplateInvalidError,
} from '@/services/auto-notify-config.service'

export function autoNotifyErrorResponse(e: unknown, tag: string) {
  if (e instanceof AutoNotifyKindNotAvailableError) return jsonNoStore({ error: 'KIND_NOT_AVAILABLE' }, { status: 409 })
  if (e instanceof AutoNotifyTemplateConflictError)
    return jsonNoStore({ error: 'TEMPLATE_CONFLICT', currentUpdatedAt: e.currentUpdatedAt?.toISOString() ?? null }, { status: 409 })
  if (e instanceof AutoNotifyTemplateInvalidError)
    return jsonNoStore({ error: 'VALIDATION_ERROR', issues: e.issues }, { status: 400 })
  console.error(`[${tag}]`, e instanceof Error ? e.message : e)
  return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
}
