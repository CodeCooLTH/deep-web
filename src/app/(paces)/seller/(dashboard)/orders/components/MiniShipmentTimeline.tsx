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
import HoverPanel from './HoverPanel'
import { cn } from '@/utils/helpers'
import { SHIPMENT_STAGES } from '@/lib/iship/status'
// ตารางจุดไฮไลต์ย้ายไปเป็น SSOT ที่ order-stage.ts แล้ว — ฝั่งผู้ซื้อ (ParcelTimeline) เคยเขียน
// ตรรกะของตัวเองขึ้นมาใหม่แล้วแมปผิดทั้งชุด สองจอต้องอ่านจากตารางเดียวกันเท่านั้น
import { SHIPMENT_STAGE_DOT_INDEX, SHIPPING_STAGE_LABEL, type ShippingStageKey } from '@/lib/order-stage'

interface Props {
  stage: ShippingStageKey | undefined
  /** มีพัสดุ/เลขแทรคจริงไหม — DONE ของออเดอร์ที่ไม่เคยมีพัสดุต้องไม่วาดแถบเขียวลอย ๆ */
  hasShipment: boolean
  /** ออเดอร์ยกเลิกแล้ว — ไม่วาด timeline (สถานะพัสดุไม่ใช่สาระของใบนั้นอีก) */
  cancelled?: boolean
  /**
   * true = วาดแค่จุด ไม่เปิด panel ของตัวเอง
   *
   * ใช้เมื่อถูกวางอยู่ใน hover card ที่ใหญ่กว่าแล้ว (ShipmentHoverCard) — ไม่งั้นเอาเมาส์
   * ไปวางตรงจุดจะได้ panel เล็กของตัวเองแทนการ์ดเต็มของพ่อ = สองอันแย่งกันบนจอเดียว
   */
  plain?: boolean
}

export default function MiniShipmentTimeline({ stage, hasShipment, cancelled, plain }: Props) {
  const cur = stage != null ? SHIPMENT_STAGE_DOT_INDEX[stage] : null
  if (cur == null || !hasShipment || cancelled) {
    return <span className="text-default-400 text-sm">—</span>
  }

  /**
   * แถบ 4 จุดเล่าได้แค่ "ของเดินหน้าไปถึงไหน" — สองกองนี้อยู่นอกเส้นนั้น จึงยืมจุดรถมาปัก
   * แล้วเปลี่ยนสี+คำแทน (SHIPMENT_STAGE_DOT_INDEX ให้ค่า 2 กับทั้งคู่ด้วยเหตุผลเดียวกัน)
   *
   * แยกสีตามกอง: PROBLEM = danger (ยังไม่รู้ผล ต้องไปตามขนส่ง) · RETURNED = warning
   * (ของกลับมาถึงร้านแล้ว เหลือแต่ร้านตัดสินใจ) — ถ้าใช้สีเดียวกันก็เท่ากับไม่ได้แยกกอง
   *
   * 🛑 คำต้องมาจาก SHIPPING_STAGE_LABEL ไม่ใช่ literal ในไฟล์นี้ (เดิมพิมพ์ 'พัสดุมีปัญหา'
   * ไว้เอง = คำเดียวกันสองที่ เลื่อนออกจากกันได้เงียบ ๆ — HR16)
   */
  const problem = stage === 'PROBLEM'
  const returned = stage === 'RETURNED'
  const offTrack = problem || returned
  const currentLabel =
    stage === 'PROBLEM' || stage === 'RETURNED'
      ? SHIPPING_STAGE_LABEL[stage]
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
          offTrack && isCurrent
            ? problem
              ? 'bg-danger text-white'
              : 'bg-warning text-white'
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

  const dots = (
    <div className="flex items-center" role="img" aria-label={ariaLabel}>
      {SHIPMENT_STAGES.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 && (
            <span className={cn('h-0.5 w-2 shrink-0', i <= cur ? 'bg-success' : 'bg-default-200')} />
          )}
          {/* plain = ไม่ใส่ title รายจุด ปล่อยให้การ์ดเต็มของพ่อเป็นคนอธิบาย */}
          {plain ? dot(i, 'sm') : <span title={s.label}>{dot(i, 'sm')}</span>}
        </Fragment>
      ))}
    </div>
  )

  if (plain) return dots

  return (
    // hover ขึ้น panel เต็มผ่าน HoverPanel (portal ระดับ body — cell อยู่ใน .table-wrapper
    // overflow-auto, absolute ใน cell โดน clip; touch ไม่มี hover ก็แค่ไม่ขึ้น มี title ต่อจุดแล้ว)
    <HoverPanel
      width={288}
      className="inline-flex items-center"
      trigger={dots}
    >
      {/* stepper เต็ม ทรงเดียวกับการ์ดการจัดส่ง (ShippingCard) ย่อส่วน */}
      <div className="p-3">
        <p
          className={cn(
            'mb-2 text-xs font-semibold',
            problem ? 'text-danger-ink' : returned ? 'text-warning-ink' : 'text-default-900',
          )}
        >
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
    </HoverPanel>
  )
}
