import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import {
  requireShopContext,
  forbidIfReadOnly,
  mapServiceError,
  AUTO_REPLY_NO_STORE,
} from '@/lib/auto-reply-route-context'
import { convertUnansweredToQna } from '@/services/auto-reply-unanswered.service'
import { AutoReplyUnansweredConvertSchema } from '@/lib/validations'

/**
 * POST กรอกคำตอบให้คำถามในคิว — สร้างข้อในคลัง + ปิดคิวแถวนั้น (API.md §4.40 · phase `00023-qna`)
 *
 * NOTE: สองการเขียนนี้อยู่ใน `prisma.$transaction` เดียวกันที่ชั้น service — ถ้าปิดคิวพลาด
 * ข้อในคลังต้องไม่ถูกสร้างค้างไว้ ไม่งั้นร้านจะกรอกซ้ำแล้วชน unique constraint
 * โดยที่คิวยังบอกว่า "ยังไม่ได้ตอบ" (แก้ไปแล้วเมื่อ 2026-08-01 — เดิมเป็นสองคำสั่งแยก)
 *
 * `question` ให้ร้านแก้ได้ก่อนบันทึก โดยค่าเริ่มต้นมาจาก `rawSample` ของคิว — ตั้งใจให้แก้ได้
 * เพราะข้อความจริงของลูกค้าอาจมีคำฟุ่มเฟือยที่ทำให้ match ครั้งหน้าไม่ติด
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyUnansweredConvertSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  try {
    const result = await convertUnansweredToQna(
      id,
      ctx.shopId,
      {
        keywordId: parsed.output.keywordId,
        question: parsed.output.question,
        answer: parsed.output.answer,
        imageFileIds: parsed.output.imageFileIds,
      },
      ctx.userId,
    )
    return NextResponse.json(result, { status: 201, headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'บันทึกคำตอบไม่สำเร็จ')
  }
}
