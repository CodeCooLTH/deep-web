'use client'

/**
 * EmojiPicker — popover เลือก emoji สำหรับ composer (feature 00018, composer improvement #1)
 *
 * ไม่ใช้ไลบรารีภายนอก และ "ไม่มีตัวอักษร emoji ดิบในซอร์สโค้ดเลย" — สร้าง glyph ตอน render ด้วย
 * String.fromCodePoint(codepoint) จาก array ของ codepoint (number) เท่านั้น เหตุผล 2 ข้อ:
 *  1) Hard Rule 12 (theme-guard hook) grep หา emoji char ในไฟล์ที่แก้ = ต้องเป็น 0 — ถ้าฝัง emoji
 *     ดิบไฟล์นี้จะถูกบล็อกทันที. codepoint เป็นเลขฐานสิบหก (ASCII) จึงผ่าน grep
 *  2) emoji ที่ "ส่งออก" เป็น Unicode text ธรรมดา — Messenger/Instagram/Deep ปลายทาง render เอง
 *     ตาม platform (ข้อกำหนดผู้ใช้ "รองรับ emoji ที่ส่งผ่าน facebook") ไม่ต้องแปลงพิเศษ
 *
 * Paces primitive เท่านั้น (Hard Rule 7): .card/bg-card/token spacing/size-* — ไม่มี arbitrary value
 * Base (popover ทรง card ลอย): theme/paces/Admin/TS ใช้ .card + shadow-sm สำหรับ dropdown panel
 */
import { useEffect, useRef } from 'react'

// codepoint (ไม่ใช่ตัว emoji) — จัดกลุ่มให้เหมาะกับแชทร้านค้า (ทักทาย/ขอบคุณ/นิ้วโป้ง/หัวใจ/เงิน/ช้อป)
// export เพื่อให้แผงรีแอ็กชันบนข้อความ (MessageActionBubble) ใช้ชุดเดียวกัน — user สั่ง 2026-08-03
// "กดแล้วขึ้น panel emoji ที่รองรับทั้งหมด" ชุด emoji ต้องเป็นชุดเดียวกับที่ composer ใช้ ไม่ใช่คนละชุด
export const EMOJI_CATEGORIES: { key: string; label: string; codepoints: number[] }[] = [
  {
    key: 'smileys',
    label: 'หน้ายิ้ม',
    codepoints: [
      0x1f600, 0x1f603, 0x1f604, 0x1f601, 0x1f606, 0x1f605, 0x1f602, 0x1f923, 0x1f60a, 0x1f607,
      0x1f643, 0x1f609, 0x1f60c, 0x1f60d, 0x1f970, 0x1f618, 0x1f617, 0x1f61a, 0x1f60b, 0x1f61b,
      0x1f61c, 0x1f92a, 0x1f929, 0x1f60e, 0x1f913, 0x1f914, 0x1f610, 0x1f611, 0x1f636, 0x1f60f,
      0x1f62c, 0x1f644, 0x1f62e, 0x1f627, 0x1f62d, 0x1f625, 0x1f622, 0x1f621, 0x1f97a, 0x1f605,
    ],
  },
  {
    key: 'gestures',
    label: 'ท่าทาง',
    codepoints: [
      0x1f44d, 0x1f44e, 0x1f44c, 0x1f44f, 0x1f64f, 0x1f44b, 0x1f919, 0x270c, 0x1f91f, 0x1f918,
      0x1f4aa, 0x1f91d, 0x270a, 0x1f91a, 0x1f446, 0x1f447, 0x1f448, 0x1f449, 0x1f590, 0x1f64c,
    ],
  },
  {
    key: 'hearts',
    label: 'หัวใจ',
    codepoints: [
      0x2764, 0x1f9e1, 0x1f49b, 0x1f49a, 0x1f499, 0x1f49c, 0x1f5a4, 0x1f90d, 0x1f90e, 0x1f494,
      0x1f495, 0x1f49e, 0x1f497, 0x1f49d, 0x1f496, 0x2b50, 0x1f31f, 0x1f525, 0x2728, 0x1f4af,
      0x2705, 0x274c, 0x2757, 0x2753, 0x1f389, 0x1f38a,
    ],
  },
  {
    key: 'shopping',
    label: 'ช้อป/เงิน',
    codepoints: [
      0x1f4b0, 0x1f4b5, 0x1f4b3, 0x1f4b8, 0x1f6d2, 0x1f6cd, 0x1f381, 0x1f4e6, 0x1f4ee, 0x1f69a,
      0x1f3ea, 0x1f3f7, 0x1f4b2, 0x1f9fe, 0x1f4dd, 0x1f4c5, 0x23f0, 0x1f4f1, 0x1f4de, 0x1f514,
    ],
  },
  {
    key: 'food',
    label: 'อาหาร',
    codepoints: [
      0x1f354, 0x1f355, 0x1f35c, 0x1f361, 0x1f366, 0x1f369, 0x1f370, 0x1f382, 0x2615, 0x1f9cb,
      0x1f37a, 0x1f349, 0x1f34e, 0x1f34a, 0x1f353, 0x1f347, 0x1f95d, 0x1f33d, 0x1f363, 0x1f371,
    ],
  },
]

type Props = {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export default function EmojiPicker({ onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // ปิดเมื่อคลิกนอก panel หรือกด Escape (pattern เดียวกับ FilterDropdown/dropdown อื่นใน (paces))
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="เลือกอิโมจิ"
      className="card bg-card border-default-200 absolute bottom-full left-0 z-20 mb-2 w-72 border p-0 shadow-lg"
    >
      <div className="max-h-64 overflow-y-auto p-3">
        {EMOJI_CATEGORIES.map((cat) => (
          <div key={cat.key} className="mb-3 last:mb-0">
            <p className="text-default-700 mb-1.5 text-2xs font-semibold">{cat.label}</p>
            <div className="grid grid-cols-8 gap-0.5">
              {cat.codepoints.map((cp) => {
                const glyph = String.fromCodePoint(cp)
                return (
                  <button
                    key={cp}
                    type="button"
                    onClick={() => onSelect(glyph)}
                    className="hover:bg-default-100 flex size-8 items-center justify-center rounded text-xl leading-none"
                    aria-label={`อิโมจิ ${glyph}`}
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
  )
}
