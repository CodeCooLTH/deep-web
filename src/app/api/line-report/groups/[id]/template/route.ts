import { groupIdOf, type Ctx, handle, json, parseBody, requireAccess } from '../../../_shared'
import * as v from 'valibot'
import { LineReportError } from '@/lib/line-report/errors'
import { resetTemplate, updateTemplate } from '@/services/line-report-group.service'

export const dynamic = 'force-dynamic'

/** เพดาน body (FR-EXT-10) — เทมเพลตจริง ≤16 KB; เกินนี้ = ไม่ใช่เทมเพลตที่ถูกต้องอยู่แล้ว ไม่ต้องอ่านต่อ */
const MAX_BODY_BYTES = 64 * 1024

// template เป็น unknown: ให้ validateTemplate ใน service บอก rule/blockId (TEMPLATE_INVALID) แทน VALIDATION เฉย ๆ
const PutSchema = v.strictObject({
  template: v.unknown(),
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
  confirmProfit: v.optional(v.boolean()),
})

/** FR-EXT-10 — L2 · บันทึกเทมเพลต (optimistic lock ด้วย expectedVersion) */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const ownerId = await requireAccess('PAID')
  const id = await groupIdOf(ctx)
  // content-length กันก่อนอ่าน · ตรวจความยาวจริงซ้ำเพราะ header ปลอม/ไม่มีได้ (chunked)
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) throw new LineReportError('TEMPLATE_TOO_LARGE', { reason: 'BODY' })
  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new LineReportError('TEMPLATE_TOO_LARGE', { reason: 'BODY' })
  const body = await parseBody(new Request(req.url, { method: 'PUT', body: text }), PutSchema)
  const { measure, ...group } = await updateTemplate(ownerId, id, body)
  return json({ group, warnings: measure.warnings, size: { bytes: measure.bytes, limit: measure.limit } })
})

/** FR-EXT-10 — L2 · คืนแบบมาตรฐาน */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const ownerId = await requireAccess('PAID')
  return json({ group: await resetTemplate(ownerId, await groupIdOf(ctx)) })
})
