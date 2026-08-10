'use client'

/**
 * ReviewImageGallery — รูปย่อที่ผู้ซื้อแนบมากับรีวิว + lightbox เต็มจอ (feature 00041, BR-BOE-19)
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/[token]/components/SlipViewer.tsx
 *   (โครง controlled overlay + useLockBodyScroll + Escape + คลิกฉากหลังเพื่อปิด)
 *   ขยายจาก "รูปเดียว" เป็น "อาเรย์ + ดัชนี" และเพิ่มปุ่มเลื่อนซ้าย-ขวา
 *
 * ไม่ใช้ HSOverlay ของ Preline เพราะโปรเจกต์นี้แปลง overlay เป็น controlled div ด้วย React state
 * เป็นมาตรฐานอยู่แล้ว (Preline พังเมื่อ re-render) — ซึ่งแปลว่าต้องเรียก `useLockBodyScroll` เอง
 * ไม่งั้นบนมือถือจะลากหน้าข้างหลังทะลุออกไปได้ขณะเปิดรูป
 */

import { useCallback, useEffect, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

type Props = {
  images: string[]
  /** ขนาดรูปย่อ — เดสก์ท็อปในตารางเล็กกว่ามือถือเล็กน้อย */
  thumbClassName?: string
}

const ReviewImageGallery = ({ images, thumbClassName = 'size-12' }: Props) => {
  // null = ปิดอยู่ · ตัวเลข = ดัชนีรูปที่กำลังเปิด (0 เป็นค่าที่ถูกต้อง จึงใช้ null ไม่ใช่ falsy)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [broken, setBroken] = useState<Record<string, boolean>>({})

  const isOpen = openIndex !== null

  useLockBodyScroll(isOpen)

  const close = useCallback(() => setOpenIndex(null), [])
  const step = useCallback(
    (delta: number) => {
      setOpenIndex((cur) => (cur === null ? cur : (cur + delta + images.length) % images.length))
    },
    [images.length],
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

  if (images.length === 0) return null

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {images.map((fileId, i) =>
          broken[fileId] ? (
            // รูปพังทีละใบ → แทนที่เฉพาะใบนั้น ไม่ซ่อนทั้งแถว (ไม่งั้นผู้ขายไม่รู้ว่าลูกค้าแนบมากี่ใบ)
            <div
              key={fileId}
              className={`${thumbClassName} bg-default-100 text-default-300 flex items-center justify-center rounded-md`}
            >
              <Icon icon="photo-off" className="text-base" />
            </div>
          ) : (
            <button
              key={fileId}
              type="button"
              onClick={() => setOpenIndex(i)}
              className={`${thumbClassName} overflow-hidden rounded-md`}
              aria-label={`ดูรูปแนบรีวิว ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- fileId เป็น dynamic route ที่ไม่ผ่าน image optimizer */}
              <img
                src={`/api/files/${fileId}`}
                // alt ว่างโดยตั้งใจ — ปุ่มที่ครอบมี aria-label อยู่แล้ว ใส่ทั้งคู่ = อ่านซ้ำสองรอบ
                alt=""
                className="size-full object-cover"
                onError={() => setBroken((prev) => ({ ...prev, [fileId]: true }))}
              />
            </button>
          ),
        )}
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="รูปแนบรีวิว"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label="ปิด"
            className="btn btn-icon absolute end-4 top-4 size-11 bg-light/20 text-white hover:bg-light/30"
          >
            <Icon icon="x" className="text-xl" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="รูปก่อนหน้า"
                // stopPropagation: ปุ่มอยู่บนฉากหลังที่ผูก onClick=close ไว้ ถ้าไม่กันไว้ กดเลื่อนรูป
                // จะปิด lightbox ทิ้งทุกครั้ง
                onClick={(e) => {
                  e.stopPropagation()
                  step(-1)
                }}
                className="btn btn-icon absolute start-4 top-1/2 size-11 -translate-y-1/2 bg-light/20 text-white hover:bg-light/30"
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
                className="btn btn-icon absolute end-4 top-1/2 size-11 -translate-y-1/2 bg-light/20 text-white hover:bg-light/30"
              >
                <Icon icon="chevron-right" className="text-xl" />
              </button>
            </>
          )}

          {images.length > 1 && (
            <span className="text-default-100 absolute bottom-6 text-sm tabular-nums">
              {openIndex + 1} / {images.length}
            </span>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element -- เหตุผลเดียวกับรูปย่อ */}
          <img
            src={`/api/files/${images[openIndex]}`}
            alt={`รูปแนบรีวิว ${openIndex + 1}`}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

export default ReviewImageGallery
