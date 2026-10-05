import { groupIdOf, type Ctx, handle, json, parseBody, requireAccess } from '../../../_shared'
import { ReplaceShopsSchema } from '@/lib/line-report/validations'
import { replaceGroupShops } from '@/services/line-report-shop.service'

export const dynamic = 'force-dynamic'

/** API §4.6 — L2 · แทนที่ร้านที่รวม */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const ownerId = await requireAccess('PAID')
  const id = await groupIdOf(ctx)
  const { shopIds } = await parseBody(req, ReplaceShopsSchema)
  return json({ shops: await replaceGroupShops(ownerId, id, shopIds) })
})
