/**
 * RecentActivityFeed — S-12 RECENT ACTIVITY timeline (RSC)
 *
 * ทำไม RSC: component รับ items ผ่าน props จาก page.tsx (fetch ที่ server แล้ว)
 *            ไม่ต้องมี client state → RSC ป้องกัน PII รั่วเข้า client bundle
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/profile/components/TimeLine.tsx
 *       — copy pattern: relative container + absolute node + เส้นแนวตั้ง
 *       — ตัด: form post, image, like, comment, iframe ทั้งหมด
 *       — เพิ่ม: section header พร้อม link ขวา (v4), icon node color-per-type,
 *                formatDistanceToNow Thai, empty state
 *
 * V4 polish (P5):
 *   - ย้าย "ดูทั้งหมด ›" จาก footer ขึ้นมาที่ section header (ตาม mockup v4)
 *   - container: px-4 mb-4 (จาก mx-3)
 *   - card: rounded-[20px] + layered shadow (จาก rounded-2xl shadow-sm)
 *   - timeline: pl-8 + เส้น left-[13px] bg-[#eef0f4] (เบาลง จาก bg-gray-200)
 *   - node: w-[26px] h-[26px] -left-8 ring-4 ring-white (จาก w-6 h-6 -left-7)
 *   - icon: text-[15px] ชัดเจน
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
    <section className="mb-4">
      {/* section header: label ซ้าย + "ดูทั้งหมด ›" ขวา (ตาม mockup v4) */}
      <div className="flex items-center justify-between px-[6px] mb-[10px]">
        <span className="text-[13.5px] font-bold text-default-500 tracking-[0.1px]">กิจกรรมล่าสุด</span>
        <Link href="/orders" className="text-[12.5px] font-semibold text-primary">ดูทั้งหมด ›</Link>
      </div>

      {/* card shell — rounded-[20px] + layered shadow ตาม v4 card treatment */}
      <div className="bg-white rounded-[20px] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_6px_16px_-8px_rgba(16,24,40,0.10)] p-4">

        {items.length === 0 ? (
          // empty state — แสดงแทน timeline เมื่อยังไม่มีกิจกรรม
          <p className="text-[13px] text-muted text-center py-4">ยังไม่มีกิจกรรม</p>
        ) : (
          // timeline container — pl-8 ให้ node -left-8 วางทับเส้นพอดี (เพิ่มจาก pl-7)
          <div className="relative pl-8">
            {/* เส้นแนวตั้ง — left-[13px] ให้อยู่กึ่งกลาง node 26px; bg-[#eef0f4] เบากว่า gray-200 */}
            <div className="absolute left-[13px] top-3 bottom-3 w-px bg-[#eef0f4]" />

            {items.map((item, index) => {
              const style = ACTIVITY_STYLE[item.type]
              const isLast = index === items.length - 1

              return (
                <div
                  key={`${item.type}-${item.at.getTime()}-${index}`}
                  className={`relative${isLast ? '' : ' mb-4'}`}
                >
                  {/* node icon — w-[26px] h-[26px] ring-4 ring-white ตาม mockup v4 */}
                  <span
                    className={`absolute -left-8 inline-flex w-[26px] h-[26px] rounded-full ring-4 ring-white items-center justify-center ${style.bg} ${style.text}`}
                  >
                    <Icon icon={style.icon} className="text-[15px]" />
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
                  <p className="text-[11px] text-default-500">
                    {formatDistanceToNow(item.at, { addSuffix: true, locale: th })}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export default RecentActivityFeed
