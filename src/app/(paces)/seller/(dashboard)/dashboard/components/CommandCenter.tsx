/**
 * CommandCenter — Mobile shell RSC (lg:hidden)
 *
 * รับ CommandCenterData จาก page.tsx และ render stack บนลงล่าง (S-8..S-13)
 *
 * T5: ลบ HideAppHeaderMobile + CommandTopBar ออก — header ย้ายไปอยู่ใน layout (T2/T3) แล้ว
 *     .app-header ซ่อนด้วย CSS shell ใน safepay-overrides.css (T4) ไม่ต้อง inject <style> ที่นี่
 *
 * T8/T9: ลบ CreateFab + MiniBanner ออกจาก render — CreateFab ย้ายฟังก์ชันไปอยู่ใน SellerBottomNav
 *        (center raised button + speed-dial) แล้ว; MiniBanner ไม่มีใน v6 design (PROMO_BANNER = null)
 *        pb-28 ลบออก — padding-bottom ครอบโดย global CSS (T1) แล้ว
 *
 * Section order ตาม v6 mockup (command-center-v6.html):
 *   OrderStatusTimeline → ShortcutPanel → RecentActivityFeed
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx
 */
import type { CommandCenterData } from '../_constants/command-center'
import ShortcutPanel from './ShortcutPanel'
import OrderStatusTimeline from './OrderStatusTimeline'
import RecentActivityFeed from './RecentActivityFeed'

type Props = {
  data: CommandCenterData
}

export default function CommandCenter({ data }: Props) {
  return (
    <div className="lg:hidden relative">
      {/* ORDER STATUS — 4-node timeline (v6 section ที่ 1) */}
      <OrderStatusTimeline counts={data.orderStatusCounts} />

      {/* SHORTCUT — 6-tile grid 3×2 (v6 section ที่ 2; badge ย้ายไป bottom nav แล้ว) */}
      <ShortcutPanel />

      {/* RECENT ACTIVITY — vertical timeline feed (v6 section ที่ 3) */}
      <RecentActivityFeed items={data.recentActivity} />
    </div>
  )
}
