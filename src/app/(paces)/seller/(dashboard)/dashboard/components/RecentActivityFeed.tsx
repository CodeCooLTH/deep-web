/**
 * RecentActivityFeed — S-5 RECENT ACTIVITY timeline (RSC)
 *
 * ทำไม RSC: component รับ items ผ่าน props จาก page.tsx (fetch ที่ server แล้ว)
 *            ไม่ต้องมี client state → RSC ป้องกัน PII รั่วเข้า client bundle
 *
 * T7 rewrite: v7 arbitrary/hex → Paces primitive (.card .card-header timeline)
 *   - ลบ: rounded-[14px], shadow-[...], text-[NNpx], rgba(...), #hex ทั้งหมด
 *   - ใช้: card/card-header/card-title, size-7.5/rounded-full, after:border-dashed,
 *           bg-{semantic}/text-{semantic}, text-sm/text-xs/text-default-500
 *   - คง: data logic (items, formatDistanceToNow th), empty state, ACTIVITY_STYLE map
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/RecentActivity.tsx
 *       — copy pattern: .card .card-header .card-title + after:border-dashed timeline node
 *       — ตัด: SimpleBar, activityData import, dots-vertical dropdown (ไม่ใช้)
 *       — เพิ่ว: icon-per-type node color map, formatDistanceToNow Thai, empty state,
 *                "ดูทั้งหมด ›" link header ขวา
 */

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import { cn } from '@/utils/helpers'
import Icon from '@/components/wrappers/Icon'
import type { ActivityItem } from '@/services/activity.service'

// ─── ACTIVITY_STYLE map ────────────────────────────────────────────────────────
// ทำไม: ใช้ literal class string เต็ม (ไม่ dynamic) เพื่อกัน Tailwind v4 purge
// T7: เปลี่ยนจาก arbitrary rgba → Paces semantic token (bg-primary, bg-success, bg-info, bg-warning)
//     node เป็น filled circle + icon ขาว ตาม Paces RecentActivity pattern
type ActivityStyle = {
  icon: string
  nodeClass: string  // bg-{semantic} สำหรับ filled circle node
}

const ACTIVITY_STYLE: Record<ActivityItem['type'], ActivityStyle> = {
  ORDER_CREATED: {
    icon: 'plus',
    nodeClass: 'bg-primary',
  },
  ORDER_CONFIRMED: {
    icon: 'user-check',
    nodeClass: 'bg-success',
  },
  SMS_SENT: {
    icon: 'message-2',
    nodeClass: 'bg-info',
  },
  REVIEW_RECEIVED: {
    icon: 'star',
    nodeClass: 'bg-warning',
  },
  TOPUP: {
    icon: 'coin',
    nodeClass: 'bg-success',
  },
}

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  items: ActivityItem[]
}

// ─── Component ────────────────────────────────────────────────────────────────
const RecentActivityFeed = ({ items }: Props) => {
  return (
    <div className="card">
      {/* card-header: title ซ้าย + "ดูทั้งหมด ›" ขวา */}
      <div className="card-header flex items-center justify-between">
        <h4 className="card-title">กิจกรรมล่าสุด</h4>
        <Link href="/notifications" className="text-primary text-sm">
          ดูทั้งหมด ›
        </Link>
      </div>

      <div className="card-body">
        {items.length === 0 ? (
          // empty state — onboarding guide ให้ seller สร้างออเดอร์แรก
          // ทำไม: "ยังไม่มีกิจกรรม" ไม่บอก seller ว่าต้องทำอะไร → CTA ลด onboarding friction
          <div className="flex flex-col items-center justify-center gap-3 py-8 px-4">
            {/* icon จาง — ใช้ opacity-40 เพื่อให้ primary ส่อง neutral ไม่ดึงความสนใจมาก */}
            <span className="opacity-40 text-primary">
              <Icon icon="shopping-cart-plus" className="text-4xl" />
            </span>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold">สร้างออเดอร์แรกเลย</p>
              <p className="text-xs text-default-500">กิจกรรมจะปรากฏที่นี่เมื่อคุณเริ่มใช้งาน</p>
            </div>
            {/* NF-4: min-height 44px → h-11 = 44px ผ่าน touch target */}
            <Link
              href="/orders/new"
              className="btn btn-primary btn-sm h-11 px-5 flex items-center justify-center"
            >
              สร้างออเดอร์
            </Link>
          </div>
        ) : (
          // timeline: Paces after:border-dashed pattern (copy จาก RecentActivity.tsx)
          <div>
            {items.map((item, idx) => {
              const style = ACTIVITY_STYLE[item.type]
              const isLast = idx === items.length - 1

              return (
                <div
                  className="flex gap-x-3"
                  key={`${item.type}-${item.at.getTime()}-${idx}`}
                >
                  {/* node wrapper — after: เส้นประแนวตั้ง, ซ่อนที่ item สุดท้าย */}
                  {/* ตรง Paces RecentActivity: after:top-7 after:bottom-0 after:start-3.5 */}
                  <div
                    className={cn(
                      'relative after:absolute after:top-7 after:bottom-0 after:start-3.5 after:w-0 after:border-s after:border-dashed after:border-default-300 after:-translate-x-[0.5px]',
                      { 'after:content-none': isLast }
                    )}
                  >
                    <div className="relative z-10">
                      {/* filled circle node: size-7.5 + bg-{semantic} + icon ขาว ตาม Paces */}
                      <div
                        className={cn(
                          'flex justify-center items-center rounded-full size-7.5 text-white',
                          style.nodeClass
                        )}
                      >
                        <Icon icon={style.icon} className="text-base" />
                      </div>
                    </div>
                  </div>

                  {/* content row */}
                  <div className={cn('grow', { 'pb-5': !isLast, 'pb-1': isLast })}>
                    {/* label — wrap Link เมื่อมี href */}
                    {item.href ? (
                      <Link href={item.href}>
                        <h5 className="text-sm font-medium hover:text-primary transition-colors">
                          {item.label}
                        </h5>
                      </Link>
                    ) : (
                      <h5 className="text-sm font-medium">{item.label}</h5>
                    )}

                    {/* relative time ภาษาไทย — text-default-500 (ไม่ใช่ default-400) เพื่อ a11y WCAG */}
                    <p className="text-xs text-default-500 mt-0.5">
                      {formatDistanceToNow(item.at, { addSuffix: true, locale: th })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default RecentActivityFeed
