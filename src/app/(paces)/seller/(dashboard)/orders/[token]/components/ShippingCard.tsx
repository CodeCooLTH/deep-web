'use client'

/**
 * ShippingCard — "การจัดส่ง" การ์ดเดียวที่รวม 2 วิธีไว้ด้วยกัน
 *
 * ปัญหาเดิม (user report 2026-07-30 "ก็ใช้ยากอยู่ดี"): หน้านี้มีวิธีจัดส่ง 2 ระบบแข่งกัน
 * บนจอเดียวโดยไม่บอกว่าต่างกันยังไง —
 *   1) ปุ่มน้ำเงินเต็มความกว้างใน StatusHero → ShipForm (พิมพ์ชื่อขนส่ง+เลขพัสดุเอง)
 *   2) การ์ด "การจัดส่ง" คอลัมน์ขวา → ShipmentPanel (สร้างพัสดุจริงผ่าน iShip)
 * ร้านต้องเดาเองว่าจะกดอันไหน
 *
 * กติกาที่ user กำหนด: ปกติ "กรอกเอง" เป็นค่าตั้งต้น; ร้านที่เปิดเชื่อมต่อ iShip ในตั้งค่า
 * ต้องเลือกได้ว่าจะส่งเองหรือใช้ iShip — เลือกอย่างใดอย่างหนึ่ง
 *
 * Base (segmented switch): src/app/(paces)/seller/(dashboard)/orders/components/OrderActions.tsx
 *   (button group แบบ inline-flex + -ms-px + rounded-*-none ของ Paces ui/buttons)
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import ShipForm from './ShipForm'
import ShipmentPanel from './ShipmentPanel'
import type { ShipmentContextJson } from '@/lib/iship/context'

type Method = 'MANUAL' | 'ISHIP'

interface ShippingCardProps {
  orderToken: string
  /** context ของ iShip — null = ร้านไม่ได้เชื่อมต่อ หรือออเดอร์นี้ไม่เกี่ยวกับการส่งของ */
  ishipContext: ShipmentContextJson | null
  /** true = มีพัสดุ iShip เปิดไว้แล้ว → เข้าโหมด iShip เลย ไม่ต้องให้เลือกซ้ำ */
  hasIshipShipment: boolean
  initialTrackingNo?: string | null
  initialProvider?: string | null
}

export default function ShippingCard({
  orderToken,
  ishipContext,
  hasIshipShipment,
  initialTrackingNo,
  initialProvider,
}: ShippingCardProps) {
  const canUseIship = ishipContext !== null
  // ค่าตั้งต้น = กรอกเอง (user: "ปรกติจะกรอกเองครับ") ยกเว้นมีพัสดุ iShip เปิดค้างอยู่แล้ว
  const [method, setMethod] = useState<Method>(hasIshipShipment ? 'ISHIP' : 'MANUAL')

  const SEG = 'btn btn-sm inline-flex items-center gap-1.5 text-xs min-h-11'
  const segCls = (active: boolean) =>
    active
      ? `${SEG} bg-primary text-white border border-primary`
      : `${SEG} border border-default-300 bg-card text-default-700 hover:bg-default-50`

  return (
    <div className="card">
      <div className="card-header flex-wrap gap-3">
        <h4 className="card-title flex items-center gap-1.5">
          <Icon icon="truck-delivery" className="text-base" aria-hidden="true" />
          การจัดส่ง
        </h4>

        {/* ให้เลือกวิธีเฉพาะเมื่อร้านเชื่อมต่อ iShip ไว้ — ร้านที่ไม่ได้เชื่อมจะเห็นแค่ฟอร์มกรอกเอง
            ไม่ต้องเจอตัวเลือกที่กดไปก็ใช้ไม่ได้ */}
        {canUseIship && !hasIshipShipment && (
          <div
            className="inline-flex"
            role="group"
            aria-label="เลือกวิธีจัดส่ง"
          >
            <button
              type="button"
              onClick={() => setMethod('MANUAL')}
              aria-pressed={method === 'MANUAL'}
              className={`${segCls(method === 'MANUAL')} rounded-e-none`}
            >
              <Icon icon="edit" className="text-sm" aria-hidden="true" />
              ส่งเอง
            </button>
            <button
              type="button"
              onClick={() => setMethod('ISHIP')}
              aria-pressed={method === 'ISHIP'}
              className={`${segCls(method === 'ISHIP')} -ms-px rounded-s-none`}
            >
              <Icon icon="package-export" className="text-sm" aria-hidden="true" />
              สร้างพัสดุ iShip
            </button>
          </div>
        )}
      </div>

      <div className="card-body">
        {/* อธิบายสั้น ๆ ว่าโหมดที่เลือกอยู่ทำอะไร — เดิมไม่มีอะไรบอกเลยว่า 2 ทางต่างกันยังไง */}
        <p className="text-default-400 text-xs mb-3">
          {method === 'MANUAL'
            ? 'ส่งเอง: คุณส่งของกับขนส่งเอง แล้วนำเลขพัสดุมากรอกที่นี่เพื่อแจ้งผู้ซื้อ'
            : 'สร้างพัสดุ iShip: ระบบเปิดพัสดุและออกใบปะหน้าให้ ได้เลขพัสดุอัตโนมัติ'}
        </p>

        {method === 'MANUAL' || !canUseIship ? (
          <ShipForm
            publicToken={orderToken}
            initialTrackingNo={initialTrackingNo}
            initialProvider={initialProvider}
          />
        ) : (
          // ShipmentPanel มีกรอบการ์ดของตัวเอง — ที่นี่ต้องการเฉพาะเนื้อใน จึงส่ง bare
          <ShipmentPanel orderToken={orderToken} context={ishipContext!} bare />
        )}
      </div>
    </div>
  )
}
