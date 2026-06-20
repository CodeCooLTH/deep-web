/**
 * SlipViewer — แสดงสลิปโอนเงินที่ buyer แนบ (S-11)
 *
 * Base: src/app/(paces)/admin/(dashboard)/topups/[id]/SlipImageClient.tsx
 *
 * ทำไมต้องเป็น 'use client':
 * - onError เป็น event handler — ส่งข้าม RSC boundary ไม่ได้
 * - useState สำหรับ toggle แสดง fullscreen overlay
 */
'use client'

import Icon from '@/components/wrappers/Icon'
import { useState } from 'react'

interface SlipViewerProps {
  slipFileId: string
}

export default function SlipViewer({ slipFileId }: SlipViewerProps) {
  const [errored, setErrored] = useState(false)
  const [showFull, setShowFull] = useState(false)

  const src = `/api/files/${slipFileId}`

  if (errored) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-default-400 border border-dashed border-default-300 rounded-xl">
        <Icon icon="photo-off" className="text-3xl" />
        <p className="text-xs">ไม่สามารถโหลดสลิปได้</p>
      </div>
    )
  }

  return (
    <>
      {/* Thumbnail — กด/คลิกเพื่อดูแบบเต็ม */}
      <button
        type="button"
        onClick={() => setShowFull(true)}
        className="group relative block mx-auto overflow-hidden rounded-xl border border-default-300 hover:border-primary transition-colors"
        aria-label="ดูสลิปแบบเต็ม"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="สลิปโอนเงิน"
          className="max-h-48 w-auto object-contain"
          onError={() => setErrored(true)}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-dark/0 group-hover:bg-dark/20 transition-colors">
          <Icon
            icon="zoom-in"
            className="text-white text-2xl opacity-0 group-hover:opacity-100 drop-shadow transition-opacity"
          />
        </span>
      </button>

      {/* Fullscreen overlay */}
      {showFull && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark/80 p-4"
          onClick={() => setShowFull(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white hover:text-default-200"
            onClick={() => setShowFull(false)}
            aria-label="ปิด"
          >
            <Icon icon="x" className="text-3xl" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="สลิปโอนเงิน (เต็ม)"
            className="max-h-screen max-w-screen object-contain rounded-xl shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onError={() => { setErrored(true); setShowFull(false) }}
          />
        </div>
      )}
    </>
  )
}
