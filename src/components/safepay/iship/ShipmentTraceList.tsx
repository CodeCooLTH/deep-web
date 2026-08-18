'use client'

/**
 * ShipmentTraceList — ไทม์ไลน์ "สถานะล่าสุด" ของพัสดุ (จุดสี + เส้นประ + เวลา/สถานที่)
 *
 * ═══ ทำไมแยกออกมา ═══
 * โครงนี้ถูกออกแบบและปรับจนลงตัวใน `orders/components/ShipmentHoverCard.tsx` แล้ว
 * (2026-08-06/07) พอ user ขอไทม์ไลน์แบบเดียวกันใน sheet ของห้องแชท (2026-08-17) ทางที่ผิดคือ
 * ก็อป JSX ไปวางอีกที่ — ของสองที่จะเพี้ยนจากกันทันทีที่มีคนแก้ฝั่งเดียว โดยไม่มี tsc/เทสฟ้อง
 * (คลาสเดียวกับที่ CLAUDE.md บันทึกไว้เรื่อง 3 แถบที่ "ก็อปโครงกันมา" แล้วกลายเป็น 3 แถวหน้าตา
 *  เหมือนกันแต่คนละความหมาย)
 *
 * 🛑 รายละเอียดที่ห้ามทำหาย เพราะเคยวัดจริงมาแล้ว (ยกมาจาก ShipmentHoverCard ทั้งดุ้น):
 *   · เส้นต่อเป็น **element จริง** ไม่ใช่ `::after` ของธีม — ของธีมคำนวณ offset จากขนาดจุดคงที่
 *     พอจุดแถวล่าสุดใหญ่กว่าแถวประวัติ (28 vs 24) เส้นจะไม่ต่อกัน (บทเรียนเดียวกับ
 *     ShippingActivity.tsx ที่วัดจริงแล้วได้เส้นสูง 0px)
 *   · เวลาอยู่ **บรรทัดที่ 2** ไม่ใช่คอลัมน์ซ้าย — วันที่ไทยเต็ม "07 ส.ค. 2569 09:58" กิน ~100px
 *     ถ้าทำเป็นคอลัมน์ ข้อความสถานะ+สถานที่จะถูกตัดเป็น 3 บรรทัดทุกแถวบนจอแคบ
 *   · พื้นทินท์ของแถวล่าสุดเป็น `bg-default-50` (เทากลาง) **ไม่ใช่สี semantic** — กรอบนี้แปลว่า
 *     "อันนี้คืออันล่าสุด" ไม่ได้แปลว่าสถานะดี/ร้าย ความหมายนั้นอยู่ที่สีของจุดแล้ว
 */

import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatDateTimeTH } from '@/lib/format-date'
import { describeCarrierStatus } from '@/lib/iship/status'
import { TONE_DOT_SOLID, TONE_DOT_TINT } from './tone'

/** เหตุการณ์ที่ `/api/seller/iship/shipments/[id]/traces` คืนมา (รูปเดียวกับ ShippingCard) */
export type TraceEvent = {
  status: string
  statusText?: string | null
  statusDesc?: string | null
  location?: string | null
  occurredAt?: string | null
}

/** เรียงใหม่ก่อนเก่า แล้วตัดเหลือ n รายการ — ผู้เรียกทุกที่ต้องเรียงเหมือนกัน */
export function sortTraces(traces: TraceEvent[], limit?: number): TraceEvent[] {
  const at = (t: TraceEvent) => (t.occurredAt ? Date.parse(t.occurredAt) : 0)
  const sorted = [...traces].sort((a, b) => at(b) - at(a))
  return limit ? sorted.slice(0, limit) : sorted
}

export default function ShipmentTraceList({ traces }: { traces: TraceEvent[] }) {
  if (traces.length === 0) return null
  return (
    <div>
      {traces.map((t, i) => {
        const meta = describeCarrierStatus(t.status)
        const latest = i === 0
        const isLast = i === traces.length - 1
        return (
          <div className="flex gap-x-2.5" key={`${t.occurredAt ?? ''}-${t.status}-${i}`}>
            <div className="flex shrink-0 flex-col items-center">
              <span
                className={cn(
                  'flex shrink-0 items-center justify-center rounded-full',
                  latest ? 'size-7' : 'size-6',
                  (latest ? TONE_DOT_SOLID : TONE_DOT_TINT)[meta.tone],
                )}
              >
                <Icon icon={meta.icon} className={latest ? 'text-base' : 'text-sm'} aria-hidden="true" />
              </span>
              {!isLast && <span className="border-default-300 w-px flex-1 border-e border-dashed" />}
            </div>
            <div className={cn('min-w-0 flex-1 rounded-lg px-2 py-1', latest && 'bg-default-50', !isLast && 'mb-2')}>
              <p
                className={cn(
                  'mb-0 text-xs break-words',
                  latest ? 'text-default-900 font-semibold' : 'text-default-800 font-medium',
                )}
              >
                {t.statusText ?? t.statusDesc ?? meta.text}
              </p>
              <p className="text-default-700 mb-0 text-2xs tabular-nums">
                {t.occurredAt ? formatDateTimeTH(t.occurredAt) : '—'}
                {t.location && <span> · {t.location}</span>}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
