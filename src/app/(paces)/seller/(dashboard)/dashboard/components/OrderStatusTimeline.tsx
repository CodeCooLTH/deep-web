/**
 * OrderStatusTimeline — RSC
 * S-11 (v6 polish): violet CTA "รอคุณดำเนินการ" + 3-stat inline grid
 *
 * ทำไม: violet CTA โดดเด่นกว่า blue-50 bar เดิม (v4) — actionable ชัดขึ้น;
 *       3-stat ใต้ CTA ย่อเป็น icon+count (ไม่มี chip กลม) เบากว่าเดิม
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx
 * — adapt (v6): vertical timeline → violet CTA block + grid-3 inline stat;
 *   ตัด time/desc; node → icon-only; เพิ่ม section header + sec-link violet
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

// ─── Component ────────────────────────────────────────────────────────────────
export default function OrderStatusTimeline({ counts }: Props) {
  return (
    <section className="mb-[14px]">
      {/* section header — label + sec-link violet ตาม mockup v6 */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-[13px] font-semibold text-[rgba(47,43,61,0.70)]">สถานะคำสั่งซื้อ</span>
        <Link
          href="/orders"
          className="text-[12.5px] font-medium text-[#7367F0] inline-flex items-center gap-[1px]"
        >
          จัดการ
          <Icon icon="chevron-right" className="text-[15px]" />
        </Link>
      </div>

      {/* card shell — rounded-[14px] + shadow v6 bg ขาว */}
      <div className="bg-white rounded-[14px] shadow-[0_2px_8px_rgba(47,43,61,0.07)] p-3">

        {/* CTA block — violet solid, actionable ─────────────────────────────── */}
        {/* ทำไม: seller เห็นทันทีว่าต้องทำอะไรก่อน (mockup v6 ORDER STATUS §1) */}
        <Link
          href="/orders"
          className="flex items-center gap-3 bg-[#7367F0] rounded-[11px] px-3.5 py-3"
        >
          {/* icon chip ขาวบนพื้น violet */}
          <span className="inline-flex shrink-0 w-[38px] h-[38px] rounded-[10px] bg-white/[0.18] items-center justify-center">
            <Icon icon="clock-hour-4" className="text-[21px] text-white" />
          </span>

          {/* text block */}
          <span className="flex-1 min-w-0">
            <span className="block text-[12.5px] text-white/85 leading-[1.2]">รอคุณดำเนินการ</span>
            <span className="block text-[19px] font-bold text-white leading-[1.25]">
              {clamp(counts.PENDING)} รายการ
            </span>
          </span>

          {/* chevron actionable indicator */}
          <Icon icon="chevron-right" className="text-[20px] text-white/90 shrink-0" />
        </Link>

        {/* 3-stat inline grid ──────────────────────────────────────────────── */}
        {/* ทำไม: 3 สถานะที่เหลือย่อเป็นแถวเบา ลดน้ำหนักสายตา (mockup v6 §2) */}
        <div className="grid grid-cols-3 mt-3">

          {/* จัดส่งแล้ว — SHIPPED, icon สี cyan */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="flex items-center gap-1.5">
              <Icon icon="truck-delivery" className="text-[16px] text-[#00BAD1]" />
              <span className="text-[18px] font-bold">{clamp(counts.SHIPPED)}</span>
            </span>
            <span className="text-[11.5px] text-[rgba(47,43,61,0.55)]">จัดส่งแล้ว</span>
          </div>

          {/* สำเร็จ — CONFIRMED, icon สี green; ตัวกลางมี border-l/r */}
          <div className="flex flex-col items-center gap-0.5 border-l border-r border-[rgba(47,43,61,0.10)]">
            <span className="flex items-center gap-1.5">
              <Icon icon="circle-check" className="text-[16px] text-[#28C76F]" />
              <span className="text-[18px] font-bold">{clamp(counts.CONFIRMED)}</span>
            </span>
            <span className="text-[11.5px] text-[rgba(47,43,61,0.55)]">สำเร็จ</span>
          </div>

          {/* ยกเลิก — CANCELLED, icon สี ink-40, ตัวเลข ink-70 */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="flex items-center gap-1.5">
              <Icon icon="circle-x" className="text-[16px] text-[rgba(47,43,61,0.40)]" />
              <span className="text-[18px] font-bold text-[rgba(47,43,61,0.70)]">{clamp(counts.CANCELLED)}</span>
            </span>
            <span className="text-[11.5px] text-[rgba(47,43,61,0.55)]">ยกเลิก</span>
          </div>

        </div>
      </div>
    </section>
  )
}
