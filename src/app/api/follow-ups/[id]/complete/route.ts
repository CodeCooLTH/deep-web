import { NextRequest } from 'next/server'
import * as v from 'valibot'
import { CompleteFollowUpSchema } from '@/lib/validations'
import { completeFollowUp } from '@/services/customer-follow-up.service'
import { badId, fail, json, mapFollowUpError, parseId, readJson, requireScope, requireUser, validationError } from '../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id)
  if (!id) return badId()
  const u = await requireUser()
  if ('res' in u) return u.res
  const s = await requireScope(u, 'X2')
  if ('res' in s) return s.res
  // body ว่างได้ = "ข้าม" (outcome null)
  const body = (await readJson(request)) ?? {}
  const parsed = v.safeParse(CompleteFollowUpSchema, body)
  if (!parsed.success) return validationError(parsed.issues)
  try {
    return json({ item: await completeFollowUp(u.userId, s.scope.shopIds, id, parsed.output.outcome ?? null) })
  } catch (e) {
    return mapFollowUpError(e, 'complete follow-up')
  }
}
