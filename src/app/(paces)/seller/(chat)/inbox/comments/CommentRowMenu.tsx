'use client'

/**
 * CommentRowMenu — เมนูคลิกขวาบนแถวคอมเมนต์ (ส่วนขยาย 2026-08-19, FR-CR-15/17)
 *
 * ทางเข้าที่ 2 คู่กับปุ่มลอยตอน hover ใน CommentsClient.tsx — รายการเดียว: "ทำเครื่องหมายว่าจัดการ
 * แล้ว" / "เลิกทำเครื่องหมาย" สลับตาม `resolved`
 *
 * Base: src/app/(paces)/seller/(chat)/inbox/components/ChatContextMenu.tsx เฉพาะ branch
 * `point` mode (`if (!row) { return createPortal(...) }`)
 *
 * 🛑 **มติเดิม (2026-08-19) เคยเขียนไว้ตรงนี้ว่า "ตัดโหมด row ทิ้ง เพราะมือถือมี SwipeableRow
 * อยู่แล้ว" — user เห็นของจริงแล้วสั่งกลับเมื่อ 2026-08-20**: "ให้ทำ long press ให้หน่อย ใน mobile
 * เหมือน long press ใน chat lists". เก็บประโยคนี้ไว้แทนการลบเงียบ ๆ เพื่อไม่ให้คนถัดไปอ่านเจอ
 * มติเก่าที่ไหนสักที่แล้วเข้าใจว่าโค้ดทำผิดมติ. ปัดซ้าย **ยังอยู่** ทั้งคู่ทำงานร่วมกันได้เหมือนที่
 * `InboxList.tsx` ทำอยู่แล้วบน prod (นิ้วขยับเกิน tolerance = ยกเลิกกดค้างเอง ปัดชนะ / นิ้วนิ่งครบ
 * เวลา = กดค้างชนะ) — ไม่ต้องเขียนตรรกะตัดสินใครชนะเพิ่ม
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
import RowFocusSheet from '../../_components/RowFocusSheet'

/**
 * ทางเข้าเมนูของแถวคอมเมนต์ — idiom เดียวกับ `ChatRowAnchor` ของรายการแชท
 *   point = คลิกขวาบนเดสก์ท็อป (การ์ดเกาะเคอร์เซอร์)
 *   row   = กดค้างบนมือถือ (โหมดเพ่ง: เบลอฉาก + ยกแถว + แผ่นจากขอบล่าง)
 */
export type CommentRowAnchor =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'row'; row: HTMLElement }

/** ขนาดโดยประมาณของเมนู (min-w-44 = 176px + กันชนขอบจอ) — ใช้ clamp ตำแหน่งไม่ให้ล้นจอ */
const MENU_WIDTH = 200
const MENU_HEIGHT = 64
/** กันชนขอบจอ (ตัวเดียวกับ EDGE ของ ChatContextMenu.tsx) */
const EDGE = 8

type Props = {
  anchor: CommentRowAnchor
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

export default function CommentRowMenu({ anchor, resolved, busy, unavailableReason, onToggle, onClose }: Props) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)

  // clamp ไม่ให้ล้นขอบขวา/ล่างของจอ — ตรรกะเดียวกับ pointLeft/pointTop ของ ChatContextMenu.tsx
  const x = anchor.kind === 'point' ? anchor.x : 0
  const y = anchor.kind === 'point' ? anchor.y : 0
  const left = Math.max(EDGE, Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : x) - MENU_WIDTH))
  const top = Math.max(EDGE, Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : y) - MENU_HEIGHT))

  // effect ชุดนี้เป็นของ **โหมด point เท่านั้น** — โหมด row มี RowFocusSheet จัดการปิด/วัดตำแหน่งเอง
  // (และมันต้อง "วัดใหม่" ตอน scroll/resize ไม่ใช่ "ปิด" ซึ่งตรงข้ามกับที่นี่)
  const pointMode = anchor.kind === 'point'
  useEffect(() => {
    if (!pointMode) return
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
  }, [onClose, pointMode])

  const label = unavailableReason ?? (resolved ? t.comments.unmarkDone : t.comments.markDone)
  const icon = resolved ? 'arrow-back-up' : 'circle-check'
  const disabled = busy || Boolean(unavailableReason)
  function handleToggle() {
    if (unavailableReason) return
    onToggle()
    onClose()
  }

  /**
   * โหมดกดค้าง (มือถือ) — ยกโครง "โหมดเพ่ง" มาจากรายการแชทผ่าน RowFocusSheet
   *
   * 🛑 **ไม่ยก tile-grid 4 ช่องของ ChatContextMenu มาด้วย** ทั้งที่นั่นคือหน้าตาที่ user ชี้ว่า
   * "เหมือน chat lists" — เพราะเมนูนี้มีรายการเดียว ยกมาทั้งดุ้นจะเหลือช่องว่างเปล่า 3 ช่อง
   * สิ่งที่ user หมายถึงคือ *ท่าและความรู้สึก* (เบลอ/ยกแถว/แผ่นจากขอบล่าง) ไม่ใช่จำนวนช่อง
   * เป้ากด `min-h-14` (56px) ไม่ใช่ `.dropdown-item` (~36px) — แผ่นระดับนี้ต้องแตะด้วยนิ้วโป้งได้
   */
  if (anchor.kind === 'row') {
    return (
      <RowFocusSheet row={anchor.row} onClose={onClose} ariaLabel={t.comments.commentMenuAria} grip={false}>
        <div role="menu" className="px-2 pb-1">
          <button
            type="button"
            role="menuitem"
            disabled={disabled}
            aria-disabled={disabled}
            onClick={handleToggle}
            className="text-default-800 flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-start text-sm disabled:opacity-50"
          >
            <Icon icon={icon} className="size-5 shrink-0" />
            {label}
          </button>
        </div>
      </RowFocusSheet>
    )
  }

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
        disabled={disabled}
        aria-disabled={disabled}
        onClick={handleToggle}
        className="dropdown-item text-sm disabled:opacity-50"
      >
        <Icon icon={icon} className="size-4" />
        {label}
      </button>
    </div>,
    document.body,
  )
}
