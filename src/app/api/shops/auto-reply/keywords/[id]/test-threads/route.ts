import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, forbidIfReadOnly, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { prisma } from '@/lib/prisma'
import { invalidateShop } from '@/lib/auto-reply-cache'
import { AutoReplyTestThreadSchema } from '@/lib/validations'

/**
 * GET/POST แชทที่ใช้ทดสอบของกลุ่มคำหนึ่ง ๆ (feature 00023)
 *
 * แทน `/api/shops/auto-reply/test-mode/threads` เดิมที่เป็น allowlist ระดับร้าน —
 * user 2026-07-29: "ให้ตั้งค่าทดสอบได้ทีละอัน" ทำให้แต่ละกลุ่มคำมีรายการแชททดสอบของตัวเอง
 * ทดสอบชุดใหม่กับแชทตัวเองได้ โดยชุดที่ LIVE อยู่ยังตอบลูกค้าจริงในเวลาเดียวกัน
 *
 * WARNING: keywordId ต้องถูก scope ด้วย shopId ทุกครั้ง (ทั้ง GET และ POST) — ไม่งั้นเดา id
 * ของร้านอื่นแล้วผูกเธรดข้ามร้านได้
 */
export const dynamic = 'force-dynamic'

/** ตรวจว่ากลุ่มคำนี้เป็นของร้านที่ active จริง — คืน null ถ้าไม่ใช่ */
async function findKeyword(id: string, shopId: string) {
  return prisma.autoReplyKeyword.findFirst({ where: { id, shopId }, select: { id: true } })
}

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const { id } = await params

  if (!(await findKeyword(id, ctx.shopId))) {
    return NextResponse.json({ error: 'ไม่พบกลุ่มคำนี้' }, { status: 404 })
  }

  const rows = await prisma.autoReplyKeywordTestThread.findMany({
    where: { keywordId: id },
    select: {
      id: true,
      createdAt: true,
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
    provider: r.conversation.shopChannel?.provider ?? null,
    lastMessageAt: r.conversation.lastMessageAt,
    lastMessagePreview: r.conversation.lastMessagePreview,
  }))

  return NextResponse.json({ items, canEdit: ctx.canEdit }, { headers: AUTO_REPLY_NO_STORE })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyTestThreadSchema, body)
  if (!parsed.success) {
    // AC-021-06: ไม่มี confirmed: true = ปฏิเสธ — ข้อความจะถูกส่งถึงคนจริง ต้องยืนยันก่อนเสมอ
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  if (!(await findKeyword(id, ctx.shopId))) {
    return NextResponse.json({ error: 'ไม่พบกลุ่มคำนี้' }, { status: 404 })
  }

  // shopId ใน where = กันผูกเธรดของร้านอื่นเข้ากลุ่มคำของตัวเอง
  const conversation = await prisma.conversation.findFirst({
    where: { id: parsed.output.conversationId, shopId: ctx.shopId },
    select: { id: true },
  })
  if (!conversation) return NextResponse.json({ error: 'ไม่พบแชทนี้ในร้าน' }, { status: 404 })

  // เพิ่มซ้ำ = ไม่ถือว่าผิด (@@unique กันไว้แล้ว) ตอบ ok เหมือนเดิมเพื่อให้ UI ไม่ต้องแยกเคส
  await prisma.autoReplyKeywordTestThread.upsert({
    where: { keywordId_conversationId: { keywordId: id, conversationId: conversation.id } },
    create: { keywordId: id, conversationId: conversation.id },
    update: {},
  })
  invalidateShop(ctx.shopId)
  return NextResponse.json({ ok: true }, { headers: AUTO_REPLY_NO_STORE })
}
