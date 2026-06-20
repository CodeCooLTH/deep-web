import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { listWonOrders } from '@/services/app-order.service'

// GET /api/app/me/won — รายการที่ชนะ/ออเดอร์สำเร็จ
export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  return NextResponse.json(await listWonOrders(auth.user.id))
}
