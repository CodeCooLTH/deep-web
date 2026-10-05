import { groupIdOf, type Ctx, handle, json, parseBody, requireAccess } from '../../_shared'
import { UpdateSettingsSchema } from '@/lib/line-report/validations'
import { leaveGroup } from '@/lib/line-report/line-client'
import { getGroupDetail, hasActiveBinding, removeGroup, updateSettings } from '@/services/line-report-group.service'

export const dynamic = 'force-dynamic'

/** API §4.4 — L1 (poll ทุก 3 วิ) */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const ownerId = await requireAccess('READ')
  return json(await getGroupDetail(ownerId, await groupIdOf(ctx)))
})

/** API §4.5 — L2 · autosave รายฟิลด์ */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const ownerId = await requireAccess('PAID')
  const id = await groupIdOf(ctx)
  const body = await parseBody(req, UpdateSettingsSchema)
  return json({ group: await updateSettings(ownerId, id, body) })
})

/** API §4.8 — L1 (มติ: แพ็กเกจหมดแล้วยกเลิกได้) · หลัง commit บอทออกจากกลุ่ม best-effort */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const ownerId = await requireAccess('READ')
  const { leaveLineGroupId } = await removeGroup(ownerId, await groupIdOf(ctx))
  let botLeft: boolean | null = leaveLineGroupId ? false : null
  // มีแถว ACTIVE ถือ id เดิมแล้ว = ถูกผูกใหม่ระหว่างนั้น → ห้ามสั่งบอทออก (จะหลุดจากกลุ่มของเจ้าของคนใหม่)
  if (leaveLineGroupId && !(await hasActiveBinding(leaveLineGroupId).catch(() => true))) {
    // ล้มก็ไม่ทำให้การลบล้ม — กลุ่มถูก REMOVED ไปแล้ว
    botLeft = await leaveGroup(leaveLineGroupId).catch((e) => {
      console.warn('[line-report-api] leaveGroup ล้ม', e instanceof Error ? e.name : 'unknown')
      return false
    })
  }
  return json({ removed: true, botLeft })
})
