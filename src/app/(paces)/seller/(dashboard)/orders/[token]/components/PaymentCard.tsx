/**
 * PaymentCard — การชำระเงิน (วิธีชำระ + ช่องทาง + สลิป + ลิงก์ดิจิทัล)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/BillingDetails.tsx
 *       + CustomerDetails.tsx (icon-list pattern)
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { Icon } from '@iconify/react'
import SlipViewer from './SlipViewer'

// label map — เจ้าของใหม่ย้ายมาจาก CustomerDetails (Phase B)
// sync กับ PAYMENT_OPTIONS/CHANNEL_OPTIONS ใน orders/new/components/PaymentChannelBlock.tsx
const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'เงินสด',
  TRANSFER: 'โอนเงิน',
  PROMPTPAY: 'พร้อมเพย์',
  CARD: 'บัตรเครดิต/เดบิต',
  COD: 'เก็บปลายทาง',
  OTHER: 'อื่นๆ',
}
const CHANNEL_LABELS: Record<string, string> = {
  STOREFRONT: 'หน้าร้าน',
  FACEBOOK: 'Facebook',
  LINE: 'Line',
  TIKTOK: 'TikTok / TikTok Shop',
  OTHER: 'อื่นๆ',
}

export interface PaymentCardProps {
  paymentMethod: string | null
  salesChannel: string | null
  slipFileId: string | null
  accessUrl: string | null
  fulfillmentMode: string
  publicToken: string
}

export default function PaymentCard({
  paymentMethod,
  salesChannel,
  slipFileId,
  accessUrl,
  fulfillmentMode,
  publicToken,
}: PaymentCardProps) {
  const router = useRouter()
  // S-12: state สำหรับ accessUrl form (copy มาจาก OrderActions — เจ้าของใหม่)
  const [accessUrlValue, setAccessUrlValue] = useState(accessUrl ?? '')
  const [accessUrlLoading, setAccessUrlLoading] = useState(false)

  const handleSaveAccessUrl = async () => {
    const url = accessUrlValue.trim()
    if (!url) {
      toast.error('กรุณากรอกลิงก์')
      return
    }
    setAccessUrlLoading(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/access-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'บันทึกลิงก์ไม่สำเร็จ')
      }
      toast.success('บันทึกลิงก์แล้ว')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'บันทึกลิงก์ไม่สำเร็จ'
      toast.error(message)
    } finally {
      setAccessUrlLoading(false)
    }
  }

  const hasPaymentInfo = paymentMethod !== null || salesChannel !== null
  // divider แสดงเมื่อมี slip หรือ NO_SHIPPING section จะตามมา
  const hasDivider = slipFileId !== null || fulfillmentMode === 'NO_SHIPPING'

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">การชำระเงิน</h4>
      </div>
      <div className="card-body">
        {/* icon-list: วิธีชำระ + ช่องทาง — pattern จาก CustomerDetails icon-list */}
        {hasPaymentInfo ? (
          <ul className="text-default-400 space-y-2.5">
            {paymentMethod && (
              <li>
                <div className="flex items-center gap-2.5">
                  <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full">
                    <Icon icon="tabler:cash" className="text-sm" />
                  </span>
                  <h5 className="text-default-400 font-medium text-sm">
                    วิธีชำระ: {PAYMENT_LABELS[paymentMethod] ?? paymentMethod}
                  </h5>
                </div>
              </li>
            )}
            {salesChannel && (
              <li>
                <div className="flex items-center gap-2.5">
                  <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full">
                    <Icon icon="tabler:speakerphone" className="text-sm" />
                  </span>
                  <h5 className="text-default-400 font-medium text-sm">
                    ช่องทาง: {CHANNEL_LABELS[salesChannel] ?? salesChannel}
                  </h5>
                </div>
              </li>
            )}
          </ul>
        ) : (
          /* empty-state เมื่อไม่มีข้อมูลการชำระเงินเลย */
          <div className="flex flex-col items-center py-6 text-center">
            <Icon icon="tabler:credit-card-off" className="text-3xl text-default-300 mb-2" />
            <p className="text-default-400 text-sm">ไม่มีข้อมูลการชำระเงิน</p>
          </div>
        )}

        {/* divider — แสดงเมื่อมี section slip หรือ accessUrl ตามมา */}
        {hasDivider && (
          <hr className="border-t border-dashed border-default-300 my-4" />
        )}

        {/* S-11: สลิปการโอนเงิน */}
        {slipFileId && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Icon icon="tabler:receipt" className="text-base text-default-400" />
              <span className="text-sm font-semibold text-default-800">สลิปการโอนเงิน</span>
            </div>
            <SlipViewer slipFileId={slipFileId} />
          </div>
        )}

        {/* S-12: ลิงก์ส่งมอบสินค้า/บริการดิจิทัล — เฉพาะ NO_SHIPPING */}
        {fulfillmentMode === 'NO_SHIPPING' && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Icon icon="tabler:link" className="text-base text-default-400" />
              <span className="text-sm font-semibold text-default-800">ลิงก์ส่งมอบสินค้า/บริการดิจิทัล</span>
            </div>
            <p className="text-default-400 text-xs mb-3">
              กรอก URL เพื่อส่งมอบให้ผู้ซื้อ (ต้องเป็น http หรือ https)
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={accessUrlValue}
                onChange={(e) => setAccessUrlValue(e.target.value)}
                placeholder="https://example.com/download/..."
                className="form-input text-sm flex-1"
                disabled={accessUrlLoading}
              />
              <button
                type="button"
                onClick={handleSaveAccessUrl}
                disabled={accessUrlLoading}
                className="btn bg-primary text-white hover:bg-primary-hover px-4 text-sm font-medium disabled:opacity-60 whitespace-nowrap"
              >
                {accessUrlLoading ? 'กำลังบันทึก...' : 'บันทึกลิงก์'}
              </button>
            </div>
            {/* แสดง URL ที่บันทึกอยู่ปัจจุบัน เพื่อยืนยันก่อน refresh */}
            {accessUrl && (
              <p className="text-xs text-default-400 break-all mt-2">
                <span className="font-medium text-default-600">บันทึกอยู่:</span> {accessUrl}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
