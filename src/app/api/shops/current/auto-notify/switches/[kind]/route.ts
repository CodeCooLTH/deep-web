/** PUT /api/shops/current/auto-notify/switches/[kind] — เปิด/ปิดจังหวะ (00078 · API §4.3 · X8) */
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { AutoNotifyKindSchema, AutoNotifySwitchBodySchema } from '@/lib/auto-notify/schemas'
import { autoNotifyErrorResponse } from '@/lib/auto-notify/route-errors'
import { setSwitch } from '@/services/auto-notify-config.service'

export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'X8')
  if (!gate.ok) return gate.response
  const kind = v.safeParse(AutoNotifyKindSchema, (await ctx.params).kind)
  const body = v.safeParse(AutoNotifySwitchBodySchema, await request.json().catch(() => null))
  if (!kind.success || !body.success) return jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 })
  try {
    return jsonNoStore(await setSwitch(gate.shopId, kind.output, body.output.enabled, gate.userId))
  } catch (e) {
    return autoNotifyErrorResponse(e, 'PUT auto-notify/switches')
  }
}
