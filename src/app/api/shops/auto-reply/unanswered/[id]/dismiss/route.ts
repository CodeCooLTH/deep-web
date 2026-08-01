import { NextRequest, NextResponse } from 'next/server'
import {
  requireShopContext,
  forbidIfReadOnly,
  mapServiceError,
  AUTO_REPLY_NO_STORE,
} from '@/lib/auto-reply-route-context'
import { dismissUnanswered } from '@/services/auto-reply-unanswered.service'

/**
 * POST กดข้ามคำถามในคิว (API.md §4.38 · phase `00023-qna`)
 *
 * NOTE: "ข้าม" ไม่ใช่ "ลบ" — แถวยังอยู่ในสถานะ DISMISSED เพื่อให้ยกเลิกได้ (§4.39) และเพื่อ
 * เป็นหลักฐานว่าร้านตัดสินใจกับคำถามนี้ไปแล้ว ถ้าลบทิ้งจริง คำถามเดิมจะกลับเข้าคิวใหม่
 * ในฐานะ "งานค้าง" ทุกครั้งที่ลูกค้าถามซ้ำ แล้วร้านต้องตัดสินใจเรื่องเดิมไม่รู้จบ
 */
export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id } = await params

  try {
    await dismissUnanswered(id, ctx.shopId, ctx.userId)
    return NextResponse.json({ ok: true }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'ข้ามคำถามไม่สำเร็จ')
  }
}
