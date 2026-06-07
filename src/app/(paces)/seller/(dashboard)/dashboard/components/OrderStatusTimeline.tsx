/**
 * OrderStatusTimeline — RSC
 * S-11 (v4 polish): highlight bar "รอดำเนินการ" + grid-3 สถานะที่เหลือ
 *
 * ทำไม: seller เห็น action ที่รอทำก่อนทันที (PENDING เด่น, actionable)
 *       3 สถานะที่เหลือย่อเป็นแถวเล็กลดน้ำหนักสายตา
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx
 * — adapt (v4): vertical timeline → highlight bar + grid-3; ตัด time/desc;
 *   node → circle chip + icon; เพิ่ม section header + link; highlight PENDING bar บนสุด
 *
 * ⚠️ literal Tailwind class เต็มทุก node — กัน Tailwind v4 purge dynamic string
 */

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'

type Props = {
  counts: {
    PENDING: number
    SHIPPED: number
    CONFIRMED: number
    CANCELLED: number
  }
}

// ─── helper: clamp count ≤99 เพื่อกัน 3 หลัก squeeze ที่ 360px ────────────────
function clamp(n: number): string {
  return n > 99 ? '99+' : String(n)
}

// ─── config: 3 สถานะที่เหลือ (ไม่รวม PENDING ที่อยู่ใน highlight bar) ──────────
// ทำไม: literal class เต็มทุก entry กัน Tailwind v4 purge
const SECONDARY_NODES = [
  {
    key: 'SHIPPED' as const,
    icon: 'truck-delivery',
    chipBg: 'bg-blue-50',
    chipText: 'text-blue-600',
    label: 'จัดส่งแล้ว',
  },
  {
    key: 'CONFIRMED' as const,
    icon: 'circle-check',
    chipBg: 'bg-emerald-50',
    chipText: 'text-emerald-600',
    label: 'สำเร็จ',
  },
  {
    key: 'CANCELLED' as const,
    icon: 'circle-x',
    chipBg: 'bg-slate-100',
    chipText: 'text-slate-500',
    label: 'ยกเลิก',
  },
] as const

// ─── Component ────────────────────────────────────────────────────────────────
export default function OrderStatusTimeline({ counts }: Props) {
  return (
    <section className="mb-4">
      {/* section header — label + link "จัดการ ›" ตาม mockup v4 */}
      <div className="flex items-center justify-between mb-[10px]">
        <span className="text-[13.5px] font-bold text-default-500">สถานะคำสั่งซื้อ</span>
        <Link
          href="/orders"
          className="text-[12.5px] font-semibold text-primary"
        >
          จัดการ ›
        </Link>
      </div>

      {/* card shell — rounded-[20px] + layered shadow ตาม card treatment v4 */}
      <div className="bg-white rounded-[20px] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_6px_16px_-8px_rgba(16,24,40,0.10)] p-4">

        {/* highlight bar — PENDING actionable, blue-tint bg ────────────────── */}
        {/* ทำไม: seller มือใหม่เห็นทันทีว่าต้องทำอะไรก่อน (mockup v4 §3 ใช้ง่าย) */}
        <Link
          href="/orders"
          className="flex items-center gap-3 rounded-2xl bg-blue-50 px-3.5 py-3 mb-3.5"
        >
          {/* icon chip ขาว ลอยใน bar */}
          <span className="inline-flex w-11 h-11 rounded-xl bg-white text-blue-600 shadow-sm shrink-0 items-center justify-center">
            <Icon icon="clock-hour-4" className="text-[24px]" />
          </span>

          {/* text block */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-default-600 leading-tight">รอคุณดำเนินการ</p>
            <p className="text-[20px] font-bold text-blue-600 leading-tight">
              {clamp(counts.PENDING)} รายการ
            </p>
          </div>

          {/* chevron actionable indicator */}
          <Icon icon="chevron-right" className="text-[22px] text-blue-600" />
        </Link>

        {/* grid-3: 3 สถานะที่เหลือ (เล็กกว่า PENDING) ─────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          {SECONDARY_NODES.map((node) => (
            <div
              key={node.key}
              className="flex flex-col items-center gap-1 py-1"
            >
              {/* circle chip — literal bg/text กัน purge */}
              <span
                className={`inline-flex w-9 h-9 rounded-full ${node.chipBg} ${node.chipText} items-center justify-center`}
              >
                <Icon icon={node.icon} className="text-[19px]" />
              </span>

              {/* count — 0 แสดง "0"; clamp "99+" กัน 3 หลัก */}
              <span className="text-[17px] font-bold leading-none">
                {clamp(counts[node.key])}
              </span>

              {/* label */}
              <span className="text-[11px] text-default-500">{node.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
