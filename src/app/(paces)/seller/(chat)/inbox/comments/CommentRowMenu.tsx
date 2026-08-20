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
const MENU_WIDTH = 272 // w-64 (256px) + กันชนขอบจอ
const MENU_HEIGHT = 260 // ไทล์ 60px + caption + แถว FB + padding
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
  /**
   * ── ไทล์ที่สอง: ทักแชท ─────────────────────────────────────────────────
   * user 2026-08-20: "panel ด้านล่าง ผมว่า action ก็น้อยเกินด้วยนะ" + critique P1 ชี้ว่างบ
   * affordance ทั้งหมดของแถวถูกใช้กับ action ที่แปลว่า "ไม่ต้องทำอะไร" ขณะที่งานจริง
   * (ตอบ/ทักแชท) ต้องเปิดเธรดเสมอ — "ทักแชท" คือตัวที่ขาดแล้วเจ็บที่สุด
   */
  privateReply: {
    state: 'SENT' | 'SENDING' | 'EXPIRED' | 'AVAILABLE'
    /** ห้องแชทที่เกิดจากการทักครั้งก่อน — null = ทักแล้วแต่สร้างห้องไม่สำเร็จ (เคสจริงที่มีอยู่) */
    conversationId: string | null
    /** ข้อความบนไทล์ตอนสถานะ SENT ที่ไม่มีห้องแชท เช่น "ทักแล้ว · 14:32" */
    sentLabel: string
    /** เหตุผลตอนกดไม่ได้ (หมดเวลา) — null = ไม่ต้องขึ้น caption */
    unavailableReason: string | null
    onStart: () => void
    onOpenChat: () => void
  }
  /** ลิงก์ไปคอมเมนต์ใบนี้บน Facebook — null = โพสต์ไม่มี permalink (ไม่ render แถวนี้เลย) */
  facebookUrl: string | null
  onToggle: () => void
  onClose: () => void
}

export default function CommentRowMenu({
  anchor,
  resolved,
  busy,
  unavailableReason,
  privateReply,
  facebookUrl,
  onToggle,
  onClose,
}: Props) {
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

  const markLabel = resolved ? t.comments.unmarkDone : t.comments.markDoneTile
  const markIcon = resolved ? 'arrow-back-up' : 'circle-check'
  const markDisabled = busy || Boolean(unavailableReason)
  function handleToggle() {
    if (unavailableReason) return
    onToggle()
    onClose()
  }

  /**
   * ไทล์ที่สอง — สถานะเดียวกับปุ่ม "ทักแชท" ในเธรด แต่ตัดสินจากข้อมูลที่แถวมีอยู่แล้ว
   * ผู้ขายจึงทักได้จากรายการโดยไม่ต้องเปิดโพสต์เข้าไปก่อน (critique 2026-08-20 คำถามข้อ 3)
   */
  const pr = privateReply
  const prSpec =
    pr.state === 'SENT' && pr.conversationId
      ? { icon: 'message-2', label: t.comments.openChat, disabled: false, run: pr.onOpenChat }
      : pr.state === 'SENT'
        ? // ทักไปแล้วแต่สร้างห้องแชทไม่สำเร็จ — เคสจริงที่มีอยู่ในระบบ ไม่ใช่ไทล์ว่าง
          { icon: 'circle-check', label: pr.sentLabel, disabled: true, run: () => {} }
        : pr.state === 'SENDING'
          ? { icon: 'loader-2', label: t.comments.sending, disabled: true, run: () => {} }
          : pr.state === 'EXPIRED'
            ? { icon: 'clock-x', label: t.comments.windowExpired, disabled: true, run: () => {} }
            : { icon: 'message-reply', label: t.comments.privateReply, disabled: false, run: pr.onStart }

  /**
   * เนื้อในชุดเดียวใช้ทั้ง 2 โหมด (กดค้างมือถือ / คลิกขวาเดสก์ท็อป) — ท่าเดียวกับ ChatContextMenu
   * ลดพื้นที่ที่ตรรกะจะ drift กันระหว่างสองแพลตฟอร์ม
   *
   * 🛑 ไทล์ 2 คอลัมน์ ไม่ใช่ 4 แบบแผ่นของแชท — คำไทยที่นี่ยาวกว่า ("เลิกทำเครื่องหมาย")
   * ยัด 4 ช่องแล้วตัดคำเละ (craft-floor: รันคำจริงทุก breakpoint แล้วแก้สิ่งที่ล้น ไม่ใช่ยึด
   * จำนวนคอลัมน์ตายตัว)
   *
   * 🛑 เหตุผลตอนกดไม่ได้เป็น **caption ที่มองเห็นตลอด** ไม่ใช่ `title`/tooltip — มือถือไม่มี hover
   * ทางเดียวที่ "ความเงียบไม่อธิบายตัวเอง" เป็นจริงบนทัชสกรีนคือข้อความที่เห็นอยู่
   */
  const tileCls =
    'flex min-h-15 flex-col items-center justify-center gap-1.5 rounded-lg px-1 text-xs font-medium disabled:opacity-50'
  const body = (
    <>
      <div role="menu" className="grid grid-cols-2 gap-2 px-4 pt-1">
        <button
          type="button"
          role="menuitem"
          disabled={markDisabled}
          aria-disabled={markDisabled}
          onClick={handleToggle}
          className={`${tileCls} ${
            resolved ? 'bg-primary/15 text-primary-ink' : 'bg-default-100 text-default-800 hover:bg-default-200'
          }`}
        >
          <Icon icon={markIcon} className="size-5 shrink-0" />
          {markLabel}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={prSpec.disabled}
          aria-disabled={prSpec.disabled}
          onClick={() => {
            if (prSpec.disabled) return
            prSpec.run()
            onClose()
          }}
          className={`${tileCls} bg-default-100 text-default-800 hover:bg-default-200`}
        >
          <Icon
            icon={prSpec.icon}
            className={`size-5 shrink-0 ${pr.state === 'SENDING' ? 'animate-spin' : ''}`}
          />
          {prSpec.label}
        </button>
      </div>

      {(unavailableReason || pr.unavailableReason) && (
        <div className="bg-warning/15 text-warning-ink text-2xs mx-4 mt-2 rounded-md px-2.5 py-1.5">
          {unavailableReason ?? pr.unavailableReason}
        </div>
      )}

      {facebookUrl && (
        <>
          <hr className="border-default-300 mx-4 mt-2 mb-1 border-t" />
          <a
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={onClose}
            className="text-default-800 hover:bg-default-100 flex min-h-12 items-center gap-3 px-4 text-sm"
          >
            <Icon icon="external-link" className="size-4 shrink-0" />
            {t.comments.openPostOnFacebook}
          </a>
        </>
      )}
    </>
  )

  // โหมดกดค้าง (มือถือ) — ยกโครง "โหมดเพ่ง" มาจากรายการแชทผ่าน RowFocusSheet
  // grip กลับมาแล้วเพราะแผ่นมีมากกว่า 1 action ต้องมี affordance บอกว่ามาจากขอบล่าง
  if (anchor.kind === 'row') {
    return (
      <RowFocusSheet row={anchor.row} onClose={onClose} ariaLabel={t.comments.commentMenuAria}>
        <div className="pb-1">{body}</div>
      </RowFocusSheet>
    )
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={t.comments.commentMenuAria}
      style={{ top, left }}
      className="border-default-300 bg-card fixed z-50 w-64 overflow-hidden rounded-lg border py-2 shadow-lg"
    >
      {body}
    </div>,
    document.body,
  )
}
