import { groupIdOf, type Ctx, handle, json, requireAccess, requireBotReady } from '../../../_shared'
import { sendTest } from '@/services/line-report-send.service'

export const dynamic = 'force-dynamic'
// build สรุปหลายร้าน + push LINE ในคำขอเดียว
export const maxDuration = 60

/** API §4.7 — L2 · ส่งทดสอบ (≤5/วัน/กลุ่ม) */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const ownerId = await requireAccess('PAID')
  requireBotReady()
  const { deliveryId, sentAt, remaining, summary } = await sendTest(ownerId, await groupIdOf(ctx))
  return json({ deliveryId, sentAt, remaining, summary })
})
