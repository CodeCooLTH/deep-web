/**
 * PaymentCard — การชำระเงิน (วิธีชำระ + ช่องทาง + สลิป + ลิงก์ดิจิทัล)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/BillingDetails.tsx
 *       (payment-row pattern: icon container + text block + status badge — flex justify-between)
 *
 * เปลี่ยนจาก icon-list (CustomerDetails pattern) เป็น billing-row เดียว ตาม BillingDetails theme:
 *   ซ้าย = icon-circle (btn-icon bg-light rounded-full) + ชื่อวิธีชำระ + sub-text ช่องทาง
 *   ขวา  = status badge (soft bg-{semantic}/15) derive จาก status + paymentMethod + slipFileId
 *
 * สลิป (S-11) + ลิงก์ดิจิทัล (S-12) คง logic/state เดิมทุกอย่าง — เพิ่มแค่ divider + section label
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { pacesToast } from '@/lib/paces-toast'
// ใช้ wrapper ที่ auto-prepend tabler: — ตรงกับ convention ใน OrderCard (ห้าม import จาก @iconify/react ตรง)
import Icon from '@/components/wrappers/Icon'
import SlipViewer from './SlipViewer'
// import label + icon map จาก shared data.ts แทน duplicate local copy
import { PAYMENT_LABELS, PAYMENT_ICONS } from '../../components/data'
import { isCODPayment } from '@/lib/order-display'
// โลโก้ช่องทางการขาย — เดิมเป็นข้อความล้วน "ช่องทาง: Facebook" (user 2026-07-30: ขอโลโก้จริง)
import SalesChannelBadge from '@/components/safepay/SalesChannelBadge'

export interface PaymentCardProps {
  paymentMethod: string | null
  salesChannel: string | null
  slipFileId: string | null
  accessUrl: string | null
  fulfillmentMode: string
  publicToken: string
  /** status ของออเดอร์ — ใช้ derive status badge ฝั่งการชำระเงิน */
  status: string
}

export default function PaymentCard({
  paymentMethod,
  salesChannel,
  slipFileId,
  accessUrl,
  fulfillmentMode,
  publicToken,
  status,
}: PaymentCardProps) {
  const router = useRouter()
  // S-12: state สำหรับ accessUrl form
  const [accessUrlValue, setAccessUrlValue] = useState(accessUrl ?? '')
  const [accessUrlLoading, setAccessUrlLoading] = useState(false)
  // error แสดงใต้ช่องกรอก ไม่ใช่ toast — ผู้ใช้ต้องเห็นข้อความติดกับช่องที่ต้องแก้
  const [accessUrlError, setAccessUrlError] = useState('')

  const handleSaveAccessUrl = async () => {
    const url = accessUrlValue.trim()
    if (!url) {
      setAccessUrlError('กรุณากรอกลิงก์ที่จะส่งให้ผู้ซื้อ')
      return
    }
    // เช็คฝั่ง client ก่อนยิง — helper text บอกกติกาไว้แล้ว ไม่ควรให้รู้ตัวตอน server ตีกลับ
    if (!/^https?:\/\/.+/i.test(url)) {
      setAccessUrlError('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://')
      return
    }
    setAccessUrlError('')
    setAccessUrlLoading(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/access-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'บันทึกลิงก์ไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('บันทึกลิงก์แล้ว')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'บันทึกลิงก์ไม่สำเร็จ กรุณาลองใหม่'
      pacesToast.error(message)
    } finally {
      setAccessUrlLoading(false)
    }
  }

  const hasPaymentInfo = paymentMethod !== null || salesChannel !== null

  // ── derive status badge (ตาม spec task) ──────────────────────────────────────
  // isCODPayment reuse จาก order-display.ts (canonical export S-13)
  type BadgeConfig = { label: string; cls: string } | null
  const paymentBadge: BadgeConfig = (() => {
    if (status === 'CONFIRMED') {
      return { label: 'ชำระแล้ว', cls: 'badge bg-success/15 text-success' }
    }
    if (status === 'CANCELLED') {
      return { label: 'ยกเลิก', cls: 'badge bg-default-100 text-default-400' }
    }
    if (isCODPayment(paymentMethod)) {
      return { label: 'รอเก็บปลายทาง', cls: 'badge bg-info/15 text-info' }
    }
    // TRANSFER / PROMPTPAY
    if (paymentMethod === 'TRANSFER' || paymentMethod === 'PROMPTPAY') {
      if (slipFileId) return { label: 'รอตรวจสอบสลิป', cls: 'badge bg-info/15 text-info' }
      // "รอชำระ" เป็นสถานะปกติของออเดอร์ที่เพิ่งสร้าง ไม่ใช่ความผิดพลาด — เดิมใช้ danger (แดง)
      // ทำให้ออเดอร์ใหม่ทุกใบขึ้นแดงตั้งแต่วินาทีแรก แดงเลยไม่เหลือความหมาย
      return { label: 'รอชำระ', cls: 'badge bg-warning/15 text-warning' }
    }
    // วิธีอื่น (CASH/CARD/OTHER) หรือ paymentMethod null — ไม่แสดง badge
    return null
  })()

  // icon + label สำหรับ payment row
  const paymentIcon: string = paymentMethod ? (PAYMENT_ICONS[paymentMethod] ?? 'wallet') : 'credit-card-off'
  const paymentLabel: string = paymentMethod ? (PAYMENT_LABELS[paymentMethod] ?? paymentMethod) : 'ยังไม่ระบุวิธีชำระ'

  // dividers: แสดงเฉพาะเมื่อมี section ถัดไป
  const hasSlipSection = slipFileId !== null
  const hasAccessUrlSection = fulfillmentMode === 'NO_SHIPPING'
  const hasDividerAfterRow = hasPaymentInfo && (hasSlipSection || hasAccessUrlSection)
  const hasDividerAfterSlip = hasSlipSection && hasAccessUrlSection

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">การชำระเงิน</h4>
      </div>
      <div className="card-body">

        {/* ── Payment Row — BillingDetails pattern ─────────────────────────────
            Base: BillingDetails.tsx lines 34-46 (flex justify-between + icon + badge)
            ทำไม: เดิมเป็น icon-list 2 รายการ (วิธี + ช่องทาง) แยกกัน;
            ปรับเป็น row เดียว (left=icon+text, right=badge) ตาม billing convention
         ──────────────────────────────────────────────────────────────────────── */}
        {hasPaymentInfo ? (
          <div className="flex items-center justify-between">
            {/* LEFT: icon-circle + text */}
            <div className="flex items-center gap-2.5">
              <span className="btn btn-icon bg-light text-default-800 size-8! rounded-full">
                <Icon icon={paymentIcon} className="size-4.5" />
              </span>
              <div>
                <p className="text-default-800 font-medium text-sm mb-0">{paymentLabel}</p>
                {/* ช่องทางขาย = โลโก้แบรนด์จริง + ชื่อ (เดิมเป็นข้อความ "ช่องทาง: Facebook") */}
                {salesChannel && (
                  <span className="mt-1 inline-flex">
                    <SalesChannelBadge channel={salesChannel} />
                  </span>
                )}
              </div>
            </div>
            {/* RIGHT: status badge */}
            {paymentBadge && (
              <span className={paymentBadge.cls}>{paymentBadge.label}</span>
            )}
          </div>
        ) : (
          /* empty-state เมื่อไม่มีข้อมูลการชำระเงินเลย */
          <div className="flex flex-col items-center py-6 text-center">
            <Icon icon="credit-card-off" className="text-3xl text-default-300 mb-2" />
            <p className="text-default-400 text-sm">ไม่มีข้อมูลการชำระเงิน</p>
          </div>
        )}

        {/* divider — payment row → slip */}
        {hasDividerAfterRow && (
          <div className="border-t border-dashed border-default-300 my-4" />
        )}

        {/* S-11: สลิปการโอนเงิน */}
        {hasSlipSection && (
          <div className={hasDividerAfterSlip ? 'mb-4' : undefined}>
            <div className="flex items-center gap-2 mb-3">
              <Icon icon="receipt" className="text-base text-default-400" />
              <span className="text-sm font-semibold text-default-800">สลิปการโอนเงิน</span>
            </div>
            <SlipViewer slipFileId={slipFileId!} />
          </div>
        )}

        {/* divider — slip → access-url */}
        {hasDividerAfterSlip && (
          <div className="border-t border-dashed border-default-300 my-4" />
        )}

        {/* S-12: ลิงก์ส่งมอบสินค้า/บริการดิจิทัล — เฉพาะ NO_SHIPPING */}
        {hasAccessUrlSection && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Icon icon="link" className="text-base text-default-400" />
              <span className="text-sm font-semibold text-default-800">ลิงก์ส่งมอบสินค้า/บริการดิจิทัล</span>
            </div>
            <p className="text-default-400 text-xs mb-3">
              กรอก URL เพื่อส่งมอบให้ผู้ซื้อ (ต้องเป็น http หรือ https)
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={accessUrlValue}
                onChange={(e) => { setAccessUrlValue(e.target.value); if (accessUrlError) setAccessUrlError('') }}
                placeholder="https://example.com/download/..."
                className="form-input text-sm flex-1"
                disabled={accessUrlLoading}
                aria-invalid={accessUrlError ? true : undefined}
                aria-describedby={accessUrlError ? 'access-url-error' : undefined}
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
            {accessUrlError && (
              <p id="access-url-error" role="alert" className="text-danger text-xs mt-1.5">
                {accessUrlError}
              </p>
            )}
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
