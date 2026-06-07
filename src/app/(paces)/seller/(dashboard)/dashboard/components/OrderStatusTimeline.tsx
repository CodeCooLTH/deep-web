/**
 * OrderStatusTimeline — RSC
 * S-11: แสดง 4 สถานะคำสั่งซื้อแบบ horizontal row คั่นด้วย chevron
 *
 * ทำไม: seller เห็น snapshot สถานะออเดอร์ทั้งหมดในคลิกเดียว ไม่ต้องเข้า list
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx
 * — adapt: vertical timeline → horizontal flex row; ตัด time/desc column;
 *   node size-3.5 circle → w-10 h-10 circle + icon; เพิ่ม chevron separator
 *
 * ⚠️ 360px note: 4 node + 3 chevron ใน flex-1 — count 3 หลัก (≥100) อาจ squeeze
 * ให้ flex-1 + leading-none ช่วย; ถ้า QA พบ squeeze ให้ clamp "99+" หรือ ลด font เป็น text-[14px]
 */

import { Fragment } from 'react'
import Icon from '@/components/wrappers/Icon'

type Props = {
  counts: {
    PENDING: number
    SHIPPED: number
    CONFIRMED: number
    CANCELLED: number
  }
}

// ─── config nodes ─────────────────────────────────────────────────────────────
// ทำไม: ใช้ literal class string เต็มในแต่ละ entry
// กัน Tailwind v4 purge dynamic string (เหมือน ShortcutPanel pattern)
const NODES = [
  {
    key: 'PENDING' as const,
    icon: 'clock',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    label: 'รอดำเนินการ',
  },
  {
    key: 'SHIPPED' as const,
    icon: 'truck',
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    label: 'จัดส่งแล้ว',
  },
  {
    key: 'CONFIRMED' as const,
    icon: 'circle-check',
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    label: 'สำเร็จ',
  },
  {
    key: 'CANCELLED' as const,
    icon: 'circle-x',
    bg: 'bg-gray-100',
    text: 'text-gray-500',
    label: 'ยกเลิก',
  },
] as const

// ─── Component ────────────────────────────────────────────────────────────────
export default function OrderStatusTimeline({ counts }: Props) {
  return (
    <section className="mx-3 mb-4">
      {/* label section */}
      <p className="text-[13px] font-semibold text-muted-foreground mb-2 pl-1">สถานะคำสั่งซื้อ</p>

      {/* card shell — ใช้ Tailwind primitive ไม่ใช้ .card (padding global ขัด flex ตาม Design Decision #2) */}
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-center justify-between">
          {NODES.map((node, idx) => (
            <Fragment key={node.key}>
              {/* status node */}
              <div
                className="flex flex-col items-center gap-1 flex-1"
              >
                {/* circle icon — literal bg/text class ต่อ node กัน purge */}
                <span
                  className={`inline-flex w-10 h-10 rounded-full ${node.bg} ${node.text} items-center justify-center`}
                >
                  <Icon icon={node.icon} className="text-xl" />
                </span>

                {/* count — 0 แสดง "0" ไม่ซ่อน (spec S-11); leading-none กัน wrap @360px
                    clamp "99+" กัน 3 หลัก squeeze 4 node + 3 chevron ที่ 360px (UX Q1) */}
                <span className="text-[18px] font-bold text-default-900 leading-none">
                  {counts[node.key] > 99 ? '99+' : counts[node.key]}
                </span>

                {/* label */}
                <span className="text-[11px] text-muted-foreground">{node.label}</span>
              </div>

              {/* chevron separator — ไม่ต้องการหลัง node สุดท้าย */}
              {idx < NODES.length - 1 && (
                <Icon
                  icon="chevron-right"
                  className="text-gray-300 text-lg shrink-0"
                />
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  )
}
