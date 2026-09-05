import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'

import { replacePhrases } from '@/services/auto-order-config.service'
import { requireAutoOrderShop, mapAutoOrderError } from '../_shared'

export const dynamic = 'force-dynamic'

const BodySchema = v.object({
  // เพดาน 20 วลี/ยาว 100 ตัวอักษร — บังคับที่ server ไม่ใช่แค่ maxlength ของ input
  phrases: v.pipe(
    v.array(v.pipe(v.string(), v.maxLength(100))),
    v.maxLength(20),
  ),
})

/** PUT /api/seller/auto-order/phrases — แทนที่ชุดวลีทั้งชุด */
export async function PUT(request: NextRequest) {
  const guard = await requireAutoOrderShop()
  if (!guard.ok) return guard.response

  const parsed = v.safeParse(BodySchema, await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลวลีไม่ถูกต้อง' }, { status: 400 })

  try {
    const rows = await replacePhrases(guard.shopId, parsed.output.phrases)
    return NextResponse.json({ phrases: rows.map((p) => ({ id: p.id, phrase: p.phrase })) })
  } catch (e) {
    const mapped = mapAutoOrderError(e)
    if (mapped) return mapped
    throw e
  }
}
