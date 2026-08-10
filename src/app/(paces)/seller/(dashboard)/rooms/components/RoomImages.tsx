'use client'

/**
 * RoomImages — อัปโหลด/จัดลำดับรูปห้องพัก (feature 00017 Phase 1, FR-LODG-05)
 *
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductImages.tsx
 *   (chase ของ theme — โครง .card + FileUploader + grid preview + ปุ่มลบมุมรูป)
 *
 * ต่างจาก ProductImages 2 อย่างที่ P1 ต้องมี (Design Spec §4):
 *   1. จัดลำดับได้ (drag บน desktop + ปุ่มลูกศรบนมือถือ) — ลำดับใน array = ลำดับแสดงผล
 *   2. รูปแรก = รูปหลัก มีป้ายบอกชัด + ปุ่ม "ตั้งเป็นรูปหลัก"
 *
 * ทำไมไม่แก้ ProductImages ให้รองรับทั้งคู่: หน้าสินค้าใช้งานจริงบน prod อยู่แล้ว
 * การเพิ่ม reorder เข้าไปเปลี่ยนพฤติกรรมของมันโดยไม่มีใครขอ = นอกขอบเขต P1 และเสี่ยงฟรี
 *
 * IMPORTANT: ไม่มี field แยกสำหรับ "รูปหลัก" — ลำดับ array เป็น SSOT เดียว
 * ตรงกับ schema Room.images (Json array) ที่ตัวแรกคือรูปหลักเสมอ
 */

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { uploadFileId } from '@/lib/upload-client'
import FileUploader from '@/components/FileUploader'
import { MAX_ROOM_IMAGES } from '@/lib/lodging'

interface RoomImagesProps {
  value: string[]
  onChange: (next: string[]) => void
}

type UploadingItem = { key: string; name: string; previewUrl: string }

/** รูปอาจเป็น full URL (seed/CDN) หรือ storage fileId — mirror guard ของหน้าสินค้า */
function imageSrc(id: string): string {
  return id.startsWith('http') ? id : `/api/files/${id}`
}

export default function RoomImages({ value, onChange }: RoomImagesProps) {
  const [uploading, setUploading] = useState<UploadingItem[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  // แก้ stale closure กรณี user drop หลาย batch ก่อน batch แรก resolve
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  const remainingSlots = Math.max(0, MAX_ROOM_IMAGES - value.length - uploading.length)
  const isFull = remainingSlots <= 0

  const uploadOne = useCallback(async (file: File, key: string) => {
    try {
      // direct upload (2026-08-10) — ไม่ผ่าน body ของ function ที่ Vercel จำกัด 4.5MB
      return await uploadFileId(file, 'IMAGE')
    } catch (err) {
      pacesToast.error(`${file.name}: ${err instanceof Error && err.message ? err.message : 'อัปโหลดไม่สำเร็จ'}`)
      return null
    } finally {
      setUploading((prev) => {
        const found = prev.find((u) => u.key === key)
        if (found) URL.revokeObjectURL(found.previewUrl)
        return prev.filter((u) => u.key !== key)
      })
    }
  }, [])

  const handleSetFiles = useCallback(
    (incoming: File[] | undefined) => {
      if (!incoming || incoming.length === 0) return

      const slots = Math.max(0, MAX_ROOM_IMAGES - value.length - uploading.length)
      const accepted = incoming.slice(0, slots)
      if (accepted.length < incoming.length) {
        pacesToast.warning(`เพิ่มรูปได้สูงสุด ${MAX_ROOM_IMAGES} รูปต่อห้อง`)
      }
      if (accepted.length === 0) return

      const items: UploadingItem[] = accepted.map((f) => {
        // revoke preview ที่ FileUploader แปะมา ไม่งั้น blob URL leak (เราส่ง files=[] ให้มัน)
        const withPreview = f as File & { preview?: string }
        if (withPreview.preview) URL.revokeObjectURL(withPreview.preview)
        return {
          key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: f.name,
          previewUrl: URL.createObjectURL(f),
        }
      })
      setUploading((prev) => [...prev, ...items])

      Promise.all(accepted.map((file, idx) => uploadOne(file, items[idx]!.key))).then((results) => {
        const newIds = results.filter((r): r is string => !!r)
        if (newIds.length > 0) onChange([...valueRef.current, ...newIds])
      })
    },
    [value.length, uploading.length, onChange, uploadOne],
  )

  const remove = useCallback(
    (id: string) => onChange(value.filter((x) => x !== id)),
    [value, onChange],
  )

  /** ย้ายรูปจากตำแหน่ง from ไป to — ใช้ทั้ง drag และปุ่มลูกศร */
  const move = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= value.length || from === to) return
      const next = [...value]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved!)
      onChange(next)
    },
    [value, onChange],
  )

  const makeMain = useCallback((index: number) => move(index, 0), [move])

  return (
    <div className="card">
      <div className="card-header p-5">
        <h4 className="card-title mb-1.25">รูปภาพห้องพัก</h4>
        <p className="text-default-400">
          รองรับ .png .jpg .jpeg .webp ขนาดไม่เกิน 10 MB — รูปแรกคือรูปหลักที่แสดงบนโปรไฟล์ร้าน
        </p>
        <p className="text-default-500 mt-2 text-sm">
          {value.length + uploading.length} / {MAX_ROOM_IMAGES} รูป
        </p>
      </div>

      <div className="card-body">
        <FileUploader
          files={[]}
          setFiles={handleSetFiles}
          accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }}
          maxSize={1024 * 1024 * 10}
          maxFileCount={MAX_ROOM_IMAGES}
          multiple
          disabled={isFull}
          className="mb-3"
        />

        {(value.length > 0 || uploading.length > 0) && (
          <>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {value.map((id, index) => (
                <div
                  key={id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null) move(dragIndex, index)
                    setDragIndex(null)
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`border-default-300 relative overflow-hidden rounded-lg border ${
                    dragIndex === index ? 'opacity-50' : ''
                  } ${index === 0 ? 'ring-primary ring-2' : ''}`}
                >
                  <Image
                    src={imageSrc(id)}
                    alt={index === 0 ? 'รูปหลักของห้องพัก' : `รูปห้องพักลำดับที่ ${index + 1}`}
                    width={120}
                    height={120}
                    className="aspect-square h-auto w-full cursor-move object-cover"
                  />

                  {/* ★ = typographic dingbat สีเดียว (carve-out ที่อนุญาต ไม่ใช่ emoji) */}
                  {index === 0 && (
                    <span className="bg-primary absolute start-1 top-1 rounded px-1.5 py-0.5 text-xs text-white">
                      ★ รูปหลัก
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => remove(id)}
                    className="bg-danger absolute end-1 top-1 inline-flex size-6 items-center justify-center rounded-full text-white shadow"
                    aria-label={`ลบรูปลำดับที่ ${index + 1}`}
                  >
                    <Icon icon="tabler:x" className="size-4" />
                  </button>

                  {/* ปุ่มลูกศร — drag บนมือถือใช้ยาก ต้องมีทางเลือกที่แตะได้เสมอ */}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/40 px-1 py-0.5">
                    <button
                      type="button"
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0}
                      className="inline-flex size-6 items-center justify-center rounded text-white disabled:opacity-30"
                      aria-label="ย้ายไปก่อนหน้า"
                    >
                      <Icon icon="tabler:chevron-left" className="size-4" />
                    </button>
                    {index !== 0 && (
                      <button
                        type="button"
                        onClick={() => makeMain(index)}
                        className="rounded px-1 text-xs text-white"
                      >
                        ตั้งเป็นรูปหลัก
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => move(index, index + 1)}
                      disabled={index === value.length - 1}
                      className="inline-flex size-6 items-center justify-center rounded text-white disabled:opacity-30"
                      aria-label="ย้ายไปถัดไป"
                    >
                      <Icon icon="tabler:chevron-right" className="size-4" />
                    </button>
                  </div>
                </div>
              ))}

              {uploading.map((u) => (
                <div
                  key={u.key}
                  // aspect-square ย้ายมาที่กรอบ (div นี้ relative+overflow-hidden อยู่แล้ว) — เดิมอยู่ที่
                  // <img> ซึ่งเป็น replaced element จึงคุม ratio ไม่ได้จริง (h-auto ยิ่งยืนยันว่าความสูง
                  // มาจากสัดส่วนไฟล์) รูปแต่ละใบเลยสูงไม่เท่ากันในกริดเดียวกัน
                  className="border-default-300 relative aspect-square overflow-hidden rounded-lg border opacity-60"
                >
                  {/* blob: URL — next/image ไม่รองรับและจะ warn */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.previewUrl} alt={u.name} className="absolute inset-0 size-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Icon icon="tabler:loader-2" className="size-6 animate-spin text-white" />
                  </div>
                </div>
              ))}
            </div>

            {value.length > 1 && (
              <p className="text-default-400 mt-3 text-sm">
                ลากรูปเพื่อจัดลำดับ หรือใช้ปุ่มลูกศรใต้รูป
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
