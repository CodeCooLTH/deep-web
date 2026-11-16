// 00095 S-6 — ด่านร้านนำร่อง + vertical ของ route (หลังผ่าน requireShopCapability) · ใช้สถานะเดียวกับ service.assertAvailable
// (ไม่ใช้ requireOnlineSalesVertical ของ shop-api-guard เพราะคืน 403 INVENTORY_NOT_ELIGIBLE ไม่ตรงสัญญา API §5)
import type { NextResponse } from 'next/server'
import * as v from 'valibot'
import { SalesFollowBotNotAvailableError } from './errors'
import { isSalesFollowBotEnabled } from './gate'
import { salesFollowErrorResponse, validationErrorResponse } from './route-errors'
import { mapStructuralIssue } from './schemas'

/** null = ผ่าน · ไม่ผ่าน = 403 FEATURE_NOT_ENABLED / 409 NOT_AVAILABLE_FOR_SHOP */
export function featureGate(shopId: string, vertical: string): NextResponse | null {
  if (!isSalesFollowBotEnabled(shopId)) return salesFollowErrorResponse(new SalesFollowBotNotAvailableError('FEATURE_NOT_ENABLED'), 'gate')
  if (vertical !== 'ONLINE_SALES') return salesFollowErrorResponse(new SalesFollowBotNotAvailableError('NOT_AVAILABLE_FOR_SHOP'), 'gate')
  return null
}

/** parse ด้วย schema ของ schemas.ts — ผิด = 400 VALIDATION_ERROR (issues มี path/stepIndex/partIndex) */
export function parseWith<S extends v.GenericSchema>(schema: S, raw: unknown): { ok: true; value: v.InferOutput<S> } | { ok: false; response: NextResponse } {
  const r = v.safeParse(schema, raw)
  return r.success ? { ok: true, value: r.output } : { ok: false, response: validationErrorResponse(r.issues.map(mapStructuralIssue)) }
}

export const readJson = (req: Request): Promise<unknown> => req.json().catch(() => null)
