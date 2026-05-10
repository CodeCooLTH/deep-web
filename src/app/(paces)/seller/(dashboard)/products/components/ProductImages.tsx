'use client'

import { Icon } from '@iconify/react'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import FileUploader from '@/components/FileUploader'

interface ProductImagesProps {
  value: string[]
  onChange: (next: string[]) => void
  maxFiles?: number
  formId?: string
}

type UploadingItem = {
  // ใช้ key เฉพาะแต่ละไฟล์เพื่อให้ render preview ได้ระหว่างกำลังอัปโหลด
  key: string
  name: string
  previewUrl: string
}

export default function ProductImages({
  value,
  onChange,
  maxFiles = 10,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  formId,
}: ProductImagesProps) {
  const [uploading, setUploading] = useState<UploadingItem[]>([])

  // valueRef: sync ค่า value (fileIds จาก parent) เข้า ref ทุก render
  // เพื่อให้ Promise.all().then() อ่าน value ล่าสุดได้ — แก้ stale closure
  // กรณี user drop หลาย batch ก่อน batch แรกจะ resolve
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  // FileUploader คาดหวัง files state ของมัน — แต่เราอัปโหลดเข้า server ทันที
  // เลยส่ง [] ตลอด เพราะ source of truth คือ value (fileIds) จาก parent
  const dropzoneFiles: File[] = []

  const remainingSlots = Math.max(0, maxFiles - value.length - uploading.length)
  const isFull = remainingSlots <= 0

  const uploadOne = useCallback(
    async (file: File, key: string) => {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        if (!res.ok) throw new Error(`upload failed: ${res.status}`)
        const data = (await res.json()) as { fileId: string }
        return data.fileId
      } catch {
        toast.error(`อัปโหลดไม่สำเร็จ: ${file.name}`)
        return null
      } finally {
        // cleanup preview URL
        setUploading((prev) => {
          const found = prev.find((u) => u.key === key)
          if (found) URL.revokeObjectURL(found.previewUrl)
          return prev.filter((u) => u.key !== key)
        })
      }
    },
    [],
  )

  const handleSetFiles = useCallback(
    (incoming: File[] | undefined) => {
      if (!incoming || incoming.length === 0) return

      // กันเกิน maxFiles
      const slots = Math.max(0, maxFiles - value.length - uploading.length)
      const accepted = incoming.slice(0, slots)
      if (accepted.length < incoming.length) {
        toast.error(`อัปโหลดได้สูงสุด ${maxFiles} รูป`)
      }
      if (accepted.length === 0) return

      // เพิ่ม uploading items — revoke preview URL ที่ FileUploader.onDrop
      // แปะมา (ผ่าน Object.assign(file, { preview: ... })) ก่อนสร้างของเราเอง
      // ไม่งั้น blob URL ของ FileUploader จะ leak จนกว่าจะ unload page
      // (FileUploader cleanup useEffect จะไม่เห็น File เหล่านี้เพราะเราส่ง files=[])
      const items: UploadingItem[] = accepted.map((f) => {
        const fileWithPreview = f as File & { preview?: string }
        if (fileWithPreview.preview) {
          URL.revokeObjectURL(fileWithPreview.preview)
        }
        return {
          key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: f.name,
          previewUrl: URL.createObjectURL(f),
        }
      })
      setUploading((prev) => [...prev, ...items])

      // ยิงอัปโหลดพร้อมกัน — เก็บผลลัพธ์แล้ว append เข้า value ทีละชุด
      Promise.all(accepted.map((file, idx) => uploadOne(file, items[idx]!.key))).then(
        (results) => {
          const newIds = results.filter((r): r is string => !!r)
          if (newIds.length > 0) {
            // อ่าน value ล่าสุดจาก valueRef แทน closure เพื่อแก้ stale closure
            // กรณี user drop batch B ก่อน batch A resolve → batch B จะเห็น
            // value ที่ batch A append แล้ว ไม่ทับของ A
            onChange([...valueRef.current, ...newIds])
          }
        },
      )
    },
    [maxFiles, value.length, uploading.length, onChange, uploadOne],
  )

  const handleRemove = useCallback(
    (id: string) => {
      onChange(value.filter((x) => x !== id))
    },
    [value, onChange],
  )

  return (
    <div className="card">
      <div className="card-header p-5">
        <div>
          <h4 className="card-title mb-1.25">รูปภาพสินค้า</h4>
          <p className="text-default-400">
            อัปโหลดรูปสินค้าของคุณ รองรับไฟล์ .png .jpg .jpeg .webp ขนาดไม่เกิน 10 MB
          </p>
          <p className="text-default-500 mt-2 text-sm">
            {value.length + uploading.length} / {maxFiles} รูป
          </p>
        </div>
      </div>
      <div className="card-body">
        <FileUploader
          files={dropzoneFiles}
          setFiles={handleSetFiles}
          accept={{
            'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
          }}
          maxSize={1024 * 1024 * 10}
          maxFileCount={maxFiles}
          multiple
          disabled={isFull}
          className="mb-3"
        />

        {(value.length > 0 || uploading.length > 0) && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {value.map((id) => (
              <div
                key={id}
                className="border-default-300 relative overflow-hidden rounded-lg border"
              >
                <Image
                  src={`/api/files/${id}`}
                  alt="รูปสินค้า"
                  width={120}
                  height={120}
                  className="aspect-square h-auto w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemove(id)}
                  className="bg-danger absolute end-1 top-1 inline-flex size-6 items-center justify-center rounded-full text-white shadow"
                  aria-label="ลบรูป"
                >
                  <Icon icon="tabler:x" className="size-4" />
                </button>
              </div>
            ))}

            {uploading.map((u) => (
              <div
                key={u.key}
                className="border-default-300 relative overflow-hidden rounded-lg border opacity-60"
              >
                {/* ใช้ <img> สำหรับ blob: URL — next/image ไม่รองรับ blob โดยตรงและจะ warn */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={u.previewUrl}
                  alt={u.name}
                  className="aspect-square h-auto w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Icon
                    icon="tabler:loader-2"
                    className="size-6 animate-spin text-white"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
