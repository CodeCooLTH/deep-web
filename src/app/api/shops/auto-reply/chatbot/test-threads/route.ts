import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, forbidIfReadOnly, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { prisma } from '@/lib/prisma'
import { AutoReplyTestThreadSchema } from '@/lib/validations'

/**
 * GET/POST แชทที่ใช้ทดสอบ ChatBot (ระดับร้าน)
 *
 * Base: keywords/[id]/test-threads/route.ts — โครงเดียวกัน ต่างที่ผูก shopId แทน keywordId
 * เพราะ ChatBot เป็นสวิตช์ระดับร้าน ไม่มีกลุ่มคำให้ผูก
 *
 * WARNING: ทั้ง GET และ POST ต้อง scope shopId — ไม่งั้นเดา conversationId ของร้านอื่น
 * แล้วผูกข้ามร้านได้
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error

  const rows = await prisma.aiChatbotTestThread.findMany({
    where: { shopId: ctx.shopId },
    select: {
      id: true,
      conversation: {
        select: {
          id: true,
          alias: true,
          lastMessageAt: true,
          lastMessagePreview: true,
          externalContact: { select: { name: true, avatarUrl: true } },
          shopChannel: { select: { name: true, provider: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const items = rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation.id,
    name: r.conversation.alias ?? r.conversation.externalContact?.name ?? 'ไม่ทราบชื่อ',
    avatarUrl: r.conversation.externalContact?.avatarUrl ?? null,
    channelName: r.conversation.shopChannel?.name ?? null,
    lastMessagePreview: r.conversation.lastMessagePreview,
  }))

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
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  // เธรดต้องเป็นของร้านนี้จริง — เช็คก่อนเขียนเสมอ
  const conv = await prisma.conversation.findFirst({
    where: { id: parsed.output.conversationId, shopId: ctx.shopId },
    select: { id: true },
  })
  if (!conv) return NextResponse.json({ error: 'ไม่พบแชทนี้ในร้าน' }, { status: 404 })

  // เลือกซ้ำ = ไม่ใช่ error (unique constraint กันไว้แล้ว) — คืน ok ให้ UI ไม่ต้องแยกเคส
  await prisma.aiChatbotTestThread.upsert({
    where: { shopId_conversationId: { shopId: ctx.shopId, conversationId: conv.id } },
    create: { shopId: ctx.shopId, conversationId: conv.id },
    update: {},
  })
  return NextResponse.json({ ok: true }, { status: 201, headers: AUTO_REPLY_NO_STORE })
}
