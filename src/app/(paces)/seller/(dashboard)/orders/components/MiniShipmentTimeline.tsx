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
import { SHIPMENT_STAGES, describeProgress } from '@/lib/iship/status'
// ตารางจุดไฮไลต์ย้ายไปเป็น SSOT ที่ order-stage.ts แล้ว — ฝั่งผู้ซื้อ (ParcelTimeline) เคยเขียน
// ตรรกะของตัวเองขึ้นมาใหม่แล้วแมปผิดทั้งชุด สองจอต้องอ่านจากตารางเดียวกันเท่านั้น
import { SHIPMENT_STAGE_DOT_INDEX, SHIPPING_STAGE_LABEL, type ShippingStageKey } from '@/lib/order-stage'
import { NOTICE_BOX, shipmentCurrentDotCls } from '@/components/safepay/iship/tone'

interface Props {
  stage: ShippingStageKey | undefined
  /**
   * สถานะล่าสุดจากขนส่ง (iShip) — มีค่า = ตัดสินขั้นด้วย `describeProgress()` **ตัวเดียวกับ
   * `ShippingCard` ในหน้ารายละเอียด** ⇒ ออเดอร์ใบเดียวกันไม่พูดคนละขั้นสองจอ
   *
   * null = ร้านแจ้งเลขเอง (ไม่มีขนส่งคอยอัปเดต) → ถอยไปใช้ `SHIPMENT_STAGE_DOT_INDEX`
   * ซึ่งหยาบกว่าแต่เป็นข้อมูลเท่าที่มีจริง
   */
  carrierStatus?: string | null
  /** OrderShipment.status — คู่กับ carrierStatus เป็น input ของ describeProgress */
  shipmentStatus?: string
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

export default function MiniShipmentTimeline({
  stage,
  carrierStatus,
  shipmentStatus,
  hasShipment,
  cancelled,
  plain,
}: Props) {
  /**
   * 🛑 ลำดับความน่าเชื่อถือ: ขนส่งบอกเอง > กองงานที่เราจัดให้
   *
   * `describeProgress()` เป็น SSOT ที่ `ShippingCard`/`ShipmentStatusView`/`ShipmentStepper`
   * ใช้อยู่ก่อนแล้ว และมันละเอียดระดับ carrierStatus — `return_success` ไปจุดที่ 4 พร้อม
   * เปลี่ยนคำเป็น "ส่งคืนสำเร็จ" ส่วน `cannot_pickup` ถอยไปจุดที่ 1 (ขนส่งยังไม่ได้ของ)
   * ขณะที่ `SHIPMENT_STAGE_DOT_INDEX` เห็นแค่กองงาน 6 ค่าจึงปักจุดรถให้ทั้งคู่
   *
   * ก่อนหน้านี้แถว/hover อ่านจากตารางหยาบอย่างเดียว ⇒ พัสดุที่ตีกลับมาถึงร้านแล้วขึ้น
   * "กำลังจัดส่ง" ตัวหนา (user เจอบน prod 2026-08-24) — คำที่ขัดกับความจริงบนจอที่ผู้ขาย
   * ใช้ตัดสินใจ แย่กว่าไม่มีคำเลย
   */
  const progress = carrierStatus != null ? describeProgress(shipmentStatus ?? 'CREATED', carrierStatus) : null
  const cur = progress ? progress.stage : stage != null ? SHIPMENT_STAGE_DOT_INDEX[stage] : null
  if (cur == null || cur < 0 || !hasShipment || cancelled) {
    return <span className="text-default-400 text-sm">—</span>
  }

  /** คำใต้จุด — ขั้นสุดท้ายถูก override ได้ ("ส่งคืนสำเร็จ" ไม่ใช่ "จัดส่งสำเร็จ") */
  const stepLabel = (i: number) =>
    i === SHIPMENT_STAGES.length - 1 ? (progress?.lastLabel ?? SHIPMENT_STAGES[i].label) : SHIPMENT_STAGES[i].label

  /**
   * คำที่ใช้อ่านให้ screen reader / title — ต้องเป็นคำเดียวกับที่ตาเห็น
   *
   * พัสดุ iShip: คำของขั้นปัจจุบัน (ซึ่งขั้นสุดท้ายถูก override เป็น "ส่งคืนสำเร็จ" ได้)
   * พัสดุที่ร้านแจ้งเลขเอง: ไม่มี carrierStatus ให้ละเอียดกว่านั้น จึงใช้คำของกองงาน
   */
  const currentLabel = progress
    ? stepLabel(Math.min(cur, SHIPMENT_STAGES.length - 1))
    : stage === 'PROBLEM' || stage === 'RETURNED'
      ? SHIPPING_STAGE_LABEL[stage]
      : SHIPMENT_STAGES[Math.min(cur, SHIPMENT_STAGES.length - 1)].label
  const ariaLabel = `สถานะพัสดุ: ${currentLabel}`
  /** สีจุดปัจจุบัน — SSOT เดียวกับหน้ารายละเอียด ห้ามตัดสินเองที่นี่ */
  const currentDot = shipmentCurrentDotCls(progress?.notice)

  const dot = (i: number, size: 'sm' | 'lg') => {
    const reached = i <= cur
    const isCurrent = i === cur
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full',
          size === 'sm' ? 'size-6' : 'size-8',
          isCurrent ? currentDot : reached ? 'bg-success text-white' : 'bg-default-100 text-default-500',
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
          {plain ? dot(i, 'sm') : <span title={stepLabel(i)}>{dot(i, 'sm')}</span>}
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
        <p className="text-default-900 mb-2 text-xs font-semibold">{currentLabel}</p>
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
                    {stepLabel(i)}
                  </span>
                </span>
              </Fragment>
            )
          })}
        </div>

        {/* กล่องเตือนเมื่อออกนอกเส้นทางปกติ — ข้อความมาจาก NOTICE_OF ตัวเดียวกับหน้ารายละเอียด
            (เดิม panel นี้ไม่มีกล่องนี้เลย ⇒ ต่อให้จุดถูกแล้ว ผู้ขายก็ยังไม่รู้ว่าเกิดอะไรขึ้น) */}
        {progress?.notice && (
          <p
            className={cn(
              'text-2xs mt-2 mb-0 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5',
              NOTICE_BOX[progress.notice.tone] ?? NOTICE_BOX.secondary,
            )}
          >
            <Icon icon="alert-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
            <span>{progress.notice.text}</span>
          </p>
        )}
      </div>
    </HoverPanel>
  )
}
