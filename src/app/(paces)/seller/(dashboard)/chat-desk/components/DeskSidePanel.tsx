'use client'

/**
 * DeskSidePanel — เปลือกแผงข้างของโต๊ะแชท: >=1024 ดึงจากขวา (w-96) · <1024 bottom-sheet
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx (offcanvasRight: bg-card border-s ...)
 *   + โครง scrim/grip/Esc จาก src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerPanelSheet.tsx
 * ขับด้วย React state ไม่ใช้ hs-overlay เพราะหน้านี้ re-render ทุก 8 วินาที (SDS TD-12)
 *
 * วางไว้ใน "เวที" ที่เป็น relative — เดสก์ท็อปแผงจะเกาะขอบขวาของเวที (ตาม mockup) ส่วนมือถือเป็น fixed ทั้งจอ
 * เดสก์ท็อปไม่ใช่ modal (เวทียังคลิกได้) จึงไม่ล็อก scroll/ไม่กับดักโฟกัส ทำเฉพาะมือถือ
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { useMinWidth } from '@/hooks/useMinWidth'

export type DeskSidePanelProps = {
  /** aria-label ของ dialog */
  label: string
  onClose: () => void
  children: ReactNode
}

export default function DeskSidePanel({ label, onClose, children }: DeskSidePanelProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isDesktop = useMinWidth(1024)
  const modal = isDesktop === false
  useLockBodyScroll(modal)
  useDialogFocus(modal, ref, onClose)

  // เดสก์ท็อป: ไม่มีกับดักโฟกัส แต่ Esc ต้องปิดได้เหมือนกัน
  useEffect(() => {
    if (modal) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modal, onClose])

  return (
    // z-80 = ชั้น overlay ของ viewport (Paces ไม่มี token · precedent CustomerPanelSheet.tsx)
    <div className="fixed inset-0 z-80 flex items-end lg:absolute lg:inset-auto lg:end-0 lg:top-0 lg:bottom-0 lg:w-96">
      <button type="button" aria-label="ปิดแผง" tabIndex={-1} onClick={onClose} className="bg-default-900/40 backdrop-blur-xs absolute inset-0 lg:hidden" />
      <div
        ref={ref}
        role="dialog"
        aria-modal={modal}
        aria-label={label}
        tabIndex={-1}
        className="bg-card border-default-300 relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl shadow-lg lg:h-full lg:max-h-none lg:rounded-none lg:border-s" // HR7 carve-out: max-h-[85dvh] ไม่มี token ความสูงอิง viewport ใน Paces (precedent CustomerPanelSheet.tsx)
      >
        <div className="bg-default-300 mx-auto mt-2 mb-1 h-1 w-9 shrink-0 rounded-full lg:hidden" />
        {children}
      </div>
    </div>
  )
}
