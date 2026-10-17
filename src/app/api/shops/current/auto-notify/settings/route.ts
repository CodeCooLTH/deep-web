/** PATCH /api/shops/current/auto-notify/settings — เพดานต่อห้องต่อวัน 1..20 (00078 · API §4.2 · X8) */
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { SetAutoNotifyCapSchema } from '@/lib/auto-notify/schemas'
import { autoNotifyErrorResponse } from '@/lib/auto-notify/route-errors'
import { setDailyCap } from '@/services/auto-notify-config.service'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'X8')
  if (!gate.ok) return gate.response
  const parsed = v.safeParse(SetAutoNotifyCapSchema, await request.json().catch(() => null))
  if (!parsed.success) return jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 })
  try {
    return jsonNoStore(await setDailyCap(gate.shopId, parsed.output.dailyCapPerRoom, gate.userId))
  } catch (e) {
    return autoNotifyErrorResponse(e, 'PATCH auto-notify/settings')
  }
}
