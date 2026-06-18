/**
 * Base: theme/paces/Admin/TS/src/components/FileUploader.tsx
 *
 * ProductImageDropzone — dropzone อัปโหลดรูปสินค้า (onboarding step 4 / form สินค้า).
 * ต่างจาก FileUploader (theme) ตรงที่:
 *   - prop contract: value=fileId[], onChange รับ fileId[] (ไม่ใช่ File[])
 *   - upload อัตโนมัติทันทีที่ drop/เลือกไฟล์ → POST /api/upload → append fileId ผ่าน onChange
 *   - preview grid แนวนอน (grid-cols-5) ไม่ใช่ list ตั้ง
 *   - validate + toast ผ่าน pacesToast (Hard Rule 9)
 *   - Paces primitive เท่านั้น — ไม่มี arbitrary value/hex (Hard Rule 7)
 */
'use client'

import { useCallback, useRef, useState } from 'react'
import Dropzone, { type DropzoneState, type FileRejection } from 'react-dropzone'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

// =========================================================
// Types
// =========================================================

interface ProductImageDropzoneProps {
  value: string[]                          // fileId[] ที่ upload แล้ว
  onChange: (fileIds: string[]) => void
  disabled?: boolean
}

/** state ภายใน — รวม fileId + previewUrl ไว้ด้วยกัน */
interface PreviewEntry {
  fileId: string
  /** URL สำหรับแสดง <img> — ใช้ /api/files/{fileId} (server-agnostic; S3 public URL หรือ local) */
  previewUrl: string
}

// =========================================================
// Constants (สอดคล้อง TFR-011 + storage/types.ts)
// =========================================================
const ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
}
const MAX_SIZE_BYTES = 5 * 1024 * 1024   // 5 MB
const MAX_COUNT = 5

// =========================================================
// Component
// =========================================================

export default function ProductImageDropzone({
  value,
  onChange,
  disabled = false,
}: ProductImageDropzoneProps) {
  /**
   * ทำไมเก็บ previewEntries แยกจาก value:
   *   value (fileId[]) เป็น source-of-truth ที่ form เห็น;
   *   previewEntries เก็บ URL สำหรับ <img> — ถ้า component unmount แล้ว mount ใหม่
   *   (เช่น react-hook-form reset) value จะ sync กลับมา แต่ previewEntries จะถูก
   *   init ใหม่จาก value เสมอ (ผ่าน derived state pattern ใน onDrop)
   */
  const [previewEntries, setPreviewEntries] = useState<PreviewEntry[]>(() =>
    value.map((fileId) => ({ fileId, previewUrl: `/api/files/${fileId}` }))
  )
  const [uploading, setUploading] = useState(false)

  // ref เพื่อ revoke objectURL ที่ไม่ได้ใช้แล้ว (prevent memory leak)
  const objectUrls = useRef<string[]>([])

  // ทำไม useCallback: onDrop ถูกส่งเป็น prop ให้ Dropzone — กัน re-render ซ้ำ
  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      // --------------------------------------------------
      // validate ไฟล์ที่ถูก reject โดย react-dropzone
      // --------------------------------------------------
      if (rejectedFiles.length > 0) {
        for (const { file, errors } of rejectedFiles) {
          const isType = errors.some((e) => e.code === 'file-invalid-type')
          const isSize = errors.some((e) => e.code === 'file-too-large')
          if (isType) pacesToast.error('รองรับเฉพาะ JPG, PNG, WEBP')
          else if (isSize) pacesToast.error(`ไฟล์ "${file.name}" ขนาดเกิน 5MB`)
        }
      }

      if (acceptedFiles.length === 0) return

      // --------------------------------------------------
      // validate จำนวนรวม (value.length คือจำนวนที่ upload แล้ว)
      // --------------------------------------------------
      if (value.length + acceptedFiles.length > MAX_COUNT) {
        pacesToast.error(`อัปโหลดได้สูงสุด ${MAX_COUNT} รูป`)
        return
      }

      setUploading(true)
      const newFileIds: string[] = []

      for (const file of acceptedFiles) {
        try {
          const formData = new FormData()
          formData.append('file', file)

          const res = await fetch('/api/upload', { method: 'POST', body: formData })
          if (!res.ok) {
            pacesToast.error(`อัปโหลด "${file.name}" ล้มเหลว`)
            continue
          }

          const data = (await res.json()) as { fileId: string }
          newFileIds.push(data.fileId)
        } catch {
          pacesToast.error(`อัปโหลด "${file.name}" ล้มเหลว`)
        }
      }

      setUploading(false)

      if (newFileIds.length === 0) return

      // append fileId ใหม่เข้า previewEntries + call onChange
      const newEntries: PreviewEntry[] = newFileIds.map((fileId) => ({
        fileId,
        previewUrl: `/api/files/${fileId}`,
      }))

      setPreviewEntries((prev) => [...prev, ...newEntries])
      onChange([...value, ...newFileIds])
    },
    [value, onChange]
  )

  function handleRemove(fileId: string) {
    setPreviewEntries((prev) => prev.filter((e) => e.fileId !== fileId))
    onChange(value.filter((id) => id !== fileId))
  }

  const isDisabled = disabled || uploading || value.length >= MAX_COUNT

  return (
    <div>
      {/* -------- Dropzone area -------- */}
      <Dropzone
        onDrop={onDrop}
        accept={ACCEPT}
        maxSize={MAX_SIZE_BYTES}
        maxFiles={MAX_COUNT}
        multiple
        disabled={isDisabled}
      >
        {({ getRootProps, getInputProps, isDragActive }: DropzoneState) => (
          <div
            {...getRootProps()}
            className={[
              'border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors',
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-default-300',
              isDisabled ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <input {...getInputProps()} />

            {/* ไอคอน cloud-upload ใน circle bg-info/15 (Paces token) */}
            <div className="flex justify-center mb-3">
              <span className="btn btn-icon bg-info/15 text-info size-11 rounded-full">
                <Icon icon="tabler:cloud-upload" className="text-2xl" />
              </span>
            </div>

            <p className="text-sm font-medium text-default-700 mb-1">
              วางไฟล์ที่นี่ หรือคลิกเพื่อเลือก
            </p>
            <p className="text-xs text-default-400 mb-4">
              รองรับ JPG, PNG, WEBP ขนาดไม่เกิน 5MB ต่อไฟล์ (สูงสุด 5 รูป)
            </p>

            {/* ทำไม type="button": กัน submit form เมื่อ dropzone อยู่ใน <form> */}
            <button
              type="button"
              className="btn btn-sm border border-default-300 shadow"
              disabled={isDisabled}
            >
              {uploading ? 'กำลังอัปโหลด…' : 'เลือกรูปภาพ'}
            </button>
          </div>
        )}
      </Dropzone>

      {/* -------- Preview grid -------- */}
      {previewEntries.length > 0 && (
        <div className="grid grid-cols-5 gap-2 mt-3">
          {previewEntries.map((entry) => (
            <div
              key={entry.fileId}
              /* ทำไม relative: ปุ่มลบ absolute position อ้างอิง container นี้ */
              className="relative"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.previewUrl}
                alt="รูปสินค้า"
                /* size-16 = 4rem = 64px (Paces size token); object-cover กัน distort */
                className="size-16 rounded object-cover w-full"
              />

              {/* ปุ่มลบ — absolute offset -top-1.5 -right-1.5 (arbitrary จำเป็น: ลอยออกนอก corner) */}
              <button
                type="button"
                onClick={() => handleRemove(entry.fileId)}
                /* bg-danger text-white = Paces semantic token; size-6 = 1.5rem */
                className="absolute -top-1.5 -right-1.5 bg-danger text-white size-6 rounded-full flex items-center justify-center"
                aria-label="ลบรูปภาพ"
              >
                <Icon icon="tabler:x" className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
