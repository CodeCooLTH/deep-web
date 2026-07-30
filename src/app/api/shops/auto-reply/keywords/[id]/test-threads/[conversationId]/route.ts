import { NextRequest, NextResponse } from 'next/server'
import { requireShopContext, forbidIfReadOnly, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { prisma } from '@/lib/prisma'
import { invalidateShop } from '@/lib/auto-reply-cache'

/**
 * DELETE เอาแชทออกจากรายการทดสอบของกลุ่มคำนี้ (feature 00023)
 *
 * WARNING: ถอดแชทสุดท้ายออกจากกลุ่มที่สถานะเป็น TEST = กลุ่มนั้นจะไม่ตอบใครเลยทันที
 * จึงตอบ `remainingCount` กลับไปให้ UI เตือนได้ ไม่ใช่ปล่อยให้ร้านค้นพบเองว่าเงียบไปเฉย ๆ
 */
export const dynamic = 'force-dynamic'

export async function DELETE(
  _r: NextRequest,
  { params }: { params: Promise<{ id: string; conversationId: string }> },
) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id, conversationId } = await params

  // scope ด้วย shopId ที่ตัวกลุ่มคำ — กันลบของร้านอื่นด้วยการเดา id
  const keyword = await prisma.autoReplyKeyword.findFirst({
    where: { id, shopId: ctx.shopId },
    select: { id: true, status: true },
  })
  if (!keyword) return NextResponse.json({ error: 'ไม่พบกลุ่มคำนี้' }, { status: 404 })

  await prisma.autoReplyKeywordTestThread.deleteMany({ where: { keywordId: id, conversationId } })
  const remainingCount = await prisma.autoReplyKeywordTestThread.count({ where: { keywordId: id } })

  invalidateShop(ctx.shopId)
  return NextResponse.json(
    { ok: true, remainingCount, status: keyword.status },
    { headers: AUTO_REPLY_NO_STORE },
  )
}
