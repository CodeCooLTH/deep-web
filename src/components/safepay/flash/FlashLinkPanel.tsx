'use client'

/**
 * FlashLinkPanel — ผูกเลขพัสดุ Flash ที่ร้านเปิดไว้แล้วเข้ากับคำสั่งซื้อ (Design-Spec §4.7 ท้ายหัวข้อ)
 *
 * ใช้คอมโพเนนต์ย่อยเดียวกับทางออก ① ของ NEEDS_REVIEW (FlashPnoLink) โดยไม่มีกล่องเตือนและไม่มีทางเลือก ②
 * เหตุที่ผูกด้วยเลขพัสดุ ไม่ใช่เลือกจากรายการแบบ iShip: Flash ไม่มีรายการพัสดุให้เลือก
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx
 *       + in-app: src/components/safepay/iship/ShipmentLinkPanel.tsx (โครงหัวข้อ + ปุ่มกลับไปสร้างใหม่)
 */

import Icon from '@/components/wrappers/Icon'
import type { ShipmentViewJson } from '@/lib/iship/context'
import type { ShipmentFooterReporter } from '@/components/safepay/iship/shipment-footer'
import FlashPnoLink from './FlashPnoLink'

interface Props {
  orderToken: string
  onLinked: (shipment: ShipmentViewJson) => void
  /** สลับกลับไปแผงสร้างพัสดุ (ไม่ส่ง = ไม่มีปุ่ม) */
  onSwitchToCreate?: () => void
  formId?: string
  hideSubmit?: boolean
  onFooterChange?: ShipmentFooterReporter
}

export default function FlashLinkPanel({
  orderToken,
  onLinked,
  onSwitchToCreate,
  formId,
  hideSubmit,
  onFooterChange,
}: Props) {
  return (
    <section className="flex flex-col gap-3 p-4">
      <header>
        <h6 className="mb-1 flex items-center gap-2 text-sm font-semibold text-default-900">
          <Icon icon="tabler:link" className="text-base text-primary" aria-hidden="true" />
          ผูกเลขพัสดุที่เปิดไว้แล้วที่ Flash
        </h6>
        <p className="text-default-700 mb-0 text-xs">
          ค้นหาจากชื่อผู้รับใน Flash Printer แล้วคัดลอกเลขพัสดุมาวาง พัสดุจริงที่ Flash จะไม่ถูกแก้ไข
        </p>
      </header>

      <FlashPnoLink
        confirmRequest={(pno) => ({ path: '/api/seller/flash/shipments/link', body: { orderToken, pno } })}
        onLinked={onLinked}
        formId={formId}
        hideSubmit={hideSubmit}
        onFooterChange={onFooterChange}
      />

      {onSwitchToCreate && (
        <button
          type="button"
          onClick={onSwitchToCreate}
          className="btn text-primary inline-flex items-center gap-1.5 self-start p-0 text-sm hover:underline"
        >
          <Icon icon="tabler:package-export" className="text-base" aria-hidden="true" />
          ยังไม่ได้เปิดที่ Flash? สร้างพัสดุใหม่
        </button>
      )}
    </section>
  )
}
