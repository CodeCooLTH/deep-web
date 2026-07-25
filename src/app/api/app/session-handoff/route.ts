import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { createMobileTicket } from '@/lib/mobile-ticket'

// POST /api/app/session-handoff (Bearer) → { ticket }
// แอปเรียกก่อนเปิด WebView — ได้ ticket อายุ 60 วิ ใช้ครั้งเดียว เพื่อแลกเป็น session cookie ที่ /auth/mobile-enter
export async function POST(request: NextRequest) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  const ticket = await createMobileTicket(auth.user.id, 'enter')
  return NextResponse.json({ ticket })
}
