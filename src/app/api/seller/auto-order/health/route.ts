import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'

import { prisma } from '@/lib/prisma'
import { checkMessageEchoesHealth, repairMessageEchoes } from '@/services/message-echoes-health.service'
import { requireAutoOrderShop } from '../_shared'

export const dynamic = 'force-dynamic'

const BodySchema = v.object({
  shopChannelId: v.string(),
  /** `true` = กดปุ่ม "ซ่อมให้" · `false`/ไม่ส่ง = แค่ตรวจ */
  repair: v.optional(v.boolean(), false),
})

/**
 * POST /api/seller/auto-order/health — ตรวจ/ซ่อมสิทธิ์ `message_echoes` ของเพจ
 *
 * 🛑 ยิง Graph จริงทุกครั้ง **ไม่ derive จากวันที่เชื่อมเพจ** (AC-ACO-10/74) — เพจที่เชื่อม
 * ก่อนที่เราจะเพิ่ม field ใหม่จะไม่มีมันติดมาเอง และเงียบสนิทเหมือนไม่มีอะไรเกิดขึ้น
 */
export async function POST(request: NextRequest) {
  const guard = await requireAutoOrderShop()
  if (!guard.ok) return guard.response

  const parsed = v.safeParse(BodySchema, await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })

  // 🛑 ownership อยู่ใน WHERE ตั้งแต่คิวรีแรก ไม่ใช่ดึงมาแล้วค่อยเทียบ — เพจของร้านอื่นต้อง
  // ไม่ถูกอ่านขึ้นมาเลย และตอบ 404 เหมือน "ไม่มีแถวนี้" เพื่อกัน enumeration
  const owned = await prisma.shopChannel.findFirst({
    where: { id: parsed.output.shopChannelId, shopId: guard.shopId },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'ไม่พบช่องทางนี้' }, { status: 404 })

  const status = parsed.output.repair
    ? await repairMessageEchoes(owned.id)
    : await checkMessageEchoesHealth(owned.id)

  return NextResponse.json({ shopChannelId: owned.id, messageEchoesStatus: status })
}
