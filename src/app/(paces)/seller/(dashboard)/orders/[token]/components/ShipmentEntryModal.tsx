'use client'

/**
 * ShipmentEntryModal — โมดัลแจ้ง/แก้เลขพัสดุ (task T9, S-9/S-12)
 *
 * เดิม ShippingCard ฝังฟอร์มไว้ในเนื้อหาหน้า → ปุ่ม submit สีน้ำเงินกลายเป็นน้ำเงินตัวที่ 2
 * แข่งกับปุ่ม primary บนแถบ action (ผิด One Voice, ย้อนกลับไปเป็นอาการ "ปุ่มกระจาย" ที่ v5 ตั้งใจแก้)
 * — ดู docs/superpowers/specs/2026-07-31-seller-order-detail-v5-design.md §3
 *
 * 2 mode:
 *   'create' — ปุ่ม "แจ้งเลขพัสดุ" (สถานะ PENDING) มี segmented [ส่งเอง | สร้างพัสดุ iShip] ยิง POST
 *   'edit'   — ปุ่ม "แก้ไขเลขพัสดุ" (สถานะ SHIPPED + MANUAL เท่านั้น) ไม่มี segmented ยิง PATCH
 *
 * ทำไมไม่ใช้ DraftOrderProvider/ShipmentDraftPanel ของห้องแชท (เดิมตั้งใจไว้ใน S-9):
 * ดู docs/scope/2026-07-31-seller-order-detail-v5-scope-baseline.md Change Log แถว S-9 —
 * ShipmentDraftPanel บังคับ conversationId ที่ Order ไม่มี relation ไปหา + provider mount
 * เฉพาะ (chat)/layout.tsx คนละ route group + ห้ามแตะ ShipmentTracking (โหมด MANUAL ทำไม่ได้)
 *
 * Base (overlay shell — dialog/backdrop/Escape/header-X, controlled React state):
 *   src/app/(paces)/seller/(dashboard)/orders/components/BulkActionBar.tsx → BulkSmsConfirmDialog
 *   (การ์ด-overlay ที่ผ่าน review แล้วสำหรับ modal ที่เป็นฟอร์ม — Swal เหมาะกับ confirm/blocking
 *   alert ธรรมดาเท่านั้น ตาม feedback_sweet_alerts_modal)
 * Base (segmented switch MANUAL/iShip + helper text ต่อโหมด — ยกตรรกะ/คำมาใช้ตรง ๆ):
 *   .../ShippingCard.tsx
 *
 * เนื้อฟอร์มจริง (validate/submit/error) ไม่เขียนซ้ำที่นี่ — reuse ShipForm (MANUAL, prop ใหม่
 * mode/alwaysOpen/onSuccess/onCancel/onSubmittingChange ล้วน optional) และ ShipmentPanel (iShip, bare)
 * ที่มีอยู่แล้วตรง ๆ
 *
 * a11y: role="dialog" aria-modal aria-labelledby + focus trap (Tab/Shift+Tab วนในโมดัล) + คืน focus
 * ให้ element เดิมตอนปิด — ของเดิม SlipViewer ไม่มี focus trap มาก่อน ถือเป็นหนี้ที่ไม่ทำซ้ำในงานนี้
 *
 * หมายเหตุขอบเขต (iShip branch): ShipmentPanel/ShipmentCreateForm มี router.refresh() ของตัวเอง
 * อยู่แล้วก่อนหน้านี้ (ย้ายมาจาก ShippingCard เดิม ไม่ได้เพิ่มใหม่) — ไฟล์นี้เองไม่เรียก router.refresh()
 * เลยสักบรรทัด (import ไม่มี useRouter ด้วยซ้ำ) ตาม spec "ห้ามเรียก router.refresh() เองในโมดัล"
 * ส่วน submitting-guard ของ backdrop ผูกกับ ShipForm (MANUAL/edit) เป็นหลักผ่าน onSubmittingChange —
 * ShipmentPanel ไม่มีช่องรายงานสถานะ submitting ออกมา (แก้เพิ่มจะเป็นการ deep-dive UX ของมันเกิน
 * ขอบเขตงานนี้ตาม scope baseline OOS-7)
 */

import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import ShipForm from './ShipForm'
import ShipmentPanel from './ShipmentPanel'
import type { ShipmentContextJson } from '@/lib/iship/context'

type Method = 'MANUAL' | 'ISHIP'

interface ShipmentEntryModalProps {
  open: boolean
  onClose: () => void
  /** เรียกหลังบันทึกสำเร็จ (หลังโมดัลปิดไปแล้ว) — page เป็นคนสั่ง router.refresh() เอง (T11) */
  onSuccess?: () => void
  orderToken: string
  /** 'create' = ปุ่ม "แจ้งเลขพัสดุ" (PENDING, มี segmented) | 'edit' = ปุ่ม "แก้ไขเลขพัสดุ" (SHIPPED+MANUAL, ไม่มี segmented) */
  mode: 'create' | 'edit'
  /** context ของ iShip — null/undefined = ร้านไม่ได้เชื่อมต่อ (ใช้เฉพาะ mode='create') */
  ishipContext?: ShipmentContextJson | null
  /** true = มีพัสดุ iShip เปิดไว้แล้ว → เข้าโหมด iShip เลย ไม่ต้องให้เลือกซ้ำ (ใช้เฉพาะ mode='create') */
  hasIshipShipment?: boolean
  /** ค่าที่กรอกไว้แล้ว — prefill ตอน mode='edit' */
  initialTrackingNo?: string | null
  initialProvider?: string | null
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function ShipmentEntryModal({
  open,
  onClose,
  onSuccess,
  orderToken,
  mode,
  ishipContext = null,
  hasIshipShipment = false,
  initialTrackingNo,
  initialProvider,
}: ShipmentEntryModalProps) {
  const canUseIship = mode === 'create' && ishipContext !== null
  const [method, setMethod] = useState<Method>(hasIshipShipment ? 'ISHIP' : 'MANUAL')
  // กันปิด backdrop/Escape ระหว่างกำลังส่งฟอร์ม (ตาม pattern BulkSmsConfirmDialog)
  const [submitting, setSubmitting] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // reset state ทุกครั้งที่เปิดใหม่ — กันค่าค้างจากรอบก่อน (เช่นเปิด create ของออเดอร์หนึ่งแล้วปิด
  // แล้วเปิด edit ของอีกออเดอร์)
  useEffect(() => {
    if (open) {
      setMethod(hasIshipShipment ? 'ISHIP' : 'MANUAL')
      setSubmitting(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderToken, mode])

  const dismiss = () => {
    if (submitting) return
    onClose()
  }

  // Escape + focus trap + คืน focus ให้ element เดิมตอนปิด
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const firstFocusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)[0]
    firstFocusable?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        dismiss()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (!nodes || nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submitting])

  if (!open) return null

  const handleSuccess = () => {
    setSubmitting(false)
    onClose()
    onSuccess?.()
  }

  const SEG = 'btn btn-sm inline-flex items-center gap-1.5 text-xs min-h-11'
  const segCls = (active: boolean) =>
    active
      ? `${SEG} bg-primary text-white border border-primary`
      : `${SEG} border border-default-300 bg-card text-default-700 hover:bg-default-50`

  const showManualForm = mode === 'edit' || method === 'MANUAL' || !canUseIship

  return (
    <div
      ref={dialogRef}
      className="size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto bg-dark/40 flex items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shipmentEntryModalLabel"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      <div className="ease-in-out transition-all duration-200 sm:max-w-md w-[calc(100%-24px)] m-3 sm:mx-auto flex items-center"> {/* w-[calc(100%-24px)]: carve-out เดิมจาก BulkSmsConfirmDialog (Base) — เว้นขอบ 12px รอบโมดัลบนจอแคบ ไม่มี Paces token ให้ค่านี้ */}
        <div className="w-full flex flex-col card pointer-events-auto">
          {/* Header */}
          <div className="card-header p-5">
            <h3 id="shipmentEntryModalLabel" className="font-medium text-sm flex items-center gap-1.5">
              <Icon icon="truck-delivery" className="text-base" aria-hidden="true" />
              {mode === 'edit' ? 'แก้ไขเลขพัสดุ' : 'แจ้งเลขพัสดุ'}
            </h3>
            <button
              type="button"
              aria-label="ปิด"
              onClick={dismiss}
              disabled={submitting}
              className="disabled:opacity-40"
            >
              <Icon icon="x" className="text-2xl align-middle text-default-600" />
            </button>
          </div>

          {/* Body */}
          <div className="card-body flex flex-col gap-3">
            {/* segmented เลือกวิธี — เฉพาะ create mode ที่ร้านเชื่อมต่อ iShip ไว้และยังไม่มีพัสดุ
                edit mode ต้องไม่มี segmented (แก้ได้เฉพาะ MANUAL อยู่แล้ว ไม่ใช่จังหวะเลือกวิธีส่ง) */}
            {mode === 'create' && canUseIship && !hasIshipShipment && (
              <div className="inline-flex" role="group" aria-label="เลือกวิธีจัดส่ง">
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

            <p className="text-default-400 text-xs mb-0">
              {mode === 'edit'
                ? 'แก้ไขขนส่งหรือเลขพัสดุที่แจ้งไปแล้ว — ผู้ซื้อจะเห็นเลขใหม่ทันทีที่บันทึก'
                : showManualForm
                  ? 'ส่งเอง: คุณส่งของกับขนส่งเอง แล้วนำเลขพัสดุมากรอกที่นี่เพื่อแจ้งผู้ซื้อ'
                  : 'สร้างพัสดุ iShip: ระบบเปิดพัสดุและออกใบปะหน้าให้ ได้เลขพัสดุอัตโนมัติ'}
            </p>

            {showManualForm ? (
              <ShipForm
                publicToken={orderToken}
                initialTrackingNo={initialTrackingNo}
                initialProvider={initialProvider}
                mode={mode}
                alwaysOpen
                onSuccess={handleSuccess}
                onCancel={dismiss}
                onSubmittingChange={setSubmitting}
              />
            ) : (
              // ShipmentPanel มีกรอบการ์ดของตัวเอง — ที่นี่ต้องการเฉพาะเนื้อใน จึงส่ง bare
              <ShipmentPanel orderToken={orderToken} context={ishipContext!} bare />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
