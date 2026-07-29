'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/notifications/page.tsx (Stacking variant, บรรทัด 147–195)
 *
 * Mount จุดเดียวใน AppProvidersWrapper — subscribe CustomEvent 'paces:toast'
 * แล้ว render PacesToastItem แบบ stacking. Placement = bottom-right (เลือกโดย user).
 * แทน <ToastContainer> ของ react-toastify ทั้งหมดในฝั่ง (paces).
 */

import PacesToastItem from '@/components/paces/PacesToastItem'
import { PACES_TOAST_EVENT, type PacesToastDetail, type PacesToastPlacement } from '@/lib/paces-toast'
import { useEffect, useState } from 'react'

interface ToastEntry extends PacesToastDetail {
  id: number
}

const MAX_VISIBLE = 5 // กัน toast ล้นจอเมื่อยิงรัว ๆ — เก่าสุดของ placement เดียวกันถูกตัดทิ้ง

let seq = 0

export default function PacesToastContainer() {
  const [toasts, setToasts] = useState<ToastEntry[]>([])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PacesToastDetail>).detail
      if (!detail) return
      setToasts((prev) => {
        const entry: ToastEntry = { ...detail, id: ++seq }
        const next = [...prev, entry]
        // cap แยกตาม placement — chat (bottom) ยิงรัว ๆ ไม่ดัน action (top) ทิ้ง
        const same = next.filter((t) => t.placement === entry.placement)
        if (same.length > MAX_VISIBLE) {
          const oldestId = same[0].id
          return next.filter((t) => t.id !== oldestId)
        }
        return next
      })
    }
    window.addEventListener(PACES_TOAST_EVENT, handler)
    return () => window.removeEventListener(PACES_TOAST_EVENT, handler)
  }, [])

  const remove = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))

  if (toasts.length === 0) return null

  // z-[1080] เพราะ Paces ไม่มี z-toast token; สูงกว่า modal/offcanvas overlay
  const regionClass: Record<PacesToastPlacement, string> = {
    'top-right': 'fixed end-4 top-4 z-[1080] flex flex-col gap-3',
    'bottom-right': 'fixed end-4 bottom-4 z-[1080] flex flex-col gap-3',
  }

  const renderRegion = (placement: PacesToastPlacement) => {
    const items = toasts.filter((t) => t.placement === placement)
    if (items.length === 0) return null
    return (
      <div className={regionClass[placement]} aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <PacesToastItem
            key={t.id}
            id={t.id}
            type={t.type}
            message={t.message}
            duration={t.duration}
            chatMessage={t.chatMessage}
            onClose={remove}
          />
        ))}
      </div>
    )
  }

  return (
    <>
      {renderRegion('top-right')}
      {renderRegion('bottom-right')}
    </>
  )
}
