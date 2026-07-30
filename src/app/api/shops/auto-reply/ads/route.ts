import { NextResponse } from 'next/server'
import { requireShopContext, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/shops/auto-reply/ads — โฆษณาที่เคยมีลูกค้าทักเข้ามาจริง (AC-007-05)
 *
 * อ่านจาก ConversationAdReferral ของ feature 00018 ที่เก็บไว้อยู่แล้ว — ไม่สร้างตารางใหม่
 * และไม่ดึงชื่อแคมเปญ/ชุดโฆษณาจาก Marketing API (PRD §5 นอกขอบเขต ต้องขอ ads_read เพิ่ม)
 * ร้านตั้งชื่อกำกับเองได้ที่ AutoReplyRule.adLabel แทน
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error

  // scope ผ่าน conversation.shopId — referral ไม่มี shopId ตรง ๆ (ผูกกับเธรด)
  const rows = await prisma.conversationAdReferral.findMany({
    where: { adId: { not: null }, conversation: { shopId: ctx.shopId } },
    select: { adId: true, adTitle: true, adBody: true, adPermalink: true, receivedAt: true },
    orderBy: { receivedAt: 'desc' },
    take: 500,
  })

  // ยุบตาม adId เอาตัวล่าสุดของแต่ละโฆษณา + นับจำนวนครั้งที่ถูกกด
  const byAd = new Map<string, { adId: string; adTitle: string | null; adBody: string | null; adPermalink: string | null; lastSeenAt: Date; hitCount: number }>()
  for (const r of rows) {
    const key = r.adId as string
    const found = byAd.get(key)
    if (found) {
      found.hitCount++
    } else {
      byAd.set(key, {
        adId: key,
        adTitle: r.adTitle,
        adBody: r.adBody,
        adPermalink: r.adPermalink,
        lastSeenAt: r.receivedAt,
        hitCount: 1,
      })
    }
  }

  return NextResponse.json({ items: [...byAd.values()] }, { headers: AUTO_REPLY_NO_STORE })
}
