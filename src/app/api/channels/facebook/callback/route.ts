import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { exchangeCodeForToken, listManageablePages } from '@/lib/facebook/graph'
import { encryptToken } from '@/lib/token-crypto'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { OAUTH_USER_TOKEN_COOKIE, PENDING_TOKEN_COOKIE_OPTIONS } from '@/lib/facebook/pending-connect'
import { OAUTH_STATE_COOKIE, callbackUrl } from '../connect/route'
import { sessionUserId } from '@/lib/session-user'

// รับ code จาก Facebook (feature 00018)
//
// เดิม callback นี้ "เชื่อมทุกเพจที่ user มีสิทธิ์" เข้าร้านที่ active อยู่ทันที — เป็นบั๊กเชิงพฤติกรรม
// ที่อันตราย: user คนหนึ่งมักดูแลเพจของตัวเองหลายเพจ พอเข้ามาเชื่อมเพจของร้าน เพจส่วนตัวที่เหลือ
// ถูกลากเข้าร้านนั้นไปด้วยทั้งหมด (ถูก subscribe webhook + ข้อความไหลเข้า inbox ที่พนักงานคนอื่นเห็น)
//
// ตอนนี้ callback แค่ "พก token ไปต่อ" แล้วพา user ไปหน้าเลือกเพจ — ไม่แตะ DB ไม่ subscribe อะไรเลย
// การเชื่อมจริงเกิดที่ POST /api/channels/facebook/confirm หลัง user ติ๊กเลือกเอง

export const dynamic = 'force-dynamic'

function backToSettings(request: NextRequest, query: Record<string, string>) {
  const url = new URL('/settings/channels', request.nextUrl.origin)
  for (const [k, val] of Object.entries(query)) url.searchParams.set(k, val)
  // status 302 ให้สอดคล้องกับ connect route — ค่า default ของ NextResponse.redirect คือ 307
  return NextResponse.redirect(url.toString(), 302)
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!session?.user || !userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

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

  // bug fix (แชทไม่แยกตามร้าน, user report prod): เดิมใช้ getShopByUserId ซึ่งคืน PERSONAL เสมอ
  // ไม่สนว่า user กำลัง active อยู่ร้านไหน (feature 00008 shop switcher) ผล: กำลังเปิดร้าน B อยู่
  // แล้วกด "เชื่อม Facebook Page" กลับไปผูก channel เข้า PERSONAL แทน — /inbox ของร้าน B ไม่เห็นข้อความ
  // resolveActiveShopContext re-verify membership เสมอ; resolve ไม่ได้ (ร้านถูกลบ/หลุดสิทธิ์) → 'no_shop'
  //
  // ยังต้อง resolve ตรงนี้แม้จะไม่เขียน DB แล้ว — เพื่อฟันธงตั้งแต่ต้นทางว่า user มีร้านให้เชื่อมจริง
  // (ไม่งั้นจะไปเด้ง error เอาตอนกดยืนยันหลังเลือกเพจไปแล้ว = เสียเที่ยว)
  const activeCtx = await resolveActiveShopContext({
    user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
  })
  if (!activeCtx) return backToSettings(request, { status: 'no_shop' })

  try {
    const userToken = await exchangeCodeForToken(code, callbackUrl(request))
    // ยิง listManageablePages ตรงนี้เพื่อ "คัดกรองล่วงหน้า" อย่างเดียว — ถ้าไม่มีเพจที่มีสิทธิ์เลย
    // ต้องบอกที่หน้าตั้งค่าเลย ไม่ใช่พาไปหน้าเลือกเพจว่าง ๆ (รายการจริงดึงใหม่ที่หน้านั้นอีกที)
    const pages = await listManageablePages(userToken)
    if (pages.length === 0) {
      return backToSettings(request, { status: 'no_eligible_page' })
    }

    // ไปหน้าเลือกเพจ พร้อมพา user token (เข้ารหัส) ไปใน cookie httpOnly อายุสั้น
    const res = NextResponse.redirect(new URL('/settings/channels/select', request.nextUrl.origin).toString(), 302)
    res.cookies.set(OAUTH_USER_TOKEN_COOKIE, encryptToken(userToken), PENDING_TOKEN_COOKIE_OPTIONS)
    res.cookies.delete(OAUTH_STATE_COOKIE)
    return res
  } catch (e) {
    // ห้าม log token — log แค่ message
    console.error('[fb-connect] ล้มเหลว', e instanceof Error ? e.message : e)
    return backToSettings(request, { status: 'error' })
  }
}
