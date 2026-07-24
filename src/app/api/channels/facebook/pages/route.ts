import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listManageablePages } from '@/lib/facebook/graph'
import { readPendingUserToken } from '@/lib/facebook/pending-connect'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { describePageStates } from '@/services/shop-channel.service'

/**
 * GET /api/channels/facebook/pages — รายการเพจให้หน้า "เลือกเพจที่จะเชื่อม" (feature 00018)
 *
 * ดึงสดจาก Graph ทุกครั้งด้วย user token ที่ callback พักไว้ใน cookie แล้วเทียบกับ ShopChannel
 * ว่าเพจไหนว่าง/เชื่อมกับร้านนี้อยู่แล้ว/ติดร้านอื่น
 *
 * ห้ามคืน access token ออกไปเด็ดขาด — response มีแค่ข้อมูลที่ใช้แสดงผล
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = (session.user as { id: string }).id

  const activeCtx = await resolveActiveShopContext({
    user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
  })
  if (!activeCtx) return NextResponse.json({ error: 'no_shop' }, { status: 400 })

  // 410 Gone = "เคยมีแต่หมดอายุแล้ว" — client เอาไปแยกกับ error อื่นเพื่อชวนให้เริ่มเชื่อมใหม่
  // (ครอบทั้งกรณีเข้าหน้านี้ตรง ๆ โดยไม่ผ่าน OAuth ด้วย — ผลลัพธ์สำหรับผู้ใช้เหมือนกัน)
  const userToken = readPendingUserToken(request)
  if (!userToken) return NextResponse.json({ error: 'session_expired' }, { status: 410 })

  try {
    const pages = await listManageablePages(userToken)
    const states = await describePageStates(
      activeCtx.shopId,
      pages.map((p) => p.id),
    )
    const shop = await prisma.shop.findUnique({
      where: { id: activeCtx.shopId },
      select: { shopName: true },
    })

    return NextResponse.json(
      {
        shopName: shop?.shopName ?? null,
        pages: pages.map((p) => ({
          id: p.id,
          name: p.name,
          // URL สาธารณะแบบเสถียรของ Graph (ไม่ต้อง token) — ชุดเดียวกับที่ upsertChannel เก็บลง DB
          avatarUrl: `https://graph.facebook.com/${p.id}/picture?type=large`,
          hasInstagram: p.instagramBusinessAccountId !== null,
          state: states[p.id]?.state ?? 'available',
          occupiedBy: states[p.id]?.occupiedBy ?? null,
        })),
      },
      // ข้อมูลผูกกับผู้ใช้+ร้าน ห้ามให้ shared cache (CDN/มือถือ 5G) เก็บไปเสิร์ฟข้ามคน
      { headers: { 'cache-control': 'private, no-store' } },
    )
  } catch (e) {
    console.error('[fb-pages] ล้มเหลว', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'graph_error' }, { status: 502 })
  }
}
