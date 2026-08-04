/**
 * GET /go/profile — พาไปหน้าร้านจริงของบัญชีที่กำลังเปิดอยู่ (โดเมนผู้ซื้อ)
 *
 * ทำไมต้องมี route กลางแทนที่จะใส่ URL ตรง ๆ ในเมนู: `sellerMenuItems` เป็น module-level
 * constant ที่ `getSellerPageTitle.ts` import ตอน module load — ใส่ URL ที่ผันตามผู้ใช้ไม่ได้
 * (BUSINESS ที่มี slug → /b/{slug}, ที่เหลือ → /u/{username}) จึง resolve ที่นี่ต่อ request
 *
 * IMPORTANT: ต้องตัด `seller.` ออกจาก host ก่อนประกอบ URL — proxy.ts เติม `/seller` นำหน้า
 * ทุก path บน subdomain นี้ ถ้าส่ง `/b/{slug}` เปล่า ๆ เบราว์เซอร์จะต่อกับ host เดิมได้
 * `seller.<domain>/b/{slug}` → โดน rewrite เป็น `/seller/b/{slug}` → 404
 * (บั๊กจริงที่เคยเจอกับปุ่มเดียวกันนี้ในหน้า /public-profile — ดู public-profile/page.tsx)
 *
 * fallback ทุกกรณีที่ resolve ไม่ได้ = /dashboard (ไม่ใช่ 500) เพราะนี่คือลิงก์นำทางเฉย ๆ
 */
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user as { id: string; username?: string | null } | undefined
  if (!user?.id) return NextResponse.redirect(new URL('/auth/sign-in', await originFromHeaders()))

  const origin = await originFromHeaders()
  const buyerOrigin = origin.replace('://seller.', '://')

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )

  const target =
    active?.kind === 'BUSINESS' && active.shop.slug
      ? `${buyerOrigin}/b/${active.shop.slug}`
      : user.username
        ? `${buyerOrigin}/u/${user.username}`
        : `${origin}/dashboard`

  return NextResponse.redirect(target)
}

/** origin ของ request ตาม host จริง (dev = http, prod = https) */
async function originFromHeaders(): Promise<string> {
  const host = (await headers()).get('host') ?? ''
  const proto = host.startsWith('localhost') || host.includes('.local') ? 'http' : 'https'
  return `${proto}://${host}`
}
