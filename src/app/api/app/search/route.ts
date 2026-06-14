import { NextRequest, NextResponse } from 'next/server'
import { searchAuctions } from '@/services/auction.service'

// GET /api/app/search?q= — ค้นหา auction (public)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''
  return NextResponse.json(await searchAuctions(q))
}
