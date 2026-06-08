'use client'

/**
 * TopUpRequestModal — modal ให้ seller เติมเครดิต SMS
 *
 * Base shell: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 * (Preline hs-overlay modal — card → card-header → card-body → card-footer)
 *
 * Upload pattern: copy เป๊ะจาก
 *   src/app/(paces)/seller/(dashboard)/verification/components/VerificationForm.tsx
 *   ฟังก์ชัน uploadFile (line 36-46) — POST /api/upload, FormData field name "file"
 *
 * Flow: เลือก amount (preset หรือพิมพ์เอง) → เลือก slip → อัปโหลด slip → ได้ fileId
 *       → POST /api/wallet/topup { amount, slipFileId } → 201 → onSuccess + onClose + toast
 *
 * RC-8: ห้าม log slip/PII ในทุก state
 */

import Icon from '@/components/wrappers/Icon'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'

// ─── Constants ─────────────────────────────────────────────────────────────────
// MAX_FILE_SIZE: copy จาก VerificationForm.tsx (5 MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024

// preset packages ตาม Design Spec
const PRESETS = [100, 300, 500, 1000] as const

// ─── Upload helper (copy pattern จาก VerificationForm.tsx line 36-46) ──────────
// POST /api/upload, FormData field name "file" → คืน fileId string
async function uploadFile(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/upload', { method: 'POST', body: fd })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error ?? 'อัปโหลดไฟล์ไม่สำเร็จ')
  }
  const data = await res.json()
  return data.fileId as string
}

// ─── Props ──────────────────────────────────────────────────────────────────────
interface TopUpRequestModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

// ─── State type ─────────────────────────────────────────────────────────────────
type ModalState =
  | 'idle'        // รอ input
  | 'uploading'   // กำลังอัปโหลดสลิป
  | 'submitting'  // กำลัง POST /api/wallet/topup
  | 'error'       // มี error ใน banner

// ─── Component ──────────────────────────────────────────────────────────────────
export default function TopUpRequestModal({ open, onClose, onSuccess }: TopUpRequestModalProps) {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [amount, setAmount] = useState<string>('')
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [slipFile, setSlipFile] = useState<File | null>(null)
  const [slipPreview, setSlipPreview] = useState<string | null>(null)
  const [modalState, setModalState] = useState<ModalState>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')
  // amountError: error ใต้ amount input (ไม่ใช่ banner)
  const [amountError, setAmountError] = useState<string>('')

  const slipInputRef = useRef<HTMLInputElement>(null)

  // ─── Cleanup Blob URL เมื่อ slipPreview เปลี่ยนหรือ component unmount ───────
  // ทำไม: URL.createObjectURL ต้อง revoke ทุก exit path เพื่อไม่ให้ leak ใน browser memory
  useEffect(() => {
    return () => {
      if (slipPreview) URL.revokeObjectURL(slipPreview)
    }
  }, [slipPreview])

  // ─── ปิด modal + reset state ───────────────────────────────────────────────
  const handleClose = () => {
    if (modalState === 'uploading' || modalState === 'submitting') return
    setAmount('')
    setSelectedPreset(null)
    setSlipFile(null)
    setSlipPreview(null)
    setModalState('idle')
    setErrorMsg('')
    setAmountError('')
    onClose()
  }

  // ─── เลือก preset package ──────────────────────────────────────────────────
  const handlePresetClick = (preset: number) => {
    setSelectedPreset(preset)
    setAmount(String(preset))
    setAmountError('')
  }

  // ─── แก้ amount เอง = deselect preset ─────────────────────────────────────
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setAmount(val)
    setSelectedPreset(null)
    // validate เบา ๆ ขณะพิมพ์
    const num = parseInt(val, 10)
    if (val === '' || isNaN(num)) {
      setAmountError('')
    } else if (num < 100) {
      setAmountError('จำนวนขั้นต่ำคือ ฿100')
    } else if (num > 100000) {
      setAmountError('จำนวนสูงสุดคือ ฿100,000')
    } else {
      setAmountError('')
    }
  }

  // ─── เลือกไฟล์ slip ────────────────────────────────────────────────────────
  const handleSlipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      toast.error('ไฟล์สลิปต้องไม่เกิน 5 MB')
      e.target.value = ''
      return
    }
    setSlipFile(file)
    // สร้าง preview thumbnail จาก object URL
    // ไม่ต้อง revoke เองตรงนี้ — useEffect cleanup จะ revoke ค่าเก่าเองทุกครั้ง slipPreview เปลี่ยน
    const prevUrl = URL.createObjectURL(file)
    setSlipPreview(prevUrl)
  }

  // ─── Validation ก่อน submit ────────────────────────────────────────────────
  const amountNum = parseInt(amount, 10)
  const amountValid = !isNaN(amountNum) && amountNum >= 100 && amountNum <= 100000
  const canSubmit =
    amountValid && slipFile !== null && modalState !== 'uploading' && modalState !== 'submitting'

  // ─── Submit flow ───────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return
    setErrorMsg('')
    setModalState('uploading')
    let fileId: string
    try {
      // step 1: อัปโหลดสลิปก่อน → ได้ fileId
      // RC-8: ห้าม log ชื่อไฟล์/raw data ที่อาจเป็น PII
      fileId = await uploadFile(slipFile!)
    } catch {
      // upload error: ไม่ลงใน banner เพราะยัง ไม่ได้ submit — toast + reset state
      setModalState('error')
      // ข้อความครบในตัวเอง ไม่มี prefix ที่ render แล้ว
      setErrorMsg('อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่')
      return
    }

    setModalState('submitting')
    try {
      // step 2: ส่งคำขอ top-up พร้อม fileId ที่ได้
      const res = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, slipFileId: fileId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? 'ส่งคำขอไม่สำเร็จ')
      }
      // success: toast → onSuccess callback → ปิด modal
      toast.success('ส่งคำขอซื้อเครดิตแล้ว Deep จะตรวจสอบและเพิ่มเครดิตให้ภายใน 24 ชั่วโมง')
      onSuccess?.()
      handleClose()
    } catch (err: unknown) {
      // ใส่ prefix "ส่งคำขอไม่สำเร็จ:" ที่ setErrorMsg เพื่อให้ banner แสดงเฉพาะ errorMsg ตรง ๆ
      const raw = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'
      setModalState('error')
      setErrorMsg(`ส่งคำขอไม่สำเร็จ: ${raw}`)
    }
  }

  // ─── Render state helpers ──────────────────────────────────────────────────
  const isUploading = modalState === 'uploading'
  const isSubmitting = modalState === 'submitting'
  const isBusy = isUploading || isSubmitting

  const submitLabel = isUploading
    ? 'กำลังอัปโหลดสลิป...'
    : isSubmitting
      ? 'กำลังส่งคำขอ...'
      : 'ส่งคำขอ'

  // ─── ถ้า modal ถูก controlled ให้ hidden/visible ─────────────────────────
  if (!open) return null

  return (
    /* hs-overlay shell — copy จาก AddCategoryModal.tsx แล้วปรับ id + a11y
       ทำไมใช้ controlled prop แทน hs-overlay data-attr: modal นี้ถูก mount แบบ React
       state (open prop) ไม่ใช่ Preline data-hs-overlay trigger จากภายนอก
       เพื่อให้ reset state ทุกครั้งที่ปิด/เปิดได้ถูกต้อง */
    <div
      className="size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto bg-black/50 flex items-start sm:items-center py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="topUpModalLabel"
      tabIndex={-1}
      onClick={(e) => {
        // กดนอก card = ปิด (เหมือน hs-overlay backdrop)
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      {/* ใช้ items-start + py-4 บน wrapper ทำให้ card ไม่ถูก clamp ตรงกลาง
          และ overflow-y-auto บน wrapper ทำให้ทั้ง card scroll ได้เมื่อจอเตี้ย
          (แก้ปัญหา footer หลุดจอบน 360×640 เมื่อแสดง slip preview) */}
      <div className="ease-in-out transition-all duration-200 lg:max-w-lg md:max-w-md md:w-full w-[calc(100%-24px)] m-3 md:mx-auto flex items-center">
        <div className="w-full flex flex-col card pointer-events-auto">
          {/* ─── Header ───────────────────────────────────────────────────── */}
          <div className="card-header p-5">
            <h3 id="topUpModalLabel" className="font-medium text-sm">
              เติมเครดิต SMS
            </h3>
            <button
              type="button"
              aria-label="ปิด"
              onClick={handleClose}
              disabled={isBusy}
              className="disabled:opacity-40"
            >
              <Icon icon="x" className="text-2xl align-middle text-default-600" />
            </button>
          </div>

          {/* ─── Body ─────────────────────────────────────────────────────── */}
          <div className="card-body overflow-y-auto space-y-5">
            {/* Error banner */}
            {modalState === 'error' && errorMsg && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 rounded-md bg-danger/10 border border-danger/30 p-3 text-sm text-danger"
              >
                <Icon icon="alert-circle" className="shrink-0 text-base mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* ─── Preset packages ────────────────────────────────────────── */}
            <div>
              <p className="form-label mb-2">เลือกจำนวนเครดิต</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={selectedPreset === preset}
                    onClick={() => handlePresetClick(preset)}
                    disabled={isBusy}
                    className={[
                      /* min-h-11 = 44px touch target (M3 mobile rule) */
                      'rounded-full border px-4 py-2.5 min-h-11 text-sm font-medium transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      selectedPreset === preset
                        ? 'bg-primary text-white border-primary'
                        : 'bg-card border-default-300 text-default-700 hover:border-primary hover:text-primary',
                    ].join(' ')}
                  >
                    ฿{preset.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* ─── Amount input ────────────────────────────────────────────── */}
            <div>
              <label htmlFor="topUpAmount" className="form-label">
                จำนวนเงิน (บาท) <span className="text-danger">*</span>
              </label>
              <div className="relative flex items-center">
                <span className="absolute start-3 text-default-500 text-sm select-none">฿</span>
                <input
                  id="topUpAmount"
                  type="number"
                  min={100}
                  max={100000}
                  step={1}
                  value={amount}
                  onChange={handleAmountChange}
                  disabled={isBusy}
                  placeholder="100"
                  className={[
                    'form-input ps-7 w-full',
                    amountError ? '!border-danger' : '',
                  ].join(' ')}
                />
              </div>
              {/* error ใต้ input — aria-live เพื่อ a11y */}
              {amountError && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="mt-1 text-sm text-danger"
                >
                  {amountError}
                </p>
              )}
            </div>

            {/* ─── Slip upload ─────────────────────────────────────────────── */}
            <div>
              <label className="form-label mb-1">
                สลิปการโอนเงิน <span className="text-danger">*</span>
              </label>
              <div
                className="relative flex items-center gap-3 rounded-lg border border-default-200 bg-default-50 px-4 py-3 cursor-pointer hover:border-primary transition-colors"
                onClick={() => !isBusy && slipInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="เลือกไฟล์สลิป"
                onKeyDown={(e) => e.key === 'Enter' && !isBusy && slipInputRef.current?.click()}
              >
                <Icon icon="file-upload" className="size-5 text-default-400 shrink-0" />
                <span className="text-sm text-default-500 truncate flex-1">
                  {slipFile ? slipFile.name : 'คลิกเพื่อเลือกสลิป'}
                </span>
                {slipFile && (
                  <Icon icon="circle-check" className="size-4 text-success shrink-0" />
                )}
                {/* hidden file input — trigger โดย div ด้านนอก (pattern จาก VerificationForm.tsx) */}
                <input
                  ref={slipInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleSlipChange}
                  disabled={isBusy}
                />
              </div>
              <p className="mt-1 text-xs text-default-400">
                รองรับ JPG / PNG ขนาดสูงสุด 5 MB
              </p>

              {/* Slip preview thumbnail */}
              {slipPreview && (
                <div className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slipPreview}
                    alt="ตัวอย่างสลิป"
                    className="rounded-lg border border-default-200 max-h-40 w-auto object-contain"
                    onError={() => setSlipPreview(null)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ─── Footer ───────────────────────────────────────────────────── */}
          {/* min-h-11 บนปุ่ม footer = 44px touch target */}
          <div className="flex justify-end items-center gap-x-2 border-t border-default-300 card-body">
            <button
              type="button"
              className="btn bg-light hover:text-primary disabled:opacity-40 min-h-11"
              onClick={handleClose}
              disabled={isBusy}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="btn bg-primary text-white hover:bg-primary-hover disabled:opacity-60 inline-flex items-center gap-2 min-h-11"
            >
              {isBusy && (
                <Icon icon="loader-2" className="size-4 animate-spin" />
              )}
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
