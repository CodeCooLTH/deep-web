'use client'

/**
 * ShipmentStepper — แถบความคืบหน้าพัสดุ 4 ขั้น ใช้ร่วมกันทุกที่ที่โชว์ progress ในแชท
 * (การ์ดออเดอร์ bubble/right panel + แถบสถานะออเดอร์ใต้หัวเธรด — งาน Order Progress 2026-08-05)
 *
 * แยกออกมาเพื่อให้ stepper "หน้าตาเดียวกันทุกที่" ตามเจตนา operate: ผู้ขายเรียนรู้ครั้งเดียว
 * ใช้ได้ทุกจุด — ห้ามมีเวอร์ชันที่วาดเองต่างไปจากโมดัลพัสดุเดิม
 *
 * Base: src/components/safepay/iship/ShipmentRail.tsx (แถบ 2 แถว ขาไป+ขากลับ
 *       + notice box) — โทนสีมาจาก describeProgress() เดิม ไม่ตัดสินสีเองที่นี่
 */

import Icon from '@/components/wrappers/Icon'
import { NOTICE_BOX } from '@/components/safepay/iship/tone'
import { SHIPMENT_STAGES, describeProgress } from '@/lib/iship/status'
import { describeReturnLeg, railAriaLabel } from '@/lib/iship/return-timeline'
import ShipmentRail from '@/components/safepay/iship/ShipmentRail'
import { shipmentCurrentDotCls } from '@/components/safepay/iship/tone'

export default function ShipmentStepper({
  shipmentStatus,
  carrierStatus,
  returnStartedAt,
  returnedAt,
  size = 'md',
  showNotice = true,
}: {
  /** OrderShipment.status ('PENDING'|'CREATED'|'FAILED'|'CANCELLED') */
  shipmentStatus: string
  /** สถานะล่าสุดจากขนส่ง (null = ขนส่งยังไม่อัปเดต) */
  carrierStatus: string | null
  /** เวลาของ "ขากลับ" — null = ขนส่งไม่ได้แจ้งเวลา ไม่ใช่ "ไม่เกิด" */
  returnStartedAt?: string | Date | null
  returnedAt?: string | Date | null
  /** md = ในการ์ดออเดอร์ (dot size-7) · sm = แถบสถานะใต้หัวเธรด (dot size-6 เท่าโมดัลพัสดุย่อ) */
  size?: 'md' | 'sm'
  /** แถบปักพื้นที่จำกัด — ปิด notice ได้ (การ์ดเปิดเสมอ) */
  showNotice?: boolean
}) {
  const progress = describeProgress(shipmentStatus, carrierStatus, 'seller')

  /**
   * แถวที่ 2 ("ขากลับ") — `null` = ออเดอร์ปกติ ไม่วาดแถว 2 เลย
   *
   * เดิมจอนี้วาด `<ol className="grid grid-cols-4">` ของตัวเอง ⇒ พอเพิ่มแถว 2 จะกลายเป็น
   * โค้ดชุดที่ 3 ที่วาดเรื่องเดียวกัน (คลาสเดียวกับที่ `ParcelTimeline` เคย drift จนพัสดุที่
   * ส่งถึงแล้วโชว์ "สร้างพัสดุ") ⇒ ย้ายมาใช้ `ShipmentRail` ตัวกลางแทน
   */
  const leg = describeReturnLeg({ audience: 'seller', carrierStatus, returnStartedAt, returnedAt })
  const lastIdx = SHIPMENT_STAGES.length - 1
  const currentLabel =
    progress.stage === lastIdx ? (progress.lastLabel ?? SHIPMENT_STAGES[lastIdx].label)
      : SHIPMENT_STAGES[Math.max(0, Math.min(progress.stage, lastIdx))].label

  return (
    <div>
      <ShipmentRail
        stage={progress.stage}
        lastLabel={progress.lastLabel}
        lastIcon={progress.lastIcon}
        currentDotCls={shipmentCurrentDotCls(progress.notice)}
        leg={leg}
        size={size === 'md' ? 'lg' : 'sm'}
        ariaLabel={railAriaLabel(currentLabel, leg)}
      />

      {showNotice && progress.notice && (
        <p
          className={`mb-0 mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-2xs ${
            NOTICE_BOX[progress.notice.tone] ?? NOTICE_BOX.secondary
          }`}
        >
          <Icon icon="tabler:alert-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>{progress.notice.text}</span>
        </p>
      )}
    </div>
  )
}
