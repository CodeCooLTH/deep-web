import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { prisma } from '@/lib/prisma'
import { invalidateShop } from '@/lib/auto-reply-cache'
import { ConversationAutoReplyPatchSchema } from '@/lib/validations'

/**
 * PATCH /api/chat/conversations/{id}/auto-reply — คุม auto-reply ระดับเธรด (S-12)
 *
 * WARNING: endpoint นี้ **ห้ามส่งข้อความถึงลูกค้าเด็ดขาด** — เป็นการเปลี่ยนสถานะเท่านั้น
 *
 * STAFF ใช้ได้ (ต่างจาก endpoint ตั้งค่าระดับร้าน) เพราะเป็นการควบคุมเธรดที่ตัวเองดูแลอยู่
 * ซึ่งเป็นงานประจำวันของแอดมิน — แต่แก้ค่าระดับร้านผ่านเส้นทางนี้ไม่ได้
 */
export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(ConversationAutoReplyPatchSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const o = parsed.output

  // ตรวจว่าเธรดเป็นของร้านที่ active ก่อนเสมอ — และถ้าจะตั้งบริบทสินค้า ต้องเป็นสินค้าของร้านนี้
  const conversation = await prisma.conversation.findFirst({
    where: { id, shopId: ctx.shopId },
    select: { id: true },
  })
  if (!conversation) return NextResponse.json({ error: 'ไม่พบเธรดนี้ในร้าน' }, { status: 404 })

  if (o.contextProductId) {
    const product = await prisma.product.findFirst({
      where: { id: o.contextProductId, shopId: ctx.shopId },
      select: { id: true },
    })
    if (!product) return NextResponse.json({ error: 'ไม่พบสินค้านี้ในร้าน' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if (o.autoReplyEnabled !== undefined) data.autoReplyEnabled = o.autoReplyEnabled
  // AC-016-04: แอดมินเปิดกลับเองก่อนครบเวลาได้
  if (o.clearPause) data.autoReplyPausedUntil = null
  // TD-012: ล้าง handoff = เธรดกลับมาให้ระบบดูแลต่อ (ต้องล้าง reason ด้วยไม่งั้นค้างสับสน)
  if (o.clearHandoff) {
    data.handoffAt = null
    data.handoffReason = null
  }
  if (o.contextProductId !== undefined) {
    data.contextProductId = o.contextProductId
    // AC-014-02: สิ่งที่คนกำหนดเองชนะการแมปจากโฆษณาเสมอ — ต้องบันทึกที่มาไว้ ไม่งั้นรอบถัดไป
    // ระบบจะไม่รู้ว่าค่านี้มาจากคนหรือจากการเดา แล้วอาจถูกทับด้วย ADS_MAPPING
    data.contextProductSource = o.contextProductId ? 'MANUAL' : null
    data.contextProductAt = o.contextProductId ? new Date() : null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'ไม่มีข้อมูลที่ต้องแก้ไข' }, { status: 400 })
  }

  const updated = await prisma.conversation.update({
    where: { id },
    data,
    select: {
      id: true,
      autoReplyEnabled: true,
      autoReplyPausedUntil: true,
      autoReplyCount: true,
      handoffAt: true,
      handoffReason: true,
      contextProductId: true,
      contextProductSource: true,
    },
  })
  invalidateShop(ctx.shopId)
  return NextResponse.json(updated, { headers: AUTO_REPLY_NO_STORE })
}
