// Next Imports
import { unstable_cache } from 'next/cache'

// Util Imports
import { getServerMode } from '@core/utils/serverHelpers'
import { fileUrlOf } from '@/lib/file-url'

// Component Imports
import FrontLayout from '@components/layout/front-pages'
import LandingPageWrapper from '@views/front-pages/landing-page'

// Type Imports
import type { LandingShop } from '@views/front-pages/landing-page/TrustSearchHero'

// Service Imports
import { getConfirmedOrderCountByShopIds, getShopCount, getTrustedShops } from '@/services/shop.service'
import { getTierDisplay } from '@/services/trust-score.service'

// ร้านบนหน้าแรก (15 ร้าน = กริด 5×3 ของ ShopLightGrid; carousel ใช้ชุดเดียวกัน) — query/mapping ชุดเดียวกับ "ร้านความน่าเชื่อถือ" ของ /m (m/page.tsx getHomeDiscovery)
// ข้อมูลสาธารณะเหมือนกันทุกคน ไม่มี session ⇒ cache ร่วมได้; คะแนนบนการ์ด stale ได้ ≤60 วิ
// (กดเข้าโปรไฟล์เห็นค่าจริงเสมอ)
const getLandingShops = unstable_cache(
  async (): Promise<LandingShop[]> => {
    const rows = await getTrustedShops(15)
    const shopIds = rows.map(s => s.shops[0]?.id).filter((id): id is string => !!id)
    const deals = await getConfirmedOrderCountByShopIds(shopIds)

    return rows.map(s => ({
      username: s.username,
      shopName: s.shops[0]?.shopName ?? s.displayName,
      image: s.shops[0]?.logo ? fileUrlOf(s.shops[0].logo) : s.avatar,
      trustScore: s.trustScore,
      tierLabel: getTierDisplay(s.trustScore).tier,
      verified: s.verifications.length > 0,
      deals: s.shops[0]?.id ? (deals.get(s.shops[0].id) ?? 0) : 0
    }))
  },
  ['landing-shops'],
  { revalidate: 60, tags: ['landing-shops'] }
)

export default async function MarketingHomePage() {
  const [mode, shopCount, shops] = await Promise.all([getServerMode(), getShopCount(), getLandingShops()])

  return (
    <FrontLayout>
      <LandingPageWrapper mode={mode} shopCount={shopCount} shops={shops} />
    </FrontLayout>
  )
}
