import { NextRequest, NextResponse } from 'next/server'
import { getShopDetail } from '@/services/app-shop.service'

// GET /api/app/shops/[id] — รายละเอียดร้าน (public)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const shop = await getShopDetail(id)
  if (!shop) return NextResponse.json({ error: 'ไม่พบร้านค้า' }, { status: 404 })
  return NextResponse.json(shop)
}
