/**
 * OrderActionPanel — รวมทุก action ของ order (seller sidebar)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx (card primitive)
 * callout pattern: StatusHero.tsx
 */
'use client'

import Icon from '@/components/wrappers/Icon'
import ShipForm from './ShipForm'
import SendSmsButton from './SendSmsButton'
import OrderCopyLink from './OrderCopyLink'
import CancelOrderButton from './CancelOrderButton'

export interface OrderActionPanelProps {
  publicToken: string
  status: string
  fulfillmentMode: string
}

export default function OrderActionPanel({ publicToken, status, fulfillmentMode }: OrderActionPanelProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title flex items-center gap-1.5">
          <Icon icon="bolt" className="text-base text-primary" />
          การดำเนินการ
        </h4>
      </div>
      <div className="card-body">
        {/* PENDING + SHIPPED fulfillmentMode: ShipForm (primary) → แชร์ → ยกเลิก */}
        {status === 'PENDING' && fulfillmentMode === 'SHIPPED' && (
          <div className="flex flex-col gap-3">
            {/* primary action: บันทึกการจัดส่ง */}
            <div className="flex flex-col">
              <ShipForm publicToken={publicToken} />
            </div>

            <hr className="border-t border-default-200 my-1" />

            {/* แชร์ให้ผู้ซื้อ */}
            <div className="flex flex-col">
              <p className="text-2xs text-default-400 font-medium uppercase mb-1">แชร์ให้ผู้ซื้อ</p>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col">
                  <OrderCopyLink publicToken={publicToken} />
                </div>
                <div className="flex flex-col">
                  <SendSmsButton publicToken={publicToken} />
                </div>
              </div>
            </div>

            <hr className="border-t border-default-200 my-1" />

            {/* ยกเลิก */}
            <div className="flex flex-col">
              <CancelOrderButton publicToken={publicToken} status={status} />
            </div>
          </div>
        )}

        {/* PENDING + NO_SHIPPING: SendSmsButton (primary) → คัดลอกลิงก์ → ยกเลิก */}
        {status === 'PENDING' && fulfillmentMode !== 'SHIPPED' && (
          <div className="flex flex-col gap-3">
            {/* primary action: ส่ง SMS */}
            <div className="flex flex-col">
              <SendSmsButton publicToken={publicToken} />
            </div>

            <hr className="border-t border-default-200 my-1" />

            {/* คัดลอกลิงก์ */}
            <div className="flex flex-col">
              <p className="text-2xs text-default-400 font-medium uppercase mb-1">แชร์ให้ผู้ซื้อ</p>
              <div className="flex flex-col">
                <OrderCopyLink publicToken={publicToken} />
              </div>
            </div>

            <hr className="border-t border-default-200 my-1" />

            {/* ยกเลิก */}
            <div className="flex flex-col">
              <CancelOrderButton publicToken={publicToken} status={status} />
            </div>
          </div>
        )}

        {/* SHIPPED: callout รอผู้ซื้อยืนยัน → แชร์ → ยกเลิก */}
        {status === 'SHIPPED' && (
          <div className="flex flex-col gap-3">
            {/* callout รอผู้ซื้อ — rounded = Paces 4px token */}
            <div className="bg-info/15 text-info rounded p-3 flex items-center gap-2 text-sm font-medium">
              <Icon icon="clock" className="shrink-0" />
              รอผู้ซื้อยืนยันรับสินค้า
            </div>

            <hr className="border-t border-default-200 my-1" />

            {/* แชร์ให้ผู้ซื้อ */}
            <div className="flex flex-col">
              <p className="text-2xs text-default-400 font-medium uppercase mb-1">แชร์ให้ผู้ซื้อ</p>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col">
                  <OrderCopyLink publicToken={publicToken} />
                </div>
                <div className="flex flex-col">
                  <SendSmsButton publicToken={publicToken} />
                </div>
              </div>
            </div>

            <hr className="border-t border-default-200 my-1" />

            {/* ยกเลิก — CancelOrderButton render เฉพาะ PENDING/SHIPPED (ภายในตัวเอง) */}
            <div className="flex flex-col">
              <CancelOrderButton publicToken={publicToken} status={status} />
            </div>
          </div>
        )}

        {/* CONFIRMED: ออเดอร์สำเร็จ → คัดลอกลิงก์ (ไม่มี action เพิ่ม) */}
        {status === 'CONFIRMED' && (
          <div className="flex flex-col gap-3">
            {/* callout สำเร็จ — rounded = Paces 4px token */}
            <div className="bg-success/15 text-success rounded p-3 flex items-center gap-2 text-sm font-medium">
              <Icon icon="circle-check-filled" className="shrink-0" />
              ออเดอร์สำเร็จแล้ว
            </div>

            <hr className="border-t border-default-200 my-1" />

            <div className="flex flex-col">
              <OrderCopyLink publicToken={publicToken} />
            </div>
            <p className="text-xs text-default-400 text-center mt-1">ไม่มีการดำเนินการเพิ่มเติม</p>
          </div>
        )}

        {/* CANCELLED: ออเดอร์ถูกยกเลิก → คัดลอกลิงก์ (ไม่มี action เพิ่ม) */}
        {status === 'CANCELLED' && (
          <div className="flex flex-col gap-3">
            {/* callout ยกเลิก — rounded = Paces 4px token */}
            <div className="bg-danger/15 text-danger rounded p-3 flex items-center gap-2 text-sm font-medium">
              <Icon icon="circle-x" className="shrink-0" />
              ออเดอร์ถูกยกเลิกแล้ว
            </div>

            <hr className="border-t border-default-200 my-1" />

            <div className="flex flex-col">
              <OrderCopyLink publicToken={publicToken} />
            </div>
            <p className="text-xs text-default-400 text-center mt-1">ไม่มีการดำเนินการเพิ่มเติม</p>
          </div>
        )}

        {/* unknown status — ไม่มี action */}
        {!['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED'].includes(status) && (
          <p className="text-default-400 text-sm">ไม่มีการดำเนินการเพิ่มเติม</p>
        )}
      </div>
    </div>
  )
}
