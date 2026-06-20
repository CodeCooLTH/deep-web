import { NextRequest, NextResponse } from 'next/server'
import { listShops } from '@/services/app-shop.service'

// GET /api/app/shops?page= — รายชื่อร้าน (paginated, public)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const pageRaw = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1
  return NextResponse.json(await listShops(page))
}
