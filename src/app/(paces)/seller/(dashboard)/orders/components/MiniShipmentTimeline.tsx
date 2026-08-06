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
  const currentLabel = problem
    ? 'พัสดุมีปัญหา'
    : SHIPMENT_STAGES[Math.min(cur, SHIPMENT_STAGES.length - 1)].label
  const ariaLabel = `สถานะพัสดุ: ${currentLabel}`

  const dot = (i: number, size: 'sm' | 'lg') => {
    const reached = i <= cur
    const isCurrent = i === cur
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full',
          size === 'sm' ? 'size-6' : 'size-8',
          problem && isCurrent
            ? 'bg-danger text-white'
            : isCurrent
              ? 'bg-primary text-white'
              : reached
                ? 'bg-success text-white'
                : 'bg-default-100 text-default-500',
        )}
      >
        <Icon
          icon={SHIPMENT_STAGES[i].icon}
          className={size === 'sm' ? 'text-xs' : 'text-base'}
          aria-hidden="true"
        />
      </span>
    )
  }

  return (
    // group-hover ขึ้น panel เต็ม (user 2026-08-06) — CSS ล้วน ไม่มี JS state:
    // touch ไม่มี hover ก็แค่ไม่ขึ้น (มือถือมี title ต่อจุดอยู่แล้ว)
    <div className="group relative inline-flex items-center" role="img" aria-label={ariaLabel}>
      {SHIPMENT_STAGES.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 && (
            <span className={cn('h-0.5 w-2 shrink-0', i <= cur ? 'bg-success' : 'bg-default-200')} />
          )}
          <span title={s.label}>{dot(i, 'sm')}</span>
        </Fragment>
      ))}

      {/* panel เต็มตอน hover — stepper ทรงเดียวกับการ์ดการจัดส่ง (ShippingCard) ย่อกว้าง 288px
          ยึด absolute กับตัว timeline (บทเรียน popover: ยึดที่ตัว trigger ไม่ใช่แถว) เปิดขึ้นบน
          กันชนขอบล่างของกล่อง scroll ตาราง */}
      <div className="border-default-200 bg-card pointer-events-none invisible absolute bottom-full start-0 z-30 mb-2 w-72 rounded-lg border p-3 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100">
        <p className={cn('mb-2 text-xs font-semibold', problem ? 'text-danger-ink' : 'text-default-900')}>
          {currentLabel}
        </p>
        <div className="flex items-center">
          {SHIPMENT_STAGES.map((s, i) => (
            <Fragment key={s.label}>
              {i > 0 && (
                <span
                  className={cn('h-0.5 flex-1', i <= cur ? 'bg-success' : 'bg-default-200')}
                />
              )}
              {dot(i, 'lg')}
            </Fragment>
          ))}
        </div>
        <div className="mt-1.5 flex items-start">
          {SHIPMENT_STAGES.map((s, i) => {
            const isLast = i === SHIPMENT_STAGES.length - 1
            return (
              <Fragment key={s.label}>
                {i > 0 && <span className="flex-1" />}
                <span
                  className={cn(
                    'flex w-8 shrink-0',
                    i === 0 ? 'justify-start' : isLast ? 'justify-end' : 'justify-center',
                  )}
                >
                  <span
                    className={cn(
                      'text-2xs leading-tight whitespace-nowrap',
                      i === cur ? 'text-default-900 font-semibold' : 'text-default-700',
                    )}
                  >
                    {s.label}
                  </span>
                </span>
              </Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}
