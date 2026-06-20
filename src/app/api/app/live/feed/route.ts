import { NextResponse } from 'next/server'

// GET /api/app/live/feed?page= — Live feed (TikTok-style)
// ⚠️ Live/realtime ยังไม่ทำ (deferred — "realtime ค่อยคุย") → คืน feed ว่าง.
// โครงสร้าง { items, nextCursor } ตรงกับ Paginated<T> เพื่อให้แอปไม่พัง.
export async function GET() {
  return NextResponse.json({ items: [], nextCursor: null })
}
