'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/ProductImage.tsx
 *   (card shell pattern: card > card-header > card-body, FileUploader dropzone)
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/fileuploads/components/Dropzone.tsx
 *   (dashed border + dropzone shell)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent สำหรับ hero+thumbnail layout นี้
 *   ProductImages.tsx เป็น SafePay sibling ที่เป็น upstream ของ auto-upload pattern
 *   (auto-upload + valueRef pattern + per-item uploading skeleton + double-blob-revoke)
 *   Layout override: marketplace post-composer style — hero image เต็มความกว้าง
 *   + thumbnail strip แนวนอน + counter; ไม่ใช้ Paces FileUploader wrapper
 *   เพราะต้องการ control render ของ hero state กับ +tile state แยกกัน
 */
import { Icon } from '@iconify/react'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { pacesToast } from '@/lib/paces-toast'

interface ProductImagesCardV2Props {
  value: string[]
  onChange: (next: string[]) => void
  maxFiles?: number
  formId?: string
}

type UploadingItem = {
  key: string
  name: string
  previewUrl: string
}

export default function ProductImagesCardV2({
  value,
  onChange,
  maxFiles = 10,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  formId,
}: ProductImagesCardV2Props) {
  const [uploading, setUploading] = useState<UploadingItem[]>([])

  // valueRef กัน stale closure ตอน user drop หลาย batch ก่อนตัวแรก resolve
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  const remainingSlots = Math.max(0, maxFiles - value.length - uploading.length)
  const isFull = remainingSlots <= 0
  const total = value.length + uploading.length

  const uploadOne = useCallback(async (file: File, key: string) => {
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`upload failed: ${res.status}`)
      const data = (await res.json()) as { fileId: string }
      return data.fileId
    } catch {
      pacesToast.error('ใส่รูปไม่สำเร็จ ลองใหม่อีกครั้งได้เลยค่ะ')
      return null
    } finally {
      setUploading((prev) => {
        const found = prev.find((u) => u.key === key)
        if (found) URL.revokeObjectURL(found.previewUrl)
        return prev.filter((u) => u.key !== key)
      })
    }
  }, [])

  const acceptFiles = useCallback(
    (incoming: File[]) => {
      if (!incoming || incoming.length === 0) return
      const slots = Math.max(0, maxFiles - valueRef.current.length - uploading.length)
      const accepted = incoming.slice(0, slots)
      if (accepted.length < incoming.length) {
        pacesToast.error(`ใส่ได้มากที่สุด ${maxFiles} รูปค่ะ`)
      }
      if (accepted.length === 0) return

      const items: UploadingItem[] = accepted.map((f) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: f.name,
        previewUrl: URL.createObjectURL(f),
      }))
      setUploading((prev) => [...prev, ...items])

      Promise.all(accepted.map((file, idx) => uploadOne(file, items[idx]!.key))).then(
        (results) => {
          const newIds = results.filter((r): r is string => !!r)
          if (newIds.length > 0) {
            onChange([...valueRef.current, ...newIds])
          }
        },
      )
    },
    [maxFiles, uploading.length, onChange, uploadOne],
  )

  // ใช้ react-dropzone โดยตรง (ไม่ใช้ FileUploader) เพื่อให้คุม render เองได้
  // hero state กับ +tile state ใช้ DOM ต่างกันโดยสิ้นเชิง
  const heroDropzone = useDropzone({
    onDrop: acceptFiles,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxSize: 1024 * 1024 * 10,
    multiple: true,
    disabled: isFull,
    noClick: false,
    noKeyboard: false,
  })

  const addTileDropzone = useDropzone({
    onDrop: acceptFiles,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxSize: 1024 * 1024 * 10,
    multiple: true,
    disabled: isFull,
  })

  const handleRemove = useCallback(
    (id: string) => {
      onChange(value.filter((x) => x !== id))
    },
    [value, onChange],
  )

  const heroImageId = value[0] ?? null

  return (
    <div className="px-3 pt-3 pb-2.5">
      {/* Empty state — full-width tap zone (compact: fixed h-44/52 ไม่ใช้ aspect)
          desktop ≥lg: hero สูงขึ้น (h-96 ≈ 384px) ให้สมกับเป็น hero ของ composer */}
      {value.length === 0 && uploading.length === 0 && (
        <div
          {...heroDropzone.getRootProps()}
          className="bg-default-50 border-default-300 hover:border-primary hover:bg-primary/5 flex h-44 sm:h-52 lg:h-96 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-3 text-center transition"
        >
          <input {...heroDropzone.getInputProps()} />
          <span className="text-2xl leading-none">📷</span>
          <p className="text-dark text-sm font-semibold">เพิ่มรูปสินค้า (แตะ/ลากมาวาง)</p>
          <span className="border-default-300 mt-1 inline-flex min-h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-semibold shadow-sm">
            <Icon icon="tabler:plus" className="size-3.5" />
            เลือกรูป
          </span>
        </div>
      )}

      {/* Filled state — hero image (compact: h-44 sm:h-56) + thumbnail strip + counter */}
      {(value.length > 0 || uploading.length > 0) && (
        <>
          {/* Hero image — first slot. desktop ≥lg: h-96 (384px) hero feel */}
          {heroImageId ? (
            <div className="border-default-200 relative h-44 sm:h-56 lg:h-96 w-full overflow-hidden rounded-2xl border bg-black/5">
              <Image
                src={`/api/files/${heroImageId}`}
                alt="รูปหลักของสินค้า"
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 640px, 720px"
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemove(heroImageId)}
                className="bg-danger absolute end-2 top-2 inline-flex size-9 items-center justify-center rounded-full text-white shadow-md"
                aria-label="ลบรูปหลัก"
              >
                <Icon icon="tabler:x" className="size-5" />
              </button>
              <span className="absolute start-2 top-2 inline-flex items-center rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                รูปหลัก
              </span>
            </div>
          ) : (
            // ยังไม่มี value แต่ uploading อยู่ — โชว์ skeleton compact (desktop ก็ใหญ่ตาม hero)
            <div className="bg-default-100 relative flex h-44 sm:h-56 lg:h-96 w-full items-center justify-center overflow-hidden rounded-2xl">
              {uploading[0] && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={uploading[0].previewUrl}
                    alt={uploading[0].name}
                    className="absolute inset-0 size-full object-cover opacity-60"
                  />
                  <Icon
                    icon="tabler:loader-2"
                    className="size-10 animate-spin text-white drop-shadow"
                  />
                </>
              )}
            </div>
          )}

          {/* Thumbnail strip — horizontal scroll, 64px squares + "+" tile */}
          <div className="-mx-3 mt-2 overflow-x-auto px-3">
            <div className="flex w-max items-center gap-2">
              {value.map((id, idx) => (
                <div
                  key={id}
                  className={`border-default-200 relative size-16 shrink-0 overflow-hidden rounded-lg border ${
                    idx === 0 ? 'ring-primary ring-2' : ''
                  }`}
                >
                  <Image
                    src={`/api/files/${id}`}
                    alt={`รูปสินค้า ${idx + 1}`}
                    width={64}
                    height={64}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemove(id)}
                    className="bg-danger absolute end-0.5 top-0.5 inline-flex size-5 items-center justify-center rounded-full text-white shadow"
                    aria-label="ลบรูป"
                  >
                    <Icon icon="tabler:x" className="size-3" />
                  </button>
                </div>
              ))}

              {uploading.map((u) => (
                <div
                  key={u.key}
                  className="border-default-200 relative size-16 shrink-0 overflow-hidden rounded-lg border opacity-70"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={u.previewUrl}
                    alt={u.name}
                    className="size-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Icon
                      icon="tabler:loader-2"
                      className="size-5 animate-spin text-white"
                    />
                  </div>
                </div>
              ))}

              {!isFull && (
                <div
                  {...addTileDropzone.getRootProps()}
                  className="bg-default-50 border-default-300 hover:border-primary hover:bg-primary/5 flex size-16 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed text-default-400 transition"
                  aria-label="เพิ่มรูปอีก"
                >
                  <input {...addTileDropzone.getInputProps()} />
                  <Icon icon="tabler:plus" className="size-5" />
                </div>
              )}
            </div>
          </div>

          {/* Subtle counter — text-default-300 ให้จางลง */}
          <p className="text-default-300 mt-1.5 text-xs">
            ใส่ไปแล้ว {total}/{maxFiles} รูป — รูปแรกจะเป็นรูปหลัก
          </p>
        </>
      )}
    </div>
  )
}
