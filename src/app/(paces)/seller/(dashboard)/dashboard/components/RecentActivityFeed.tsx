/**
 * RecentActivityFeed — S-12 RECENT ACTIVITY timeline (RSC)
 *
 * ทำไม RSC: component รับ items ผ่าน props จาก page.tsx (fetch ที่ server แล้ว)
 *            ไม่ต้องมี client state → RSC ป้องกัน PII รั่วเข้า client bundle
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/profile/components/TimeLine.tsx
 *       — copy pattern: relative container + absolute node + เส้นแนวตั้ง
 *       — ตัด: form post, image, like, comment, iframe ทั้งหมด
 *       — เพิ่ม: section header พร้อม link ขวา, icon node color-per-type,
 *                formatDistanceToNow Thai, empty state
 *
 * V6 restyle (T6):
 *   - card: rounded-[14px] + shadow-[0_2px_8px_rgba(47,43,61,0.07)] + p-3.5
 *   - node: w-7 h-7 (28px) + shadow-[0_0_0_3px_#fff] (ring-3 white via box-shadow)
 *   - tint: arbitrary rgba ตาม mockup command-center-v6 — ไม่ใช้ Tailwind color name
 *     semantic (#FF9F43 amber / #28C76F green / #00BAD1 cyan) + primary (Paces token) สำหรับ ORDER_CREATED
 *   - timeline line: bg-[rgba(47,43,61,0.10)]
 *   - time: text-[12px] text-[rgba(47,43,61,0.55)] (S-5: 0.40→0.55 WCAG fix)
 *   - label: font-medium text-[#2F2B3D]
 */

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import Icon from '@/components/wrappers/Icon'
import type { ActivityItem } from '@/services/activity.service'

// ─── ACTIVITY_STYLE map ────────────────────────────────────────────────────────
// ทำไม: ใช้ literal class string เต็ม (ไม่ dynamic) เพื่อกัน Tailwind v4 purge
// V6: เปลี่ยนเป็น arbitrary rgba ให้ตรง brand palette จาก mockup command-center-v6
type ActivityStyle = {
  icon: string
  bg: string
  text: string
}

const ACTIVITY_STYLE: Record<ActivityItem['type'], ActivityStyle> = {
  ORDER_CREATED: {
    icon: 'plus',
    bg: 'bg-primary/10',
    text: 'text-primary',
  },
  ORDER_CONFIRMED: {
    icon: 'user-check',
    bg: 'bg-[rgba(40,199,111,0.14)]',
    text: 'text-[#28C76F]',
  },
  SMS_SENT: {
    icon: 'message-2',
    bg: 'bg-[rgba(0,186,209,0.13)]',
    text: 'text-[#00BAD1]',
  },
  REVIEW_RECEIVED: {
    icon: 'star',
    bg: 'bg-[rgba(255,159,67,0.16)]',
    text: 'text-[#FF9F43]',
  },
  TOPUP: {
    icon: 'coin',
    bg: 'bg-[rgba(40,199,111,0.14)]',
    text: 'text-[#28C76F]',
  },
}

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  items: ActivityItem[]
}

// ─── Component ────────────────────────────────────────────────────────────────
const RecentActivityFeed = ({ items }: Props) => {
  return (
    <section className="mb-3">
      {/* section header: label ซ้าย + "ดูทั้งหมด ›" ขวา (ตาม mockup v6) */}
      {/* v6.1: ลบ px-4 ซ้อน (main มี padding-inline 1rem แล้ว → เดิม 32px เยื้องกว่าการ์ดอื่น) */}
      <div className="flex items-center justify-between px-[2px] mb-2">
        <span className="text-[13px] font-semibold text-[rgba(47,43,61,0.70)]">กิจกรรมล่าสุด</span>
        <Link href="/orders" className="text-[12.5px] font-medium text-primary inline-flex items-center gap-[1px]">
          ดูทั้งหมด <Icon icon="chevron-right" className="text-[15px]" />
        </Link>
      </div>

      {/* card shell — rounded-[14px] + shadow v6 + p-3.5 (14px) ด้านบน ตาม SoT mockup */}
      <div className="bg-white rounded-[14px] shadow-[0_2px_8px_rgba(47,43,61,0.07)] pt-3.5 px-3.5 pb-1.5">

        {items.length === 0 ? (
          // S-6: empty state onboarding — แทน text เปล่าด้วย block ที่ guide ให้ seller สร้างออเดอร์แรก
          // ทำไม: "ยังไม่มีกิจกรรม" ไม่บอก seller ว่าต้องทำอะไร → เพิ่ม CTA ลด onboarding friction (spec v7 §4 Section B)
          <div className="flex flex-col items-center justify-center gap-3 py-8 px-4">
            {/* icon จาง — opacity-40 บน wrapper ให้สี primary ส่อง neutral ทำให้อ่านได้โดยไม่ดึงความสนใจมาก */}
            <span className="opacity-40 text-primary">
              <Icon icon="shopping-cart-plus" className="text-[32px]" />
            </span>
            <div className="text-center space-y-1">
              <p className="text-[14px] font-semibold text-[#2F2B3D]">สร้างออเดอร์แรกเลย</p>
              <p className="text-[12px] text-[rgba(47,43,61,0.55)]">กิจกรรมจะปรากฏที่นี่เมื่อคุณเริ่มใช้งาน</p>
            </div>
            {/* CTA ใช้ Tailwind explicit แทน btn btn-sm — เพราะ btn-sm ให้ py-1.25 (~26px) ไม่ถึง 44px touch target ที่ NF-4 กำหนด */}
            <Link
              href="/orders/new"
              className="inline-flex items-center justify-center h-11 px-5 rounded-[10px] bg-primary text-white text-[13px] font-semibold active:scale-95 transition-transform"
            >
              สร้างออเดอร์
            </Link>
          </div>
        ) : (
          // timeline container — pl-8 ให้ node -left-8 วางทับเส้นพอดี
          <ul className="relative pl-8 list-none m-0 p-0">
            {items.map((item, index) => {
              const style = ACTIVITY_STYLE[item.type]
              const isLast = index === items.length - 1

              return (
                <li
                  key={`${item.type}-${item.at.getTime()}-${index}`}
                  className={`relative${isLast ? ' pb-1' : ' pb-3'}`}
                >
                  {/* เส้นแนวตั้ง — left-[13px] กึ่งกลาง node 28px; ซ่อนที่ item สุดท้าย */}
                  {!isLast && (
                    <span className="absolute left-[-21px] top-7 bottom-0 w-px bg-[rgba(47,43,61,0.10)]" />
                  )}

                  {/* node icon — w-7 h-7 (28px) shadow-[0_0_0_3px_#fff] ตาม mockup v6 */}
                  <span
                    className={`absolute -left-8 top-0 inline-flex w-7 h-7 rounded-full shadow-[0_0_0_3px_#fff] items-center justify-center ${style.bg} ${style.text}`}
                  >
                    <Icon icon={style.icon} className="text-[15px]" />
                  </span>

                  {/* label — wrap <Link> เมื่อมี href (ทำให้ item clickable) */}
                  {item.href ? (
                    <Link href={item.href}>
                      <p className="text-[13.5px] font-medium text-[#2F2B3D] leading-snug hover:text-primary transition-colors">
                        {item.label}
                      </p>
                    </Link>
                  ) : (
                    <p className="text-[13.5px] font-medium text-[#2F2B3D] leading-snug">{item.label}</p>
                  )}

                  {/* relative time ภาษาไทย ด้วย date-fns + locale th */}
                  {/* S-5: เปลี่ยน opacity 0.40 → 0.55 เพื่อให้ผ่าน WCAG 4.5:1 contrast บน white card */}
                  <p className="text-[12px] text-[rgba(47,43,61,0.55)] mt-[1px]">
                    {formatDistanceToNow(item.at, { addSuffix: true, locale: th })}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

export default RecentActivityFeed
