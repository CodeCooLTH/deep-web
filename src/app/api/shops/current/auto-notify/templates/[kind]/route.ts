/** PUT/DELETE /api/shops/current/auto-notify/templates/[kind] — บันทึก/คืนค่าตั้งต้นเทมเพลต (00078 · API §4.4–4.5 · X8) */
import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { jsonNoStore, NO_STORE } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import {
  AutoNotifyKindSchema,
  DeleteAutoNotifyTemplateQuerySchema,
  SaveAutoNotifyTemplateSchema,
} from '@/lib/auto-notify/schemas'
import { autoNotifyErrorResponse } from '@/lib/auto-notify/route-errors'
import { resetTemplate, saveTemplate } from '@/services/auto-notify-config.service'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ kind: string }> }

export async function PUT(request: NextRequest, ctx: Ctx) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'X8')
  if (!gate.ok) return gate.response
  const kind = v.safeParse(AutoNotifyKindSchema, (await ctx.params).kind)
  const body = v.safeParse(SaveAutoNotifyTemplateSchema, await request.json().catch(() => null))
  if (!kind.success || !body.success) return jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 })
  try {
    const { body: text, expectedUpdatedAt } = body.output
    return jsonNoStore(
      await saveTemplate(gate.shopId, kind.output, text, expectedUpdatedAt ? new Date(expectedUpdatedAt) : null, gate.userId),
    )
  } catch (e) {
    return autoNotifyErrorResponse(e, 'PUT auto-notify/templates')
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'X8')
  if (!gate.ok) return gate.response
  const kind = v.safeParse(AutoNotifyKindSchema, (await ctx.params).kind)
  const q = v.safeParse(DeleteAutoNotifyTemplateQuerySchema, {
    expectedUpdatedAt: request.nextUrl.searchParams.get('expectedUpdatedAt'),
  })
  if (!kind.success || !q.success) return jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 })
  try {
    await resetTemplate(gate.shopId, kind.output, new Date(q.output.expectedUpdatedAt))
    return new NextResponse(null, { status: 204, headers: NO_STORE })
  } catch (e) {
    return autoNotifyErrorResponse(e, 'DELETE auto-notify/templates')
  }
}
