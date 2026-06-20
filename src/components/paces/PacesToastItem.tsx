'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/notifications/page.tsx (Basic variant, บรรทัด 44–58)
 *
 * Toast เดี่ยวของระบบ Paces — markup คัดจาก reference (header brand-row + body):
 *   - container: bg-default-100 border-default-300 rounded-md border shadow
 *   - header: logo-sm + "Deep" + relative time + close (×)
 *   - body: semantic icon (success/error/warning/info) + ข้อความ
 * ปรับจาก reference: ตัด data-hs-remove-element (Preline DOM-remove ชน React reconcile)
 *   → จัดการ dismiss + slide-out ด้วย React state เอง; ใส่ semantic icon ใน body;
 *   relative time สด (เลือกโดย user) แทน "11 mins ago" คงที่.
 */

import logoSm from '@/assets/images/logo-sm.png'
import { relativeTimeTh } from '@/lib/relative-time-th'
import type { PacesToastType } from '@/lib/paces-toast'
import { Icon } from '@iconify/react'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

const VARIANT: Record<PacesToastType, { icon: string; color: string }> = {
  success: { icon: 'tabler:circle-check', color: 'text-success' },
  error: { icon: 'tabler:alert-circle', color: 'text-danger' },
  warning: { icon: 'tabler:alert-triangle', color: 'text-warning' },
  info: { icon: 'tabler:info-circle', color: 'text-info' },
}

const EXIT_MS = 300 // ต้องตรงกับ `transition-all duration-300` บน container ด้านล่าง (ถ้าแก้ duration ต้องแก้คู่กัน)

interface Props {
  id: number
  type: PacesToastType
  message: string
  duration: number
  onClose: (id: number) => void
}

export default function PacesToastItem({ id, type, message, duration, onClose }: Props) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const createdAt = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const deadlineRef = useRef(0)
  const remainingRef = useRef(duration)

  const variant = VARIANT[type]

  const dismiss = () => {
    setLeaving((prev) => {
      if (prev) return prev
      setTimeout(() => onClose(id), EXIT_MS)
      return true
    })
  }

  const startTimer = (ms: number) => {
    if (duration <= 0) return // duration 0 = sticky
    clearTimeout(timerRef.current)
    deadlineRef.current = Date.now() + ms
    timerRef.current = setTimeout(dismiss, ms)
  }

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    startTimer(duration)
    const tick = setInterval(() => setNowTick(Date.now()), 10_000)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timerRef.current)
      clearInterval(tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pause = () => {
    if (duration <= 0) return
    clearTimeout(timerRef.current)
    remainingRef.current = Math.max(0, deadlineRef.current - Date.now())
  }
  const resume = () => startTimer(remainingRef.current)

  const shown = visible && !leaving

  return (
    <div
      role="alert"
      tabIndex={-1}
      onMouseEnter={pause}
      onMouseLeave={resume}
      // w-80 + max-w กัน overflow บนจอเล็ก (Paces ไม่มี token responsive-width ตรงนี้)
      className={`bg-default-100 border-default-300 w-80 max-w-[calc(100vw-2rem)] rounded-md border shadow transition-all duration-300 ${
        shown ? 'translate-x-0 opacity-100' : 'translate-x-5 opacity-0'
      }`}>
      <div className="border-default-300 flex items-center border-b px-3 py-2">
        <p className="text-default-600 flex items-center gap-1.5 text-sm">
          <Image src={logoSm} alt="Deep" className="size-4" />
          <strong className="font-semibold">Deep</strong>
        </p>
        <div className="ms-auto flex items-center gap-2">
          <span className="text-default-400 text-xs">{relativeTimeTh(createdAt.current, nowTick)}</span>
          <button
            type="button"
            onClick={dismiss}
            aria-label="ปิด"
            className="flex items-center justify-center opacity-50 hover:opacity-100 focus:opacity-100 focus:outline-hidden">
            <Icon icon="tabler:x" className="text-default-800 size-6" />
          </button>
        </div>
      </div>
      <div className="flex items-start gap-2 p-3 text-sm">
        <Icon icon={variant.icon} className={`${variant.color} mt-0.5 size-4 shrink-0`} />
        <span className="text-default-700">{message}</span>
      </div>
    </div>
  )
}
