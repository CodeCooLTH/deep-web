'use client'

/**
 * useSheetA11y — เปลือกชีตที่ประกอบเอง (00086 P3: ชีตมอบงาน · ชีตเริ่ม/ทำเสร็จ)
 * ล็อก scroll หน้าหลัง · Esc · ย้ายโฟกัสเข้า (ปุ่ม X) · ขัง Tab · คืนโฟกัสที่เดิมตอนปิด
 *
 * Base: src/components/safepay/service-close/ServiceCloseSheet.tsx (useLockBodyScroll + Esc + focus trap ชุดเดียวกัน)
 * ล็อก scroll ครั้งเดียวต่อชีต (docs/conventions/overlay-scroll-lock.md) — ห้ามเรียก useLockBodyScroll ซ้ำในตัวชีต
 */
import { useEffect, useRef, type RefObject } from 'react'

import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useSheetA11y(
  open: boolean,
  onEscape: () => void,
): { panelRef: RefObject<HTMLDivElement | null>; closeRef: RefObject<HTMLButtonElement | null> } {
  useLockBodyScroll(open)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  // ตัวจัดการ Esc ล่าสุดเสมอ โดยไม่ต้องผูก listener ใหม่ทุก render (hook-return-identity-in-deps)
  const escRef = useRef(onEscape)
  useEffect(() => {
    escRef.current = onEscape
  })

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    const t = setTimeout(() => closeRef.current?.focus(), 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        escRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      restoreRef.current?.focus?.()
    }
  }, [open])

  return { panelRef, closeRef }
}
