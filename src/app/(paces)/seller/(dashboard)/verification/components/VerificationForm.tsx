'use client'

import Icon from '@/components/wrappers/Icon'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { pacesToast } from '@/lib/paces-toast'
import { uploadFileId } from '@/lib/upload-client'
import * as Yup from 'yup'
import { yupResolver } from '@hookform/resolvers/yup'

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB per NFR-1.3

// ─── L2 Form ──────────────────────────────────────────────────────────────────
const schemaL2 = Yup.object({
  socialLink: Yup.string()
    .url('กรุณากรอก URL ที่ถูกต้อง')
    .default(''),
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type L2Values = { socialLink: string }

// ─── L3 Form ──────────────────────────────────────────────────────────────────
const schemaL3 = Yup.object({
  registrationNumber: Yup.string()
    .min(2, 'กรุณากรอกเลขที่จดทะเบียน')
    .required('กรุณากรอกเลขที่จดทะเบียน'),
  address: Yup.string().default(''),
})

type L3Values = { registrationNumber: string; address: string }

// ─── Shared helpers ───────────────────────────────────────────────────────────

// direct upload (2026-08-10) — เดิมส่งผ่าน body ของ function ที่ Vercel จำกัด 4.5MB ทั้งที่หน้านี้
// บอกผู้ใช้ว่ารับถึง 5MB (ดู upload-policy.ts); DOCUMENT = รูป + PDF ตาม PRD FR-2.5 (L3)
async function uploadFile(file: File): Promise<string> {
  return uploadFileId(file, 'DOCUMENT')
}

function validateFileSize(file: File | null | undefined, label: string): string | null {
  if (!file) return `กรุณาเลือกไฟล์ ${label}`
  if (file.size > MAX_FILE_SIZE) return `ไฟล์ ${label} ต้องไม่เกิน 5 MB`
  return null
}

// ─── File input component ─────────────────────────────────────────────────────
function FileField({
  label,
  required,
  inputRef,
  error,
}: {
  label: string
  required?: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  error?: string
}) {
  const [fileName, setFileName] = useState<string | null>(null)
  return (
    <div>
      <label className="form-label">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <div
        className="relative flex items-center gap-3 rounded-lg border border-default-200 bg-default-50 px-4 py-3 cursor-pointer hover:border-primary transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        {/* mdi:file-upload-outline → tabler:file-upload (ผ่าน wrapper) */}
        <Icon icon="file-upload" className="size-5 text-default-400 shrink-0" />
        <span className="text-sm text-default-500 truncate flex-1">
          {fileName ?? 'คลิกเพื่อเลือกไฟล์ (รูปภาพ / PDF, ≤ 5 MB)'}
        </span>
        {fileName && (
          /* mdi:check-circle → tabler:circle-check (ผ่าน wrapper) */
          <Icon icon="circle-check" className="size-4 text-success shrink-0" />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </div>
      {error && <p className="text-danger mt-1 text-sm">{error}</p>}
    </div>
  )
}

// ─── Level-2 Form ─────────────────────────────────────────────────────────────
function L2Form({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const idCardRef = useRef<HTMLInputElement>(null)
  const selfieRef = useRef<HTMLInputElement>(null)
  const shopPhotoRef = useRef<HTMLInputElement>(null)
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<L2Values>({ resolver: yupResolver(schemaL2) })

  const onSubmit = async (values: L2Values) => {
    // Validate files client-side
    const errs: Record<string, string> = {}
    const idCardErr = validateFileSize(idCardRef.current?.files?.[0], 'บัตรประชาชน')
    const selfieErr = validateFileSize(selfieRef.current?.files?.[0], 'Selfie')
    const shopPhotoErr = validateFileSize(shopPhotoRef.current?.files?.[0], 'รูปร้าน')
    if (idCardErr) errs.idCard = idCardErr
    if (selfieErr) errs.selfie = selfieErr
    if (shopPhotoErr) errs.shopPhoto = shopPhotoErr
    if (Object.keys(errs).length > 0) {
      setFileErrors(errs)
      return
    }
    setFileErrors({})
    setSubmitting(true)
    try {
      // Upload files
      const [idCardId, selfieId, shopPhotoId] = await Promise.all([
        uploadFile(idCardRef.current!.files![0]),
        uploadFile(selfieRef.current!.files![0]),
        uploadFile(shopPhotoRef.current!.files![0]),
      ])

      const documents: Record<string, string> = {
        idCard: idCardId,
        selfie: selfieId,
        shopPhoto: shopPhotoId,
      }
      if (values.socialLink) documents.socialLink = values.socialLink

      // Submit verification
      const res = await fetch('/api/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'DOCUMENT',
          level: 2,
          documents,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(data?.error ?? 'ส่งเอกสารไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      pacesToast.success('ส่งเอกสารแล้ว รอแอดมินตรวจสอบ')
      router.refresh()
      onDone()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'
      pacesToast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-4 space-y-4 border-t border-default-100 pt-4">
      <FileField label="บัตรประชาชน" required inputRef={idCardRef} error={fileErrors.idCard} />
      <FileField label="Selfie คู่กับบัตรประชาชน" required inputRef={selfieRef} error={fileErrors.selfie} />
      <FileField label="รูปหน้าร้าน / ป้ายร้าน" required inputRef={shopPhotoRef} error={fileErrors.shopPhoto} />

      <div>
        <label htmlFor="socialLink" className="form-label">
          Social Link <span className="text-default-400">(ไม่บังคับ)</span>
        </label>
        <input
          id="socialLink"
          type="url"
          className="form-input"
          placeholder="https://facebook.com/yourshop"
          {...register('socialLink')}
        />
        {errors.socialLink && <p className="text-danger mt-1 text-sm">{errors.socialLink.message}</p>}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={handleSubmit(onSubmit)}
          disabled={submitting}
          className="btn bg-primary text-white hover:bg-primary-hover px-5 py-2.5 font-semibold disabled:opacity-60 inline-flex items-center gap-2"
        >
          {submitting ? (
            <>
              {/* mdi:loading → tabler:loader-2 (ผ่าน wrapper) */}
              <Icon icon="loader-2" className="size-4 animate-spin" />
              กำลังส่ง...
            </>
          ) : (
            <>
              {/* mdi:send-outline → tabler:send (ผ่าน wrapper) */}
              <Icon icon="send" className="size-4" />
              ส่งเอกสาร
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={submitting}
          className="btn border border-default-300 bg-card hover:bg-default-50 text-default-700 px-5 py-2.5"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  )
}

// ─── Level-3 Form ─────────────────────────────────────────────────────────────
function L3Form({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const bizDocRef = useRef<HTMLInputElement>(null)
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<L3Values>({ resolver: yupResolver(schemaL3) })

  const onSubmit = async (values: L3Values) => {
    const errs: Record<string, string> = {}
    const bizDocErr = validateFileSize(bizDocRef.current?.files?.[0], 'เอกสารจดทะเบียน')
    if (bizDocErr) errs.bizDoc = bizDocErr
    if (Object.keys(errs).length > 0) {
      setFileErrors(errs)
      return
    }
    setFileErrors({})
    setSubmitting(true)
    try {
      const bizDocId = await uploadFile(bizDocRef.current!.files![0])

      const documents: Record<string, string> = {
        bizDoc: bizDocId,
        registrationNumber: values.registrationNumber,
      }
      if (values.address) documents.address = values.address

      const res = await fetch('/api/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'DOCUMENT',
          level: 3,
          documents,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(data?.error ?? 'ส่งเอกสารไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      pacesToast.success('ส่งเอกสารแล้ว รอแอดมินตรวจสอบ')
      router.refresh()
      onDone()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'
      pacesToast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-4 space-y-4 border-t border-default-100 pt-4">
      <FileField
        label="เอกสารจดทะเบียนธุรกิจ"
        required
        inputRef={bizDocRef}
        error={fileErrors.bizDoc}
      />

      <div>
        <label htmlFor="registrationNumber" className="form-label">
          เลขที่จดทะเบียน<span className="text-danger"> *</span>
        </label>
        <input
          id="registrationNumber"
          type="text"
          className="form-input"
          placeholder="0105xxxxxxxxxxxxxxx"
          {...register('registrationNumber')}
        />
        {errors.registrationNumber && (
          <p className="text-danger mt-1 text-sm">{errors.registrationNumber.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="address" className="form-label">
          ที่อยู่ร้าน <span className="text-default-400">(ไม่บังคับ)</span>
        </label>
        <textarea
          id="address"
          rows={3}
          className="form-textarea"
          placeholder="เลขที่ / ถนน / แขวง / เขต / จังหวัด / รหัสไปรษณีย์"
          {...register('address')}
        />
        {errors.address && <p className="text-danger mt-1 text-sm">{errors.address.message}</p>}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={handleSubmit(onSubmit)}
          disabled={submitting}
          className="btn bg-primary text-white hover:bg-primary-hover px-5 py-2.5 font-semibold disabled:opacity-60 inline-flex items-center gap-2"
        >
          {submitting ? (
            <>
              {/* mdi:loading → tabler:loader-2 (ผ่าน wrapper) */}
              <Icon icon="loader-2" className="size-4 animate-spin" />
              กำลังส่ง...
            </>
          ) : (
            <>
              {/* mdi:send-outline → tabler:send (ผ่าน wrapper) */}
              <Icon icon="send" className="size-4" />
              ส่งเอกสาร
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={submitting}
          className="btn border border-default-300 bg-card hover:bg-default-50 text-default-700 px-5 py-2.5"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  )
}

// ─── Public export ─────────────────────────────────────────────────────────────
export default function VerificationForm({
  level,
  onDone,
}: {
  level: 2 | 3
  onDone: () => void
}) {
  if (level === 2) return <L2Form onDone={onDone} />
  return <L3Form onDone={onDone} />
}
