'use server'

// server action สำหรับ browse ร้านค้า (infinite scroll ฝั่ง client) — filter tier + ค้นชื่อ + cursor.
// map raw → display shape (tier/dots/color) ที่ serializable ส่งกลับ client
import { browseShops } from '@/services/shop.service'
import { getTierDisplay } from '@/services/trust-score.service'
import { getTierColor } from '@/lib/trust-tier'
import type { TierChipColor } from '@/lib/trust-tier'

const resolveImg = (u: string) => (u.startsWith('http') ? u : `/api/files/${u}`)

export type ShopItem = {
  username: string
  shopName: string
  image: string | null
  trustScore: number
  tier: string
  dots: number
  tierColor: TierChipColor
  verified: boolean
}

export async function browseShopsAction(opts: {
  tier?: string
  q?: string
  cursor?: string
}): Promise<{ items: ShopItem[]; nextCursor: string | null }> {
  const { items, nextCursor } = await browseShops({ ...opts, take: 20 })
  return {
    items: items.map(s => {
      const disp = getTierDisplay(s.trustScore)
      return {
        username: s.username,
        shopName: s.shops[0]?.shopName ?? s.displayName,
        image: s.shops[0]?.logo ? resolveImg(s.shops[0].logo) : s.avatar,
        trustScore: s.trustScore,
        tier: disp.tier,
        dots: disp.dots,
        tierColor: getTierColor(s.trustScore),
        verified: s.verifications.length > 0
      }
    }),
    nextCursor
  }
}
