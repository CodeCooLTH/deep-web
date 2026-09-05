import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'

import { replaceChannels } from '@/services/auto-order-config.service'
import { requireAutoOrderShop, mapAutoOrderError } from '../_shared'

export const dynamic = 'force-dynamic'

const BodySchema = v.object({ shopChannelIds: v.array(v.string()) })

/** PUT /api/seller/auto-order/channels — แทนที่ชุดเพจทั้งชุด */
export async function PUT(request: NextRequest) {
  const guard = await requireAutoOrderShop()
  if (!guard.ok) return guard.response

  const parsed = v.safeParse(BodySchema, await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลช่องทางไม่ถูกต้อง' }, { status: 400 })

  try {
    // id ที่ไม่ใช่ของร้านนี้ถูกกรองทิ้งใน service (scope อยู่ใน WHERE) — ตอบกลับด้วยชุดที่
    // บันทึกจริง ไม่ใช่ echo สิ่งที่ client ส่งมา เพื่อให้หน้าจอเห็นทันทีว่าอะไรถูกตัดทิ้ง
    const rows = await replaceChannels(guard.shopId, parsed.output.shopChannelIds)
    return NextResponse.json({ shopChannelIds: rows.map((r) => r.shopChannelId) })
  } catch (e) {
    const mapped = mapAutoOrderError(e)
    if (mapped) return mapped
    throw e
  }
}
