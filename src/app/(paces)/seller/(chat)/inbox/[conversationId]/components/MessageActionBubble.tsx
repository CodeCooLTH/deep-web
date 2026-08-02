'use client'

/**
 * MessageActionBubble — เมนูลอยที่โผล่เมื่อ "กดค้าง" บนบับเบิลข้อความ (user สั่ง 2026-08-02)
 *
 * ปัญหาที่แก้: ปุ่มตอบกลับ/คัดลอกในเธรดเป็น `lg:group-hover:flex` (ChatThread.tsx) = ผูกกับ hover
 * ซึ่งมือถือไม่มี — ปุ่มจึงไม่เคยโผล่บนมือถือเลยแม้แต่ครั้งเดียว ไม่ใช่แค่กดยาก
 *
 * Base: theme/paces dropdown (.dropdown-item) — โครง/positioning ยกมาจาก
 * inbox/components/ChatContextMenu.tsx (portal + fixed + clamp ขอบจอ) ซึ่งเป็นเมนูคลิกขวาของ
 * แถวแชท ต่างกันที่ตัวนี้เป็นแถวแนวนอนไอคอน+ข้อความ ไม่ใช่รายการแนวตั้ง เพราะมี action แค่ 2–3 ตัว
 * และต้องอยู่ติดบับเบิลที่กดค้าง ไม่ใช่ลอยกลางจอ
 *
 * ทำไม portal: เธรดอยู่ใน Chat Rail ที่มี overflow/transform ซึ่ง clip ตัว fixed จนแสดงไม่เต็ม
 * (บทเรียนเดียวกับ ChatContextMenu — user report 2026-07-23)
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/wrappers/Icon'

export type MessageAction = {
  key: string
  icon: string
  label: string
  onSelect: () => void
  /** ย้ำสายตาว่าเป็น action ที่ "ทำอะไรกับข้อความคนอื่น" — ตอนนี้ยังไม่มีตัวไหนใช้ (เผื่อ "ลบ") */
  danger?: boolean
}

type Props = {
  /** จุดที่นิ้วกดค้าง (viewport coords) — เมนูจะเกาะเหนือจุดนี้ */
  x: number
  y: number
  actions: MessageAction[]
  onClose: () => void
}

/** ระยะห่างจากนิ้ว — พอให้เมนูไม่ถูกนิ้วบัง แต่ยังอ่านว่าเป็นของบับเบิลนั้น */
const GAP = 12
/** กันชนขอบจอ */
const EDGE = 8

export default function MessageActionBubble({ x, y, actions, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // เริ่มที่ opacity 0 แล้วค่อยวัดขนาดจริงก่อนโชว์ — วางก่อนวัดจะเห็นเมนูกระโดดหนึ่งเฟรม
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // แนวนอน: กึ่งกลางที่นิ้ว แล้ว clamp ให้อยู่ในจอ
    const left = Math.min(Math.max(EDGE, x - width / 2), vw - width - EDGE)
    // แนวตั้ง: เหนือนิ้วก่อน (นิ้วบังน้อยกว่า) — ถ้าชนขอบบนค่อยพลิกลงล่าง
    const above = y - GAP - height
    const top = above >= EDGE ? above : Math.min(y + GAP, vh - height - EDGE)

    setPos({ top, left })
  }, [x, y])

  // ปิดเมื่อ: แตะที่อื่น / เลื่อนเธรด / กด Esc
  // scroll ใช้ capture=true เพราะตัวที่เลื่อนจริงคือ container ของเธรด ไม่ใช่ window (event ไม่ bubble)
  useEffect(() => {
    const onPointerDown = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // หน่วงหนึ่งเฟรม — ไม่งั้น touchend ของการกดค้างครั้งนี้เองจะปิดเมนูทันทีที่เพิ่งเปิด
    const id = setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown)
      document.addEventListener('touchstart', onPointerDown)
    }, 0)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      clearTimeout(id)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  if (actions.length === 0) return null

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="ตัวเลือกของข้อความ"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className={`border-default-300 bg-card fixed z-50 flex gap-1 rounded-lg border p-1 shadow-lg transition-opacity duration-150 ${
        pos ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          role="menuitem"
          onClick={() => {
            a.onSelect()
            onClose()
          }}
          // ปุ่มสูง 44px เต็ม tap target ตามที่หน้าอื่นในโปรเจกต์ยึดอยู่ — เมนูนี้เกิดบนมือถือล้วน
          className={`hover:bg-default-100 flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-3 text-xs ${
            a.danger ? 'text-danger' : 'text-default-700'
          }`}
        >
          <Icon icon={a.icon} className="text-lg" />
          {a.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
