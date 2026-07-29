import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, forbidIfReadOnly, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { prisma } from '@/lib/prisma'
import { AutoReplyTestThreadSchema } from '@/lib/validations'

/** GET/POST เธรดใน allowlist ของโหมดทดสอบ (AC-021-02/06) */
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const items = await prisma.conversation.findMany({
    where: { shopId: ctx.shopId, autoReplyTestEnabled: true },
    select: {
      id: true,
      lastMessageAt: true,
      alias: true,
      externalContact: { select: { name: true } },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ items, canEdit: ctx.canEdit }, { headers: AUTO_REPLY_NO_STORE })
}

export async function POST(request: NextRequest) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyTestThreadSchema, body)
  if (!parsed.success) {
    // AC-021-06: ไม่มี confirmed: true = ปฏิเสธ — ข้อความจะถูกส่งถึงคนจริง ต้องยืนยันก่อนเสมอ
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  // shopId ใน where = กันเพิ่มเธรดของร้านอื่นเข้า allowlist ของตัวเอง
  const { count } = await prisma.conversation.updateMany({
    where: { id: parsed.output.conversationId, shopId: ctx.shopId },
    data: { autoReplyTestEnabled: true },
  })
  if (count === 0) return NextResponse.json({ error: 'ไม่พบเธรดนี้ในร้าน' }, { status: 404 })
  return NextResponse.json({ ok: true }, { headers: AUTO_REPLY_NO_STORE })
}
