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
import BestSellerStrip from './BestSellerStrip'
import CarouselGrid from './CarouselGrid'
import ActivityTimeline from './ActivityTimeline'
import SalesChartCard from './SalesChartCard'

type Props = {
  data: CommandCenterData
}

export default function CommandCenter({ data }: Props) {
  // D#13: map data.liveAuctionCount → badgeCount ของ tile ประมูล (href='/auctions')
  // ทำที่นี่แทนใน _constants เพราะ SHORTCUT_TILES เป็น static const — data มาจาก server ต่อ request
  const tiles = SHORTCUT_TILES.map((tile) =>
    tile.href === '/auctions' ? { ...tile, badgeCount: data.liveAuctionCount ?? 0 } : tile,
  )

  // -mx-4: edge-to-edge ทั้ง CC — หักล้าง gutter `.seller-mobile-shell main { padding-inline:1rem }` (16px)
  // ให้ทุก section (hero+cards) ชนขอบจอ ไม่มี padding ซ้าย/ขวา ตาม mockup v10 (HR7 arbitrary: ไม่มี full-bleed token)
  // pb อยู่ที่ main แล้ว (safepay-overrides.css) — wrapper ไม่ใส่ซ้ำ
  return (
    <div className="lg:hidden space-y-3 -mx-4">
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
        packageStatus={data.packageStatus ?? 'NOT_SUBSCRIBED'}
        packageTier={data.packageTier ?? null}
        packageCanManage={data.packageCanManage ?? false}
      />

      {/* ยอดขาย — การ์ด mini (sparkline + total เดือนนี้) จิ้ม→เปิด full sheet; null=fetch ล้ม→ซ่อนตัวเอง */}
      <SalesChartCard initialSeries={data.salesSeries ?? null} />

      {/* คำสั่งซื้อ — 4-status flat + badge (PENDING/SHIPPED) */}
      <OrderStatusBand counts={data.orderStatusCounts} />

      {/* สินค้าขายดี — จิ้ม→สร้างออเดอร์พร้อมสินค้านั้น (feature Quick Create); ว่าง→ไม่ render */}
      <BestSellerStrip products={data.bestSellers ?? []} />

      {/* เมนูลัด — carousel 4×2/หน้า + dots (D#13: tiles ผ่าน map เติม badgeCount ประมูล) */}
      <CarouselGrid tiles={tiles} />

      {/* กิจกรรมล่าสุด — timeline real data */}
      <ActivityTimeline items={data.recentActivity} />
    </div>
  )
}
