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
import { EMOJI_CATEGORIES } from './EmojiPicker'

export type MessageAction = {
  key: string
  icon: string
  label: string
  onSelect: () => void
  /** ย้ำสายตาว่าเป็น action ที่ "ทำอะไรกับข้อความคนอื่น" — ตอนนี้ยังไม่มีตัวไหนใช้ (เผื่อ "ลบ") */
  danger?: boolean
}

/**
 * ตัวเลือกรีแอ็กชัน (user สั่ง 2026-08-03 "reaction ข้อความด้วย") — แถวอิโมจิเหนือรายการคำสั่ง
 * แบบเดียวกับ Messenger. `emoji` ส่งมาพร้อม variation selector แล้วจากฝั่ง caller
 * (ดู lib/emoji-presentation) ไฟล์นี้จึงไม่มีอักขระอิโมจิอยู่ในซอร์สเลย
 */
export type MessageReactionOption = {
  emoji: string
  /** ชื่อไทยสำหรับ aria-label — อิโมจิล้วนอ่านออกเสียงไม่ได้ */
  label: string
  /** ตัวที่กดค้างอยู่ตอนนี้ — กดซ้ำ = ถอนออก */
  active: boolean
  onSelect: () => void
}

type Props = {
  /** จุดที่นิ้วกดค้าง (viewport coords) — เมนูจะเกาะเหนือจุดนี้ */
  x: number
  y: number
  actions: MessageAction[]
  /** ว่าง = ข้อความนี้กดรีแอ็กชันไม่ได้ (ถูกลบ/ยังส่งไม่ถึงลูกค้า) → ไม่ต้องขึ้นแถว */
  reactions?: MessageReactionOption[]
  /** ปุ่ม "+" ท้ายแถว → เปิดแผงอิโมจิทั้งชุด (เหมือน Messenger). ไม่ส่ง = ไม่มีปุ่ม + */
  onPickCustomEmoji?: (emoji: string) => void
  onClose: () => void
}

// HR7 carve-out (จำเป็นจริง): รีแอ็กชัน 7 ปุ่ม × 44px = ~310px ชนขอบจอ 320px ได้ ต้องจำกัดความ
// กว้างเทียบ viewport แล้วเลื่อนแนวนอนแทน — Paces ไม่มี token "กว้างเท่าจอลบ padding" ให้ใช้ และ
// ทางเลือกอื่นคือย่อปุ่มให้เล็กกว่ามาตรฐาน tap target 44px ซึ่งแย่กว่า
const REACTION_ROW_WIDTH = 'max-w-[calc(100vw-2rem)]' // HR7 carve-out: Paces ไม่มี token กว้าง-เท่าจอ-ลบ-padding

/** ระยะห่างจากนิ้ว — พอให้เมนูไม่ถูกนิ้วบัง แต่ยังอ่านว่าเป็นของบับเบิลนั้น */
const GAP = 12
/** กันชนขอบจอ */
const EDGE = 8

export default function MessageActionBubble({
  x,
  y,
  actions,
  reactions = [],
  onPickCustomEmoji,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // เริ่มที่ opacity 0 แล้วค่อยวัดขนาดจริงก่อนโชว์ — วางก่อนวัดจะเห็นเมนูกระโดดหนึ่งเฟรม
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  // กด "+" แล้วแผงในกล่องเดิมสลับเป็นอิโมจิทั้งชุด (ไม่เปิด popover ซ้อน popover ซึ่งวางตำแหน่งยาก
  // และปิดยากบนมือถือ) — ปิดกลับด้วยปุ่มลูกศรหรือปิดทั้งเมนู
  const [showAll, setShowAll] = useState(false)

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
    // showAll: แผงเต็มสูงกว่าแถวสั้นมาก ถ้าไม่วัดใหม่จะทะลุขอบจอล่าง/บน
  }, [x, y, showAll])

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

  if (actions.length === 0 && reactions.length === 0) return null

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="ตัวเลือกของข้อความ"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className={`border-default-300 bg-card fixed z-50 flex flex-col gap-1 rounded-lg border p-1 shadow-lg transition-opacity duration-150 ${
        pos ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {showAll && onPickCustomEmoji && (
        // แผงอิโมจิทั้งชุด (user สั่ง 2026-08-03 "กดแล้วขึ้น panel emoji ที่รองรับทั้งหมด" — Messenger
        // มีปุ่ม + ท้ายแถวแบบเดียวกัน) ใช้ชุด EMOJI_CATEGORIES เดียวกับ EmojiPicker ของช่องพิมพ์
        // สร้าง glyph จาก codepoint จึงไม่มีอักขระอิโมจิในซอร์ส (HR12)
        <div className="w-72">
          <div className="border-default-200 mb-1 flex items-center gap-1 border-b pb-1">
            <button
              type="button"
              onClick={() => setShowAll(false)}
              aria-label="กลับไปรีแอ็กชันที่ใช้บ่อย"
              className="hover:bg-default-100 text-default-700 flex size-8 items-center justify-center rounded-lg"
            >
              <Icon icon="arrow-left" className="text-base" />
            </button>
            <span className="text-default-700 text-xs font-semibold">เลือกอิโมจิ</span>
          </div>
          <div className="max-h-64 overflow-y-auto px-1 pb-1">
            {EMOJI_CATEGORIES.map((cat) => (
              <div key={cat.key} className="mb-3 last:mb-0">
                <p className="text-default-700 text-2xs mb-1.5 font-semibold">{cat.label}</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {cat.codepoints.map((cp) => {
                    const glyph = String.fromCodePoint(cp)
                    return (
                      <button
                        key={cp}
                        type="button"
                        aria-label={`รีแอ็กชัน ${glyph}`}
                        onClick={() => {
                          onPickCustomEmoji(glyph)
                          onClose()
                        }}
                        className="hover:bg-default-100 flex size-8 items-center justify-center rounded text-xl leading-none"
                      >
                        {glyph}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!showAll && reactions.length > 0 && (
        // แถวอิโมจิอยู่บนสุดเหมือน Messenger — เป็นสิ่งที่คนกดบ่อยที่สุด และแยกจากคำสั่งข้อความ
        // ด้วยเส้นคั่น เพราะคนละความหมาย (ตอบสนองข้อความ vs จัดการข้อความ)
        <div
          className={`${REACTION_ROW_WIDTH} flex gap-0.5 overflow-x-auto ${
            actions.length > 0 ? 'border-default-200 border-b pb-1' : ''
          }`}
        >
          {reactions.map((r) => (
            <button
              key={r.label}
              type="button"
              role="menuitemradio"
              aria-checked={r.active}
              aria-label={r.active ? `เอา${r.label}ออก` : r.label}
              onClick={() => {
                r.onSelect()
                onClose()
              }}
              // size-11 = 44px tap target เท่าปุ่มคำสั่งด้านล่าง; ตัวที่กดอยู่ย้ำด้วยพื้นสีจาง
              className={`flex size-11 items-center justify-center rounded-full text-xl leading-none ${
                r.active ? 'bg-primary/15' : 'hover:bg-default-100'
              }`}
            >
              {r.emoji}
            </button>
          ))}
          {onPickCustomEmoji && (
            // ปุ่ม "+" ท้ายแถวเหมือน Messenger — อิโมจิที่ Send API รับมีมากกว่า 7 ตัวมาตรฐาน
            <button
              type="button"
              aria-label="เลือกอิโมจิอื่น"
              onClick={() => setShowAll(true)}
              className="bg-default-100 hover:bg-default-200 text-default-700 flex size-11 shrink-0 items-center justify-center rounded-full"
            >
              <Icon icon="plus" className="text-lg" />
            </button>
          )}
        </div>
      )}
      <div className={showAll ? 'hidden' : 'flex gap-1'}>
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
      </div>
    </div>,
    document.body,
  )
}
