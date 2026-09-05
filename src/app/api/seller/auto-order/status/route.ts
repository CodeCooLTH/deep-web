import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'

import { setAutoOrderStatus, AUTO_ORDER_STATUSES } from '@/services/auto-order-config.service'
import { requireAutoOrderShop, mapAutoOrderError } from '../_shared'

export const dynamic = 'force-dynamic'

const BodySchema = v.object({ status: v.picklist([...AUTO_ORDER_STATUSES]) })

/** PATCH /api/seller/auto-order/status — เปลี่ยนสถานะ OFFLINE/TEST/LIVE */
export async function PATCH(request: NextRequest) {
  const guard = await requireAutoOrderShop()
  if (!guard.ok) return guard.response

  const parsed = v.safeParse(BodySchema, await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 })

  try {
    const config = await setAutoOrderStatus(guard.shopId, parsed.output.status, guard.userId)
    return NextResponse.json({ status: config.status })
  } catch (e) {
    const mapped = mapAutoOrderError(e)
    if (mapped) return mapped
    throw e
  }
}
