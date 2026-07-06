/**
 * OrderStatusBand — band คำสั่งซื้อ 4-status แบบ flat (RSC)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 *       (in-project adapt ref: src/app/(paces)/seller/(dashboard)/dashboard/components/OrderStatusRow.tsx)
 *
 * ต่างจาก OrderStatusRow:
 *  - icon Solar Duotone (ไม่ใช่ Tabler) ผ่าน @iconify/react โดยตรง (ไม่ใช้ wrapper)
 *  - icon flat ไม่มี circle/bg/border ครอบ (spec §4.2 + mockup .ostat)
 *  - badge เฉพาะ PENDING/SHIPPED เมื่อ count > 0 (งานที่ต้องทำ)
 *  - CONFIRMED/CANCELLED ไม่มี badge
 *  - icon สี per-status ตาม mockup (.ic-warning / .ic-info / .ic-success / .ic-default)
 */

import Link from 'next/link'
import { Icon } from '@iconify/react'

export interface OrderStatusBandProps {
  counts: {
    PENDING: number
    SHIPPED: number
    CONFIRMED: number
    CANCELLED: number
  }
}

// clamp count ≥100 → "99+" เพื่อไม่ให้ badge กว้างเกิน
function fmtBadge(n: number): string {
  if (n >= 100) return '99+'
  return String(n)
}

const STATUSES: {
  key: keyof OrderStatusBandProps['counts']
  label: string
  icon: string
  // สี Paces token ตาม mockup — ห้าม hardcode hex
  iconClass: string
  // แสดง badge เฉพาะ PENDING / SHIPPED (งานที่ต้องทำ)
  showBadge: boolean
}[] = [
  {
    key: 'PENDING',
    label: 'รอดำเนินการ',
    icon: 'solar:clock-circle-bold-duotone',
    iconClass: 'text-warning',
    showBadge: true,
  },
  {
    key: 'SHIPPED',
    label: 'กำลังจัดส่ง',
    icon: 'solar:delivery-bold-duotone',
    iconClass: 'text-info',
    showBadge: true,
  },
  {
    key: 'CONFIRMED',
    label: 'สำเร็จ',
    icon: 'solar:check-circle-bold-duotone',
    iconClass: 'text-success',
    showBadge: false,
  },
  {
    key: 'CANCELLED',
    label: 'ยกเลิก',
    icon: 'solar:close-circle-bold-duotone',
    // text-default-500 — โทน muted สำหรับสถานะ inactive (ยกเลิก)
    iconClass: 'text-default-500',
    showBadge: false,
  },
]

export default function OrderStatusBand({ counts }: OrderStatusBandProps) {
  return (
    <div className="card">
      {/* header: ชื่อ band + ลิงก์ "ดูทั้งหมด ›" (RSC-safe: Link ธรรมดา ไม่ใช้ component={Link} — Hard Rule 2) */}
      <div className="card-header flex items-center justify-between">
        <h4 className="card-title flex items-center gap-1.5">
          <Icon icon="tabler:clipboard-list" className="size-4 text-primary" />
          คำสั่งซื้อ
        </h4>
        <Link href="/orders" className="text-primary text-sm font-medium inline-flex items-center gap-0.5">
          ดูทั้งหมด
          <Icon icon="solar:alt-arrow-right-linear" className="size-4" />
        </Link>
      </div>

      <div className="card-body">
        {/* grid 4 คอลัมน์ flat — ไม่มี bg/border ครอบ icon (spec §4.2 + mockup .ostat) */}
        <div className="grid grid-cols-4 gap-2">
          {STATUSES.map(({ key, label, icon, iconClass, showBadge }) => {
            const count = counts[key]
            // badge แสดงเฉพาะ showBadge=true และ count > 0
            const badgeText = showBadge && count > 0 ? fmtBadge(count) : null

            return (
              /* Link ครอบ tap target ทั้งก้อน — short path ไม่มี /seller prefix (convention) */
              <Link
                key={key}
                href={`/orders?status=${key}`}
                className="flex flex-col items-center gap-2 py-1 active:scale-95 transition-transform"
              >
                {/* icon wrapper: relative เพื่อ position badge absolute */}
                {/* arbitrary: px-1 / py-0.5 เพิ่ม tap target รอบ icon (Paces ไม่มี token ขนาด hit-area ไม่มี circle) — HR7 */}
                <span className="relative inline-flex items-center justify-center px-1 py-0.5">
                  {/* icon Solar Duotone flat ขนาด 30px ตาม mockup .os-ic font-size:30px */}
                  {/* arbitrary: size-[30px] — Paces size-* token สูงสุด size-12(48px) ใหญ่เกินสำหรับ icon กริด; size-7(28px) เล็กไป, size-8(32px)ใกล้แต่ 30px ตรงกับ mockup — HR7 */}
                  <Icon
                    icon={icon}
                    className={`size-[30px] ${iconClass}`}
                  />
                  {/* badge เล็กมุมบนขวา icon — แสดงเฉพาะ PENDING/SHIPPED และ count > 0 */}
                  {badgeText !== null && (
                    <span
                      /* arbitrary: -top-1.5 / -right-2 จัดตำแหน่ง badge overlap มุมบนขวา icon — ค่า Paces spacing token ไม่ครอบ negative offset สำหรับ absolute badge — HR7 */
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-danger text-white rounded-full text-2xs font-bold flex items-center justify-center leading-none tabular-nums"
                    >
                      {badgeText}
                    </span>
                  )}
                </span>
                {/* label ใต้ icon — text-default-700 ตาม mockup .os-lb */}
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
