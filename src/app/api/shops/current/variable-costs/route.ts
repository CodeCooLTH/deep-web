/**
 * GET/PUT /api/shops/current/variable-costs — ต้นทุนต่อออเดอร์ที่ร้านตั้งเอง (feature 00096 P2 · BRD FR-016)
 *
 * เจ้าของร้านเท่านั้น (F1 — เปลี่ยนวิธีนับกำไรของร้าน) · ทุกประเภทร้าน · PUT ส่งครบ 4 ช่อง (valibot ตรวจช่วงค่า)
 * Base (โครง guard + error mapping): src/app/api/shops/current/report-settings/route.ts
 */
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import * as v from 'valibot'

import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { VariableCostSchema } from '@/lib/variable-cost'
import { getShopVariableCosts, updateShopVariableCosts } from '@/services/variable-cost.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'F1')
  if (!gate.ok) return gate.response
  return jsonNoStore(await getShopVariableCosts(gate.shopId))
}

export async function PUT(request: NextRequest) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'F1')
  if (!gate.ok) return gate.response
  const parsed = v.safeParse(VariableCostSchema, await request.json().catch(() => null))
  if (!parsed.success) return jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 })
  try {
    return jsonNoStore(await updateShopVariableCosts(gate.shopId, parsed.output))
  } catch (e) {
    console.error('[PUT /api/shops/current/variable-costs] shopId:', gate.shopId, e instanceof Error ? e.message : e)
    return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
