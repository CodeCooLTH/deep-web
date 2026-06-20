import { NextResponse } from 'next/server'
import { topAuctions } from '@/services/auction.service'

// GET /api/app/auctions/top — auction ที่บิดเยอะสุด (public)
export async function GET() {
  const items = await topAuctions(10)
  return NextResponse.json(items)
}
