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
 * Section order ตาม v7 spec (§4 Section D):
 *   OrderStatusTimeline → RecentActivityFeed → ShortcutPanel
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
  // wrapper ไม่ใส่ px/pb — .seller-mobile-shell main มี padding-inline:1rem + padding-bottom:5rem
  // ครอบอยู่แล้ว (safepay-overrides.css L98/L101); ใส่ซ้ำจะเยื้อง 32px + ล่างห่างเกิน
  return (
    <div className="lg:hidden relative">
      {/* ORDER STATUS — 4-node timeline (v7 section ที่ 1) */}
      <OrderStatusTimeline counts={data.orderStatusCounts} />

      {/* RECENT ACTIVITY — vertical timeline feed (v7 section ที่ 2; เลื่อนขึ้นก่อน shortcut ตาม mental model) */}
      <RecentActivityFeed items={data.recentActivity} />

      {/* SHORTCUT — 6-tile grid 4+2 (v7 section ที่ 3; เลื่อนลงหลัง activity) */}
      <ShortcutPanel />
    </div>
  )
}
