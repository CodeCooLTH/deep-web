import { NextRequest } from 'next/server'
import * as v from 'valibot'
import { SnoozeFollowUpSchema } from '@/lib/validations'
import { snoozeFollowUp } from '@/services/customer-follow-up.service'
import { badId, fail, json, mapFollowUpError, parseId, readJson, requireScope, requireUser, validationError } from '../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id)
  if (!id) return badId()
  const u = await requireUser()
  if ('res' in u) return u.res
  const s = await requireScope(u, 'X2')
  if ('res' in s) return s.res
  const body = await readJson(request)
  if (body === null) return fail(400, 'VALIDATION', 'Invalid input')
  const parsed = v.safeParse(SnoozeFollowUpSchema, body)
  if (!parsed.success) return validationError(parsed.issues)
  try {
    return json({ item: await snoozeFollowUp(s.scope.shopIds, id, parsed.output) })
  } catch (e) {
    return mapFollowUpError(e, 'snooze follow-up')
  }
}
