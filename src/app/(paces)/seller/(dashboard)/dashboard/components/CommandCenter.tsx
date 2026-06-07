/**
 * CommandCenter — Mobile shell RSC (lg:hidden)
 *
 * รับ CommandCenterData จาก page.tsx และ render stack บนลงล่าง
 * แต่ละ section เป็น placeholder สำหรับ T2-T8 (ยังไม่ build จริง)
 *
 * wrapper: pb-28 กัน FAB ทับ content ล่าง (S-13)
 * relative ให้ children absolute elements วางได้
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx
 */
import type { CommandCenterData } from '../_constants/command-center'

type Props = {
  data: CommandCenterData
}

export default function CommandCenter({ data }: Props) {
  return (
    <div className="lg:hidden pb-28 relative">
      {/* TODO T2: CommandTopBar — hamburger + shopName + bell + avatar */}
      {/* shopName={data.shopName} avatarUrl={data.avatarUrl} */}

      {/* TODO T3: ShortcutPanel — 8-tile grid */}
      {/* pendingOrderCount={data.pendingOrderCount} */}

      {/* TODO T4: MiniBanner — static promo banner (null = ซ่อน) */}
      {/* banner={data.promoBanner} */}

      {/* TODO T5: OrderStatusTimeline — 4-node horizontal */}
      {/* counts={data.orderStatusCounts} */}

      {/* TODO T7: RecentActivityFeed — vertical timeline (ต้อง T6 activity.service ก่อน) */}
      {/* items={data.recentActivity} */}

      {/* TODO T8: CreateFab — speed-dial FAB (client island) */}
    </div>
  )
}
