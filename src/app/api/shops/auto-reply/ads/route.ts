import { NextResponse } from 'next/server'
import { requireShopContext, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/shops/auto-reply/ads — โฆษณาที่เคยมีลูกค้าทักเข้ามาจริง (AC-007-05)
 *
 * อ่านจาก ConversationAdReferral ของ feature 00018 ที่เก็บไว้อยู่แล้ว — ไม่สร้างตารางใหม่
 * และไม่ดึงชื่อแคมเปญ/ชุดโฆษณาจาก Marketing API (PRD §5 นอกขอบเขต ต้องขอ ads_read เพิ่ม)
 * ร้านตั้งชื่อกำกับเองได้ที่ AutoReplyRule.adLabel แทน
 *
 * WARNING (บั๊กจริง 2026-08-02): เดิมดึง referral ดิบ 500 แถวล่าสุดมายุบเป็นโฆษณาใน JS
 * ร้านที่มีทราฟฟิกหนักจากโฆษณาตัวเดียว โฆษณาตัวอื่นจะหลุดหายจากรายการทั้งที่ยังมีอยู่จริง
 * (500 แถวอาจเป็นโฆษณาเดียวทั้งหมด) — เปลี่ยนเป็น groupBy ซึ่งนับครบทุกแถวในฐาน
 * แล้วค่อยดึง metadata ของเฉพาะโฆษณาที่ได้มา
 */
export const dynamic = 'force-dynamic'

/** จำนวนโฆษณาสูงสุดที่ส่งกลับ — พอสำหรับร้านที่ยิงโฆษณาเยอะ และ prompt/DOM ไม่บวม */
const MAX_ADS = 200
/** แถวที่ดึงมาเติมชื่อ/รูป — ไม่ใช่ตัวนับอีกต่อไป จึงไม่กระทบความครบของรายการ */
const METADATA_SAMPLE = 1000

export async function GET() {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error

  // scope ผ่าน conversation.shopId — referral ไม่มี shopId ตรง ๆ (ผูกกับเธรด)
  const where = { adId: { not: null }, conversation: { shopId: ctx.shopId } } as const

  // นับจากทั้งฐาน ไม่ใช่จากตัวอย่าง — ตัวเลข "ทัก N ครั้ง" จึงเป็นความจริง
  const grouped = await prisma.conversationAdReferral.groupBy({
    by: ['adId'],
    where,
    _count: { _all: true },
    _max: { receivedAt: true },
    orderBy: { _count: { adId: 'desc' } },
    take: MAX_ADS,
  })
  if (grouped.length === 0) return NextResponse.json({ items: [] }, { headers: AUTO_REPLY_NO_STORE })

  const adIds = grouped.map((g) => g.adId).filter((x): x is string => Boolean(x))

  // ดึง metadata ของเฉพาะโฆษณาที่ติดอันดับ — เรียงใหม่ไปเก่าเพื่อให้ค่าล่าสุดชนะ
  const rows = await prisma.conversationAdReferral.findMany({
    where: { ...where, adId: { in: adIds } },
    select: {
      adId: true,
      adTitle: true,
      adBody: true,
      adPermalink: true,
      photoFileId: true,
    },
    orderBy: { receivedAt: 'desc' },
    take: METADATA_SAMPLE,
  })

  type Meta = {
    adTitle: string | null
    adBody: string | null
    adPermalink: string | null
    photoFileId: string | null
  }
  const metaByAd = new Map<string, Meta>()
  for (const r of rows) {
    const key = r.adId as string
    const found = metaByAd.get(key)
    if (!found) {
      metaByAd.set(key, {
        adTitle: r.adTitle,
        adBody: r.adBody,
        adPermalink: r.adPermalink,
        photoFileId: r.photoFileId,
      })
      continue
    }
    // Meta ไม่ได้ส่งรูป/ชื่อ/ข้อความมาทุกครั้ง — เก็บค่าที่มีจริงจากครั้งเก่ากว่าไว้
    // ไม่งั้นโฆษณาตัวเดิมจะกลายเป็นไม่มีรูปเพราะบังเอิญครั้งล่าสุดไม่มีมา
    found.adTitle ??= r.adTitle
    found.adBody ??= r.adBody
    found.adPermalink ??= r.adPermalink
    found.photoFileId ??= r.photoFileId
  }

  const items = grouped
    .filter((g): g is typeof g & { adId: string } => Boolean(g.adId))
    .map((g) => ({
      adId: g.adId,
      ...(metaByAd.get(g.adId) ?? { adTitle: null, adBody: null, adPermalink: null, photoFileId: null }),
      lastSeenAt: g._max.receivedAt,
      hitCount: g._count._all,
    }))

  return NextResponse.json({ items }, { headers: AUTO_REPLY_NO_STORE })
}
