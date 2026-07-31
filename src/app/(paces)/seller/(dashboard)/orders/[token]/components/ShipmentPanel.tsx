'use client'

/**
 * ShipmentPanel — ส่วน "การจัดส่ง" ในหน้าคำสั่งซื้อ (feature 00022)
 *
 * ตั้งแต่ 2026-07-27 ตัวนี้เป็นแค่ตัวเลือกโหมด + กรอบการ์ด เนื้อในทั้งหมดอยู่ที่ component กลาง
 * ใน components/safepay/iship/ ซึ่งโมดัลในหน้าแชทใช้ตัวเดียวกัน — ก่อนหน้านี้เนื้อในอยู่ที่นี่
 * ที่เดียว พอต้องใช้จุดที่สองก็จะกลายเป็นโค้ด 2 ชุดที่ต้องแก้บั๊กพร้อมกันตลอดไป
 *
 * 3 โหมด: ติดที่ค่าระดับร้าน (ที่อยู่ผู้ส่ง) / ยังไม่มีพัสดุ / มีพัสดุแล้ว
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/... card + card-header (โครงเดิมของหน้านี้)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import SenderIncompleteNotice from '@/components/safepay/iship/SenderIncompleteNotice'
import ShipmentCreateForm, { type Courier } from '@/components/safepay/iship/ShipmentCreateForm'
import ShipmentStatusView from '@/components/safepay/iship/ShipmentStatusView'
import { useIShipCouriers } from '@/components/safepay/iship/useIShipCouriers'
import type { ShipmentContextJson, ShipmentViewJson } from '@/lib/iship/context'

interface Props {
  /** token ของคำสั่งซื้อ — endpoint สร้างพัสดุรับ token ได้โดยตรง */
  orderToken: string
  context: ShipmentContextJson
  /**
   * bare = ไม่ห่อการ์ด/หัวการ์ดของตัวเอง (ผู้เรียกมีการ์ดอยู่แล้ว)
   * ใช้เมื่อถูก render ข้างใน ShippingCard ซึ่งเป็นการ์ด "การจัดส่ง" ตัวจริง —
   * ไม่งั้นได้การ์ดซ้อนการ์ด (DESIGN.md §6 ห้าม)
   */
  bare?: boolean
}

export default function ShipmentPanel({ orderToken, context, bare = false }: Props) {
  const router = useRouter()
  const { couriers, error: couriersError } = useIShipCouriers(!context.blockedBy)
  // shipment ที่เพิ่งสร้าง/ลองใหม่ในรอบนี้ — แสดงผลทันทีโดยไม่รอ router.refresh()
  const [shipment, setShipment] = useState<ShipmentViewJson | null>(context.shipment)
  const [forceForm, setForceForm] = useState(false)

  function afterChange(next: ShipmentViewJson | null) {
    setShipment(next)
    setForceForm(false)
    router.refresh()
  }

  const body = (
    <>
      {context.blockedBy ? (
        <div className="p-4">
          <SenderIncompleteNotice
            missing={context.blockedBy.missing}
            missingReceiver={context.missingReceiver}
          />
        </div>
      ) : shipment && !forceForm ? (
        <ShipmentStatusView
          shipment={shipment}
          onCancelled={() => afterChange(null)}
          onRetried={afterChange}
          onEditRequest={() => setForceForm(true)}
        />
      ) : (
        <ShipmentCreateForm
          orderToken={orderToken}
          missingReceiver={context.missingReceiver}
          receiver={context.receiver}
          sender={context.sender}
          items={context.items}
          codSuggested={context.codSuggested}
          defaults={context.defaults}
          couriers={couriers as Courier[]}
          couriersError={couriersError}
          onCreated={afterChange}
          onExists={() => router.refresh()}
        />
      )}
    </>
  )

  if (bare) return body

  return (
    <div className="card">
      <div className="card-header">
        {/* P6 (T14): เดิมใช้ <h5> เป็นกล่อง border เปล่า ๆ ไม่ใช่หัวข้อจริง — เปลี่ยนเป็น <p> คงคลาส/ภาพเดิม
            (เหมือน S-3/T14 ที่แก้จุดอื่นในหน้านี้แล้ว) */}
        <p className="bg-light/15 border-default-300 flex w-full items-center justify-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium">
          <Icon icon="tabler:truck-delivery" className="text-base" aria-hidden="true" />
          การจัดส่ง
        </p>
      </div>
      {/* ไม่ใช้ card-body เพราะเนื้อในมีเส้นคั่นเต็มความกว้างระหว่างบล็อก (padding อยู่ในแต่ละบล็อก) */}
      {body}
    </div>
  )
}
