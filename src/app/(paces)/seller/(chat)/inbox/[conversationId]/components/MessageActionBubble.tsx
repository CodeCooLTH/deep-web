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
 *
 * ── โหมด "เพ่งข้อความ" (user สั่ง 2026-08-03 อ้าง Messenger) ──────────────────────────
 * เดิมเมนูโผล่กลางเธรดที่ยังคมชัดทั้งหน้า ตาไม่รู้ว่าเมนูนี้เป็นของข้อความไหน (ข้อความติดกันหลายก้อน)
 * ตอนนี้จึงเบลอทั้งฉากหลัง แล้วยกเฉพาะบับเบิลที่กดขึ้นมาลอยเหนือฉาก (ซูม 5%) พร้อมเมนูเกาะใต้บับเบิล
 *
 * Hard Rule 6 (reference vs theme): IA/ท่าทางยกจาก ref ที่ user ส่ง (Messenger) แต่สกิน/สี/
 * คอมโพเนนต์ยังเป็น Paces ล้วน (bg-card, text-default-*, border-default-300, rounded-lg)
 * ฉากเบลอ Base: CustomerPanelSheet.tsx (`absolute inset-0 bg-default-900/40 backdrop-blur-*`)
 * ซึ่ง Base ของมันคือ theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx
 *
 * ทำไมต้อง "โคลน" บับเบิลแทนการยกตัวจริง: บับเบิลตัวจริงอยู่ลึกใน Chat Rail ที่มี overflow/transform
 * — ยก z-index ให้ทะลุ portal ระดับ body ไม่ได้ (คนละ stacking context) เหตุผลเดียวกับที่เมนูนี้ต้อง
 * เป็น portal ตั้งแต่แรก
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

/**
 * เมนูนี้เปิดได้ 2 ทางซึ่งต้องการหน้าตาคนละแบบ:
 *   - `bubble` = กดค้างบนมือถือ → โหมด "เพ่ง" (เบลอฉากหลังทั้งจอ + ยกบับเบิลนั้นขึ้นมา)
 *   - `point`  = กดปุ่มหน้ายิ้มตอน hover บนเดสก์ท็อป → popover เล็ก ๆ เกาะปุ่ม **ห้ามเบลอทั้งจอ**
 *     เพราะเมาส์ยังต้องเห็น/ใช้เธรดรอบ ๆ ได้ และไม่ได้กำลัง "เพ่ง" ข้อความเดียว
 */
export type MessageAnchor =
  | {
      kind: 'bubble'
      /** บับเบิลตัวจริงในเธรด (`[data-message-bubble]`) — วัดตำแหน่งเมนู + โคลนไปลอยเหนือฉากเบลอ */
      bubble: HTMLElement
      /** ข้อความของร้านเอง (ชิดขวา) → ซูมจากขอบขวา เมนูชิดขวา */
      mine: boolean
    }
  | { kind: 'point'; x: number; y: number }

type Props = {
  anchor: MessageAnchor
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

/** ระยะบับเบิล↔เมนู — พอให้เห็นว่าเป็นคนละก้อนแต่ยังอ่านว่าเป็นชุดเดียวกัน */
const GAP = 12
/** กันชนขอบจอ */
const EDGE = 8
/**
 * ซูมบับเบิลที่กด 5% — พอให้ "เด้งออกมา" จากฉากเบลอโดยไม่ทำให้ข้อความยาวล้นจอ
 * ต้องตรงกับคลาส `scale-105` ที่ใช้จริงด้านล่าง (HR7: ใช้ scale step ของ Tailwind ไม่ใช่ค่า bracket)
 * — ค่านี้ใช้คำนวณความสูงหลังซูมเพื่อวางเมนู ถ้าไม่ตรงกันเมนูจะเกยบับเบิล
 */
const SCALE = 1.05

export default function MessageActionBubble({
  anchor,
  actions,
  reactions = [],
  onPickCustomEmoji,
  onClose,
}: Props) {
  // แตกเป็นค่าพื้นฐานก่อนใส่ deps ของ effect — ถ้าใส่ `anchor` (object ที่ caller สร้างใหม่ทุก
  // render) ตรง ๆ effect จะวิ่งทุกรอบ แล้ว setPos สร้าง object ใหม่ → render ใหม่ → วน infinite
  const bubble = anchor.kind === 'bubble' ? anchor.bubble : null
  const mine = anchor.kind === 'bubble' ? anchor.mine : false
  const pointX = anchor.kind === 'point' ? anchor.x : 0
  const pointY = anchor.kind === 'point' ? anchor.y : 0
  const ref = useRef<HTMLDivElement>(null)
  const cloneHostRef = useRef<HTMLDivElement>(null)
  // เริ่มที่ opacity 0 แล้วค่อยวัดขนาดจริงก่อนโชว์ — วางก่อนวัดจะเห็นเมนูกระโดดหนึ่งเฟรม
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [clonePos, setClonePos] = useState<{ top: number; left: number; width: number } | null>(null)
  // แยกจาก pos เพื่อให้ transition ได้วิ่ง (ตั้งใน rAF = หลัง paint แรกที่ยัง opacity-0/scale-100)
  const [shown, setShown] = useState(false)
  // กด "+" แล้วแผงในกล่องเดิมสลับเป็นอิโมจิทั้งชุด (ไม่เปิด popover ซ้อน popover ซึ่งวางตำแหน่งยาก
  // และปิดยากบนมือถือ) — ปิดกลับด้วยปุ่มลูกศรหรือปิดทั้งเมนู
  const [showAll, setShowAll] = useState(false)
  // แผงอิโมจิเต็มชุดสูง ~300px + บับเบิลยาว = เกินจอแน่ ๆ → โหมดนั้นให้แผงเป็นพระเอกคนเดียว
  // (Messenger ก็ทิ้งโฟกัสบับเบิลตอนเปิดแผงเหมือนกัน) ฉากเบลอยังอยู่ ไม่หลุดบริบท
  const showClone = !!bubble && !showAll

  // ── โคลนบับเบิลมาวางบนฉาก + ซ่อนตัวจริง ─────────────────────────────────
  useLayoutEffect(() => {
    const host = cloneHostRef.current
    if (!host || !bubble || !showClone) return
    const clone = bubble.cloneNode(true) as HTMLElement
    // id ซ้ำในหน้าเดียวกันทำให้ getElementById/label ชี้ผิดตัว ส่วนวิดีโอที่โคลนมาจะโหลดซ้ำ
    // ทั้งที่ไม่มีใครสั่งเล่น — ตัดทิ้งทั้งคู่ (โคลนเป็นภาพนิ่งอย่างเดียว ไม่ใช่ของที่กดได้)
    clone.removeAttribute('id')
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
    clone.querySelectorAll('video').forEach((v) => {
      v.removeAttribute('autoplay')
      v.removeAttribute('controls')
    })
    host.replaceChildren(clone)

    // ซ่อนตัวจริงระหว่างเปิด — ไม่งั้นบับเบิลเดิมยังนอนอยู่ใต้ฉากเบลอตำแหน่งเดียวกัน แล้วขอบเบลอ
    // ของมัน "ฟุ้ง" ออกมารอบโคลนที่คมชัด เห็นเป็นเงาซ้อนสองชั้น. ใช้ visibility ไม่ใช่ display
    // เพราะต้องคง layout ของเธรดไว้เป๊ะ (ไม่งั้นข้อความอื่นขยับตอนกดค้าง)
    const prev = bubble.style.visibility
    bubble.style.visibility = 'hidden'
    return () => {
      bubble.style.visibility = prev
    }
  }, [bubble, showClone])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    if (!bubble) {
      // โหมด popover เกาะจุด (ปุ่มรีแอ็กชันบนเดสก์ท็อป) — ตรรกะเดิมทุกบรรทัด
      // แนวนอน: กึ่งกลางที่จุด แล้ว clamp ให้อยู่ในจอ
      const left = Math.min(Math.max(EDGE, pointX - width / 2), vw - width - EDGE)
      // แนวตั้ง: เหนือจุดก่อน (นิ้ว/เมาส์บังน้อยกว่า) — ถ้าชนขอบบนค่อยพลิกลงล่าง
      const above = pointY - GAP - height
      setPos({ top: above >= EDGE ? above : Math.min(pointY + GAP, vh - height - EDGE), left })
      return
    }

    const rect = bubble.getBoundingClientRect()
    // transform-origin อยู่ขอบบน จึงโตลงล่างอย่างเดียว — ความสูงที่ใช้จัดวางคือค่าที่ซูมแล้ว
    const cloneH = showClone ? rect.height * SCALE : 0

    // แนวนอน: ชิดข้างเดียวกับบับเบิล (ขวา = ข้อความร้าน) แล้ว clamp ไม่ให้ล้นขอบจอ
    const rawLeft = mine ? rect.right - width : rect.left
    const left = Math.min(Math.max(EDGE, rawLeft), Math.max(EDGE, vw - width - EDGE))

    // แนวตั้ง: ใต้บับเบิลก่อน (ตาไล่จากข้อความ→ตัวเลือก) → ไม่พอค่อยพลิกขึ้นเหนือบับเบิล
    let cloneTop = rect.top
    let top = cloneTop + cloneH + GAP
    if (top + height > vh - EDGE) {
      const above = cloneTop - GAP - height
      if (above >= EDGE) {
        top = above
      } else {
        // ไม่พอทั้งบนและล่าง → เลื่อนบับเบิลขึ้นให้ทั้งชุดพอดีจอ; ถ้าเมนูสูงจนดันบับเบิลพ้นจอ
        // (แผงอิโมจิเต็มชุด) ก็ clamp เมนูอย่างเดียว — โหมดนั้นไม่โชว์โคลนอยู่แล้ว
        cloneTop = Math.max(EDGE, vh - EDGE - height - GAP - cloneH)
        top = Math.min(Math.max(EDGE, cloneTop + cloneH + GAP), Math.max(EDGE, vh - height - EDGE))
      }
    }

    setPos({ top, left })
    setClonePos({ top: cloneTop, left: rect.left, width: rect.width })
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
    // showAll: แผงเต็มสูงกว่าแถวสั้นมาก ถ้าไม่วัดใหม่จะทะลุขอบจอล่าง/บน
  }, [bubble, mine, pointX, pointY, showClone, showAll])

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

  const menu = (
    <div
      ref={ref}
      role="menu"
      aria-label="ตัวเลือกของข้อความ"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      // z-50 เฉพาะโหมด popover (ไม่มี overlay ครอบ) — โหมดเพ่งใช้ z-80 ของ overlay แทน
      className={`border-default-300 bg-card fixed flex flex-col gap-1 rounded-lg border p-1 shadow-lg transition-opacity duration-150 ${
        bubble ? '' : 'z-50'
      } ${pos ? 'opacity-100' : 'opacity-0'}`}
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
    </div>
  )

  // โหมด popover (เดสก์ท็อป) = เมนูเดี่ยว ๆ เหมือนเดิม ไม่มีฉากเบลอ เมาส์ยังใช้เธรดรอบ ๆ ได้
  if (!bubble) return createPortal(menu, document.body)

  return createPortal(
    // touch-none: กันนิ้วที่ลากบนฉากเบลอไปเลื่อนเธรดข้างหลัง (iOS จะ scroll ทะลุ overlay)
    // HR7: z-80 = viewport overlay lock (Paces ไม่มี token; precedent CustomerPanelSheet.tsx)
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ตัวเลือกของข้อความ"
      className="fixed inset-0 z-80 touch-none"
    >
      {/* ฉากเบลอ — Base CustomerPanelSheet.tsx (blur-sm ไม่ใช่ blur-xs: ที่นี่ต้องดันทั้งเธรดให้ถอย
          ไปเป็นพื้นหลังจริง ๆ ไม่ใช่แค่ลดความเด่นของแผงเดียว) */}
      <div
        aria-hidden="true"
        className={`bg-default-900/40 absolute inset-0 backdrop-blur-sm transition-opacity duration-200 ease-out ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* บับเบิลที่กด — โคลนวางทับตำแหน่งเดิมเป๊ะ แล้วซูมขึ้นจากขอบบนด้านที่ชิด
          pointer-events-none: แตะโดนแล้วต้องปิด (ปล่อย event ไหลไปถึง document listener) */}
      {showClone && (
        <div
          ref={cloneHostRef}
          aria-hidden="true"
          style={{
            top: clonePos?.top ?? -9999,
            left: clonePos?.left ?? -9999,
            width: clonePos?.width,
            transformOrigin: mine ? 'right top' : 'left top',
          }}
          className={`pointer-events-none fixed transition-transform duration-200 ease-out ${
            shown ? 'scale-105' : 'scale-100'
          }`}
        />
      )}

      {menu}
    </div>,
    document.body,
  )
}
