import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { bidHistory } from '@/services/auction.service'

// GET /api/app/me/history — ประวัติการบิด → HistoryEntry[]
export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  return NextResponse.json(await bidHistory(auth.user.id))
}
