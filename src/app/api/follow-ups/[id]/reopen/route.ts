import { NextRequest } from 'next/server'
import { reopenFollowUp } from '@/services/customer-follow-up.service'
import { badId, json, mapFollowUpError, parseId, requireScope, requireUser } from '../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id)
  if (!id) return badId()
  const u = await requireUser()
  if ('res' in u) return u.res
  const s = await requireScope(u)
  if ('res' in s) return s.res
  try {
    return json({ item: await reopenFollowUp(s.scope.shopIds, id) })
  } catch (e) {
    return mapFollowUpError(e, 'reopen follow-up')
  }
}
