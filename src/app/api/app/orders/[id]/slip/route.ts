import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireAppUser } from '@/lib/app-auth'
import { AppSlipSchema } from '@/lib/app-validations'
import { prisma } from '@/lib/prisma'

// POST /api/app/orders/[id]/slip  { fileId } — แนบสลิปโอนเงิน (อัปไฟล์ที่ /api/app/upload ก่อน)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (body === null) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const parsed = v.safeParse(AppSlipSchema, body)
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })

  // updateMany + buyerUserId + status PENDING → กันแนบของคนอื่น + แนบได้เฉพาะตอนรอชำระ
  const res = await prisma.order.updateMany({
    where: { id, buyerUserId: auth.user.id, status: 'PENDING' },
    data: { slipFileId: parsed.output.fileId },
  })
  if (res.count === 0)
    return NextResponse.json({ error: 'แนบสลิปไม่ได้ (ไม่พบออเดอร์ หรือเลยขั้นชำระเงินแล้ว)' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
