'use client'

/**
 * IShipModalShell — เปลือกโมดัลที่ใช้ร่วมกันทั้ง 3 โมดัลของการตั้งค่า iShip
 *
 * มือถือ (<lg): bottom-sheet · desktop: modal กลางจอ — component เดียว responsive
 * React-state ไม่ใช้ Preline `hs-overlay` เพราะ trigger อยู่ในแถวที่ re-render ได้
 * (router.refresh หลังบันทึก + effect อ่าน searchParams ตอน deep-link) ซึ่งทำให้ inline-state
 * ของ Preline ค้าง — บทเรียนเดียวกับ OrderQrSheet/CustomerPanelSheet
 *
 * เพิ่มจาก precedent เดิม: **focus trap จริง** — ของเดิมมีแค่ Esc ปิด ทำให้กด Tab แล้วโฟกัส
 * หลุดไปอยู่หลัง scrim (คีย์บอร์ดหลงทาง ไม่ผ่าน WCAG 2.1 AA ที่ PRODUCT.md บังคับ)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx (offcanvasBottom)
 *       theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx (#standard-modal centered)
 *       in-app precedent: orders/components/OrderQrSheet.tsx (scrim + grip + close)
 */

import { useEffect, useRef } from 'react'
import Icon from '@/components/wrappers/Icon'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

interface Props {
  title: string
  onClose: () => void
  /** ความกว้างบน desktop — เนื้อหาน้อย/มากต่างกัน (Tailwind max-w-* เท่านั้น ไม่ใช่ arbitrary) */
  size?: 'sm' | 'md' | '2xl'
  /** แถบปุ่มล่าง — sticky อยู่ใต้เนื้อหาที่ scroll */
  footer?: React.ReactNode
  children: React.ReactNode
}

const DESKTOP_WIDTH: Record<NonNullable<Props['size']>, string> = {
  sm: 'lg:max-w-sm',
  md: 'lg:max-w-md',
  '2xl': 'lg:max-w-2xl',
}

export default function IShipModalShell({
  title,
  onClose,
  size = 'md',
  footer,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  // เก็บ onClose ไว้ใน ref แล้วให้ effect ด้านล่างรันครั้งเดียวตอน mount
  //
  // เดิม effect ผูก [onClose] ตรง ๆ ซึ่งพังจริง: ผู้เรียกประกาศ handler ใหม่ทุก render
  // (closeSettings ใน ShippingSettingsRow) พอพิมพ์ 1 ตัวอักษร → setState → re-render →
  // onClose เป็น reference ใหม่ → effect รันซ้ำ → โฟกัสเด้งไปปุ่มปิดทุกครั้งที่พิมพ์
  // (user report 2026-07-29) — แก้ที่นี่ ไม่ใช่ให้ผู้เรียกทุกที่ต้องจำ memo handler เอง
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    // โฟกัสแรก: ช่องกรอก/ปุ่มตัวแรกในโมดัล ไม่ใช่ปล่อยค้างอยู่ที่ปุ่มหลัง scrim
    const first = panel.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return

      // focus trap — วน Tab อยู่ในโมดัล ไม่หลุดออกไปข้างหลัง
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      )
      if (items.length === 0) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // mount ครั้งเดียวโดยเจตนา — โฟกัสแรกต้องเกิดตอนเปิดโมดัลเท่านั้น ไม่ใช่ทุก render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    // HR7: z-80 = viewport overlay lock (Paces ไม่มี token; precedent OrderQrSheet/AccountSwitcherSheet)
    <div
      className="fixed inset-0 z-80 flex items-end justify-center lg:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 bg-default-900/40 backdrop-blur-xs"
      />

      {/* HR7: max-h-[92dvh] / safe-area — Paces ไม่มี token สำหรับความสูงหน้าจอมือถือ (precedent sheet อื่น)
          transform-gpu: ทำให้ลูกที่เป็น position:fixed (เช่น AddressSearchSheet ในแท็บที่อยู่ผู้ส่ง)
          ยึดกับ "กรอบโมดัล" แทน viewport — พฤติกรรม CSS: ancestor ที่มี transform เป็น containing block
          ของ fixed descendant ถ้าไม่ใส่ บนเดสก์ท็อป sheet จะกางเต็มจอทับโมดัลจนดูหลุดกรอบ
          (precedent: (chat)/_components/DraftOrderProvider.tsx) */}
      <div
        ref={panelRef}
        className={`relative flex max-h-[92dvh] w-full transform-gpu flex-col rounded-t-2xl bg-card shadow-lg lg:max-h-[85dvh] lg:rounded-2xl ${DESKTOP_WIDTH[size]}`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-default-200 px-5 pb-3 pt-4">
          <div className="absolute inset-x-0 top-2 mx-auto h-1 w-9 rounded-full bg-default-300 lg:hidden" />
          <h5 className="mb-0 min-w-0 flex-1 truncate text-base font-semibold text-default-900">
            {title}
          </h5>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="btn btn-icon shrink-0 text-default-500 hover:bg-default-100"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-default-200 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 lg:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
