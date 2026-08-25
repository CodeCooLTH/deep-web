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
import { collapsedOutcome, describeReturnLeg, railAriaLabel } from '@/lib/iship/return-timeline'
import ShipmentRail from '@/components/safepay/iship/ShipmentRail'
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
  /** เวลาของ "ขากลับ" — null = ขนส่งไม่ได้แจ้งเวลา ไม่ใช่ "ไม่เกิด" (ดู data.ts) */
  returnStartedAt?: string | Date | null
  returnedAt?: string | Date | null
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
  /**
   * `inline` = วาดแถบเต็ม (2 แถว + คำใต้จุด) ลงในที่ตรงนั้นเลย ไม่ผ่าน hover
   *
   * 🛑 ใช้กับ **การ์ดออเดอร์บนมือถือ** — ที่นั่นเรียกตัวนี้แบบไม่ส่ง `plain` มาตลอด
   * ⇒ ได้โหมดที่ห่อด้วย `HoverPanel` ซึ่ง **แตะไม่ได้บนมือถือเลย** (ไม่มี hover) จุดโชว์อยู่
   * แต่กดยังไงก็ไม่ขึ้น panel — บั๊กที่มีอยู่ก่อนงานนี้ ไม่มีใครรายงานเพราะมันไม่ error
   *
   * เหตุผลที่การ์ดมือถือควรได้แถบเต็มไปเลย (ไม่ใช่แค่แถบจิ๋วแบบในตาราง): **การ์ดไม่ใช่ตาราง**
   * มันมีที่เหลือเฟือและไม่มี hover ให้ใช้ตั้งแต่แรก · เคสตีกลับคือเคสที่ร้านต้องรีบตัดสินใจ
   * การบังคับให้กดเข้าไปอีกชั้นบนอุปกรณ์ที่ใช้บ่อยที่สุดคือการซ่อนของสำคัญ
   */
  inline?: boolean
}

export default function MiniShipmentTimeline({
  stage,
  carrierStatus,
  shipmentStatus,
  returnStartedAt,
  returnedAt,
  hasShipment,
  cancelled,
  plain,
  inline,
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
  const progress = carrierStatus != null ? describeProgress(shipmentStatus ?? 'CREATED', carrierStatus, 'seller') : null
  const cur = progress ? progress.stage : stage != null ? SHIPMENT_STAGE_DOT_INDEX[stage] : null
  if (cur == null || cur < 0 || !hasShipment || cancelled) {
    return <span className="text-default-400 text-sm">—</span>
  }

  /**
   * แถวที่ 2 ("ขากลับ") — `null` = ออเดอร์ปกติ
   *
   * 🛑 **แถบจิ๋วในตารางไม่วาดแถว 2** (ตารางมีค่าตรงที่กวาด 30 แถวได้ในสายตาเดียว แถวสูง
   * ไม่เท่ากันทำลายข้อนั้น) แต่มัน *ต้องรู้* ว่ามีขากลับ เพื่อยุบ 2 แถวเหลือ "ผลลัพธ์ของ
   * ทั้งเรื่อง" ที่จุดสุดท้าย — ดู `collapsedOutcome()` · แถบเต็ม 2 แถวอยู่ใน panel ข้างล่าง
   */
  const leg = describeReturnLeg({ audience: 'seller', carrierStatus, returnStartedAt, returnedAt })
  const collapsed = collapsedOutcome(leg)

  /** คำใต้จุด — ขั้นสุดท้ายถูก override ได้ ("ส่งไม่สำเร็จ" ไม่ใช่ "ส่งสำเร็จ") */
  const stepLabel = (i: number) =>
    i === SHIPMENT_STAGES.length - 1 ? (progress?.lastLabel ?? SHIPMENT_STAGES[i].label) : SHIPMENT_STAGES[i].label
  /** ไอคอนขั้นสุดท้ายถูก override คู่กับคำเสมอ — ดูเหตุผลที่ ShipmentProgress.lastIcon */
  const stepIcon = (i: number) =>
    i === SHIPMENT_STAGES.length - 1 ? (progress?.lastIcon ?? SHIPMENT_STAGES[i].icon) : SHIPMENT_STAGES[i].icon

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
  const ariaLabel = railAriaLabel(currentLabel, leg)
  /** สีจุดปัจจุบัน — SSOT เดียวกับหน้ารายละเอียด ห้ามตัดสินเองที่นี่ */
  const currentDot = shipmentCurrentDotCls(progress?.notice)

  const isLastDot = (i: number) => i === SHIPMENT_STAGES.length - 1

  const dot = (i: number, size: 'sm' | 'lg') => {
    const reached = i <= cur
    const isCurrent = i === cur
    /**
     * 🛑 จุดสุดท้ายของ **แถบจิ๋ว** ยุบ 2 แถวเหลือ "ผลลัพธ์ของทั้งเรื่อง" (ไม่ใช่ผลลัพธ์ของขาไป)
     *
     * ในตารางร้านกวาดตาหา "ใบไหนต้องลงมือ" ไม่ได้อ่านประวัติ ⇒ ถ้าจุดนี้พูดแค่ว่าขาไป
     * จบยังไง ร้านจะไม่มีทางรู้จากหน้ารายการเลยว่าของกลับมาถึงมือหรือยัง
     *
     * ต้องเปลี่ยน **ทั้งสีและรูปร่าง**: "ถึงร้านแล้ว" ใช้เขียวเท่ากับ "ส่งสำเร็จ" ตามมติ user
     * ⇒ ลูกศรย้อนกลับคือสิ่งเดียวที่เหลือให้แยกสองเคสบนแถบที่ไม่มีคำกำกับ (WCAG 1.4.1)
     */
    const useCollapsed = collapsed != null && isLastDot(i)
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full',
          size === 'sm' ? 'size-6' : 'size-8',
          useCollapsed
            ? collapsed.tone === 'success'
              ? 'bg-success text-white'
              : 'bg-warning text-white'
            : isCurrent
              ? currentDot
              : reached
                ? 'bg-success text-white'
                : 'bg-default-100 text-default-500',
        )}
      >
        <Icon
          icon={useCollapsed ? collapsed.icon : stepIcon(i)}
          className={size === 'sm' ? 'text-xs' : 'text-base'}
          aria-hidden="true"
        />
      </span>
    )
  }

  /** คำของจุดสุดท้ายบนแถบจิ๋ว — ยุบแล้วต้องพูดผลลัพธ์ของทั้งเรื่อง ไม่ใช่แค่ขาไป */
  const tipLabel = (i: number) => (collapsed && isLastDot(i) ? collapsed.label : stepLabel(i))

  const dots = (
    <div className="flex items-center" role="img" aria-label={ariaLabel}>
      {SHIPMENT_STAGES.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 && (
            <span
              className={cn(
                'h-0.5 w-2 shrink-0',
                i > cur
                  ? 'bg-default-200'
                  : // ช่วงสุดท้ายเป็นสีของผลลัพธ์ — ตีกลับต้องไม่ได้เส้นเขียวพาไปถึงจุดจบ
                    collapsed && isLastDot(i)
                    ? collapsed.tone === 'success'
                      ? 'bg-success'
                      : 'bg-warning'
                    : 'bg-success',
              )}
            />
          )}
          {/* plain = ไม่ใส่ title รายจุด ปล่อยให้การ์ดเต็มของพ่อเป็นคนอธิบาย */}
          {plain ? dot(i, 'sm') : <span title={tipLabel(i)}>{dot(i, 'sm')}</span>}
        </Fragment>
      ))}
    </div>
  )

  if (plain) return dots

  /**
   * การ์ดออเดอร์มือถือ — แถบเต็มลงในที่เลย ไม่ห่อ HoverPanel (มือถือไม่มี hover)
   * ดูเหตุผลเต็มที่ prop `inline`
   */
  if (inline) {
    return (
      <div>
        <ShipmentRail
          stage={cur}
          lastLabel={progress?.lastLabel}
          lastIcon={progress?.lastIcon}
          currentDotCls={currentDot}
          leg={leg}
          ariaLabel={ariaLabel}
        />
        {progress?.notice && (
          <p
            className={cn(
              'text-2xs mt-2.5 mb-0 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5',
              NOTICE_BOX[progress.notice.tone] ?? NOTICE_BOX.secondary,
            )}
          >
            <Icon icon="alert-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
            <span>{progress.notice.text}</span>
          </p>
        )}
      </div>
    )
  }

  return (
    // hover ขึ้น panel เต็มผ่าน HoverPanel (portal ระดับ body — cell อยู่ใน .table-wrapper
    // overflow-auto, absolute ใน cell โดน clip; touch ไม่มี hover ก็แค่ไม่ขึ้น มี title ต่อจุดแล้ว)
    <HoverPanel
      width={288}
      className="inline-flex items-center"
      trigger={dots}
    >
      {/* แถบเต็ม 2 แถว — markup อยู่ใน ShipmentRail ตัวเดียวที่ทุกจอ Paces ใช้ร่วมกัน
          🛑 ที่นี่คือที่ที่ "เรื่องเต็ม" ถูกเล่า: แถบจิ๋วข้างนอกยุบเหลือจุดเดียวโดยตั้งใจ */}
      <div className="p-3">
        <p className="text-default-900 mb-2 text-xs font-semibold">{currentLabel}</p>
        <ShipmentRail
          stage={cur}
          lastLabel={progress?.lastLabel}
          lastIcon={progress?.lastIcon}
          currentDotCls={currentDot}
          leg={leg}
          ariaLabel={railAriaLabel(currentLabel, leg)}
        />

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
