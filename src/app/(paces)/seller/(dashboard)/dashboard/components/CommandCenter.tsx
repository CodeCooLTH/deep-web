/**
 * CommandCenter — Mobile shell RSC (lg:hidden)
 *
 * รับ CommandCenterData จาก page.tsx และ render stack บนลงล่าง (S-8..S-13)
 *
 * wrapper: pb-28 กัน FAB ทับ content ล่าง (S-13)
 * relative ให้ children absolute elements วางได้
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx
 */
import type { CommandCenterData } from '../_constants/command-center'
import HideAppHeaderMobile from './HideAppHeaderMobile'
import CommandTopBar from './CommandTopBar'
import ShortcutPanel from './ShortcutPanel'
import MiniBanner from './MiniBanner'
import OrderStatusTimeline from './OrderStatusTimeline'
import RecentActivityFeed from './RecentActivityFeed'
import CreateFab from './CreateFab'

type Props = {
  data: CommandCenterData
}

export default function CommandCenter({ data }: Props) {
  return (
    <div className="lg:hidden pb-28 relative">
      {/* ซ่อน Paces app-header บน mobile — CommandTopBar เป็น top bar เดียว */}
      <HideAppHeaderMobile />

      {/* T2: TOP MENU — hamburger + shopName + bell + avatar + tier chip */}
      <CommandTopBar
        shopName={data.shopName}
        avatarUrl={data.avatarUrl}
        tierName={data.tierName}
      />

      {/* T3: SHORTCUT — 8-tile grid */}
      <ShortcutPanel pendingOrderCount={data.pendingOrderCount} />

      {/* T4: MINI BANNER — static promo (null = ซ่อน section) */}
      <MiniBanner banner={data.promoBanner} />

      {/* T5: ORDER STATUS — 4-node horizontal timeline */}
      <OrderStatusTimeline counts={data.orderStatusCounts} />

      {/* T7: RECENT ACTIVITY — vertical timeline feed */}
      <RecentActivityFeed items={data.recentActivity} />

      {/* T8: CREATE FAB — speed-dial (client island) */}
      <CreateFab />
    </div>
  )
}
