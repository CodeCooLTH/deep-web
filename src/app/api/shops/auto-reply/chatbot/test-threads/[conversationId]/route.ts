import { NextRequest, NextResponse } from 'next/server'
import { requireShopContext, forbidIfReadOnly, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { prisma } from '@/lib/prisma'

/** DELETE เอาแชทออกจากรายการทดสอบ ChatBot */
export const dynamic = 'force-dynamic'

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { conversationId } = await params

  // deleteMany + shopId ใน where — เอาออกของร้านอื่นไม่ได้แม้เดา id ถูก
  await prisma.aiChatbotTestThread.deleteMany({ where: { shopId: ctx.shopId, conversationId } })

  // คืนจำนวนที่เหลือ + สถานะ ให้ UI เตือนได้ว่า "เอาตัวสุดท้ายออกแล้ว = ChatBot เงียบสนิท"
  const [remainingCount, cfg] = await Promise.all([
    prisma.aiChatbotTestThread.count({ where: { shopId: ctx.shopId } }),
    prisma.autoReplyConfig.findUnique({
      where: { shopId: ctx.shopId },
      select: { aiChatbotStatus: true },
    }),
  ])
  return NextResponse.json(
    { ok: true, remainingCount, status: cfg?.aiChatbotStatus ?? 'OFFLINE' },
    { headers: AUTO_REPLY_NO_STORE }
  )
}
