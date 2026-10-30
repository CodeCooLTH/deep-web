import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { ServiceJobPhotoSettingsSchema } from '@/lib/validations'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { appointmentErrorResponse } from '@/lib/appointment-api'
import { updateServiceJobPhotoSettings } from '@/services/service-job.service'

/**
 * PATCH /api/shops/current/service-job-photo-settings — รูปก่อน-หลังงาน (feature 00086 API §4.11 · S-11)
 * `{ mode?: 'REQUIRED'|'OPTIONAL'|'NONE', buyerVisible?: boolean }` (ส่งทีละฟิลด์ได้) → `{ mode, buyerVisible }`
 * Q2 (เจ้าของ/ผู้จัดการ) · mode NONE ⇒ buyerVisible = false บังคับที่ server · ร้านไม่ใช่บริการ → 403 FEATURE_NOT_AVAILABLE
 */
export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'Q2')
  if (!gate.ok) return gate.response

  const parsed = v.safeParse(ServiceJobPhotoSettingsSchema, await request.json().catch(() => null))
  if (!parsed.success) return jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 })

  try {
    return jsonNoStore(await updateServiceJobPhotoSettings(gate.shopId, parsed.output))
  } catch (e) {
    const mapped = appointmentErrorResponse(e)
    if (mapped) return mapped
    console.error('[PATCH /api/shops/current/service-job-photo-settings] shopId:', gate.shopId, e instanceof Error ? e.message : e)
    return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
