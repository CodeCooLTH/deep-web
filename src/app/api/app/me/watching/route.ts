import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { watchingAuctions } from '@/services/auction.service'

// GET /api/app/me/watching — auction ที่ติดตามไว้
export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  return NextResponse.json(await watchingAuctions(auth.user.id))
}
