import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'

// GET /api/app/me/replays — Live ย้อนหลัง
// ⚠️ Live/realtime ยังไม่ทำ (deferred — "realtime ค่อยคุย") → คืน [] ไปก่อน.
export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  return NextResponse.json([])
}
