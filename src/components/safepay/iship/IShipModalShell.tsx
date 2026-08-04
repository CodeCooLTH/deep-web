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
  /**
   * แถบใต้หัวโมดัลที่ไม่เลื่อนตามเนื้อหา — ใช้กับตัวเลือกที่ต้องกดสลับได้ตลอดเวลา (segmented)
   *
   * เป็น "แถวโครงสร้าง" (sibling ของกล่อง scroll) ไม่ใช่ `sticky top-0` ที่วางไว้ในกล่อง scroll
   * โดยเจตนา: `bodyClassName` มีสองค่า (`px-5 py-4` กับ `''`) ตัว sticky จะเกาะที่ padding-box
   * ของกล่อง scroll แถบเดียวกันจึงลอยห่างขอบไม่เท่ากันข้ามโหมด และเนื้อหาที่มีเส้นคั่น
   * เต็มความกว้างจะเลื่อนลอดใต้มัน ต้องไล่แก้ z-index/พื้นทึบตามอีก — แถวโครงสร้างไม่มีปัญหานี้เลย
   */
  tabs?: React.ReactNode
  /**
   * กำลังส่งคำขอที่ยกเลิกกลางทางไม่ได้ — Escape/scrim/ปุ่ม X หยุดทำงานชั่วคราว
   *
   * ที่มา: Impeccable critique 2026-08-04 (P0) — ปิดโมดัลระหว่าง POST ที่เปิดพัสดุจริง
   * ไม่ได้ยกเลิกคำขอ พัสดุถูกเปิดและถูกคิดเงินไปแล้ว แต่ร้านเสียเลขพัสดุกับใบปะหน้าไป
   * ปุ่มยังอยู่ที่เดิม (ไม่หาย) แต่จางลงและกดไม่ติด — ผู้ใช้ต้องเห็นว่า "กดไม่ได้ตอนนี้"
   * โดยไม่ต้องอ่านคำอธิบาย (PRODUCT.md: กลุ่ม digital-literacy ต่ำ)
   */
  busy?: boolean
  /**
   * class ของกล่องเนื้อหาที่ scroll ได้ — ไม่ส่ง = `px-5 py-4` (พฤติกรรมเดิมของ caller ทั้ง 3 ตัวใน settings)
   * ส่งค่าว่างเมื่อเนื้อในมี padding/เส้นคั่นเต็มความกว้างของตัวเองอยู่แล้ว (ShipmentPanel)
   */
  bodyClassName?: string
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
  tabs,
  busy = false,
  bodyClassName = 'px-5 py-4',
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  // element ที่โฟกัสอยู่ก่อนเปิดโมดัล — คืนโฟกัสให้ตอนปิด ไม่งั้นคนใช้คีย์บอร์ดถูกดีดไป
  // ต้นหน้าและต้องไล่ Tab กลับมาที่ปุ่มเดิมเอง (WCAG 2.4.3)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // เก็บ onClose ไว้ใน ref แล้วให้ effect ด้านล่างรันครั้งเดียวตอน mount
  //
  // เดิม effect ผูก [onClose] ตรง ๆ ซึ่งพังจริง: ผู้เรียกประกาศ handler ใหม่ทุก render
  // (closeSettings ใน ShippingSettingsRow) พอพิมพ์ 1 ตัวอักษร → setState → re-render →
  // onClose เป็น reference ใหม่ → effect รันซ้ำ → โฟกัสเด้งไปปุ่มปิดทุกครั้งที่พิมพ์
  // (user report 2026-07-29) — แก้ที่นี่ ไม่ใช่ให้ผู้เรียกทุกที่ต้องจำ memo handler เอง
  const onCloseRef = useRef(onClose)
  // เหตุผลเดียวกับ onCloseRef: effect ด้านล่างต้องรันครั้งเดียวตอน mount แต่ busy
  // เปลี่ยนค่าระหว่างทาง จึงอ่านผ่าน ref แทนการใส่ใน dependency (ซึ่งจะทำให้โฟกัสเด้ง
  // ทุกครั้งที่เริ่ม/จบการส่งฟอร์ม — บั๊กเดิมของ ShipmentEntryModal ที่งานนี้กำลังแก้)
  const busyRef = useRef(busy)
  useEffect(() => {
    onCloseRef.current = onClose
    busyRef.current = busy
  })

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    previouslyFocused.current = document.activeElement as HTMLElement | null

    // โฟกัสแรก: ช่องกรอก/ปุ่มตัวแรกในโมดัล ไม่ใช่ปล่อยค้างอยู่ที่ปุ่มหลัง scrim
    const first = panel.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (busyRef.current) return
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
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused.current?.focus?.()
    }
    // mount ครั้งเดียวโดยเจตนา — โฟกัสแรกต้องเกิดตอนเปิดโมดัลเท่านั้น ไม่ใช่ทุก render
    // (deps ว่างจริง ๆ จึงคืนโฟกัสตอน unmount เท่านั้น ไม่ใช่ทุกครั้งที่ busy เปลี่ยน)
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
      {/* scrim: เป็นทางลัดของเมาส์เท่านั้น — ซ่อนจาก a11y tree และถอดออกจากลำดับ Tab
          เพราะปุ่ม X ที่หัวโมดัลคือทางปิดที่ประกาศชื่อไว้แล้ว ถ้าปล่อยไว้ dialog เดียวจะมี
          element ชื่อ "ปิด" สองตัวซึ่ง screen reader อ่านซ้ำโดยไม่มีความหมายเพิ่ม */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        disabled={busy}
        onClick={onClose}
        className="absolute inset-0 bg-default-900/40 backdrop-blur-xs disabled:cursor-not-allowed"
      />

      {/* HR7: max-h-[92dvh] / safe-area — Paces ไม่มี token สำหรับความสูงหน้าจอมือถือ (precedent sheet อื่น)
          transform-gpu: ทำให้ลูกที่เป็น position:fixed (เช่น AddressSearchSheet ในแท็บที่อยู่ผู้ส่ง)
          ยึดกับ "กรอบโมดัล" แทน viewport — พฤติกรรม CSS: ancestor ที่มี transform เป็น containing block
          ของ fixed descendant ถ้าไม่ใส่ บนเดสก์ท็อป sheet จะกางเต็มจอทับโมดัลจนดูหลุดกรอบ
          (precedent: (chat)/_components/DraftOrderProvider.tsx) */}
      {/* มี tabs = โมดัลที่สลับเนื้อหาได้ → **ล็อกความสูงจริง** ไม่ใช่เพดาน เพราะเนื้อของแต่ละแท็บ
          ยาวไม่เท่ากันมาก (ส่งเอง 2 ช่อง vs สร้างพัสดุ ~1,600px) กล่องจึงกระโดดทั้งใบทุกครั้ง
          ที่สลับแท็บ และปุ่มหลักย้ายตำแหน่งตาม (user report 2026-08-04)
          ค่าเท่าเพดานเดิม — 2 ใน 3 แท็บชนเพดานอยู่แล้ว จึงเปลี่ยนหน้าตาเฉพาะแท็บที่เนื้อสั้น
          ไม่มี tabs (mode='edit', 3 โมดัลในหน้าตั้งค่า) = สถานะเดียวไม่มีการสลับ → คงเพดานเดิม
          ไม่งั้นฟอร์ม 2 ช่องจะได้กล่องสูงเต็มจอโดยไม่มีเหตุผล */}
      <div
        ref={panelRef}
        className={`relative flex ${tabs ? 'h-[92dvh] lg:h-[85dvh]' : 'max-h-[92dvh] lg:max-h-[85dvh]'} w-full transform-gpu flex-col rounded-t-2xl bg-card shadow-lg lg:rounded-2xl ${DESKTOP_WIDTH[size]}`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-default-200 px-5 pb-3 pt-4">
          <div className="absolute inset-x-0 top-2 mx-auto h-1 w-9 rounded-full bg-default-300 lg:hidden" />
          <h5 className="mb-0 min-w-0 flex-1 truncate text-base font-semibold text-default-900">
            {title}
          </h5>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="ปิด"
            // min-h-11/min-w-11: tap target ≥44px ตาม PRODUCT.md §Accessibility
            // (.btn-icon ของ Paces = size-9.25 ≈ 37px ซึ่งต่ำกว่าเกณฑ์)
            className="btn btn-icon min-h-11 min-w-11 shrink-0 text-default-700 hover:bg-default-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        {/* px-5 ให้ตรงแนวตั้งกับหัวโมดัลและ footer; border-b เส้นทึบต่อภาษาจากหัว
            (ไม่ใช้เส้นประ — เส้นประเป็นของ .card-header ในเนื้อหาหน้า ไม่ใช่ chrome ของโมดัล)
            ไม่มีเงา เพราะไม่มีอะไรเลื่อนลอดใต้มัน เนื้อหาเริ่มต่อจากแถวนี้เสมอ */}
        {tabs && (
          <div className="shrink-0 border-b border-default-200 px-5 py-3">{tabs}</div>
        )}

        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-default-200 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 lg:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
