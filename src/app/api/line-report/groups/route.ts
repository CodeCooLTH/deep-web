import { handle, json, requireAccess } from '../_shared'
import { listGroups } from '@/services/line-report-group.service'

export const dynamic = 'force-dynamic'

/** API §4.1 — L1 */
export const GET = handle(async () => json(await listGroups(await requireAccess('READ'))))
