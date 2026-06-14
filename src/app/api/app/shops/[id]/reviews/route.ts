import { NextRequest, NextResponse } from 'next/server'
import { getShopReviews } from '@/services/app-shop.service'

// GET /api/app/shops/[id]/reviews — รีวิวของร้าน (public)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json(await getShopReviews(id))
}
