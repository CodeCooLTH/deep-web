import { NextRequest } from 'next/server'
import * as v from 'valibot'
import { UpdateFollowUpSchema } from '@/lib/validations'
import { deleteFollowUp, updateFollowUp } from '@/services/customer-follow-up.service'
import { badId, fail, json, mapFollowUpError, parseId, readJson, requireScope, requireUser, validationError } from '../_shared'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id)
  if (!id) return badId()
  const u = await requireUser()
  if ('res' in u) return u.res
  const s = await requireScope(u)
  if ('res' in s) return s.res
  const body = await readJson(request)
  if (body === null) return fail(400, 'VALIDATION', 'Invalid input')
  const parsed = v.safeParse(UpdateFollowUpSchema, body)
  if (!parsed.success) return validationError(parsed.issues)
  try {
    return json({ item: await updateFollowUp(s.scope.shopIds, id, parsed.output) })
  } catch (e) {
    return mapFollowUpError(e, 'PATCH follow-up')
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id)
  if (!id) return badId()
  const u = await requireUser()
  if ('res' in u) return u.res
  const s = await requireScope(u)
  if ('res' in s) return s.res
  try {
    await deleteFollowUp(s.scope.shopIds, id)
    return json({ ok: true })
  } catch (e) {
    return mapFollowUpError(e, 'DELETE follow-up')
  }
}
