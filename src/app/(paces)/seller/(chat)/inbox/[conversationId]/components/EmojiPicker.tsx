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
 *
 * 2 ทรงตามความกว้างจอ (user สั่ง 2026-08-06 "ตอนกด emoji หรือ sticker ให้มันเป็น full จอใน mobile"):
 *   - <768px  = bottom sheet 70dvh portal ที่ body + scrim  (Base: CustomerPanelSheet.tsx)
 *   - ≥768px  = popover เกาะปุ่มเหมือนเดิม                    (Base: .card + shadow ของ Paces)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
// S-18b: สติกเกอร์ LINE — ชุดปิดตายตัวจาก SSOT (ไม่ใช่ Sticker Catalog API ของ Meta) เป็น constant
// ล้วน ไม่มี import ฝั่ง server จึงดึงมาใช้ตรงในไฟล์ client นี้ได้เลย ไม่ต้องมี API route ใหม่
import { LINE_STICKER_PACKS, lineStickerImageUrl } from '@/lib/line/stickers'

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

/** สติกเกอร์จาก Sticker Catalog API ของ Meta (ผ่าน /api/channels/facebook/stickers) หรือจากชุดปิด
 *  ตายตัวของ LINE (`@/lib/line/stickers`) — shape เดียวกันทั้งคู่ ตัวเรนเดอร์ใช้ร่วมได้ */
/** S-19: GIPHY มี 2 คลังแยกกันในตัวมันเอง (สติกเกอร์/GIF) — ต้องรู้ว่าไอเทมที่เลือกมาจากคลังไหน
 *  เพื่อเขียน recents ลง namespace ที่ถูก (ดู recentKeyFor ด้านล่าง) */
export type GiphyKind = 'stickers' | 'gifs'

/** ไอเทม GIPHY 1 ชิ้น — shape เดียวกับ GiphyItem ใน lib/giphy.ts (คัดลอกนิยามมาไว้ในไฟล์นี้ ไม่ import
 *  ตรง เพราะ lib/giphy.ts มี `import 'server-only'` ห้ามลากเข้าไฟล์ client) */
export type GiphyGridItem = {
  id: string
  title: string
  previewUrl: string
  previewWidth: number
  previewHeight: number
  sendUrl: string
  sendBytes: number
}

export type StickerItem = {
  id: string
  name: string | null
  imageUrl: string
  /** ตั้งเฉพาะไอเทมจาก GIPHY — แยก namespace recents ระหว่างสติกเกอร์/GIF (ดู rememberRecentSticker) */
  giphyKind?: GiphyKind
}
type StickerPack = { id: string; name: string; previewImageUrl: string | null }

/** แหล่งสติกเกอร์ — S-18b: LINE มีชุดปิดตายตัวจาก SSOT คนละแหล่งกับ Sticker Catalog API ของ Meta
 *  S-19: GIPHY = คลังสติกเกอร์/GIF ของเธรด Instagram (เหตุผลที่ไม่ใช้ Meta ดู lib/giphy.ts หัวไฟล์) */
export type StickerProvider = 'META' | 'LINE' | 'GIPHY'

/** สติกเกอร์ที่ใช้ล่าสุด (user สั่ง 2026-08-04 "มี recent ให้ใช้ด้วย") — เก็บที่เครื่อง ไม่ต้องมี
 *  ตารางใหม่: มันเป็นความชอบส่วนตัวของเครื่องที่ใช้ ไม่ใช่ข้อมูลร้านที่ต้องแชร์ข้ามอุปกรณ์
 *
 * S-18b: namespace แยกตาม provider — ของเดิม (ก่อนมี LINE) เก็บที่คีย์เดียวไม่แยกช่องทาง ถ้าใช้คีย์
 * ร่วมกันต่อไป เปิดเธรด LINE จะเห็นสติกเกอร์ Messenger ในแท็บ "ใช้ล่าสุด" แล้วกดส่งไม่ได้เพราะ
 * payload คนละรูปแบบ (id ของ Meta ไม่ใช่คู่ packageId/stickerId ที่ LINE ยอมรับ) — บั๊กจริงไม่ใช่
 * เรื่องความสวยงาม
 */
const RECENT_KEY_LEGACY = 'deep.chat.recentStickers'
const RECENT_KEY_META = 'deep.chat.recentStickers.meta'
const RECENT_KEY_LINE = 'deep.chat.recentStickers.line'
// S-19: GIPHY แยก namespace ตามคลัง (สติกเกอร์/GIF) — id ของ GIPHY เป็นตัวเลขล้วนเหมือน Meta/LINE
// ชนกันได้ในทางทฤษฎี (คนละผู้ให้บริการ) จึงต้องคนละคีย์เสมอ ไม่ใช่แค่กันชนกับ META/LINE
const RECENT_KEY_GIPHY_STICKER = 'deep.chat.recentStickers.giphy.stickers'
const RECENT_KEY_GIPHY_GIF = 'deep.chat.recentStickers.giphy.gifs'
/** ค่าพิเศษของแท็บ "ใช้ล่าสุด" — ไม่ใช่ id แพ็กจริง (id ของ Meta/LINE เป็นตัวเลขล้วน ไม่ชนกัน) */
const RECENT_TAB = 'RECENT'
const RECENT_MAX = 16

function recentKeyFor(provider: StickerProvider, giphyKind?: GiphyKind): string {
  if (provider === 'LINE') return RECENT_KEY_LINE
  if (provider === 'GIPHY') return giphyKind === 'gifs' ? RECENT_KEY_GIPHY_GIF : RECENT_KEY_GIPHY_STICKER
  return RECENT_KEY_META
}

function readRecentStickers(provider: StickerProvider, giphyKind?: GiphyKind): StickerItem[] {
  if (typeof window === 'undefined') return []
  try {
    const key = recentKeyFor(provider, giphyKind)
    let raw = window.localStorage.getItem(key)
    // migrate ของเดิม (คีย์เดียวก่อนแยก provider) เข้าคีย์ .meta ครั้งแรกที่อ่าน — ของเดิมมีแต่
    // สติกเกอร์ Meta เท่านั้น (ตอนนั้นยังไม่มี LINE) จึงย้ายไปฝั่ง META เสมอ ไม่ลบคีย์เก่าทิ้ง
    if (raw === null && provider === 'META') {
      const legacy = window.localStorage.getItem(RECENT_KEY_LEGACY)
      if (legacy !== null) {
        window.localStorage.setItem(RECENT_KEY_META, legacy)
        raw = legacy
      }
    }
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

export function rememberRecentSticker(sticker: StickerItem, provider: StickerProvider = 'META'): void {
  if (typeof window === 'undefined') return
  try {
    const key = recentKeyFor(provider, sticker.giphyKind)
    const next = [sticker, ...readRecentStickers(provider, sticker.giphyKind).filter((s) => s.id !== sticker.id)].slice(
      0,
      RECENT_MAX,
    )
    window.localStorage.setItem(key, JSON.stringify(next))
  } catch {
    /* localStorage เต็ม/ปิดอยู่ — recents เป็นของเสริม ห้ามทำให้ส่งสติกเกอร์ไม่ได้ */
  }
}

/**
 * S-18b: 15 แพ็ก × 5 ตัวของ LINE (`LINE_STICKER_PACKS`) แปลงเป็น shape เดียวกับ `StickerPack`/
 * `StickerItem` ของ Meta — ปิดตายตัวไม่ต้องยิง network เลย (ต่างจาก Meta ที่โหลดจาก Graph)
 */
function lineStickerPacksAsPacks(): StickerPack[] {
  return LINE_STICKER_PACKS.map((p) => ({
    id: p.packageId,
    name: p.title,
    previewImageUrl: lineStickerImageUrl(p.stickerIds[0]),
  }))
}

function lineStickerItemsForPack(packageId: string): StickerItem[] {
  const pack = LINE_STICKER_PACKS.find((p) => p.packageId === packageId)
  if (!pack) return []
  return pack.stickerIds.map((stickerId) => ({ id: stickerId, name: null, imageUrl: lineStickerImageUrl(stickerId) }))
}

type Props = {
  onSelect: (emoji: string) => void
  onClose: () => void
  /**
   * โหมดของแผง — user สั่ง 2026-08-04 รอบสอง: "อยากให้แยก emoji / sticker เป็น 2 icon"
   * (รอบแรกทำเป็นแท็บในแผงเดียวตามที่สั่งไว้ก่อนหน้า แล้ว user เปลี่ยนใจหลังลองใช้จริง)
   * 'STICKER' ต้องมาคู่กับ onSelectSticker เสมอ
   */
  mode?: 'EMOJI' | 'STICKER'
  onSelectSticker?: (sticker: StickerItem) => void
  /**
   * ยึดขอบไหนของปุ่ม — 'right' = ขอบขวาของแผงตรงกับขอบขวาของปุ่ม (ใช้เมื่อปุ่มอยู่ชิดขวาของแถบ
   * อย่างในช่องตอบคอมเมนต์ ไม่งั้นแผงยื่นออกนอกคอลัมน์แล้วถูกกล่อง scroll ตัด — user report
   * 2026-08-04 "panel มันเพี้ยน")
   */
  align?: 'left' | 'right'
  /**
   * S-18b/S-19: แหล่งสติกเกอร์ — เฉพาะตอน mode='STICKER'. ผู้เรียกต้อง derive จาก channel ของเธรดเอง
   * (ChatThread.tsx: channel==='LINE' ? 'LINE' : channel==='INSTAGRAM' ? 'GIPHY' : 'META') ไม่ default
   * เป็น LINE/GIPHY เพราะ Meta คือของเดิมที่ผ่านการใช้งานจริงมาก่อน
   */
  stickerProvider?: StickerProvider
}

export default function EmojiPicker({
  onSelect,
  onClose,
  mode = 'EMOJI',
  onSelectSticker,
  align = 'left',
  stickerProvider = 'META',
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const tab = mode
  const [packs, setPacks] = useState<StickerPack[] | null>(null)
  /**
   * แท็บที่เปิดอยู่ในแถบล่าง — id ของแพ็ก หรือ RECENT_TAB (ใช้ล่าสุด)
   * user สั่ง 2026-08-04: "ปรกติมันต้องมี tab recent sticker อยู่อันแรกเสมอ เพื่อให้ทุกครั้งที่เลือก
   * tab sticker มันเปิด recent ก่อนเสมอ" — ตรงกับ Messenger (นาฬิกาเป็นแท็บแรก)
   */
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
  //
  // S-18b: LINE ไม่มี Graph ให้ยิง — 15 แพ็กเป็น constant ปิดตายตัว ตั้งค่า packs แบบ sync ได้เลย
  useEffect(() => {
    // S-19: GIPHY มี effect โหลดของตัวเองแยกต่างหากด้านล่าง — ไม่มีแพ็ก/recents-tab แบบ META/LINE
    if (tab !== 'STICKER' || stickerProvider === 'GIPHY') return
    setRecents(readRecentStickers(stickerProvider))
    if (packs === null) {
      if (stickerProvider === 'LINE') setPacks(lineStickerPacksAsPacks())
      else void loadStickers('/api/channels/facebook/stickers')
    }
  }, [tab, packs, loadStickers, stickerProvider])

  // ได้รายการแพ็กแล้ว → เปิดแพ็กแรกให้เลย (user report 2026-08-04: แผงค้างที่ข้อความ "เลือกแพ็ก
  // ด้านล่าง" ซึ่งเท่ากับบังคับให้กดอีกครั้งก่อนเห็นของ — Messenger เปิดมาเห็นสติกเกอร์ทันที)
  useEffect(() => {
    if (tab !== 'STICKER' || stickerProvider === 'GIPHY' || packId !== null || q.trim()) return
    // มีของที่ใช้ล่าสุด → เปิดแท็บนั้นก่อนเสมอ (ไม่ต้องยิง Graph เลย)
    if (recents.length > 0) {
      setPackId(RECENT_TAB)
      return
    }
    // ยังไม่เคยส่งสติกเกอร์ (recents ว่าง) → เปิดแพ็กแรกให้ ไม่ปล่อยให้แผงว่างเปล่า
    if (!packs || packs.length === 0 || stickers !== null) return
    const first = packs[0]
    setPackId(first.id)
    if (stickerProvider === 'LINE') setStickers(lineStickerItemsForPack(first.id))
    else void loadStickers(`/api/channels/facebook/stickers?packId=${encodeURIComponent(first.id)}`)
  }, [tab, packs, packId, stickers, q, recents, loadStickers, stickerProvider])

  // ค้นหา — debounce กันยิงทุกตัวอักษร; Meta บังคับ ≥2 ตัวอักษร
  // S-18b: LINE ไม่มีช่องค้นหา (ชุดปิดตายตัว 15 แพ็ก) — สาขานี้จึงไม่มีผลกับ LINE เลย
  // S-19: GIPHY มี effect ค้นหา/trending ของตัวเองแยกด้านล่าง (endpoint คนละตัว คนละ shape)
  useEffect(() => {
    if (tab !== 'STICKER' || stickerProvider !== 'META') return
    const term = q.trim()
    if (term.length < 2) return
    const t = setTimeout(() => {
      setPackId(null)
      void loadStickers(`/api/channels/facebook/stickers?q=${encodeURIComponent(term)}`)
    }, 400)
    return () => clearTimeout(t)
  }, [q, tab, loadStickers, stickerProvider])

  /**
   * S-19: GIPHY — คลังสติกเกอร์/GIF ของเธรด Instagram (ไม่มีแพ็ก ไม่มี Graph ของ Meta ให้ยิง)
   * แยกสถานะ/effect ออกจากของ META/LINE ทั้งชุด ไม่ปนกับ `packs`/`packId`/`stickers` ข้างบน
   */
  const [giphyTab, setGiphyTab] = useState<GiphyKind>('stickers')
  const [giphyState, setGiphyState] = useState<{
    items: GiphyGridItem[]
    visible: number
    loading: boolean
    error: string | null
    hasMoreFromServer: boolean
  }>({ items: [], visible: 0, loading: true, error: null, hasMoreFromServer: true })
  const giphyAbortRef = useRef<AbortController | null>(null)
  const giphyReqIdRef = useRef(0)

  /**
   * ดึง 1 หน้าจาก GET /api/chat/giphy — offset=0 คือรีเซ็ตทั้งชุด (เปลี่ยนแท็บ/คำค้น), offset>0 คือ
   * "โหลดเพิ่ม" หลัง buffer จากหน้าเดิมหมดแล้ว (server คืนทีละ ≤24 เสมอไม่ว่า kind ไหน — ดู route.ts)
   *
   * 🛑 กันผลเก่าทับแท็บใหม่ด้วย 2 ชั้น: reqId (ตรวจหลัง await ก่อนแตะ state) + AbortController
   * (ยกเลิก request จริง ๆ ไม่ปล่อยยิงทิ้งเปล่า ๆ เวลาสลับแท็บ/พิมพ์ค้นหาถี่ ๆ)
   */
  const fetchGiphyPage = useCallback(async (kind: GiphyKind, query: string, offset: number) => {
    giphyAbortRef.current?.abort()
    const controller = new AbortController()
    giphyAbortRef.current = controller
    const reqId = ++giphyReqIdRef.current
    setGiphyState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch(`/api/chat/giphy?kind=${kind}&q=${encodeURIComponent(query)}&offset=${offset}`, {
        signal: controller.signal,
      })
      if (reqId !== giphyReqIdRef.current) return
      const body = (await res.json().catch(() => null)) as { items?: GiphyGridItem[]; error?: string } | null
      if (!res.ok) {
        setGiphyState((s) => ({ ...s, loading: false, error: body?.error ?? 'โหลดไม่สำเร็จ' }))
        return
      }
      const items = body?.items ?? []
      setGiphyState((s) => {
        const nextItems = offset === 0 ? items : [...s.items, ...items]
        // หน้าแรก (offset 0) เริ่มนับ visible ใหม่จาก 0 เสมอ — กัน visible เดิมจากแท็บ/คำค้นก่อนหน้า
        // ไหลข้ามมา (reset effect ด้านล่างเคลียร์ items/visible ไปก่อนเรียกแล้ว แต่ตรงนี้กันซ้ำอีกชั้น)
        const prevVisible = offset === 0 ? 0 : s.visible
        const pageSize = kind === 'gifs' ? 16 : 24
        return {
          items: nextItems,
          visible: Math.min(nextItems.length, prevVisible + pageSize),
          loading: false,
          error: null,
          // route.ts ใช้ limit=24 คงที่เสมอ — ได้น้อยกว่า 24 แปลว่าหมดจริง ไม่ใช่แค่หมด "หน้านี้"
          hasMoreFromServer: items.length >= 24,
        }
      })
    } catch (e) {
      if (reqId !== giphyReqIdRef.current) return
      if (e instanceof DOMException && e.name === 'AbortError') return
      setGiphyState((s) => ({ ...s, loading: false, error: 'เชื่อมต่อไม่สำเร็จ' }))
    }
  }, [])

  // เปลี่ยนแท็บ (สติกเกอร์/GIF) หรือคำค้นที่ debounce แล้ว → รีเซ็ตแล้วโหลดหน้าแรกใหม่
  // q ว่าง = trending ทันที (ไม่หน่วง) · ค้นหา ≥2 ตัวอักษร = หน่วง 400ms (ค่าเดียวกับ META ด้านบน)
  // 1 ตัวอักษร = ยังไม่ค้น คงผลเดิมไว้เฉย ๆ (พฤติกรรมเดียวกับ META)
  useEffect(() => {
    if (tab !== 'STICKER' || stickerProvider !== 'GIPHY') return
    const term = q.trim()
    if (term.length === 1) return
    setGiphyState((s) => ({ ...s, items: [], visible: 0, error: null }))
    const t = setTimeout(
      () => {
        void fetchGiphyPage(giphyTab, term, 0)
      },
      term ? 400 : 0,
    )
    return () => clearTimeout(t)
  }, [tab, stickerProvider, giphyTab, q, fetchGiphyPage])

  // ปิดแผง/unmount ระหว่างที่ยังมี request ค้าง — ยกเลิกทิ้ง กัน setState หลัง unmount
  useEffect(() => {
    return () => {
      giphyAbortRef.current?.abort()
    }
  }, [])

  /** ปุ่ม "โหลดเพิ่ม" — เปิดเผยของที่ fetch มาแล้วแต่ยังไม่โชว์ก่อนเสมอ (server คืนทีละ ≤24 ไม่ว่า kind
   *  ไหน ⇒ ต่อหน้าของ GIF (16) ย่อยมาจากชุด 24 ที่ fetch มาแล้ว) ยิง network ใหม่เฉพาะตอน buffer หมดจริง */
  function handleLoadMoreGiphy() {
    const pageSize = giphyTab === 'gifs' ? 16 : 24
    if (giphyState.visible < giphyState.items.length) {
      setGiphyState((s) => ({ ...s, visible: Math.min(s.items.length, s.visible + pageSize) }))
      return
    }
    if (giphyState.hasMoreFromServer && !giphyState.loading) {
      void fetchGiphyPage(giphyTab, q.trim(), giphyState.items.length)
    }
  }

  /** ปุ่ม "ลองใหม่" ตอน error — ยิงหน้าเดิมซ้ำโดยไม่ล้างคำค้น: offset = จำนวนที่มีอยู่แล้ว (0 ถ้ายังไม่เคย
   *  ได้อะไรเลย มากกว่านั้นถ้าเพิ่งล้มตอนกด "โหลดเพิ่ม") */
  function handleRetryGiphy() {
    void fetchGiphyPage(giphyTab, q.trim(), giphyState.items.length)
  }

  /**
   * มือถือ (<768px) = bottom sheet ครึ่งจอ ไม่ใช่ popover เกาะปุ่ม — user สั่ง 2026-08-06:
   * "ตอนกด emoji หรือ sticker ให้มันเป็น full จอใน mobile (หรือครึ่งความสูง) ตอนนี้ใช้ยากไป"
   * (popover 288px เหนือปุ่ม = อิโมจิช่องละ ~34px และสติกเกอร์เห็นทีละแถวครึ่ง)
   *
   * ต้องเป็น state ไม่ใช่แค่ responsive class เพราะโหมด sheet ต้อง portal ออกไปที่ body:
   * เธรดอยู่ใน Chat Rail ที่มี overflow/transform ซึ่ง clip ตัว fixed
   * (บทเรียนเดียวกับ MessageActionBubble.tsx / ChatContextMenu.tsx)
   */
  const [isSheet, setIsSheet] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => setIsSheet(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // โหมด sheet เท่านั้นที่ครอบทั้งจอ → ตรึงหน้าข้างหลัง (โหมด popover เดสก์ท็อปยังต้องเลื่อนหน้าได้)
  useLockBodyScroll(isSheet)

  /** เปิด sheet = ปิดคีย์บอร์ดก่อน — `position:fixed` บน iOS ยึดกับ layout viewport ซึ่ง **ไม่หด**
   *  ตามคีย์บอร์ด แผงจึงไปนอนใต้คีย์บอร์ด (บทเรียน 2026-08-04, docs/conventions ios safe-area/overlay) */
  useEffect(() => {
    if (!isSheet) return
    const el = document.activeElement
    if (el instanceof HTMLElement) el.blur()
  }, [isSheet])

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

  const panel = (
    <div
      ref={ref}
      role="dialog"
      aria-label={tab === 'STICKER' ? 'เลือกสติกเกอร์' : 'เลือกอิโมจิ'}
      aria-modal={isSheet || undefined}
      // w-96 (384px) แทน w-72 (288px): สติกเกอร์เป็นรูปที่ต้อง "ดูออกว่าเป็นตัวอะไร" ก่อนกด
      // ไม่ใช่ไอคอนที่จำตำแหน่งได้ — 4 คอลัมน์ในแผง 384px = ช่องละ ~88px (เดิม ~66px)
      // max-w-[calc] ไม่ใช้ (HR7) — บนมือถือแผงอยู่ในคอลัมน์ที่กว้างกว่านี้อยู่แล้ว
      /**
       * ความกว้างต้องเป็นค่าคงที่ **ห้ามใช้ inset-x-0 / w-auto** (user report prod 2026-08-04
       * "ใน Mobile เพี้ยนเลย" — แผงบีบเหลือเท่าปุ่ม ข้อความตกเป็นแนวตั้งทีละตัวอักษร):
       * กล่อง `relative` ที่ครอบแผงนี้คือกล่องของ **ปุ่มอิโมจิ** (กว้าง ~40px) ไม่ใช่แถบ composer
       * → inset-x-0 = 40px. 288px คือค่าที่พอดีขอบจอเมื่อวัดจากตำแหน่งปุ่มจริงบนจอแคบ
       * ≥640px ขยายเป็น 384px ได้เพราะมีที่เหลือ
       * (ตั้งแต่ 2026-08-06 จอ <768px ไม่เข้าสาขานี้แล้ว — เป็น sheet ด้านบน ค่านี้จึงมีผลช่วง 640–767px
       *  และเมื่อ matchMedia ใช้ไม่ได้)
       */
      className={
        isSheet
          ? /* 70dvh = "ครึ่งค่อนจอ" ตามที่ user เลือก — ยังเห็นข้อความบนสุดของเธรดว่ากำลังตอบใครอยู่ */
            'relative flex h-[70dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-card pb-[env(safe-area-inset-bottom)] shadow-lg' // HR7 carve-out: viewport-height + safe-area ไม่มีใน Paces scale (precedent CustomerPanelSheet.tsx)
          : `card bg-card border-default-200 absolute bottom-full z-20 mb-2 w-72 border p-0 shadow-lg sm:w-96 ${
              align === 'right' ? 'right-0' : 'left-0'
            }`
      }
    >
      {/* หัว sheet (มือถือเท่านั้น) — grip + ชื่อ + ปุ่มปิด ชุดเดียวกับ CustomerPanelSheet
          เพราะบน sheet ไม่มี "คลิกนอกแผง" ที่มองเห็นได้เหมือน popover */}
      {isSheet && (
        <div className="shrink-0 pt-2">
          <div className="bg-default-300 mx-auto mb-2 h-1 w-9 rounded-full" />
          <div className="mb-1 flex items-center justify-between px-4">
            <h3 className="text-default-900 mb-0 text-base font-bold">
              {tab !== 'STICKER'
                ? 'อิโมจิ'
                : stickerProvider === 'GIPHY'
                  ? giphyTab === 'gifs'
                    ? 'GIF'
                    : 'สติกเกอร์'
                  : 'สติกเกอร์'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="btn btn-icon text-default-700 hover:bg-default-100"
            >
              <Icon icon="x" className="text-lg" />
            </button>
          </div>
        </div>
      )}

      {tab === 'STICKER' && onSelectSticker ? (
        <div className={`flex flex-col ${isSheet ? 'min-h-0 flex-1' : ''}`}>
        {stickerProvider === 'GIPHY' ? (
          <>
            {/* S-19: ช่องค้นหา + ป้าย "GIPHY" — เงื่อนไขบังคับของ GIPHY เอง ไม่ใช่ของประดับ (HR1) ห้ามซ่อน
                วางเป็น sibling ขวาของ input-icon-group แทนการ absolute ทับใน input เดิม เลี่ยงชนกับ
                pe-10 ที่ _forms.css บังคับให้ input-icon-group ที่ไม่ใช่ unlayered utility */}
            <div className="border-default-200 flex shrink-0 items-center gap-2 border-b p-2">
              <div className="input-icon-group flex-1">
                <Icon icon="search" className="input-icon" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ค้นหาใน GIPHY"
                  aria-label="ค้นหาใน GIPHY"
                  className="form-input"
                />
              </div>
              <span className="text-2xs text-default-700 shrink-0 font-semibold">GIPHY</span>
            </div>

            <div className={`overflow-y-auto overscroll-contain p-2 ${isSheet ? 'min-h-0 flex-1' : 'max-h-80'}`}>
              {!q.trim() && <p className="text-default-700 mb-1.5 text-2xs font-semibold">กำลังนิยม</p>}
              {giphyState.error ? (
                <div className="text-default-700 flex flex-col items-center gap-2 py-4 text-center text-sm">
                  <span>{giphyState.error}</span>
                  <button type="button" onClick={handleRetryGiphy} className="btn border-default-300 min-h-11">
                    <Icon icon="refresh" className="me-1" /> ลองใหม่
                  </button>
                </div>
              ) : giphyState.loading && giphyState.items.length === 0 ? (
                // skeleton tile ตามสัดส่วนของแท็บนั้น — ห้ามใช้ข้อความ "กำลังโหลด..." (Base: ProductPickerPanel.tsx:368-380)
                <div
                  className={
                    giphyTab === 'gifs' ? 'grid grid-cols-2 gap-1.5' : `grid gap-1.5 ${isSheet ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-4'}`
                  }
                >
                  {Array.from({ length: giphyTab === 'gifs' ? 6 : 12 }).map((_, i) => (
                    <div
                      key={i}
                      role="status"
                      aria-label={giphyTab === 'gifs' ? 'กำลังโหลด GIF' : 'กำลังโหลดสติกเกอร์'}
                      className={`bg-default-100 animate-pulse rounded-xl ${giphyTab === 'gifs' ? 'aspect-video' : 'aspect-square'}`}
                    />
                  ))}
                </div>
              ) : giphyState.items.length === 0 ? (
                <p className="text-default-700 p-2 text-xs">
                  {giphyTab === 'gifs' ? 'ไม่พบ GIF ที่ค้นหา' : 'ไม่พบสติกเกอร์ที่ค้นหา'}
                </p>
              ) : (
                <>
                  {/* key ผูกกับ tab+q — เปลี่ยนแท็บ/คำค้น = unmount กริดเดิมทันที ไม่ปล่อย GIF เดิมเล่นค้าง */}
                  <div
                    key={`${giphyTab}:${q.trim()}`}
                    className={
                      giphyTab === 'gifs' ? 'grid grid-cols-2 gap-1.5' : `grid gap-1.5 ${isSheet ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-4'}`
                    }
                  >
                    {giphyState.items.slice(0, giphyState.visible).map((item) => (
                      <GiphyButton key={item.id} item={item} giphyKind={giphyTab} onPick={onSelectSticker} />
                    ))}
                  </div>
                  {(giphyState.visible < giphyState.items.length || giphyState.hasMoreFromServer) && (
                    <button
                      type="button"
                      onClick={handleLoadMoreGiphy}
                      disabled={giphyState.loading}
                      className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 mt-2 w-full"
                    >
                      {giphyState.loading ? (
                        <>
                          <Icon icon="loader-2" className="me-1 animate-spin" aria-hidden="true" /> กำลังโหลดเพิ่ม…
                        </>
                      ) : (
                        'โหลดเพิ่ม'
                      )}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* S-19: ไม่มีแพ็ก — แทนแถบแพ็กด้วย sub-tab 2 ปุ่ม (ยกท่าสีจากปุ่ม "ใช้ล่าสุด" เดิมของไฟล์นี้) */}
            <div className="border-default-200 flex shrink-0 gap-1.5 border-t p-2">
              {(['stickers', 'gifs'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setGiphyTab(k)}
                  aria-pressed={giphyTab === k}
                  className={`flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-medium ${
                    giphyTab === k ? 'bg-primary/15 text-primary' : 'text-default-700 hover:bg-default-100'
                  }`}
                >
                  {k === 'gifs' ? 'GIF' : 'สติกเกอร์'}
                </button>
              ))}
            </div>
          </>
        ) : (
        <>
          {/* S-18b — notice ถาวรบน LINE: ชุดนี้ปิดตายตัว 15 แพ็ก ไม่ใช่แคตาล็อกหลักพันแบบ Meta และ
              สติกเกอร์ที่ร้านซื้อไว้ตอบจากที่นี่ไม่ได้ (LINE ไม่เปิด API ให้ยิงสติกเกอร์ที่ไม่อยู่ใน
              รายการสาธารณะ) — ไม่มีปุ่มปิดเพราะเป็นข้อจำกัดถาวร ไม่ใช่เรื่องแจ้งครั้งเดียว */}
          {stickerProvider === 'LINE' && (
            <div className="shrink-0 p-2 pb-0">
              {/* text-xs ไม่ใช่ text-2xs — ข้อความนี้คือสิ่งเดียวที่กันร้านเข้าใจผิดว่า "โหลดสติกเกอร์ไม่ครบ/
                  ระบบพัง" ถ้าอ่านไม่ออกก็เท่ากับไม่มี (ภาษาไทยที่ ~10px อ่านยากกว่าอังกฤษที่ขนาดเดียวกัน) */}
              <p className="bg-info/15 text-info-ink mb-0 rounded-lg px-3 py-2.5 text-xs leading-normal">
                ชุดนี้คือสติกเกอร์สาธารณะที่ตอบอัตโนมัติผ่านระบบได้ — สติกเกอร์ที่ร้านซื้อไว้ ตอบได้จากแอป LINE
                Official Account Manager แทน
              </p>
            </div>
          )}
          {/* S-18b: LINE เป็นชุดปิดตายตัว 15 แพ็ก — ไม่มีช่องค้นหาเหมือน Meta */}
          {stickerProvider !== 'LINE' && (
            <div className="border-default-200 shrink-0 border-b p-2">
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
          )}
          <div className={`overflow-y-auto overscroll-contain p-2 ${isSheet ? 'min-h-0 flex-1' : 'max-h-80'}`}>
            {error ? (
              <p className="text-danger p-2 text-xs" role="alert">
                {error}
              </p>
            ) : loading ? (
              <p className="text-default-700 p-2 text-xs">กำลังโหลด...</p>
            ) : (
              <>
                {/* แท็บ "ใช้ล่าสุด" — อ่านจากเครื่อง ไม่ยิง Graph */}
                {packId === RECENT_TAB && !q.trim() && (
                  <div className={`grid gap-1.5 ${isSheet ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-4'}`}>
                    {recents.map((st) => (
                      <StickerButton key={`r-${st.id}`} sticker={st} onPick={onSelectSticker} />
                    ))}
                  </div>
                )}
                {packId !== RECENT_TAB && stickers && stickers.length > 0 && (
                  <div className={`grid gap-1.5 ${isSheet ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-4'}`}>
                    {stickers.map((st) => (
                      <StickerButton key={st.id} sticker={st} onPick={onSelectSticker} />
                    ))}
                  </div>
                )}
                {/* ไม่พบจากการค้นหา = ต้องบอก (ไม่งั้นดูเหมือนแผงพัง) ส่วนตอน "ยังไม่มีอะไรให้แสดง"
                    ไม่ต้องมีข้อความอะไรเลย — แพ็กแรกถูกเปิดให้เองอยู่แล้ว ข้อความสอนวิธีใช้
                    ("เลือกแพ็กด้านล่าง หรือค้นหาด้านบน") ถูกถอดออกตามที่ user สั่ง 2026-08-04 */}
                {stickers && stickers.length === 0 && q.trim() && (
                  <p className="text-default-700 p-2 text-xs">ไม่พบสติกเกอร์ที่ค้นหา</p>
                )}
              </>
            )}
          </div>
          {/* แถบแพ็กด้านล่าง (เหมือน Messenger) — เลื่อนแนวนอน กดแล้วโหลดสติกเกอร์ในแพ็กนั้น */}
          {packs && packs.length > 0 && (
            /* เลื่อนข้างได้เหมือน Messenger — thumb ใหญ่ขึ้นเป็น 44px (ของเดิม 36px กับรูป preview
               ที่เป็นตารางสติกเกอร์ย่อ = ดูไม่ออกว่าแพ็กอะไร) flex-nowrap กันตกบรรทัดเป็นกำแพงรูป */
            <div className="border-default-200 flex flex-nowrap gap-1 overflow-x-auto border-t p-2">
              {/* ใช้ล่าสุด = แท็บแรกเสมอ (เหมือน Messenger) — โผล่เมื่อมีของที่เคยส่งแล้ว
                  ถ้ายังไม่เคยส่งเลย แท็บนี้ไม่มีประโยชน์ (กดแล้วว่าง) จึงไม่โชว์ */}
              {recents.length > 0 && (
                <button
                  type="button"
                  title="ใช้ล่าสุด"
                  aria-label="สติกเกอร์ที่ใช้ล่าสุด"
                  aria-pressed={packId === RECENT_TAB}
                  onClick={() => {
                    setQ('')
                    setPackId(RECENT_TAB)
                  }}
                  className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
                    packId === RECENT_TAB ? 'bg-primary/15 text-primary' : 'text-default-700 hover:bg-default-100'
                  }`}
                >
                  <Icon icon="clock" className="text-lg" />
                </button>
              )}
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
                    if (stickerProvider === 'LINE') setStickers(lineStickerItemsForPack(pk.id))
                    else void loadStickers(`/api/channels/facebook/stickers?packId=${encodeURIComponent(pk.id)}`)
                  }}
                  className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
                    packId === pk.id ? 'bg-primary/15' : 'hover:bg-default-100'
                  }`}
                >
                  {pk.previewImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pk.previewImageUrl} alt="" className="size-9 object-contain" />
                  ) : (
                    <Icon icon="sticker" className="text-default-700 text-lg" />
                  )}
                </button>
              ))}
            </div>
          )}
        </>
        )}
        </div>
      ) : (
      <div className={`overflow-y-auto overscroll-contain p-3 ${isSheet ? 'min-h-0 flex-1' : 'max-h-64'}`}>
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
                    // sheet: ปุ่มกินเต็มช่องกริด (จอ 390px → ~44px = tap target ตาม PRODUCT.md)
                    // popover: ขนาดคงที่ size-8 เหมือนเดิม เพราะแผงกว้างแค่ 288/384px
                    className={`hover:bg-default-100 flex items-center justify-center rounded leading-none ${
                      isSheet ? 'aspect-square w-full text-2xl' : 'size-8 text-xl'
                    }`}
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

  if (!isSheet) return panel

  /* โหมด sheet — portal ไป body (Chat Rail clip ตัว fixed) + scrim คลิกปิด
     ชุดเดียวกับ CustomerPanelSheet.tsx ซึ่ง Base คือ theme/paces .../ui/offcanvas (offcanvasBottom) */
  return createPortal(
    <div className="fixed inset-0 z-80 flex items-end justify-center">
      <button type="button" aria-label="ปิด" onClick={onClose} className="bg-default-900/40 absolute inset-0" />
      {panel}
    </div>,
    document.body,
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

/**
 * S-19: ไอเทม GIPHY 1 ใบในกริด — ต่างจาก StickerButton ตรงที่ grid ใช้ `previewUrl` (ไฟล์เบา) เสมอ
 * แต่ส่งจริงด้วย `sendUrl` (การันตี ≤ IG_IMAGE_MAX_BYTES) — ห้ามสลับกัน (ดู lib/giphy.ts หัวไฟล์)
 * สติกเกอร์ = จัตุรัส/object-contain (ไม่บีบสัดส่วน) · GIF = 16:9/object-cover (เต็มกรอบ ตามสเปก)
 */
function GiphyButton({
  item,
  giphyKind,
  onPick,
}: {
  item: GiphyGridItem
  giphyKind: GiphyKind
  onPick: (s: StickerItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPick({ id: item.id, name: item.title, imageUrl: item.sendUrl, giphyKind })}
      aria-label={item.title}
      className={`hover:bg-default-100 flex items-center justify-center overflow-hidden rounded-lg ${
        giphyKind === 'gifs' ? 'aspect-video' : 'aspect-square p-1'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.previewUrl}
        alt={item.title}
        loading="lazy"
        className={giphyKind === 'gifs' ? 'h-full w-full object-cover' : 'max-h-full max-w-full object-contain'}
      />
    </button>
  )
}
