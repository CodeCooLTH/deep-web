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
    // photoFileId: รูปโฆษณาที่ mirror เข้า storage แล้วตอนรับ webhook (feature 00018)
    // มีอยู่ในตารางนี้ตั้งแต่แรก แต่เดิมไม่ได้ดึงมา — ตัวเลือกจึงเป็นข้อความล้วน
    // ซึ่งแยกโฆษณาที่ตั้งชื่อคล้ายกัน (หรือ Meta ไม่ส่งชื่อมาเลย) ไม่ออก
    select: {
      adId: true,
      adTitle: true,
      adBody: true,
      adPermalink: true,
      photoFileId: true,
      receivedAt: true,
    },
    orderBy: { receivedAt: 'desc' },
    take: 500,
  })

  // ยุบตาม adId เอาตัวล่าสุดของแต่ละโฆษณา + นับจำนวนครั้งที่ถูกกด
  type AdItem = {
    adId: string
    adTitle: string | null
    adBody: string | null
    adPermalink: string | null
    photoFileId: string | null
    lastSeenAt: Date
    hitCount: number
  }
  const byAd = new Map<string, AdItem>()
  for (const r of rows) {
    const key = r.adId as string
    const found = byAd.get(key)
    if (found) {
      found.hitCount++
      // referral เรียงใหม่->เก่า ตัวแรกของแต่ละโฆษณาจึงใหม่สุดอยู่แล้ว แต่บางครั้ง Meta
      // ไม่ส่งรูป/ข้อความมาในครั้งนั้น — เก็บค่าที่มีจริงจากครั้งเก่ากว่าไว้แทนที่จะปล่อยว่าง
      found.photoFileId ??= r.photoFileId
      found.adTitle ??= r.adTitle
      found.adBody ??= r.adBody
      found.adPermalink ??= r.adPermalink
    } else {
      byAd.set(key, {
        adId: key,
        adTitle: r.adTitle,
        adBody: r.adBody,
        adPermalink: r.adPermalink,
        photoFileId: r.photoFileId,
        lastSeenAt: r.receivedAt,
        hitCount: 1,
      })
    }
  }

  // เรียงตามที่ถูกทักบ่อยสุดก่อน แล้วค่อยตามความใหม่ — โฆษณาที่ร้านต้องตั้งคำตอบจริง ๆ
  // คือตัวที่มีคนทักเยอะ ไม่ใช่ตัวที่บังเอิญเจอก่อนใน referral
  const items = [...byAd.values()].sort(
    (a, b) => b.hitCount - a.hitCount || b.lastSeenAt.getTime() - a.lastSeenAt.getTime()
  )
  return NextResponse.json({ items }, { headers: AUTO_REPLY_NO_STORE })
}
