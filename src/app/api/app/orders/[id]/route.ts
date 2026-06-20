import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { getBuyerOrderDetail } from '@/services/app-order.service'

// GET /api/app/orders/[id] — รายละเอียดออเดอร์ + invoice (เจ้าของเท่านั้น)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  const { id } = await params
  const detail = await getBuyerOrderDetail(auth.user.id, id)
  if (!detail) return NextResponse.json({ error: 'ไม่พบออเดอร์' }, { status: 404 })
  return NextResponse.json(detail)
}
