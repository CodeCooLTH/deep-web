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
    <section className="mb-3">
      {/* section header — label + sec-link violet ตาม mockup v6 */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-[13px] font-semibold text-[rgba(47,43,61,0.70)]">สถานะคำสั่งซื้อ</span>
        <Link
          href="/orders"
          className="text-[12.5px] font-medium text-primary inline-flex items-center gap-[1px]"
        >
          จัดการ
          <Icon icon="chevron-right" className="text-[15px]" />
        </Link>
      </div>

      {/* card shell — rounded-[14px] + shadow v6 bg ขาว */}
      <div className="bg-white rounded-[14px] shadow-[0_2px_8px_rgba(47,43,61,0.07)] p-3">

        {/* CTA block — violet solid, actionable ─────────────────────────────── */}
        {/* ทำไม: seller เห็นทันทีว่าต้องทำอะไรก่อน (mockup v6 ORDER STATUS §1) */}
        {/* v7 (Paces theme): primary CTA depth — bg-primary (Paces blue) + ink shadow + inner highlight ขาว + press feedback
            (ใช้ Paces token ไม่ใช่ม่วง Vuexy hardcode) */}
        <Link
          href="/orders"
          className="flex items-center gap-3 bg-primary rounded-[11px] px-3.5 py-2 shadow-[0_6px_16px_-4px_rgba(47,43,61,0.30),inset_0_1px_0_rgba(255,255,255,0.18)] active:scale-[0.99] transition-transform"
        >
          {/* icon chip ขาวบนพื้น violet */}
          <span className="inline-flex shrink-0 w-[38px] h-[38px] rounded-[10px] bg-white/[0.18] items-center justify-center">
            <Icon icon="clock-hour-4" className="text-[21px] text-white" />
          </span>

          {/* text block */}
          <span className="flex-1 min-w-0">
            <span className="block text-[12.5px] text-white/85 leading-[1.2]">รอคุณดำเนินการ</span>
            <span className="block text-[19px] font-bold text-white leading-[1.25] tabular-nums">
              {clamp(counts.PENDING)} รายการ
            </span>
          </span>

          {/* chevron actionable indicator */}
          <Icon icon="chevron-right" className="text-[20px] text-white/90 shrink-0" />
        </Link>

        {/* 3-stat stacked grid ─────────────────────────────────────────────── */}
        {/* ทำไม: stacked (chip บน/count/label) อ่านตัวเลขง่ายกว่า inline (v7 S-4)
            Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersStatCard.tsx
            — adapt: ย่อ chip จาก size-9 rounded-full → w-8 h-8 rounded-[9px], stacked layout, ตัด CountUp */}
        <div className="grid grid-cols-3 mt-3">

          {/* จัดส่งแล้ว — SHIPPED: signal-cyan #00BAD1 */}
          <div className="flex flex-col items-center gap-1">
            {/* icon chip — w-8 h-8 rounded-[9px] tint 10% ตาม spec §4A */}
            <span className="w-8 h-8 rounded-[9px] bg-[rgba(0,186,209,0.10)] flex items-center justify-center">
              <Icon icon="truck-delivery" className="text-[16px] text-[#00BAD1]" />
            </span>
            <span className="text-[17px] font-bold tabular-nums text-[#00BAD1]">{clamp(counts.SHIPPED)}</span>
            <span className="text-[11px] text-[rgba(47,43,61,0.65)]">จัดส่งแล้ว</span>
          </div>

          {/* สำเร็จ — CONFIRMED: verified-green #28C76F; ตัวกลางมี border-l/r */}
          <div className="flex flex-col items-center gap-1 border-l border-r border-[rgba(47,43,61,0.10)]">
            {/* icon chip — tint 10% */}
            <span className="w-8 h-8 rounded-[9px] bg-[rgba(40,199,111,0.10)] flex items-center justify-center">
              <Icon icon="circle-check" className="text-[16px] text-[#28C76F]" />
            </span>
            <span className="text-[17px] font-bold tabular-nums text-[#28C76F]">{clamp(counts.CONFIRMED)}</span>
            <span className="text-[11px] text-[rgba(47,43,61,0.65)]">สำเร็จ</span>
          </div>

          {/* ยกเลิก — CANCELLED: ink tone จาง (icon/count rgba 0.40, chip bg rgba 0.06) */}
          <div className="flex flex-col items-center gap-1">
            {/* icon chip — bg จางมาก */}
            <span className="w-8 h-8 rounded-[9px] bg-[rgba(47,43,61,0.06)] flex items-center justify-center">
              <Icon icon="circle-x" className="text-[16px] text-[rgba(47,43,61,0.40)]" />
            </span>
            <span className="text-[17px] font-bold tabular-nums text-[rgba(47,43,61,0.40)]">{clamp(counts.CANCELLED)}</span>
            <span className="text-[11px] text-[rgba(47,43,61,0.65)]">ยกเลิก</span>
          </div>

        </div>
      </div>
    </section>
  )
}
