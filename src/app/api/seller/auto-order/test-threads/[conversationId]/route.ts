import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { getOrCreateAutoOrderConfig } from '@/services/auto-order-config.service'
import { requireAutoOrderShop } from '../../_shared'

export const dynamic = 'force-dynamic'

/**
 * DELETE — เอาห้องออกจากรายการทดสอบ
 *
 * 🛑 คืน `remainingCount` + `status` เสมอ — การ์ดใช้สองค่านี้บอกผู้ใช้ว่า "เอาออกตัวสุดท้าย
 * ทั้งที่ยังอยู่โหมดทดสอบ = ระบบจะเงียบสนิททันที" ซึ่งเป็นสภาพที่ระบบยอมให้เกิดโดยตั้งใจ
 * (ไม่ auto-flip เป็น OFFLINE) ⇒ ถ้าไม่บอกตรงนั้น ผู้ขายจะไม่มีทางรู้เลย
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const guard = await requireAutoOrderShop()
  if (!guard.ok) return guard.response

  const { conversationId } = await params
  const config = await getOrCreateAutoOrderConfig(guard.shopId)

  await prisma.autoOrderAgentTestThread.deleteMany({
    where: { configId: config.id, conversationId },
  })
  const remainingCount = await prisma.autoOrderAgentTestThread.count({
    where: { configId: config.id },
  })

  return NextResponse.json({ remainingCount, status: config.status })
}
