import { handle, json, parseBody, requireAccess, requireBotReady } from '../_shared'
import { CreateBindCodeSchema } from '@/lib/line-report/validations'
import { createBindCode } from '@/services/line-report-bind.service'

export const dynamic = 'force-dynamic'

/** API §4.2 — L2 · สร้างกลุ่ม PENDING + โค้ด (คืน code ครั้งเดียว) */
export const POST = handle(async (req: Request) => {
  const ownerId = await requireAccess('PAID')
  requireBotReady()
  const body = await parseBody(req, CreateBindCodeSchema)
  return json(await createBindCode(ownerId, { shopIds: body.shopIds }), 201)
})
