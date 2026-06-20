import { NextRequest, NextResponse } from 'next/server'
import { browseAuctions, type BrowseSort } from '@/services/auction.service'

const SORTS: BrowseSort[] = ['bidders', 'ending', 'priceHigh', 'priceLow']

// GET /api/app/auctions/browse?sort=&category=&page=
// public (ไม่ต้องล็อกอิน) — คืน { items, nextCursor }
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sortParam = searchParams.get('sort')
  const sort: BrowseSort = SORTS.includes(sortParam as BrowseSort)
    ? (sortParam as BrowseSort)
    : 'bidders'
  const category = searchParams.get('category')
  const pageRaw = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1

  const result = await browseAuctions({ sort, category, page })
  return NextResponse.json(result)
}
