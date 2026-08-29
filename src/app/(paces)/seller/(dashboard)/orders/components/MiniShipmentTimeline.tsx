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
import { SHIPMENT_STAGES, describeProgress } from '@/lib/iship/status'
// ตารางจุดไฮไลต์ย้ายไปเป็น SSOT ที่ order-stage.ts แล้ว — ฝั่งผู้ซื้อ (ParcelTimeline) เคยเขียน
// ตรรกะของตัวเองขึ้นมาใหม่แล้วแมปผิดทั้งชุด สองจอต้องอ่านจากตารางเดียวกันเท่านั้น
import { SHIPMENT_STAGE_DOT_INDEX, SHIPPING_STAGE_LABEL, type ShippingStageKey } from '@/lib/order-stage'
import { describeReturnLeg, railAriaLabel } from '@/lib/iship/return-timeline'
import ShipmentRail from '@/components/safepay/iship/ShipmentRail'
import { NOTICE_BOX, shipmentCurrentDotCls } from '@/components/safepay/iship/tone'
// สถานะกองนัดรับ (feature 00062 U18) — SSOT เดียวกับ badge บนการ์ด A2/A4 ในหน้ารายละเอียด (HR16)
import { PICKUP_STAGE_LABEL, type PickupStageKey } from '@/lib/order-pickup'

/** สีข้อความของแต่ละ tone (ไม่มีกรอบ badge) — เขียนเต็มคำกัน Tailwind purge (แพตเทิร์นเดียวกับ
 *  tone.ts) — PICKUP_STAGE_LABEL ใช้แค่ warning/info/success จริง แต่ใส่ครบ OrderStatusTone
 *  เพื่อให้ tsc บังคับถ้ามีคนเติม tone ใหม่ */
const PICKUP_TEXT_TONE: Record<'warning' | 'info' | 'success' | 'danger' | 'neutral', string> = {
  warning: 'text-warning-ink',
  info: 'text-info-ink',
  success: 'text-success-ink',
  danger: 'text-danger-ink',
  neutral: 'text-default-700',
}

interface Props {
  /**
   * สถานะกองนัดรับ (feature 00062 U18) — มีค่า = ใบนี้เป็นออเดอร์นัดรับ ไม่มีพัสดุให้วาดแถบเลย
   * ⇒ เขียนทับทุก prop อื่นด้านล่างทันที (ไม่สนใจ `plain`/`inline` เพราะข้อความ "นัดรับ ·
   * {สถานะย่อ}" เหมือนกันทั้งสองบริบท — คนละแกนกับ `stage` โดยสิ้นเชิง)
   */
  pickupStage?: PickupStageKey
  /** optional เพราะผู้เรียกที่ส่ง `pickupStage` มาไม่มีสาระให้ระบุค่านี้เลย (คนละแกน) */
  stage?: ShippingStageKey
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
  returnDispatchedAt?: string | Date | null
  /**
   * มีพัสดุ/เลขแทรคจริงไหม — DONE ของออเดอร์ที่ไม่เคยมีพัสดุต้องไม่วาดแถบเขียวลอย ๆ
   *
   * optional (default false) เพราะออเดอร์นัดรับ (`pickupStage`) ไม่มีพัสดุให้ถามอยู่แล้ว —
   * ผู้เรียกที่ส่ง `pickupStage` มาไม่ต้องส่งค่านี้ตาม (early return ก่อนถึงจุดที่ใช้)
   */
  hasShipment?: boolean
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
  pickupStage,
  stage,
  carrierStatus,
  shipmentStatus,
  returnStartedAt,
  returnedAt,
  returnDispatchedAt,
  hasShipment = false,
  cancelled,
  plain,
  inline,
}: Props) {
  /**
   * impeccable critique P1-3 (2026-08-29) — `cancelled` ต้องเช็คก่อนเข้ากิ่ง `pickupStage` เสมอ
   * เพราะ `derivePickupStage()` คืน `'DONE'` (tone success สีเขียว "เสร็จสิ้น") ให้ทั้ง
   * status===CONFIRMED **และ** CANCELLED — ถ้าไม่กันไว้ตรงนี้ (จุดเดียว ใช้ร่วมทั้งตารางและ
   * การ์ด) ออเดอร์นัดรับที่ถูกยกเลิกจะขึ้น badge "ยกเลิก" คอลัมน์หนึ่ง กับ "เสร็จสิ้น" สีเขียว
   * อีกคอลัมน์ในแถวเดียวกัน — ละเมิด Verified-Means-Green ตรงตัว (เขียวให้สิ่งที่ไม่สำเร็จ)
   * 🛑 ห้ามแก้ `derivePickupStage()` ให้คืนค่าใหม่แทน — การ์ดรายละเอียด/การ์ดมือถือกันเคสนี้ไว้
   * แล้วด้วยเงื่อนไขของตัวเอง (`!isCancelled` / `status !== 'CANCELLED'`) เปลี่ยนค่าคืนจะกระทบ
   * พฤติกรรมที่ถูกอยู่แล้วของทั้งสองจุดนั้นไปด้วย
   */
  if (cancelled) {
    return <span className="text-default-400 text-sm">—</span>
  }

  /**
   * ออเดอร์นัดรับ — ไม่มีพัสดุให้วาดแถบเลย ตอบคำถามคนละคำถามกับ "ของอยู่ไหนในเส้นทางขนส่ง"
   * (UX-Design-Spec A5) เขียนก่อนทุกอย่างข้างล่างและไม่สนใจ `plain`/`inline`: ทั้งคอลัมน์
   * "ขนส่ง/เลขพัสดุ" ในตาราง (เรียกแบบ `plain`) และการ์ดมือถือ (เรียกแบบ `inline`) ต้องได้
   * ข้อความ "นัดรับ · {สถานะย่อ}" คำเดียวกันเป๊ะ — คำมาจาก PICKUP_STAGE_LABEL เท่านั้น (HR16
   * ต้องตรงกับ badge บนการ์ด A2/A4 ในหน้ารายละเอียด)
   */
  if (pickupStage) {
    const meta = PICKUP_STAGE_LABEL[pickupStage]
    return (
      <p className="mb-0 flex items-center gap-1.5 text-xs text-default-700">
        <Icon icon="building-store" className="shrink-0 text-sm text-default-400" aria-hidden="true" />
        <span>นัดรับ</span>
        <span className="text-default-300" aria-hidden="true">
          ·
        </span>
        <span className={cn('font-semibold', PICKUP_TEXT_TONE[meta.tone])}>{meta.label}</span>
      </p>
    )
  }

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
   * มีขากลับ = แถวในตารางวาด **แถบ 2 แถวจริง** (user สั่ง 2026-08-26 หลังเห็นของจริง —
   * กลับมติเดิมที่ให้ตารางคงแถวเดียว) · ไม่มีขากลับ = จุด 4 จุดเหมือนเดิมทุกประการ
   */
  const leg = describeReturnLeg({ audience: 'seller', carrierStatus, returnStartedAt, returnedAt, returnDispatchedAt })

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
          icon={stepIcon(i)}
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
            <span
              className={cn('h-0.5 w-2 shrink-0', i <= cur ? 'bg-success' : 'bg-default-200')}
            />
          )}
          {/* plain = ไม่ใส่ title รายจุด ปล่อยให้การ์ดเต็มของพ่อเป็นคนอธิบาย */}
          {dot(i, 'sm')}
        </Fragment>
      ))}
    </div>
  )

  /**
   * แถวในตาราง — พัสดุที่มีขากลับได้ **แถบ 2 แถวจริง** ไม่ใช่ชิปข้อความ
   *
   * user สั่ง 2026-08-26 (2 รอบ): รอบแรก *"อยากเห็นในหน้า lists ด้วย"* ผมให้ชิปข้อความ
   * ข้างแถบเพื่อไม่ให้แถวสูงขึ้น · รอบสอง *"ทำไมมันแสดงข้อความ มันควรแสดง timeline ขากลับ"*
   * ⇒ **กลับมติ Q10/Q20 ตามที่ user เห็นของจริงแล้วตัดสิน**
   *
   * ราคาที่จ่าย: แถวที่มีขากลับสูงกว่าแถวอื่น (~36px) ซึ่งเป็นเหตุผลเดิมที่ตารางคงแถวเดียว
   * แต่ **มีแค่ 12 จาก 442 พัสดุบน prod** ที่เข้าเงื่อนไขนี้ ⇒ เกือบทุกแถวสูงเท่าเดิม
   *
   * `labels={false}` — ตารางไม่เคยมีคำใต้จุดอยู่แล้ว และเป็นการใช้ prop นี้ครั้งแรก
   * (impeccable audit ทักว่ามันมีผู้เรียก 0 ราย) · คำอธิบายไปอยู่ที่ `aria-label` + hover card
   */
  if (plain) {
    if (!leg) return dots
    return (
      <ShipmentRail
        stage={cur}
        lastLabel={progress?.lastLabel}
        lastIcon={progress?.lastIcon}
        currentDotCls={currentDot}
        leg={leg}
        size="sm"
        labels={false}
        ariaLabel={ariaLabel}
      />
    )
  }

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

  /**
   * ไม่ส่ง `plain`/`inline` มา = ไม่มี caller แบบนั้นแล้ว (ยืนยันด้วย grep 2026-08-26)
   *
   * เดิมกิ่งนี้ห่อ `HoverPanel` ของตัวเอง แต่แถวในตารางถูกห่อด้วย `ShipmentHoverCard`
   * ของพ่ออยู่แล้ว และการ์ดมือถือใช้ `inline` ⇒ panel ตัวนี้ไม่เคยถูกเปิดเลย
   * คืนจุดล้วนไปเป็นค่าตั้งต้นที่ปลอดภัยแทนการเก็บโค้ดตายไว้
   */
  return dots
}
