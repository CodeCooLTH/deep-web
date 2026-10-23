'use client'

/**
 * PodPhotoGallery — รูปหลักฐานการส่งจาก Flash (ลายเซ็น + รูปหน้างาน) + lightbox (feature 00084 §4.8)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reviews/components/ReviewImageGallery.tsx
 *   (ไม่มี lightbox ตรงใน Paces — theme/paces/Admin/TS/src/app/(admin)/pages/gallery/components/Gallery.tsx
 *    ใช้ lib ภายนอก; ใช้โครง controlled overlay + useLockBodyScroll + Esc/ลูกศรของ precedent ในแอป)
 *
 * ต่างจากต้นแบบ 3 จุด:
 *  - รับ URL ภายนอกของ Flash (ไม่ใช่ /api/files/{id}) ⇒ referrerPolicy="no-referrer" ทุกรูป
 *    กัน token ของคำสั่งซื้อใน URL หน้านี้รั่วไปยัง Flash ผ่าน Referer
 *  - รูปเปิดไม่ได้ = ช่อง photo-off + ข้อความ "เปิดรูปไม่ได้" (text-default-700 ผ่านคอนทราสต์)
 *    + ลิงก์ไปยัง URL เดิม เผื่อเปิดในแท็บได้ — ไม่ใช้ text-default-300 แบบต้นแบบ
 *  - ป้ายชื่อรูปเป็นไทยต่อรูป (ลายเซ็น / รูปที่ N)
 */

import { useCallback, useEffect, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

export type PodPhoto = { url: string; label: string }

const BrokenNote = ({ url }: { url: string }) => (
  <>
    <Icon icon="photo-off" className="text-default-700 text-base" aria-hidden="true" />
    <span className="text-default-700 text-2xs">เปิดรูปไม่ได้</span>
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary-ink text-2xs underline"
    >
      เปิดลิงก์ของ Flash
    </a>
  </>
)

export default function PodPhotoGallery({ photos }: { photos: PodPhoto[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [broken, setBroken] = useState<Record<string, boolean>>({})
  const isOpen = openIndex !== null

  useLockBodyScroll(isOpen)

  const close = useCallback(() => setOpenIndex(null), [])
  const step = useCallback(
    (delta: number) => {
      setOpenIndex((cur) => (cur === null ? cur : (cur + delta + photos.length) % photos.length))
    },
    [photos.length],
  )

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close, step])

  if (photos.length === 0) return null

  const current = openIndex === null ? null : photos[openIndex]

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) =>
          broken[p.url] ? (
            // รูปพังทีละใบ แทนเฉพาะใบนั้น — ไม่ซ่อนทั้งแถว (ร้านต้องรู้ว่ามีหลักฐานกี่ใบ)
            <div
              key={p.url}
              className="bg-default-100 flex min-h-20 w-28 flex-col items-center justify-center gap-0.5 rounded-lg p-1 text-center"
            >
              <BrokenNote url={p.url} />
            </div>
          ) : (
            <button
              key={p.url}
              type="button"
              onClick={() => setOpenIndex(i)}
              className="ring-default-200 size-20 overflow-hidden rounded-lg ring-1"
              aria-label={`ดู${p.label}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- URL ภายนอกของ Flash ไม่ผ่าน image optimizer */}
              <img
                src={p.url}
                alt=""
                referrerPolicy="no-referrer"
                className="size-full object-cover"
                onError={() => setBroken((prev) => ({ ...prev, [p.url]: true }))}
              />
            </button>
          ),
        )}
      </div>

      {current && openIndex !== null && (
        <div
          className="bg-dark/80 fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="หลักฐานการส่ง"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label="ปิด"
            className="btn btn-icon bg-light/20 hover:bg-light/30 absolute end-4 top-4 size-11 text-white"
          >
            <Icon icon="x" className="text-xl" />
          </button>

          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="รูปก่อนหน้า"
                // stopPropagation: ปุ่มอยู่บนฉากหลังที่ผูก close ไว้ ไม่กันจะปิด lightbox ทุกครั้งที่เลื่อน
                onClick={(e) => {
                  e.stopPropagation()
                  step(-1)
                }}
                className="btn btn-icon bg-light/20 hover:bg-light/30 absolute start-4 top-1/2 size-11 -translate-y-1/2 text-white"
              >
                <Icon icon="chevron-left" className="text-xl" />
              </button>
              <button
                type="button"
                aria-label="รูปถัดไป"
                onClick={(e) => {
                  e.stopPropagation()
                  step(1)
                }}
                className="btn btn-icon bg-light/20 hover:bg-light/30 absolute end-4 top-1/2 size-11 -translate-y-1/2 text-white"
              >
                <Icon icon="chevron-right" className="text-xl" />
              </button>
              <span className="text-default-100 absolute bottom-6 text-sm tabular-nums">
                {openIndex + 1} / {photos.length}
              </span>
            </>
          )}

          {broken[current.url] ? (
            <div
              className="bg-default-100 flex flex-col items-center gap-1 rounded-lg p-4 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <BrokenNote url={current.url} />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- เหตุผลเดียวกับรูปย่อ
            <img
              src={current.url}
              alt={current.label}
              referrerPolicy="no-referrer"
              className="max-h-full max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
              onError={() => setBroken((prev) => ({ ...prev, [current.url]: true }))}
            />
          )}
        </div>
      )}
    </>
  )
}
