import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { exchangeCodeForToken, listManageablePages } from '@/lib/facebook/graph'
import { connectPages } from '@/services/shop-channel.service'
import { resolveActiveShopContext } from '@/lib/shop-context'
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

  // bug fix (แชทไม่แยกตามร้าน, user report prod): เดิม comment ตรงนี้บอกว่า "ต้องใช้ getShopByUserId
  // ตัวเดียวกับที่ /inbox ใช้อ่าน (kind:'PERSONAL')" — นั่นคือตัวบั๊กเอง เพราะ getShopByUserId คืน
  // PERSONAL เสมอ ไม่สนว่า user กำลัง active อยู่ร้านไหน (feature 00008 shop switcher) ผล: กำลังเปิด
  // ร้าน B อยู่แล้วกด "เชื่อม Facebook Page" กลับไปผูก channel เข้า PERSONAL แทน — /inbox ของร้าน B
  // จึงไม่เห็นข้อความ (ไปโผล่ที่ PERSONAL แทน)
  // เปลี่ยนเป็น resolveActiveShopContext (re-verify membership เสมอ) — ผูก channel กับร้านที่กำลัง
  // active จริง ไม่ใช่ PERSONAL เสมอไป; resolve ไม่ได้ (ร้านถูกลบ/หลุดสิทธิ์) → 'no_shop' เหมือนเดิม
  const activeCtx = await resolveActiveShopContext({
    user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
  })
  if (!activeCtx) return backToSettings(request, { status: 'no_shop' })

  try {
    const userToken = await exchangeCodeForToken(code, callbackUrl(request))
    const pages = await listManageablePages(userToken)
    if (pages.length === 0) {
      return backToSettings(request, { status: 'no_eligible_page' })
    }

    const result = await connectPages(activeCtx.shopId, userId, pages)
    const res = backToSettings(request, {
      status: 'connected',
      connected: String(result.connected),
      ...(result.skipped.length ? { skipped: result.skipped.join(',') } : {}),
      // I-4: ไม่ปล่อยให้ subscribe ล้มเหลวเงียบ ๆ — ต้องบอก seller ว่าเพจไหนเชื่อมแล้วแต่ยังไม่ได้รับ
      // webhook จริง (ต้องกดเชื่อมใหม่หรือติดต่อ support)
      ...(result.subscribeFailed.length ? { subscribeFailed: result.subscribeFailed.join(',') } : {}),
    })
    res.cookies.delete(OAUTH_STATE_COOKIE)
    return res
  } catch (e) {
    // ห้าม log token — log แค่ message
    console.error('[fb-connect] ล้มเหลว', e instanceof Error ? e.message : e)
    return backToSettings(request, { status: 'error' })
  }
}
