/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/BillingDetails.tsx
 *
 * copy จากธีม: `card-header` + `card-body` + รายการคู่ label/ค่า
 *
 * ตัดจากธีม:
 *   - รูปบัตรเครดิต Mastercard — ระบบไม่มีการชำระด้วยบัตร (โอน/พร้อมเพย์/เก็บปลายทาง เท่านั้น)
 *   - badge "Billing Details" ที่ซ้ำกับหัวการ์ดตัวเอง
 *   - ปุ่มดินสอที่หัวการ์ด — ไม่มีหน้าแก้ข้อมูลชำระเงินแยก
 *
 * ที่เพิ่ม: สถานะการชำระเงิน (getPaymentBadge — SSOT ที่คุมกฎ Verified-Means-Green อยู่แล้ว
 * เขียวเฉพาะ "ชำระแล้ว" จริง) · ช่องทางการขาย · สลิปโอนเงิน
 *
 * คอนทราสต์: ธีมใช้ `text-default-400` ทั้งการ์ด (2.46:1 ตก AA) และ badge เขียวทึบที่ไม่ใช่
 * token คู่หมึก → ใช้ `text-default-700`/`-800` และ badge จาก SSOT ที่ผ่าน AA แล้ว
 */

import Icon from '@/components/wrappers/Icon'
import { getPaymentBadge } from '@/lib/order-display'
import SalesChannelBadge from '@/components/safepay/SalesChannelBadge'
import { PAYMENT_LABELS, PAYMENT_ICONS } from '../../components/data'
import SlipViewer from './SlipViewer'

export type BillingDetailsProps = {
  status: string
  paymentMethod: string | null
  salesChannel: string | null
  slipFileId: string | null
}

export default function BillingDetails({
  status,
  paymentMethod,
  salesChannel,
  slipFileId,
}: BillingDetailsProps) {
  const hasPaymentInfo = paymentMethod !== null || salesChannel !== null
  const paymentBadge = getPaymentBadge(status, paymentMethod, slipFileId)
  const paymentIcon = paymentMethod ? (PAYMENT_ICONS[paymentMethod] ?? 'wallet') : 'credit-card-off'
  const paymentLabel = paymentMethod ? (PAYMENT_LABELS[paymentMethod] ?? paymentMethod) : 'ยังไม่ระบุวิธีชำระ'

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">การชำระเงิน</h4>
      </div>
      <div className="card-body">
        {!hasPaymentInfo ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icon icon="credit-card-off" className="text-default-300 mb-2 text-3xl" aria-hidden="true" />
            <p className="text-default-700 text-sm">ไม่มีข้อมูลการชำระเงิน</p>
          </div>
        ) : (
          <ul className="space-y-3.5">
            <li>
              <p className="text-default-800 mb-0.5 text-2xs">วิธีชำระ</p>
              <p className="text-default-900 mb-0 flex items-center gap-1.5 text-sm font-medium">
                <Icon icon={paymentIcon} className="text-default-700 text-sm" aria-hidden="true" />
                {paymentLabel}
              </p>
            </li>
            {paymentBadge && (
              <li>
                <p className="text-default-800 mb-1 text-2xs">สถานะ</p>
                <span className={paymentBadge.cls}>{paymentBadge.label}</span>
              </li>
            )}
            {salesChannel && (
              <li>
                <p className="text-default-800 mb-1 text-2xs">ช่องทางการขาย</p>
                <SalesChannelBadge channel={salesChannel} />
              </li>
            )}
            {slipFileId && (
              <li>
                <p className="text-default-800 mb-1 text-2xs">สลิปโอนเงิน</p>
                <SlipViewer slipFileId={slipFileId} />
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
