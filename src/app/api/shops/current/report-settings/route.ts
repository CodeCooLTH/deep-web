/**
 * GET/PATCH /api/shops/current/report-settings — ตั้งค่ารายงานการเงิน (feature 00073 เฟส B · FR-010)
 *
 * เจ้าของร้านเท่านั้น (F1 — ตัวเลขเงินเต็มเป็นของเจ้าของ 00071) · ร้านบริการเท่านั้น (ร้านอื่น 403)
 * PATCH ส่งเฉพาะช่องที่เปลี่ยน · ช่องที่ไม่รู้จักถูกตัดทิ้ง (valibot object)
 *
 * Base (โครง guard + error mapping): src/app/api/shops/current/appointment-settings/route.ts
 */
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import * as v from 'valibot'

import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { UpdateReportSettingsSchema } from '@/lib/report-settings'
import {
  ReportSettingsNotAvailableError,
  getReportSettings,
  updateReportSettings,
} from '@/services/report-settings.service'
import { prisma } from '@/lib/prisma'
import { usesServiceFinanceRules } from '@/lib/finance-rules'

export const dynamic = 'force-dynamic'

const NOT_AVAILABLE = { error: 'FEATURE_NOT_AVAILABLE', message: 'ตั้งค่ารายงานใช้ได้เฉพาะร้านบริการ' }

export async function GET() {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'F1')
  if (!gate.ok) return gate.response
  const shop = await prisma.shop.findUnique({ where: { id: gate.shopId }, select: { vertical: true } })
  if (!usesServiceFinanceRules(shop?.vertical)) return jsonNoStore(NOT_AVAILABLE, { status: 403 })
  return jsonNoStore(await getReportSettings(gate.shopId))
}

export async function PATCH(request: NextRequest) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'F1')
  if (!gate.ok) return gate.response
  const parsed = v.safeParse(UpdateReportSettingsSchema, await request.json().catch(() => null))
  if (!parsed.success) return jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 })
  try {
    return jsonNoStore(await updateReportSettings(gate.shopId, parsed.output))
  } catch (e) {
    if (e instanceof ReportSettingsNotAvailableError) return jsonNoStore(NOT_AVAILABLE, { status: 403 })
    console.error('[PATCH /api/shops/current/report-settings] shopId:', gate.shopId, e instanceof Error ? e.message : e)
    return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
