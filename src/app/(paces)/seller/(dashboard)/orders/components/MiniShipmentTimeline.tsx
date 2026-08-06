'use client'

/**
 * MiniShipmentTimeline — สถานะพัสดุแบบ timeline จิ๋ว 4 จุด icon ล้วน (ไม่มีข้อความ)
 * ใช้ในแถวตารางออเดอร์ (desktop) และการ์ดออเดอร์ (mobile) — user สั่ง 2026-08-06
 *
 * จุด/ลำดับ/สี = ทรงเดียวกับ stepper ใหญ่ในการ์ดการจัดส่ง (ShippingCard) ย่อส่วน
 * ตำแหน่งปัจจุบันมาจาก shippingStage ซึ่งคำนวณด้วย deriveShippingStage ที่ server —
 * SSOT เดียวกับไทล์ Command Center และตัวกรอง ?stage= ห้ามนับเองที่นี่
 *
 * Base: stepper ใน orders/[token]/components/ShippingCard.tsx (ย่อส่วน icon-only)
 */

import { Fragment } from 'react'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { SHIPMENT_STAGES } from '@/lib/iship/status'
import type { ShippingStageKey } from '@/lib/order-stage'

/**
 * จุดปัจจุบันต่อ stage — 4 = จบเส้นทาง (ทุกจุดเขียว), null = ยังไม่มีพัสดุให้วาด
 * PROBLEM ปักที่จุดรถ (2) ด้วยสี danger — ไม่มีจุดแยกของ "มีปัญหา" ในแถบ 4 จุด
 */
const CURRENT_INDEX: Record<ShippingStageKey, number | null> = {
  AWAITING_PARCEL: null,
  AWAITING_PICKUP: 0,
  SHIPPING: 2,
  PROBLEM: 2,
  AWAITING_COD: 4,
  DONE: 4,
}

interface Props {
  stage: ShippingStageKey | undefined
  /** มีพัสดุ/เลขแทรคจริงไหม — DONE ของออเดอร์ที่ไม่เคยมีพัสดุต้องไม่วาดแถบเขียวลอย ๆ */
  hasShipment: boolean
  /** ออเดอร์ยกเลิกแล้ว — ไม่วาด timeline (สถานะพัสดุไม่ใช่สาระของใบนั้นอีก) */
  cancelled?: boolean
}

export default function MiniShipmentTimeline({ stage, hasShipment, cancelled }: Props) {
  const cur = stage != null ? CURRENT_INDEX[stage] : null
  if (cur == null || !hasShipment || cancelled) {
    return <span className="text-default-400 text-sm">—</span>
  }

  const problem = stage === 'PROBLEM'
  const ariaLabel = problem
    ? 'สถานะพัสดุ: พัสดุมีปัญหา'
    : `สถานะพัสดุ: ${SHIPMENT_STAGES[Math.min(cur, SHIPMENT_STAGES.length - 1)].label}`

  return (
    <div className="flex items-center" role="img" aria-label={ariaLabel}>
      {SHIPMENT_STAGES.map((s, i) => {
        const reached = i <= cur
        const isCurrent = i === cur
        return (
          <Fragment key={s.label}>
            {i > 0 && (
              <span
                className={cn('h-0.5 w-2 shrink-0', reached ? 'bg-success' : 'bg-default-200')}
              />
            )}
            {/* title ต่อจุด — ไม่มีข้อความบนจอ ผู้ใช้เมาส์ hover อ่านชื่อขั้นได้ */}
            <span
              title={s.label}
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full',
                problem && isCurrent
                  ? 'bg-danger text-white'
                  : isCurrent
                    ? 'bg-primary text-white'
                    : reached
                      ? 'bg-success text-white'
                      : 'bg-default-100 text-default-500',
              )}
            >
              <Icon icon={s.icon} className="text-xs" aria-hidden="true" />
            </span>
          </Fragment>
        )
      })}
    </div>
  )
}
