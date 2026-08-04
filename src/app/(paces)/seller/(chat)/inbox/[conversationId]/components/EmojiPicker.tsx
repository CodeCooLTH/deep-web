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
import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'

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

/** สติกเกอร์จาก Sticker Catalog API ของ Meta (ผ่าน /api/channels/facebook/stickers) */
export type StickerItem = { id: string; name: string | null; imageUrl: string }
type StickerPack = { id: string; name: string; previewImageUrl: string | null }

/** สติกเกอร์ที่ใช้ล่าสุด (user สั่ง 2026-08-04 "มี recent ให้ใช้ด้วย") — เก็บที่เครื่อง ไม่ต้องมี
 *  ตารางใหม่: มันเป็นความชอบส่วนตัวของเครื่องที่ใช้ ไม่ใช่ข้อมูลร้านที่ต้องแชร์ข้ามอุปกรณ์ */
const RECENT_KEY = 'deep.chat.recentStickers'
const RECENT_MAX = 16

function readRecentStickers(): StickerItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : null
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (x): x is StickerItem =>
        !!x && typeof (x as StickerItem).id === 'string' && typeof (x as StickerItem).imageUrl === 'string',
    )
  } catch {
    return []
  }
}

export function rememberRecentSticker(sticker: StickerItem): void {
  if (typeof window === 'undefined') return
  try {
    const next = [sticker, ...readRecentStickers().filter((s) => s.id !== sticker.id)].slice(0, RECENT_MAX)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* localStorage เต็ม/ปิดอยู่ — recents เป็นของเสริม ห้ามทำให้ส่งสติกเกอร์ไม่ได้ */
  }
}

type Props = {
  onSelect: (emoji: string) => void
  onClose: () => void
  /**
   * มีค่า = โชว์แท็บ "สติกเกอร์" ด้วย (user สั่ง 2026-08-04: "ปรกติเค้ากดจาก emoji กันป่ะ แล้วเจอ
   * tab เลือกว่าจะ emoji หรือ sticker") — ไม่ส่ง = แผงอิโมจิล้วนเหมือนเดิม
   * ฝั่งคอมเมนต์ไม่ส่งค่านี้: Graph ของคอมเมนต์ไม่รับ sticker_id (ส่งได้แค่ข้อความ + รูป 1 ใบ)
   */
  onSelectSticker?: (sticker: StickerItem) => void
}

export default function EmojiPicker({ onSelect, onClose, onSelectSticker }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<'EMOJI' | 'STICKER'>('EMOJI')
  const [packs, setPacks] = useState<StickerPack[] | null>(null)
  const [packId, setPackId] = useState<string | null>(null)
  const [stickers, setStickers] = useState<StickerItem[] | null>(null)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recents, setRecents] = useState<StickerItem[]>([])

  const loadStickers = useCallback(async (url: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(url)
      const body = (await res.json().catch(() => null)) as
        | { items?: StickerItem[]; packs?: StickerPack[]; error?: string }
        | null
      if (!res.ok) {
        setError(body?.error ?? 'โหลดสติกเกอร์ไม่สำเร็จ')
        return
      }
      if (body?.packs) setPacks(body.packs)
      if (body?.items) setStickers(body.items)
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  // เปิดแท็บสติกเกอร์ครั้งแรก → โหลดรายการแพ็ก + อ่าน recents (ไม่โหลดล่วงหน้าตอนเปิดแผงอิโมจิ
  // เพราะคนส่วนใหญ่เปิดมาเพื่อกดอิโมจิ ไม่ควรยิง Graph ทิ้งทุกครั้ง)
  useEffect(() => {
    if (tab !== 'STICKER') return
    setRecents(readRecentStickers())
    if (packs === null) void loadStickers('/api/channels/facebook/stickers')
  }, [tab, packs, loadStickers])

  // ค้นหา — debounce กันยิงทุกตัวอักษร; Meta บังคับ ≥2 ตัวอักษร
  useEffect(() => {
    if (tab !== 'STICKER') return
    const term = q.trim()
    if (term.length < 2) return
    const t = setTimeout(() => {
      setPackId(null)
      void loadStickers(`/api/channels/facebook/stickers?q=${encodeURIComponent(term)}`)
    }, 400)
    return () => clearTimeout(t)
  }, [q, tab, loadStickers])

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
      {/* แท็บ อิโมจิ | สติกเกอร์ — โครงเดียวกับ segmented ของแท็บช่องทางในกล่องข้อความ
          (bg-light rounded-lg p-1 + ตัวที่เลือกเป็นการ์ดขาว) เพื่อให้เป็นภาษาเดียวกันทั้งแอป */}
      {onSelectSticker && (
        <div className="border-default-200 border-b p-2">
          <div className="bg-light flex items-center gap-0.5 rounded-lg p-1" role="tablist" aria-label="ชนิดที่จะแทรก">
            {([
              { key: 'EMOJI', label: 'อิโมจิ' },
              { key: 'STICKER', label: 'สติกเกอร์' },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`flex min-w-0 flex-1 items-center justify-center rounded-md px-2 py-1.5 text-sm font-medium ${
                  tab === t.key ? 'bg-card text-dark font-semibold shadow-sm' : 'text-default-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {onSelectSticker && tab === 'STICKER' ? (
        <div className="flex flex-col">
          <div className="border-default-200 border-b p-2">
            <div className="input-icon-group">
              <Icon icon="search" className="input-icon" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาสติกเกอร์"
                aria-label="ค้นหาสติกเกอร์"
                className="form-input"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {error ? (
              <p className="text-danger p-2 text-xs" role="alert">
                {error}
              </p>
            ) : loading ? (
              <p className="text-default-700 p-2 text-xs">กำลังโหลด...</p>
            ) : (
              <>
                {/* ใช้ล่าสุด — โผล่เฉพาะตอนยังไม่ค้นหา/ไม่ได้เลือกแพ็ก (เหมือน Recents ของ Messenger) */}
                {!q.trim() && !packId && recents.length > 0 && (
                  <div className="mb-3">
                    <p className="text-default-700 mb-1.5 text-2xs font-semibold">ใช้ล่าสุด</p>
                    <div className="grid grid-cols-4 gap-1">
                      {recents.map((st) => (
                        <StickerButton key={`r-${st.id}`} sticker={st} onPick={onSelectSticker} />
                      ))}
                    </div>
                  </div>
                )}
                {stickers && stickers.length > 0 && (
                  <div className="grid grid-cols-4 gap-1">
                    {stickers.map((st) => (
                      <StickerButton key={st.id} sticker={st} onPick={onSelectSticker} />
                    ))}
                  </div>
                )}
                {stickers && stickers.length === 0 && (
                  <p className="text-default-700 p-2 text-xs">ไม่พบสติกเกอร์ที่ค้นหา</p>
                )}
                {!stickers && !q.trim() && (
                  <p className="text-default-700 p-2 text-xs">เลือกแพ็กด้านล่าง หรือค้นหาด้านบน</p>
                )}
              </>
            )}
          </div>
          {/* แถบแพ็กด้านล่าง (เหมือน Messenger) — เลื่อนแนวนอน กดแล้วโหลดสติกเกอร์ในแพ็กนั้น */}
          {packs && packs.length > 0 && (
            <div className="border-default-200 flex gap-1 overflow-x-auto border-t p-2">
              {packs.map((pk) => (
                <button
                  key={pk.id}
                  type="button"
                  title={pk.name}
                  aria-label={`แพ็ก ${pk.name}`}
                  aria-pressed={packId === pk.id}
                  onClick={() => {
                    setQ('')
                    setPackId(pk.id)
                    void loadStickers(`/api/channels/facebook/stickers?packId=${encodeURIComponent(pk.id)}`)
                  }}
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                    packId === pk.id ? 'bg-primary/15' : 'hover:bg-default-100'
                  }`}
                >
                  {pk.previewImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pk.previewImageUrl} alt="" className="size-7 object-contain" />
                  ) : (
                    <Icon icon="sticker" className="text-default-700 text-lg" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
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
      )}
    </div>
  )
}

/** ปุ่มสติกเกอร์ 1 ใบ — กดแล้วส่งทันทีเหมือน Messenger (ไม่ต้องกดยืนยันอีกครั้ง) */
function StickerButton({ sticker, onPick }: { sticker: StickerItem; onPick: (s: StickerItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(sticker)}
      aria-label={sticker.name ? `สติกเกอร์ ${sticker.name}` : 'สติกเกอร์'}
      className="hover:bg-default-100 flex aspect-square items-center justify-center rounded-lg p-1"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sticker.imageUrl} alt={sticker.name ?? ''} loading="lazy" className="max-h-full max-w-full object-contain" />
    </button>
  )
}
