// OrderStatusRow — card คำสั่งซื้อ 4-status (RSC)
// คัดลอกโครง card/card-header จาก StatisticCard.tsx + mockup .ostat
// ไม่มี 'use client' — RSC เพื่อ Hard Rule 7

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'

type StatusCounts = {
  PENDING: number
  SHIPPED: number
  CONFIRMED: number
  CANCELLED: number
}

// clamp count ≥100 → "99+"
function fmtCount(n: number): string {
  if (n <= 0) return ''
  if (n >= 100) return '99+'
  return String(n)
}

const STATUSES = [
  {
    key: 'PENDING' as const,
    label: 'รอดำเนินการ',
    // bg-warning/15 = Tailwind opacity modifier — Paces token (ไม่ arbitrary)
    circleClass: 'bg-warning/15 text-warning',
    icon: 'clock-hour-4',
  },
  {
    key: 'SHIPPED' as const,
    label: 'กำลังจัดส่ง',
    circleClass: 'bg-info/15 text-info',
    icon: 'truck-delivery',
  },
  {
    key: 'CONFIRMED' as const,
    label: 'สำเร็จ',
    circleClass: 'bg-success/15 text-success',
    icon: 'circle-check',
  },
  {
    key: 'CANCELLED' as const,
    label: 'ยกเลิก',
    // bg-default-100 / text-default-500 — Paces semantic token
    circleClass: 'bg-default-100 text-default-500',
    icon: 'ban',
  },
]

export default function OrderStatusRow({ counts }: { counts: StatusCounts }) {
  return (
    <div className="card">
      {/* header: ชื่อ card + ลิงก์ "ดูทั้งหมด" */}
      <div className="card-header flex items-center justify-between">
        <h4 className="card-title">คำสั่งซื้อ</h4>
        {/* RSC-safe: Link ธรรมดา ไม่ใช้ component={Link} (Hard Rule 2) */}
        <Link href="/orders" className="text-primary text-sm font-medium">
          ดูทั้งหมด ›
        </Link>
      </div>

      <div className="card-body">
        {/* grid 4 column — mobile-first: จอเล็กก็ fit เพราะ gap-2 + size-11 */}
        <div className="grid grid-cols-4 gap-2">
          {STATUSES.map(({ key, label, circleClass, icon }) => {
            const badge = fmtCount(counts[key])
            return (
              // Link ครอบ tap target ทั้งก้อน (NF-4)
              <Link
                key={key}
                href="/orders"
                className="flex flex-col items-center gap-2"
              >
                {/* icon-circle size-11 = 44px (NF-4 touch target) */}
                <span
                  className={`relative size-11 rounded-full flex items-center justify-center ${circleClass}`}
                >
                  <Icon icon={icon} className="size-5" />
                  {/* badge แสดงเฉพาะเมื่อ count > 0 */}
                  {badge && (
                    <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1.5 bg-danger text-white text-xs font-bold rounded-full flex items-center justify-center leading-none tabular-nums">
                      {badge}
                    </span>
                  )}
                </span>
                {/* label a11y: text-default-700 (NF-4) */}
                <span className="text-xs text-default-700 text-center leading-tight font-medium">
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
