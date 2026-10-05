import { groupIdOf, type Ctx, handle, json, requireAccess } from '../../../_shared'
import { ackAlert } from '@/services/line-report-group.service'

export const dynamic = 'force-dynamic'

/** API §4.9 — L1 · idempotent */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const ownerId = await requireAccess('READ')
  return json(await ackAlert(ownerId, await groupIdOf(ctx)))
})
