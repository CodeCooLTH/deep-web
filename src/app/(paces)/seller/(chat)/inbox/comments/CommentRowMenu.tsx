'use client'

/**
 * CommentRowMenu — เมนูคลิกขวาบนแถวคอมเมนต์ (ส่วนขยาย 2026-08-19, FR-CR-15/17)
 *
 * ทางเข้าที่ 2 คู่กับปุ่มลอยตอน hover ใน CommentsClient.tsx — รายการเดียว: "ทำเครื่องหมายว่าจัดการ
 * แล้ว" / "เลิกทำเครื่องหมาย" สลับตาม `resolved`
 *
 * Base: src/app/(paces)/seller/(chat)/inbox/components/ChatContextMenu.tsx เฉพาะ branch
 * `point` mode (`if (!row) { return createPortal(...) }`) — ตัดโหมด `row` (เบลอฉากหลัง/โคลนแถว/
 * bottom-sheet มือถือ) ทิ้งทั้งหมด เพราะแถวคอมเมนต์มีทางเข้ามือถือแยกอยู่แล้ว (SwipeableRow ปัดซ้าย
 * ใน CommentsClient.tsx) — คลิกขวาเป็นเดสก์ท็อปอย่างเดียว ไม่ต้องมีโหมดกดค้าง
 *
 * ทำไมต้อง portal + fixed + clamp เอง ไม่ใช่ absolute ธรรมดาแบบเมนู ⋯ ใน InboxList.tsx:
 * คอลัมน์ซ้ายของหน้านี้เป็นกล่อง scroll (overflow-y-auto) — `absolute` จะโดน scroll container
 * clip ทันทีที่เมนูเปิดใกล้ขอบล่างของกล่อง (docs/conventions/scroll-container-clips-popovers.md)
 * `position: fixed` ยึด viewport ไม่ยึด scroll container จึงไม่โดนตัด
 *
 * เนื้อในเป็น `.dropdown-item` list ตรง ๆ (Base: theme/paces dropdown) ไม่ใช่ tiles/grid แบบ
 * ChatContextMenu — เมนูนี้มีรายการเดียว ไม่ต้องมีโครงซับซ้อนแบบ CRM
 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'

/** ขนาดโดยประมาณของเมนู (min-w-44 = 176px + กันชนขอบจอ) — ใช้ clamp ตำแหน่งไม่ให้ล้นจอ */
const MENU_WIDTH = 200
const MENU_HEIGHT = 64
/** กันชนขอบจอ (ตัวเดียวกับ EDGE ของ ChatContextMenu.tsx) */
const EDGE = 8

type Props = {
  /** พิกัดเคอร์เซอร์ตอนคลิกขวา (clientX/clientY) */
  x: number
  y: number
  /** true = คอมเมนต์นี้ resolved อยู่แล้ว (mark done แล้ว หรือ Facebook ยืนยันว่าทักไปแล้วนอกระบบ) */
  resolved: boolean
  /** มี PATCH resolve/unresolve ค้างอยู่ของแถวนี้ */
  busy: boolean
  /**
   * แถวนี้ทำเครื่องหมายไม่ได้ พร้อมเหตุผลที่จะแสดง (null = ทำได้)
   *
   * 🛑 เมนูยังต้องเปิด ไม่ใช่ไม่เปิดเลย — รอบแรกซ่อนทางเข้าบนแถวที่ตอบไปแล้ว ผลคือคลิกขวาได้
   * เมนูของเบราว์เซอร์แทน ซึ่งผู้ใช้อ่านว่า "ฟีเจอร์พัง" (user เจอเองบน prod 2026-08-19)
   * ความเงียบไม่อธิบายตัวเอง — เมนูที่บอกว่า "ทำไมทำไม่ได้" ดีกว่าไม่มีเมนู
   */
  unavailableReason?: string | null
  onToggle: () => void
  onClose: () => void
}

export default function CommentRowMenu({ x, y, resolved, busy, unavailableReason, onToggle, onClose }: Props) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)

  // clamp ไม่ให้ล้นขอบขวา/ล่างของจอ — ตรรกะเดียวกับ pointLeft/pointTop ของ ChatContextMenu.tsx
  const left = Math.max(EDGE, Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : x) - MENU_WIDTH))
  const top = Math.max(EDGE, Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : y) - MENU_HEIGHT))

  useEffect(() => {
    function onDoc(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    // หน่วงหนึ่งเฟรมก่อนดัก ไม่งั้น mousedown ของการคลิกขวาครั้งนี้เอง (ที่ทำให้เมนูเปิด) จะไป
    // ปิดเมนูทันทีที่เพิ่งเปิด (บทเรียนเดียวกับ ChatContextMenu/MessageActionBubble)
    const id = setTimeout(() => {
      document.addEventListener('mousedown', onDoc)
      document.addEventListener('touchstart', onDoc)
    }, 0)
    document.addEventListener('keydown', onKey)
    // เลื่อน/ย่อจอขณะเมนูเปิด = ตำแหน่งเคอร์เซอร์เดิมไม่มีความหมายแล้ว ปิดไปเลย (ต่างจากโหมด `row`
    // ของ ChatContextMenu ที่ต้องวัดตำแหน่งใหม่ — ที่นี่ไม่มีแถวลอยให้ต้องตามระยะ)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={t.comments.commentMenuAria}
      style={{ top, left }}
      className="border-default-300 bg-card fixed z-50 min-w-44 overflow-hidden rounded-lg border py-1 shadow-lg"
    >
      <button
        type="button"
        role="menuitem"
        disabled={busy || Boolean(unavailableReason)}
        aria-disabled={busy || Boolean(unavailableReason)}
        onClick={() => {
          if (unavailableReason) return
          onToggle()
          onClose()
        }}
        className="dropdown-item text-sm disabled:opacity-50"
      >
        <Icon icon={resolved ? 'arrow-back-up' : 'circle-check'} className="size-4" />
        {unavailableReason ?? (resolved ? t.comments.unmarkDone : t.comments.markDone)}
      </button>
    </div>,
    document.body,
  )
}
