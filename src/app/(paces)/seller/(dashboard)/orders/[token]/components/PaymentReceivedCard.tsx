'use client'

/**
 * PaymentReceivedCard — "การชำระเงิน" การ์ดยืนยันรับเงินโอน/พร้อมเพย์/เงินสด (feature 00062, U17)
 *
 * มิเรอร์โครงจาก CodCard.tsx ทุกจุด (card + card-header + badge + icon circle 40px + ปุ่ม
 * hidden lg:flex) ต่างกัน 4 จุดตาม UX-Design-Spec.md §A3:
 *   (1) title "การชำระเงิน" แทน "เก็บเงินปลายทาง"
 *   (2) icon เปลี่ยนตาม paymentMethod จริง (PAYMENT_ICONS) แทน cash คงที่
 *   (3) badge tone ไม่ใช้ success แม้ตอนได้รับเงินแล้ว — Verified-Means-Green สงวนไว้เฉพาะ
 *       status===CONFIRMED เท่านั้น (§B8) "ร้านยืนยันเอง" เป็น self-report ไม่มีบุคคลที่สามยืนยัน
 *       — ต่างจาก CodCard (ต้นแบบที่ mirror มา) ซึ่งใช้เขียวกับ "ได้รับเงินปลายทางแล้ว"
 *       นี่คือจุดที่ precedent เดิมขัดกับ Impeccable และ ux เลือกทำตาม Impeccable + BRD
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
import { PAYMENT_ICONS, PAYMENT_LABELS } from '../../components/data'
import { formatAmount } from './order-detail-shared'
import SlipViewer from './SlipViewer'

export type PaymentReceivedCardProps = {
  totalAmount: unknown
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
  paymentMethod,
  paymentConfirmedAtISO,
  confirmedByLabel,
  slipFileId,
  busy = false,
  onMarkReceived,
  onUndo,
}: PaymentReceivedCardProps) {
  const received = Boolean(paymentConfirmedAtISO)
  // fallback 'receipt' เป็นกลาง (UX §A3 edge state) — paymentMethod อาจเป็น free text ที่ร้านพิมพ์เอง
  // ("พร้อมเพย์ 081-234-5678") ซึ่งไม่ตรง key ใน PAYMENT_ICONS/PAYMENT_LABELS เป๊ะ
  const icon = paymentMethod ? (PAYMENT_ICONS[paymentMethod] ?? 'receipt') : 'receipt'
  const methodLabel = paymentMethod ? (PAYMENT_LABELS[paymentMethod] ?? paymentMethod) : 'ยังไม่ระบุวิธีชำระ'
  const [showSlip, setShowSlip] = useState(false)

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">การชำระเงิน</h4>
        {/* info ไม่ใช่ success แม้ตอนได้รับเงินแล้ว (Verified-Means-Green สงวนเขียวให้
            status===CONFIRMED เท่านั้น) — ต่างจาก CodCard ที่ mirror มาซึ่งใช้เขียวตอนได้เงิน */}
        <span className={received ? 'badge bg-info/15 text-info-ink' : 'badge bg-warning/15 text-warning-ink'}>
          {received ? 'ได้รับเงินแล้ว' : 'ยังไม่ได้รับเงิน'}
        </span>
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
        ) : (
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
