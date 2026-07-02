'use client'

/**
 * ManualAdjustModal — modal ปรับสต็อกด้วยมือ (feat 00009 S-17, FR-DSP-01)
 *
 * ใช้ได้ทั้ง package BASIC/PRO (ACTIVE-gate เท่านั้น — TFR-DSP-01 ห้ามเอาไปเป็นจุดขาย Pro,
 * ดู UX-Design-Spec.md ส่วน S-17 + Design Decision #2)
 *
 * Base (modal shell): theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 *   (hs-overlay card → card-header → card-body → card-footer) — แปลงเป็น controlled div
 *   ตาม pattern src/app/(paces)/seller/(dashboard)/wallet/components/TopUpRequestModal.tsx
 *   (controlled open/onClose prop แทน data-hs-overlay trigger, backdrop bg-black/50 คลิกนอกปิด,
 *   error banner bg-danger/10 border-danger/30 บรรทัด 236-245)
 * Base (confirm flow): theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
 *   ฟังก์ชัน ajaxAlert() (preConfirm fetch ระหว่าง dialog ค้าง + showLoaderOnConfirm +
 *   showValidationMessage เมื่อ error) — ใช้ผ่าน pattern
 *   src/app/(paces)/seller/(dashboard)/inventory/components/SubscribeButton.tsx
 *   (Swal.fire ตรง ไม่ผ่าน withReactContent, customClass btn token, allowOutsideClick guard)
 *
 * Adaptation (HR7 — ไม่มี 1:1 ใน Paces theme, ประกอบจาก primitive):
 * - Delta stepper (⊖/⊕ + input ตรงกลาง) ประกอบจาก `btn btn-icon btn-sm` (pattern
 *   InventoryManagementTable.tsx:132-147 ปุ่ม action ต่อแถว) + `form-input text-center`
 * - Preview "{current} → {result}" เป็น text ธรรมดา (ไม่ใช้ icon ลูกศร — icon arrow-right
 *   ยังไม่ verify ใน tabler set ตาม UX spec §จุดที่ต้องระวัง) สีแดง (text-danger) เมื่อผลลัพธ์
 *   ติดลบ + disable ปุ่ม submit
 *
 * Submit 2 ชั้น (API.md §4.4):
 *   1) กด "ยืนยันปรับ" → client validate (delta=0 / note ว่าง → error banner, ไม่เปิด Swal)
 *   2) Sweet Alerts confirm ซ้อน (สรุป delta/ผล/เหตุผล) → preConfirm POST /api/inventory/stock/adjust
 *      → 200 ปิด 2 ชั้น + pacesToast.success + router.refresh(); error → showValidationMessage (dialog ค้าง)
 */

import Icon from '@/components/wrappers/Icon'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'
import { cn } from '@/utils/helpers'

// ─── Props ──────────────────────────────────────────────────────────────────
interface ManualAdjustModalProps {
  open: boolean
  onClose: () => void
  productId: string
  productName: string
  currentStockQty: number
  /** callback หลังปรับสำเร็จ (นอกจาก router.refresh) — เผื่อ parent ต้องปิด dropdown/แถวอื่นด้วย */
  onSuccess?: () => void
}

// ─── map error code จาก API (API.md §4.4) → ข้อความไทยใน Swal.showValidationMessage ──────
// error ที่เป็นไทยอยู่แล้ว (เช่น "สต็อกไม่พอ: {productName}") ใช้ตรง ๆ ผ่าน default case
function adjustErrorMessage(errorBody: string): string {
  switch (errorBody) {
    case 'INVENTORY_NOT_ACTIVE':
      return 'ต้องสมัคร Deep Stock ก่อนใช้งานฟีเจอร์นี้'
    case 'PRODUCT_NOT_FOUND':
      return 'ไม่พบสินค้านี้'
    case 'PRODUCT_NOT_TRACKED':
      return 'สินค้านี้ไม่ได้ติดตามสต็อก'
    case 'Invalid input':
      return 'ข้อมูลไม่ถูกต้อง กรุณาลองใหม่'
    case 'Rate limit exceeded':
      return 'ทำรายการถี่เกินไป กรุณาลองใหม่ภายหลัง'
    default:
      return errorBody || 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  }
}

export default function ManualAdjustModal({
  open,
  onClose,
  productId,
  productName,
  currentStockQty,
  onSuccess,
}: ManualAdjustModalProps) {
  const router = useRouter()

  // ─── State ──────────────────────────────────────────────────────────────────
  // deltaInput เป็น string (ไม่ใช่ number) เพื่อรองรับ interim state ระหว่างพิมพ์ เช่น "-"
  const [deltaInput, setDeltaInput] = useState<string>('0')
  const [note, setNote] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // errorMsg: banner client-validate เท่านั้น (delta=0 / note ว่าง) — error จาก API แสดงใน Swal แทน
  const [errorMsg, setErrorMsg] = useState<string>('')

  const deltaNum = parseInt(deltaInput, 10)
  const deltaValid = !isNaN(deltaNum) && deltaNum !== 0
  const resultQty = deltaValid ? currentStockQty + deltaNum : currentStockQty
  const isNegativeResult = deltaValid && resultQty < 0

  // ─── ปิด modal + reset state ─────────────────────────────────────────────────
  const handleClose = () => {
    if (isSubmitting) return
    setDeltaInput('0')
    setNote('')
    setErrorMsg('')
    onClose()
  }

  // ─── stepper ⊖/⊕ ──────────────────────────────────────────────────────────
  const handleStep = (dir: 1 | -1) => {
    const base = isNaN(deltaNum) ? 0 : deltaNum
    setDeltaInput(String(base + dir))
    setErrorMsg('')
  }

  // ─── กด "ยืนยันปรับ" — validate ชั้นแรกก่อนเปิด Swal ────────────────────────
  const handleAdjustClick = async () => {
    setErrorMsg('')
    if (!deltaValid) {
      setErrorMsg('จำนวนต้องไม่เป็น 0')
      return
    }
    const trimmedNote = note.trim()
    if (!trimmedNote) {
      setErrorMsg('กรุณาระบุเหตุผล')
      return
    }
    if (isNegativeResult) return // safeguard เพิ่มเติม — ปุ่ม submit ถูก disable อยู่แล้วในเคสนี้

    // ─── ชั้น 2: Sweet Alerts confirm ซ้อน (pattern SubscribeButton.tsx / ajaxAlert()) ──────
    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'question',
      title: `ยืนยันปรับสต็อก ${productName}?`,
      text: `${currentStockQty} → ${resultQty} ชิ้น (เหตุผล: ${trimmedNote})`,
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      // preConfirm: ยิง POST ระหว่าง dialog ค้าง; ถ้า error → showValidationMessage (dialog ไม่ปิด)
      preConfirm: async () => {
        try {
          setIsSubmitting(true)
          const res = await fetch('/api/inventory/stock/adjust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, delta: deltaNum, note: trimmedNote }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            Swal.showValidationMessage(adjustErrorMessage(data?.error ?? ''))
            return false
          }
          return data.resultingQty as number
        } catch {
          Swal.showValidationMessage('เกิดข้อผิดพลาด กรุณาลองใหม่')
          return false
        } finally {
          setIsSubmitting(false)
        }
      },
    })

    if (result.isConfirmed && typeof result.value === 'number') {
      pacesToast.success(`ปรับสต็อกสำเร็จ — คงเหลือ ${result.value} ชิ้น`)
      onSuccess?.()
      handleClose()
      router.refresh()
    }
  }

  // ─── ถ้า modal ถูก controlled ให้ hidden/visible ───────────────────────────
  if (!open) return null

  return (
    /* controlled div modal — copy pattern TopUpRequestModal.tsx (ไม่ใช้ hs-overlay data-attr
       เพราะ modal นี้ mount ตาม open prop ของ React state ให้ reset ได้ถูกต้องทุกครั้งเปิด/ปิด) */
    <div
      className="size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto bg-black/50 flex items-start sm:items-center py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manualAdjustModalLabel"
      tabIndex={-1}
      onClick={(e) => {
        // กดนอก card = ปิด (เหมือน hs-overlay backdrop)
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="ease-in-out transition-all duration-200 lg:max-w-lg md:max-w-md md:w-full w-[calc(100%-24px)] m-3 md:mx-auto flex items-center">
        <div className="w-full flex flex-col card pointer-events-auto">
          {/* ─── Header ─────────────────────────────────────────────────────── */}
          <div className="card-header p-5">
            <h3 id="manualAdjustModalLabel" className="font-medium text-sm">
              ปรับสต็อก: {productName}
            </h3>
            <button
              type="button"
              aria-label="ปิด"
              onClick={handleClose}
              disabled={isSubmitting}
              className="disabled:opacity-40"
            >
              <Icon icon="x" className="text-2xl align-middle text-default-600" />
            </button>
          </div>

          {/* ─── Body ───────────────────────────────────────────────────────── */}
          <div className="card-body overflow-y-auto space-y-5">
            {/* Error banner — client validate เท่านั้น (delta=0 / note ว่าง) */}
            {errorMsg && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 rounded-md bg-danger/10 border border-danger/30 p-3 text-sm text-danger"
              >
                <Icon icon="alert-circle" className="shrink-0 text-base mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <p className="text-default-500 text-sm">
              สต็อกปัจจุบัน: <span className="text-default-800 font-medium">{currentStockQty}</span> ชิ้น
            </p>

            {/* ─── Delta stepper — ประกอบจาก btn btn-icon btn-sm + form-input (HR7, ไม่มี 1:1) ──── */}
            <div>
              <label htmlFor="adjustDelta" className="form-label">
                จำนวนที่ปรับ <span className="text-danger">*</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="ลดจำนวน"
                  onClick={() => handleStep(-1)}
                  disabled={isSubmitting}
                  className="btn btn-icon btn-sm border-default-300 text-default-800 hover:border-default-400 border disabled:opacity-40"
                >
                  <Icon icon="minus" className="text-base" />
                </button>
                <input
                  id="adjustDelta"
                  type="number"
                  step={1}
                  value={deltaInput}
                  onChange={(e) => {
                    setDeltaInput(e.target.value)
                    setErrorMsg('')
                  }}
                  disabled={isSubmitting}
                  className="form-input w-24 text-center"
                />
                <button
                  type="button"
                  aria-label="เพิ่มจำนวน"
                  onClick={() => handleStep(1)}
                  disabled={isSubmitting}
                  className="btn btn-icon btn-sm border-default-300 text-default-800 hover:border-default-400 border disabled:opacity-40"
                >
                  <Icon icon="plus" className="text-base" />
                </button>

                {/* preview real-time {current} → {result} — แดงถ้าติดลบ (ไม่ใช้ icon ลูกศร ดู header comment) */}
                <span className="text-default-500 ms-2 text-sm">
                  {currentStockQty} →{' '}
                  <span
                    className={cn(
                      'font-semibold tabular-nums',
                      isNegativeResult ? 'text-danger' : 'text-default-800',
                    )}
                  >
                    {resultQty}
                  </span>{' '}
                  ชิ้น
                </span>
              </div>
              <p className="mt-1 text-xs text-default-400">ลบ = ตัดออก, บวก = รับเข้า</p>
              {isNegativeResult && (
                <p role="alert" aria-live="polite" className="mt-1 text-sm text-danger">
                  ผลลัพธ์ติดลบ — สต็อกไม่พอ
                </p>
              )}
            </div>

            {/* ─── เหตุผล (บังคับ 1-200 ตัวอักษร — ManualStockAdjustSchema) ─────────────── */}
            <div>
              <label htmlFor="adjustNote" className="form-label">
                เหตุผล * (บังคับ)
              </label>
              <textarea
                id="adjustNote"
                rows={2}
                maxLength={200}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value)
                  setErrorMsg('')
                }}
                disabled={isSubmitting}
                placeholder="เช่น ของเสียหายจากขนส่ง"
                className="form-textarea"
              />
            </div>
          </div>

          {/* ─── Footer ─────────────────────────────────────────────────────── */}
          {/* min-h-11 บนปุ่ม footer = 44px touch target */}
          <div className="flex justify-end items-center gap-x-2 border-t border-default-300 card-body">
            <button
              type="button"
              className="btn bg-light hover:text-primary disabled:opacity-40 min-h-11"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={isNegativeResult || isSubmitting}
              onClick={handleAdjustClick}
              className="btn bg-primary text-white hover:bg-primary-hover disabled:opacity-60 inline-flex items-center gap-2 min-h-11"
            >
              {isSubmitting && <Icon icon="loader-2" className="size-4 animate-spin" />}
              ยืนยันปรับ
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
