import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireAppUser } from '@/lib/app-auth'
import { AppReviewSchema } from '@/lib/app-validations'
import { getOrderTokenForBuyer } from '@/services/app-order.service'
import { createReview } from '@/services/review.service'

// POST /api/app/orders/[id]/review  { rating, comment? }  (เจ้าของออเดอร์)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (body === null) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const parsed = v.safeParse(AppReviewSchema, body)
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลรีวิวไม่ถูกต้อง' }, { status: 400 })

  // ตรวจว่า order เป็นของ buyer คนนี้ → ได้ publicToken มาเรียก service เดิมของเว็บ
  const token = await getOrderTokenForBuyer(auth.user.id, id)
  if (!token) return NextResponse.json({ error: 'ไม่พบออเดอร์' }, { status: 404 })

  try {
    const review = await createReview(token, {
      rating: parsed.output.rating,
      comment: parsed.output.text, // แอปส่ง `text` → เก็บเป็น comment
      reviewerUserId: auth.user.id,
    })
    return NextResponse.json({ ok: true, id: review.id }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'review failed'
    // state guard / รีวิวซ้ำ → 409, อื่น ๆ → 500
    if (/already exists|Cannot review/.test(msg)) {
      return NextResponse.json({ error: 'รีวิวออเดอร์นี้ไม่ได้ (สถานะไม่พร้อม หรือรีวิวไปแล้ว)' }, { status: 409 })
    }
    console.error('[POST /api/app/orders/[id]/review] failed', e)
    return NextResponse.json({ error: 'รีวิวไม่สำเร็จ' }, { status: 500 })
  }
}
