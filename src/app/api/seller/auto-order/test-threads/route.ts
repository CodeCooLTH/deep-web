import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'

import { prisma } from '@/lib/prisma'
import { getOrCreateAutoOrderConfig } from '@/services/auto-order-config.service'
import { requireAutoOrderShop } from '../_shared'

export const dynamic = 'force-dynamic'

/**
 * ห้องแชทสำหรับทดสอบ — สัญญา REST ตรงกับที่ `TestThreadsCard.tsx` คาดไว้ทุกตัว
 * (`GET` → `{items}` · `POST {conversationId, confirmed}` · `DELETE /{conversationId}`)
 *
 * 🛑 จงใจ reuse component เดิมแทนเขียนตารางใหม่ — การ์ดนั้นถือ **คำเตือนที่สำคัญที่สุด**
 * ของทั้งกลไก ("ระบบจะทำงานกับคนจริงในแชทนั้น ไม่ใช่การจำลอง") ไว้ในตัวมันเองแล้ว
 * เขียนใหม่ = ต้องจำมาเขียนคำเตือนซ้ำ ซึ่งเป็นสิ่งที่คนลืมได้
 */
const AddSchema = v.object({
  conversationId: v.string(),
  /** การ์ดส่งมาหลังผู้ใช้กดยืนยันใน Swal — บังคับซ้ำที่ server กันการยิงตรง */
  confirmed: v.literal(true),
})

export async function GET() {
  const guard = await requireAutoOrderShop()
  if (!guard.ok) return guard.response

  const config = await getOrCreateAutoOrderConfig(guard.shopId)
  const rows = await prisma.autoOrderAgentTestThread.findMany({
    where: { configId: config.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      conversationId: true,
      conversation: {
        select: {
          lastMessageAt: true,
          lastMessagePreview: true,
          externalContact: { select: { name: true, avatarUrl: true } },
          shopChannel: { select: { name: true, provider: true } },
        },
      },
    },
  })

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      name: r.conversation.externalContact?.name ?? 'ไม่ทราบชื่อ',
      avatarUrl: r.conversation.externalContact?.avatarUrl ?? null,
      channelName: r.conversation.shopChannel?.name ?? null,
      provider: r.conversation.shopChannel?.provider ?? null,
      lastMessageAt: r.conversation.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: r.conversation.lastMessagePreview,
    })),
  })
}

export async function POST(request: NextRequest) {
  const guard = await requireAutoOrderShop()
  if (!guard.ok) return guard.response

  const parsed = v.safeParse(AddSchema, await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })

  // ownership อยู่ใน WHERE ตั้งแต่คิวรีแรก — เธรดของร้านอื่นต้องไม่ถูกอ่านขึ้นมาเลย
  const owned = await prisma.conversation.findFirst({
    where: { id: parsed.output.conversationId, shopId: guard.shopId },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'ไม่พบห้องแชทนี้' }, { status: 404 })

  const config = await getOrCreateAutoOrderConfig(guard.shopId)
  await prisma.autoOrderAgentTestThread.upsert({
    where: { configId_conversationId: { configId: config.id, conversationId: owned.id } },
    create: { configId: config.id, conversationId: owned.id },
    update: {},
  })
  return NextResponse.json({ ok: true })
}
