'use client'

import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * กักโฟกัสไว้ในโมดัล (Tab/Shift+Tab วนในกล่อง) + โฟกัสตัวแรกตอนเปิด + คืนโฟกัสให้ element เดิมตอนปิด (WCAG 2.4.3)
 * ไม่จัดการ Escape — ผู้เรียกมีเงื่อนไขปิดของตัวเอง (เช่น ถามก่อนทิ้งการแก้)
 *
 * ลอกตรรกะจาก src/components/safepay/iship/IShipModalShell.tsx (mount ครั้งเดียว: ใส่ deps อื่นแล้วโฟกัสเด้งทุก render — บั๊กที่ shell นั้นเคยโดน)
 * shortcut: IShipModalShell ยังมีสำเนาของตัวเอง — ย้ายไปใช้ hook นี้เมื่อแตะไฟล์นั้นครั้งถัดไป
 */
export function useFocusTrap(panelRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const previous = document.activeElement as HTMLElement | null
    panel.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
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
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
    // mount ครั้งเดียวโดยเจตนา
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
