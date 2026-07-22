import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GRAPH_VERSION, CONNECT_SCOPES } from '@/lib/facebook/constants'

// เริ่ม OAuth เชื่อม Facebook Page (feature 00018)
//
// แยกจาก FacebookProvider ของ NextAuth โดยตั้งใจ — นั่นคือ login ของผู้ใช้ทั่วไป
// ถ้าเอา scope จัดการเพจไปใส่ที่นั่น ผู้ใช้ทุกคนจะโดนขอสิทธิ์เกินจำเป็นตั้งแต่สมัคร
// และถ้า App Review ตก login ทั้งระบบจะพังตามไปด้วย

export const dynamic = 'force-dynamic'

export const OAUTH_STATE_COOKIE = 'fb_channel_oauth_state'

export function callbackUrl(request: NextRequest): string {
  return `${request.nextUrl.origin}/api/channels/facebook/callback`
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const appId = process.env.FB_CHAT_APP_ID
  if (!appId) {
    return NextResponse.json({ error: 'ยังไม่ได้ตั้งค่า FB_CHAT_APP_ID' }, { status: 500 })
  }

  // state กัน CSRF ของ OAuth — ผูกไว้ใน cookie httpOnly แล้วเทียบตอน callback
  const state = randomBytes(16).toString('hex')

  const authorizeUrl = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`)
  authorizeUrl.searchParams.set('client_id', appId)
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl(request))
  authorizeUrl.searchParams.set('scope', CONNECT_SCOPES)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('state', state)

  // ต้องระบุ status 302 ชัด ๆ — ค่า default ของ NextResponse.redirect คือ 307
  // ซึ่งเบราว์เซอร์บาง engine จะ preserve method เดิม (ปกติไม่ใช่ปัญหาสำหรับ GET แต่ 302 คือมาตรฐาน OAuth redirect)
  const res = NextResponse.redirect(authorizeUrl.toString(), 302)
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // ต้อง lax ไม่ใช่ strict — cookie ต้องรอดตอน Facebook redirect กลับมา
    path: '/api/channels/facebook',
    maxAge: 600,
  })
  return res
}
