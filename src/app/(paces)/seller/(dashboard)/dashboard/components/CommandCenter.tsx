/**
 * CommandCenter — Mobile shell RSC (lg:hidden)
 *
 * T6 (v10): rewrite wrapper ประกอบ component ใหม่ตาม v10 section order:
 *   CompactHero → OrderStatusBand → CarouselGrid → ActivityTimeline
 *
 * แทนของเดิม (v8): SellerHeader+WalletCard → CompactHero (รวม), ShortcutGrid → CarouselGrid,
 *   OrderStatusRow → OrderStatusBand, RecentActivityFeed → ActivityTimeline.
 *   ไฟล์เก่า deprecate in-place (ลบ Phase 2 หลัง verify ไม่มี import — OOS-5)
 *
 * ห้ามใส่ px/pb บน wrapper — .seller-mobile-shell main มี padding-inline:1rem
 * + padding-bottom:5rem ครอบอยู่แล้ว (safepay-overrides.css L98/L101, บทเรียน v7)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx
 */
import type { CommandCenterData } from '../_constants/command-center'
import { SHORTCUT_TILES } from '../_constants/command-center'
import CompactHero from './CompactHero'
import OrderStatusBand from './OrderStatusBand'
import CarouselGrid from './CarouselGrid'
import ActivityTimeline from './ActivityTimeline'

type Props = {
  data: CommandCenterData
}

export default function CommandCenter({ data }: Props) {
  // wrapper ไม่ใส่ px/pb — .seller-mobile-shell main มี padding-inline:1rem + padding-bottom:5rem
  // ครอบอยู่แล้ว (safepay-overrides.css L98/L101); ใส่ซ้ำจะเยื้อง 32px + ล่างห่างเกิน
  // หมายเหตุ: CompactHero ทำ full-bleed เองด้วย -mx-5 (หักล้าง gutter — ดู comment ในไฟล์นั้น)
  return (
    <div className="lg:hidden space-y-3">
      {/* HERO — avatar + trust ring + stats + wallet + shop link (รวม header+wallet เดิม) */}
      <CompactHero
        shopName={data.shopName ?? ''}
        avatarUrl={data.avatarUrl ?? null}
        trustScore={data.trustScore ?? 0}
        walletBalance={data.walletBalance ?? 0}
        shopSlug={data.shopSlug ?? null}
        orderCount={data.orderCount ?? 0}
        reviewCount={data.reviewCount ?? 0}
        avgRating={data.avgRating ?? 0}
      />

      {/* คำสั่งซื้อ — 4-status flat + badge (PENDING/SHIPPED) */}
      <OrderStatusBand counts={data.orderStatusCounts} />

      {/* เมนูลัด — carousel 4×2/หน้า + dots */}
      <CarouselGrid tiles={SHORTCUT_TILES} />

      {/* กิจกรรมล่าสุด — timeline real data */}
      <ActivityTimeline items={data.recentActivity} />
    </div>
  )
}
