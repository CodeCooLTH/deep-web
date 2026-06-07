/**
 * RecentActivityFeed — S-12 RECENT ACTIVITY timeline (RSC)
 *
 * ทำไม RSC: component รับ items ผ่าน props จาก page.tsx (fetch ที่ server แล้ว)
 *            ไม่ต้องมี client state → RSC ป้องกัน PII รั่วเข้า client bundle
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/profile/components/TimeLine.tsx
 *       — copy pattern: relative pl-7 container + absolute -left-7 node + เส้น bg-gray-200
 *       — ตัด: form post, image, like, comment, iframe ทั้งหมด
 *       — เพิ่ม: icon node color-per-type, formatDistanceToNow Thai, empty state, footer link
 */

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import Icon from '@/components/wrappers/Icon'
import type { ActivityItem } from '@/services/activity.service'

// ─── ACTIVITY_STYLE map ────────────────────────────────────────────────────────
// ทำไม: ใช้ literal class string เต็ม (ไม่ dynamic) เพื่อกัน Tailwind v4 purge
// Tailwind จำเป็นต้องเห็น full class name ที่ build-time
type ActivityStyle = {
  icon: string
  bg: string
  text: string
}

const ACTIVITY_STYLE: Record<ActivityItem['type'], ActivityStyle> = {
  ORDER_CREATED: {
    icon: 'shopping-cart-plus',
    bg: 'bg-blue-100',
    text: 'text-blue-600',
  },
  ORDER_CONFIRMED: {
    icon: 'user-check',
    bg: 'bg-emerald-100',
    text: 'text-emerald-600',
  },
  SMS_SENT: {
    icon: 'message-2',
    bg: 'bg-violet-100',
    text: 'text-violet-600',
  },
  REVIEW_RECEIVED: {
    icon: 'star',
    bg: 'bg-yellow-100',
    text: 'text-yellow-600',
  },
  TOPUP: {
    icon: 'coin',
    bg: 'bg-green-100',
    text: 'text-green-600',
  },
}

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  items: ActivityItem[]
}

// ─── Component ────────────────────────────────────────────────────────────────
const RecentActivityFeed = ({ items }: Props) => {
  return (
    <section className="mx-3 mb-4">
      {/* label section */}
      <p className="text-[13px] font-semibold text-muted-foreground mb-2 pl-1">กิจกรรมล่าสุด</p>

      {/* card shell — ใช้ Tailwind primitive ไม่ใช้ .card (padding global ขัด flex) */}
      <div className="bg-white rounded-2xl shadow-sm p-4">

        {items.length === 0 ? (
          // empty state — แสดงแทน timeline เมื่อยังไม่มีกิจกรรม
          <p className="text-[13px] text-muted-foreground text-center py-4">ยังไม่มีกิจกรรม</p>
        ) : (
          // timeline container — copy pattern จาก TimeLine.tsx (relative pl-7 + เส้นแนวตั้ง)
          <div className="relative pl-7">
            {/* เส้นแนวตั้ง — ปรับจาก border-e dashed → solid w-px bg-gray-200 ตาม spec */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-200" />

            {items.map((item, index) => {
              const style = ACTIVITY_STYLE[item.type]
              const isLast = index === items.length - 1

              return (
                <div
                  key={`${item.type}-${item.at.getTime()}-${index}`}
                  className={`relative${isLast ? '' : ' mb-4'}`}
                >
                  {/* node icon — absolute -left-7 ให้วางทับเส้นพอดี */}
                  <span
                    className={`absolute -left-7 inline-flex w-6 h-6 rounded-full ring-4 ring-white items-center justify-center ${style.bg} ${style.text}`}
                  >
                    <Icon icon={style.icon} className="text-sm" />
                  </span>

                  {/* label — wrap <Link> เมื่อมี href (ทำให้ item clickable) */}
                  {item.href ? (
                    <Link href={item.href}>
                      <p className="text-[13.5px] text-default-900 leading-snug hover:text-primary transition-colors">
                        {item.label}
                      </p>
                    </Link>
                  ) : (
                    <p className="text-[13.5px] text-default-900 leading-snug">{item.label}</p>
                  )}

                  {/* relative time ภาษาไทย ด้วย date-fns + locale th */}
                  <p className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(item.at, { addSuffix: true, locale: th })}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {/* footer — แสดงเสมอไม่ว่ามี items หรือไม่ */}
        <Link
          href="/orders"
          className="block text-center text-[13px] font-semibold text-primary pt-3 mt-1 border-t border-gray-100"
        >
          ดูทั้งหมด
        </Link>
      </div>
    </section>
  )
}

export default RecentActivityFeed
