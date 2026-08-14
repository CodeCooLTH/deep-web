/**
 * ActivityTimeline — T5 กิจกรรมล่าสุด (RSC)
 *
 * ทำไม RSC: รับ items ผ่าน props จาก page.tsx (fetch ที่ server แล้ว)
 *            ไม่มี client state → RSC ป้องกัน PII รั่วเข้า client bundle
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/RecentActivity.tsx
 *       — copy pattern: .card .card-header .card-title + .card-body
 *       — ตัด: SimpleBar, activityData import, dots-vertical dropdown (ไม่ใช้)
 *       — เปลี่ยน: connector จาก vertical after:border-dashed เป็น horizontal dashed
 *                  divider ตาม v10 mockup (.feed-item border-bottom dashed)
 *       — เพิ่ม: icon map Solar Duotone (flat ไม่มี circle), formatDateTime (ห้าม date-fns),
 *                Link wrapper เมื่อมี item.href, empty state + CTA
 *
 * Adapt ref: src/app/(paces)/seller/(dashboard)/dashboard/components/RecentActivityFeed.tsx
 *   — ยืมแนว empty state + ACTIVITY_STYLE map
 *   — เปลี่ยน icon set: Tabler @/components/wrappers/Icon → Solar Duotone @iconify/react
 *   — เปลี่ยน timeline node: filled circle → icon flat (v10 borderless)
 *   — เปลี่ยน timestamp: formatDistanceToNow (date-fns) → formatDateTime (@/lib/format-date)
 */

import Link from 'next/link'
import { Icon } from '@iconify/react'
import { formatDateTime } from '@/lib/format-date'
import type { ActivityItem } from '@/services/activity.service'
import { getT } from '@/i18n/server'

// ─── ICON MAP ─────────────────────────────────────────────────────────────────
// ทำไม: literal class string เต็ม (ไม่ dynamic) เพื่อกัน Tailwind v4 purge
// v10: icon flat/borderless — ไม่มี filled circle node (ต่างจาก RecentActivityFeed)
type ActivityStyle = {
  icon: string       // Solar Duotone icon name
  colorClass: string // text-{semantic} token
}

const ACTIVITY_STYLE: Record<ActivityItem['type'], ActivityStyle> = {
  ORDER_CREATED: {
    icon: 'solar:bag-check-bold-duotone',
    colorClass: 'text-primary',
  },
  ORDER_CONFIRMED: {
    icon: 'solar:check-circle-bold-duotone',
    colorClass: 'text-success',
  },
  SMS_SENT: {
    icon: 'solar:letter-bold-duotone',
    colorClass: 'text-info',
  },
  REVIEW_RECEIVED: {
    icon: 'solar:star-bold-duotone',
    colorClass: 'text-warning',
  },
  TOPUP: {
    icon: 'solar:wallet-bold-duotone',
    colorClass: 'text-success',
  },
  // S-6/S-14 (00009 Deep Stock Pro) — low-stock alert (PRO only), สื่อ "เตือน" เหมือน NotificationFeed
  LOW_STOCK_ALERT: {
    icon: 'solar:danger-triangle-bold-duotone',
    colorClass: 'text-danger',
  },
}

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  items: ActivityItem[]
}

// ─── Component ────────────────────────────────────────────────────────────────
const ActivityTimeline = async ({ items }: Props) => {
  const t = await getT()
  return (
    <div className="card">
      {/* card-header: title ซ้าย + "ดูทั้งหมด ›" + icon ขวา */}
      <div className="card-header flex items-center justify-between">
        <h4 className="card-title">{t.dashboard.activityTitle}</h4>
        <Link
          href="/notifications"
          className="text-primary text-sm inline-flex items-center gap-0.5"
        >
          {t.dashboard.viewAll}
          {/* solar:alt-arrow-right-linear ตาม spec §4.4 "ดูทั้งหมด ›" */}
          <Icon icon="solar:alt-arrow-right-linear" className="text-base" />
        </Link>
      </div>

      <div className="card-body">
        {items.length === 0 ? (
          // empty state — onboarding guide ให้ seller สร้างออเดอร์แรก
          // ทำไม: "ยังไม่มีกิจกรรม" ไม่บอก seller ว่าต้องทำอะไร → CTA ลด onboarding friction
          <div className="flex flex-col items-center justify-center gap-3 py-8 px-4">
            {/* icon จาง — opacity-40 ให้ primary ส่อง neutral ไม่ดึงความสนใจมาก */}
            <Icon
              icon="solar:bag-check-bold-duotone"
              className="text-primary opacity-40"
              /* HR7: text-[40px] = arbitrary value
                 ทำไม: Paces ไม่มี icon-size token ใหญ่ขนาด empty-state illustration;
                        size ใกล้เคียง = text-4xl (36px) ใช้ไม่พอโดดเด่น; ปรับเป็น 40px */
              style={{ fontSize: '40px' }}
            />
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold">{t.dashboard.activityEmptyNone}</p>
              <p className="text-xs text-default-500">{t.dashboard.activityEmptyDesc}</p>
            </div>
            {/* NF-4: min-height 44px → h-11 = 44px touch target
                path /orders/new ยืนยันจาก RecentActivityFeed.tsx (empty state เดิม) */}
            <Link
              href="/orders/new"
              className="btn bg-primary text-white hover:bg-primary-hover text-sm font-semibold h-11 px-5 rounded-lg inline-flex items-center justify-center active:scale-95 transition-transform"
            >
              สร้างออเดอร์
            </Link>
          </div>
        ) : (
          // timeline v10: dashed divider แนวนอน (ตาม mockup .feed-item border-bottom dashed)
          // ต่างจาก RecentActivityFeed ที่ใช้ vertical after:border-dashed connector
          <div className="flex flex-col">
            {items.map((item, idx) => {
              const style = ACTIVITY_STYLE[item.type]
              const isLast = idx === items.length - 1

              const content = (
                <div
                  key={`${item.type}-${item.at.getTime()}-${idx}`}
                  className={
                    [
                      'flex items-start gap-3 py-2.5',
                      // dashed divider ระหว่าง item (ตาม mockup .feed-item)
                      // HR7: border-b border-dashed border-default-200 = Paces token → ไม่ arbitrary
                      !isLast ? 'border-b border-dashed border-default-200' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                  }
                >
                  {/* icon flat — Solar Duotone ไม่มี circle/box ครอบ (v10 borderless) */}
                  {/* HR7: text-xl = Tailwind utility (ไม่ arbitrary) */}
                  <Icon
                    icon={style.icon}
                    className={`${style.colorClass} text-xl flex-shrink-0 mt-0.5`}
                  />

                  {/* content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-default-900 leading-snug">
                      {item.label}
                    </p>
                    {/* เวลา formatDateTime พ.ศ. — ห้าม toLocaleString/date-fns (date-format.md) */}
                    <p className="text-xs text-default-400 mt-0.5">
                      {formatDateTime(item.at.toISOString())}
                    </p>
                  </div>
                </div>
              )

              // ครอบ Link เมื่อมี href (navigation ทั้ง row)
              // ทำไม: ใช้ <Link> ครอบ div แทน component={Link} → ปลอดภัยใน RSC (Hard Rule 2)
              if (item.href) {
                return (
                  <Link
                    key={`link-${item.type}-${item.at.getTime()}-${idx}`}
                    href={item.href}
                    className="hover:bg-default-50 -mx-5 px-5 transition-colors rounded-sm"
                  >
                    {content}
                  </Link>
                )
              }

              return content
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default ActivityTimeline
