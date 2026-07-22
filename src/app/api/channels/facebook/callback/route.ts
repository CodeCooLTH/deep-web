import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { exchangeCodeForToken, listManageablePages } from '@/lib/facebook/graph'
import { connectPages } from '@/services/shop-channel.service'
import { OAUTH_STATE_COOKIE, callbackUrl } from '../connect/route'

// รับ code จาก Facebook แล้วเชื่อมทุก Page ที่ user มีสิทธิ์ MESSAGING+MODERATE (feature 00018)
// MVP เชื่อมให้ทั้งหมดเลย — หน้าจอให้เลือกทีละเพจอยู่ในแผน UI

export const dynamic = 'force-dynamic'

function backToSettings(request: NextRequest, query: Record<string, string>) {
  const url = new URL('/settings/channels', request.nextUrl.origin)
  for (const [k, val] of Object.entries(query)) url.searchParams.set(k, val)
  // status 302 ให้สอดคล้องกับ connect route — ค่า default ของ NextResponse.redirect คือ 307
  return NextResponse.redirect(url.toString(), 302)
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const userId = (session.user as { id: string }).id

  const { searchParams } = request.nextUrl
  // user กด "ยกเลิก" ในหน้า Facebook
  if (searchParams.get('error')) {
    return backToSettings(request, { status: 'cancelled' })
  }

  const state = searchParams.get('state')
  const expected = request.cookies.get(OAUTH_STATE_COOKIE)?.value
  if (!state || !expected || state !== expected) {
    return backToSettings(request, { status: 'state_mismatch' })
  }

  const code = searchParams.get('code')
  if (!code) return backToSettings(request, { status: 'no_code' })

  const shop = await prisma.shop.findFirst({ where: { userId }, select: { id: true } })
  if (!shop) return backToSettings(request, { status: 'no_shop' })

  try {
    const userToken = await exchangeCodeForToken(code, callbackUrl(request))
    const pages = await listManageablePages(userToken)
    if (pages.length === 0) {
      return backToSettings(request, { status: 'no_eligible_page' })
    }

    const result = await connectPages(shop.id, userId, pages)
    const res = backToSettings(request, {
      status: 'connected',
      connected: String(result.connected),
      ...(result.skipped.length ? { skipped: result.skipped.join(',') } : {}),
    })
    res.cookies.delete(OAUTH_STATE_COOKIE)
    return res
  } catch (e) {
    // ห้าม log token — log แค่ message
    console.error('[fb-connect] ล้มเหลว', e instanceof Error ? e.message : e)
    return backToSettings(request, { status: 'error' })
  }
}
