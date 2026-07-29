import { NextRequest, NextResponse } from 'next/server'
import { requireShopContext, forbidIfReadOnly, mapServiceError, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { duplicateKeyword } from '@/services/auto-reply-rule.service'

/** POST ทำสำเนากลุ่มคำ (AC-001-08 / GAP-01) — สำเนาต้องปิดใช้งานไว้ก่อนเสมอ */
export const dynamic = 'force-dynamic'

export async function POST(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id } = await params
  try {
    const created = await duplicateKeyword(id, ctx.shopId, ctx.userId)
    return NextResponse.json(created, { status: 201, headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'ทำสำเนาไม่สำเร็จ')
  }
}
