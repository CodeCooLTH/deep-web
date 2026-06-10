/**
 * CommandCenter — Mobile shell RSC (lg:hidden)
 *
 * T8: rewrite wrapper ประกอบ component ใหม่ตาม v8 section order:
 *   SellerHeader → ShortcutGrid → OrderStatusRow → WalletCard → RecentActivityFeed
 *
 * ShortcutPanel superseded by ShortcutGrid (v8) — ไฟล์เก่าไม่ลบ
 * OrderStatusTimeline superseded by OrderStatusRow (v8) — ไฟล์เก่าไม่ลบ
 *
 * ห้ามใส่ px/pb บน wrapper — .seller-mobile-shell main มี padding-inline:1rem
 * + padding-bottom:5rem ครอบอยู่แล้ว (safepay-overrides.css L98/L101, บทเรียน v7)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx
 */
import type { CommandCenterData } from '../_constants/command-center'
import SellerHeader from './SellerHeader'
import ShortcutGrid from './ShortcutGrid'
import OrderStatusRow from './OrderStatusRow'
import WalletCard from './WalletCard'
import RecentActivityFeed from './RecentActivityFeed'

type Props = {
  data: CommandCenterData
}

export default function CommandCenter({ data }: Props) {
  // wrapper ไม่ใส่ px/pb — .seller-mobile-shell main มี padding-inline:1rem + padding-bottom:5rem
  // ครอบอยู่แล้ว (safepay-overrides.css L98/L101); ใส่ซ้ำจะเยื้อง 32px + ล่างห่างเกิน
  return (
    <div className="lg:hidden space-y-3">
      {/* HEADER — avatar + shop name + tier + trust score + notification bell */}
      <SellerHeader
        shopName={data.shopName}
        avatarUrl={data.avatarUrl}
        tierName={data.tierName}
        trustScore={data.trustScore}
      />

      {/* SHORTCUT GRID — 8-tile grid 4+4 (อ่าน SHORTCUT_TILES เอง) */}
      <ShortcutGrid />

      {/* ORDER STATUS ROW — 4 status counts แนวนอน */}
      <OrderStatusRow counts={data.orderStatusCounts} />

      {/* WALLET CARD — แสดงยอดเครดิต */}
      <WalletCard balance={data.walletBalance ?? 0} />

      {/* RECENT ACTIVITY FEED — รายการกิจกรรมล่าสุด */}
      <RecentActivityFeed items={data.recentActivity} />
    </div>
  )
}
