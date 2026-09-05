import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'

import { replaceTestThreads } from '@/services/auto-order-config.service'
import { requireAutoOrderShop, mapAutoOrderError } from '../_shared'

export const dynamic = 'force-dynamic'

const BodySchema = v.object({ conversationIds: v.array(v.string()) })

/** PUT /api/seller/auto-order/test-threads — แทนที่ชุดห้องทดสอบทั้งชุด */
export async function PUT(request: NextRequest) {
  const guard = await requireAutoOrderShop()
  if (!guard.ok) return guard.response

  const parsed = v.safeParse(BodySchema, await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลห้องแชทไม่ถูกต้อง' }, { status: 400 })

  try {
    const rows = await replaceTestThreads(guard.shopId, parsed.output.conversationIds)
    return NextResponse.json({ conversationIds: rows.map((r) => r.conversationId) })
  } catch (e) {
    const mapped = mapAutoOrderError(e)
    if (mapped) return mapped
    throw e
  }
}
