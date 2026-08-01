import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import {
  requireShopContext,
  forbidIfReadOnly,
  mapServiceError,
  AUTO_REPLY_NO_STORE,
} from '@/lib/auto-reply-route-context'
import { bulkQna, type QnaBulkAction } from '@/services/auto-reply-qna.service'
import { AutoReplyQnaBulkSchema } from '@/lib/validations'

/**
 * POST ทำหลายข้อพร้อมกัน — เปิด/ปิด/ย้ายกลุ่ม/ลบ (API.md §4.34 · phase `00023-qna`)
 *
 * WARNING: endpoint นี้คืน **200 พร้อม partial result** เมื่อบางข้อทำไม่ได้ ไม่ใช่ 4xx ทั้งก้อน
 * เหตุผลอยู่ที่ `bulkQna` (TFR-034 ข้อ 4): ย้ายกลุ่มแล้วปลายทางมีคำถามซ้ำอยู่แล้วเป็นเรื่องปกติ
 * ถ้าล้มทั้งชุด ร้านที่เลือก 50 ข้อจะไม่รู้ว่าข้อไหนเป็นปัญหาและต้องไล่ลองทีละข้อเอง
 * ผู้เรียกต้องอ่าน `failed[]` เสมอ — `ok > 0` ไม่ได้แปลว่าสำเร็จหมด
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  await params // keywordId ไม่ได้ใช้ตัดสินอะไร — ownership อยู่ที่ shopId + qnaIds ใน service

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyQnaBulkSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  try {
    const result = await bulkQna(
      ctx.shopId,
      parsed.output.qnaIds,
      parsed.output.action as QnaBulkAction,
      { targetKeywordId: parsed.output.targetKeywordId, actorUserId: ctx.userId },
    )
    return NextResponse.json(result, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'ทำรายการไม่สำเร็จ')
  }
}
