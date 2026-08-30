'use client'

/**
 * PaymentReceivedCard — "การชำระเงิน" การ์ดยืนยันรับเงินโอน/พร้อมเพย์/เงินสด (feature 00062, U17)
 *
 * มิเรอร์โครงจาก CodCard.tsx ทุกจุด (card + card-header + badge + icon circle 40px + ปุ่ม
 * hidden lg:flex) ต่างกัน 4 จุดตาม UX-Design-Spec.md §A3:
 *   (1) title "การชำระเงิน" แทน "เก็บเงินปลายทาง"
 *   (2) icon เปลี่ยนตาม paymentMethod จริง (PAYMENT_ICONS) แทน cash คงที่
 *   (3) [แก้ 2026-08-29, impeccable critique P1-4] badge ต้องผ่าน `getPaymentBadge()` SSOT
 *       เดียวกับจอผู้ซื้อ (HR16) ไม่ใช่คำนวณเองจาก `received` ล้วนอีกต่อไป — เดิมการ์ดนี้ตั้งใจ
 *       ไม่ใช้ success แม้ได้รับเงินแล้ว ("ร้านยืนยันเอง" เป็น self-report ไม่มีบุคคลที่สามยืนยัน)
 *       แต่ SSOT เช็ค status===CONFIRMED เป็นกิ่งแรกเสมอ (Verified-Means-Green อนุญาตเขียวตรงนั้น
 *       จริง — ผู้ซื้อยืนยันรับของแล้วคือบุคคลที่สาม) การไม่เรียก SSOT ทำให้จอผู้ขาย/ผู้ซื้อของ
 *       ออเดอร์ใบเดียวกันขัดกันเอง (จอซื้อเขียว "ชำระแล้ว" จอขายส้ม "ยังไม่ได้รับเงิน" ค้างตลอดไป)
 *   (4) แสดงในทุกสถานะที่ไม่ใช่ CANCELLED (ผู้เรียก — OrderDetailClient.tsx — เป็นคนกรอง
 *       ไม่ผูกกับ SHIPPED-only เหมือน COD เพราะ user journey จริงคือ "โอนก่อน → มารับของทีหลัง")
 *
 * แยกไฟล์จาก CodCard.tsx แทนที่จะใส่ if แตกกิ่งในไฟล์เดิม — CodCard ผูก copy คำว่า
 * "เก็บเงินปลายทาง"/"ปลายทาง" ไว้แน่นในคอมเมนต์และ prop names ที่จำเพาะ COD (UX §A3)
 * สอดคล้องกับที่ order-action-set.ts เตือนไว้แล้วว่า "pure module นี้ห้ามรู้จักรูปแบบข้อความวิธีชำระ"
 *
 * User flow (§A3): กด → toast → undo ไม่มี confirm modal (เหมือน A2 — undo คือการกู้คืนความ
 * ผิดพลาด ไม่ใช่ action ทำลายล้าง) — handler จริง (fetch/toast/refresh) อยู่ที่ OrderDetailClient.tsx
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/
 *       CustomerDetails.tsx (card + card-header + badge ขวาหัวการ์ด + แถวไอคอนกลม — โครงเดียวกับ
 *       ที่ CodCard.tsx copy มาแล้ว การ์ดนี้ mirror CodCard.tsx อีกชั้นหนึ่งตามที่ PRD สั่ง)
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { formatDateTimeTH } from '@/lib/format-date'
import { getPaymentBadge } from '@/lib/order-display'
import { PAYMENT_ICONS, PAYMENT_LABELS } from '../../components/data'
import { formatAmount } from './order-detail-shared'
import SlipViewer from './SlipViewer'

export type PaymentReceivedCardProps = {
  totalAmount: unknown
  /**
   * impeccable critique P1-4 (2026-08-29) — Order.status ต้องส่งเข้ามาแล้ว เพราะ badge ของ
   * การ์ดนี้ต้องผ่าน `getPaymentBadge()` SSOT เดียวกับจอผู้ซื้อ (UX-Design-Spec §B8, HR16)
   * เดิมการ์ดนี้คำนวณ badge เองจาก `received` (paymentConfirmedAt) ล้วน ไม่รู้จัก status เลย ⇒
   * ออเดอร์ที่ผู้ซื้อกดยืนยันรับของเอง (status='CONFIRMED') โดยร้านไม่เคยกด "ได้รับเงินแล้ว"
   * จอผู้ซื้อขึ้นเขียว "ชำระแล้ว" (getPaymentBadge เช็ค CONFIRMED เป็นกิ่งแรก) แต่จอผู้ขายขึ้นส้ม
   * "ยังไม่ได้รับเงิน" ค้างตลอดไปพร้อมปุ่ม primary ที่ไม่มีวันหายไปเอง
   */
  status: string
  /** วิธีชำระของออเดอร์นี้ — เลือก icon/คำอธิบายก่อนกด (TRANSFER/PROMPTPAY/CASH หรือ free text) */
  paymentMethod: string | null
  /** ISO — มีค่า = ร้านกดยืนยันรับเงินแล้ว */
  paymentConfirmedAtISO: string | null
  /** ชื่อคนที่กดยืนยัน (null = ไม่ทราบ/ระบบ) */
  confirmedByLabel: string | null
  /** ไฟล์สลิปที่ผู้ซื้อแนบมา (ถ้ามี) — เอาไว้เปิดดูก่อนกดยืนยัน (FR-PAY-03) */
  slipFileId: string | null
  busy?: boolean
  onMarkReceived: () => void
  onUndo: () => void
}

export default function PaymentReceivedCard({
  totalAmount,
  status,
  paymentMethod,
  paymentConfirmedAtISO,
  confirmedByLabel,
  slipFileId,
  busy = false,
  onMarkReceived,
  onUndo,
}: PaymentReceivedCardProps) {
  const received = Boolean(paymentConfirmedAtISO)
  // impeccable critique P1-4 — badge ต้องมาจาก SSOT เดียวกับฝั่งผู้ซื้อเสมอ ห้ามคำนวณเองอีก
  const paymentBadge = getPaymentBadge(status, paymentMethod, slipFileId, paymentConfirmedAtISO)
  // fallback 'receipt' เป็นกลาง (UX §A3 edge state) — paymentMethod อาจเป็น free text ที่ร้านพิมพ์เอง
  // ("พร้อมเพย์ 081-234-5678") ซึ่งไม่ตรง key ใน PAYMENT_ICONS/PAYMENT_LABELS เป๊ะ
  const icon = paymentMethod ? (PAYMENT_ICONS[paymentMethod] ?? 'receipt') : 'receipt'
  const methodLabel = paymentMethod ? (PAYMENT_LABELS[paymentMethod] ?? paymentMethod) : 'ยังไม่ระบุวิธีชำระ'
  const [showSlip, setShowSlip] = useState(false)

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">การชำระเงิน</h4>
        {/* PaymentBadge type รวม `| null` ไว้เผื่ออนาคต (order-display.ts) — getPaymentBadge()
            ปัจจุบันไม่มี branch ไหนคืน null จริง แต่ tsc บังคับให้ narrow ก่อนใช้ */}
        {paymentBadge && <span className={paymentBadge.cls}>{paymentBadge.label}</span>}
      </div>
      <div className="card-body">
        <div className="flex items-center gap-3">
          <span
            className={
              received
                ? 'bg-info/15 text-info-ink flex size-10 shrink-0 items-center justify-center rounded-full'
                : 'bg-warning/15 text-warning-ink flex size-10 shrink-0 items-center justify-center rounded-full'
            }
          >
            <Icon icon={icon} className="text-xl" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-default-900 mb-0 text-xl font-bold">{formatAmount(totalAmount)}</p>
            <p className="text-default-700 mb-0 text-xs">
              {received
                ? `รับเมื่อ ${formatDateTimeTH(paymentConfirmedAtISO!)}${confirmedByLabel ? ` · โดย ${confirmedByLabel}` : ''}`
                : `${methodLabel} · รอร้านยืนยัน`}
            </p>
          </div>
        </div>

        {/* มีสลิปที่ผู้ซื้อแนบมาแล้ว แต่ร้านยังไม่กดยืนยัน — ไม่บังคับดูก่อนกด แต่ต้องหาได้
            (สลิปเป็นหลักฐานประกอบการตัดสินใจตาม FR-PAY-03) reuse SlipViewer ที่มีอยู่แล้ว */}
        {!received && slipFileId && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowSlip((v) => !v)}
              className="text-primary-ink hover:underline text-xs font-medium"
            >
              {showSlip ? 'ซ่อนสลิปที่แนบมา' : 'ดูสลิปที่แนบมา'}
            </button>
            {showSlip && (
              <div className="mt-2">
                <SlipViewer slipFileId={slipFileId} />
              </div>
            )}
          </div>
        )}

        {received ? (
          <button
            className="btn border-default-300 text-default-700 mt-4 hidden w-full justify-center border text-sm font-medium disabled:opacity-60 lg:flex"
            disabled={busy}
            onClick={onUndo}
            type="button"
          >
            <Icon icon="arrow-back-up" className="me-1.5 text-base" aria-hidden="true" />
            ยกเลิกการยืนยัน
          </button>
        ) : status === 'CONFIRMED' ? null : ( // impeccable critique P1-4: ผู้ซื้อยืนยันรับของแล้ว badge บนขึ้น
          // "ชำระแล้ว" เขียวแล้ว — ปุ่มนี้ต้องไม่ค้างให้กดซ้ำ (ดู comment prop `status` ด้านบน)
          <button
            className="btn bg-primary hover:bg-primary-hover mt-4 hidden w-full justify-center text-sm font-medium text-white disabled:opacity-60 lg:flex"
            disabled={busy}
            onClick={onMarkReceived}
            type="button"
          >
            <Icon icon="cash" className="me-1.5 text-base" aria-hidden="true" />
            ได้รับเงินแล้ว
          </button>
        )}
      </div>
    </div>
  )
}
