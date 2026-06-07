/**
 * CommandCenter — Mobile shell RSC (lg:hidden)
 *
 * รับ CommandCenterData จาก page.tsx และ render stack บนลงล่าง (S-8..S-13)
 *
 * T5: ลบ HideAppHeaderMobile + CommandTopBar ออก — header ย้ายไปอยู่ใน layout (T2/T3) แล้ว
 *     .app-header ซ่อนด้วย CSS shell ใน safepay-overrides.css (T4) ไม่ต้อง inject <style> ที่นี่
 *
 * wrapper: pb-28 กัน FAB ทับ content ล่าง (S-13)
 * relative ให้ children absolute elements วางได้
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx
 */
import type { CommandCenterData } from '../_constants/command-center'
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
