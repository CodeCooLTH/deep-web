import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { listBuyerOrders } from '@/services/app-order.service'

// GET /api/app/orders — ออเดอร์ของ buyer ปัจจุบัน
export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  return NextResponse.json(await listBuyerOrders(auth.user.id))
}
