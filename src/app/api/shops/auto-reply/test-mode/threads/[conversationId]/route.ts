import { NextRequest, NextResponse } from 'next/server'
import { requireShopContext, forbidIfReadOnly, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { prisma } from '@/lib/prisma'

/** DELETE ถอดเธรดออกจาก allowlist โหมดทดสอบ (API.md §4.22) */
export const dynamic = 'force-dynamic'

export async function DELETE(
  _r: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { conversationId } = await params

  const { count } = await prisma.conversation.updateMany({
    where: { id: conversationId, shopId: ctx.shopId },
    data: { autoReplyTestEnabled: false },
  })
  if (count === 0) return NextResponse.json({ error: 'ไม่พบเธรดนี้ในร้าน' }, { status: 404 })
  return NextResponse.json({ ok: true }, { headers: AUTO_REPLY_NO_STORE })
}
