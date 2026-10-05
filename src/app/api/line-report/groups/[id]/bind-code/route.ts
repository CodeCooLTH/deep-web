import { groupIdOf, type Ctx, handle, json, requireAccess, requireBotReady } from '../../../_shared'
import { reissueBindCode } from '@/services/line-report-bind.service'

export const dynamic = 'force-dynamic'

/** API §4.3 — L2 · body `{}` ไม่ต้องอ่าน (ไม่ต้องรับทราบซ้ำ) */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const ownerId = await requireAccess('PAID')
  requireBotReady()
  return json(await reissueBindCode(ownerId, await groupIdOf(ctx)))
})
