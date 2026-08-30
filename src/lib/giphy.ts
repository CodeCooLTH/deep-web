/**
 * giphy — คลังสติกเกอร์/GIF สำหรับเธรด Instagram
 *
 * 🛑 ทำไมต้องเป็น GIPHY ไม่ใช่ API ของ Meta: สติกเกอร์/GIF ในแอป Instagram **คือ GIPHY**
 * (แท็บในแอปเขียนหัวข้อว่า `GIPHY` และ `Search GIPHY` ตรง ๆ) ส่วน Meta **ไม่มี sticker API ให้ IG เลย**
 * — `/sticker_packs` + `/sticker_search` ที่โปรเจกต์นี้ใช้อยู่เป็นของ **Messenger** คนละคลังคนละเจ้า
 * เธรด IG เคยถูกเหมารวมเป็น META จึงได้แผงที่เลือกไปก็ส่งไม่ผ่าน (พบ 2026-08-26)
 *
 * ส่งเข้า IG ได้เพราะเอกสาร Attachment Upload API ระบุว่า
 *   *"Media types can be **image (which include GIFs)**"* · Image: png, jpeg, **gif** ≤ **8MB**
 * ⇒ หยิบ URL ของ `.gif` จาก GIPHY แล้วยิงเป็น `attachment.type = "image"` ได้ตรง ๆ
 *
 * 🛑 **server-only** — คีย์ห้ามหลุดถึง client (ไฟล์นี้ห้าม import จาก component ที่มี 'use client')
 */

import 'server-only'

const GIPHY_BASE = 'https://api.giphy.com/v1'

/**
 * เพดานของ Instagram (เอกสาร Attachment Upload API) — ตัวเลขนี้เป็น "ของปลายทาง" ไม่ใช่ของเรา
 * ห้ามแก้ตามใจ ถ้า Meta เปลี่ยนต้องอ้างเอกสารกำกับ
 */
export const IG_IMAGE_MAX_BYTES = 8 * 1024 * 1024

/** เนื้อหาที่ยอมให้แสดง — `g` เท่านั้น: นี่คือเครื่องมือทำงานของร้านค้า ไม่ใช่แอปโซเชียล */
const RATING = 'g'

export type GiphyKind = 'stickers' | 'gifs'

export type GiphyItem = {
  id: string
  /** คำอธิบายจาก GIPHY — ใช้เป็น alt text (a11y) ไม่ใช่ของประดับ */
  title: string
  /** ไฟล์เล็กสำหรับกริดในแผง (เคลื่อนไหวได้ แต่เบา) */
  previewUrl: string
  previewWidth: number
  previewHeight: number
  /** ไฟล์ที่จะส่งเข้า Instagram จริง — การันตีแล้วว่า ≤ IG_IMAGE_MAX_BYTES */
  sendUrl: string
  sendBytes: number
}

type GiphyRendition = { url?: string; width?: string; height?: string; size?: string }
type GiphyRow = { id?: string; title?: string; images?: Record<string, GiphyRendition> }

const toInt = (v: string | undefined): number => {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) ? n : 0
}

/**
 * เลือกไฟล์ที่จะ "ส่งจริง" — ใหญ่ที่สุดเท่าที่ยังไม่เกินเพดานของ Instagram
 *
 * 🛑 ไล่จากคมชัดสุดลงมา ไม่ใช่หยิบตัวเล็กสุดไว้ก่อน: สติกเกอร์ส่วนใหญ่หนักไม่ถึง 1MB อยู่แล้ว
 * การหยิบ 100px ไปส่งทั้งที่ 480px ผ่านเพดานสบาย ๆ = ลูกค้าได้ภาพแตกโดยไม่จำเป็น
 *
 * `size` ของ GIPHY เป็นสตริงและบางเรนดิชันรายงานเท่ากันหมด (เห็นจริงกับ sticker ที่ทดสอบ)
 * ⇒ ต้อง parse เองและ **ข้ามตัวที่อ่านขนาดไม่ได้** ห้ามเดาว่าเล็กพอ — ส่งเกินเพดานแล้ว Meta ปฏิเสธ
 * ทั้งใบ ซึ่งผู้ขายจะเห็นเป็น "ส่งไม่สำเร็จ" โดยไม่รู้ว่าเพราะอะไร
 */
function pickSendRendition(images: Record<string, GiphyRendition>): { url: string; bytes: number } | null {
  const order = [
    'original',
    'downsized_large',
    'downsized_medium',
    'downsized',
    'fixed_width',
    'fixed_width_downsampled',
    'fixed_width_small',
  ]
  for (const key of order) {
    const r = images[key]
    const bytes = toInt(r?.size)
    // .gif เท่านั้น — GIPHY มี .webp/.mp4 ปนอยู่ในบางเรนดิชัน และ IG รับ image เฉพาะ png/jpeg/gif
    if (r?.url && bytes > 0 && bytes <= IG_IMAGE_MAX_BYTES && r.url.includes('.gif')) {
      return { url: r.url, bytes }
    }
  }
  return null
}

/** ไฟล์สำหรับกริด — เบาที่สุดที่ยังเคลื่อนไหวได้ (แผงเปิดทีเดียวหลายสิบใบ) */
function pickPreviewRendition(images: Record<string, GiphyRendition>): GiphyRendition | null {
  return (
    images.fixed_width_downsampled ??
    images.preview_gif ??
    images.fixed_width_small ??
    images.fixed_width ??
    null
  )
}

function normalize(row: GiphyRow): GiphyItem | null {
  const images = row.images ?? {}
  const preview = pickPreviewRendition(images)
  const send = pickSendRendition(images)
  // ไม่มีอย่างใดอย่างหนึ่ง = แสดงให้เลือกไม่ได้หรือเลือกแล้วส่งไม่ได้ — ตัดทิ้งตั้งแต่ต้นทาง
  // ดีกว่าปล่อยขึ้นกริดแล้วให้ผู้ขายกดโดนของที่ส่งไม่ออก
  if (!row.id || !preview?.url || !send) return null
  return {
    id: row.id,
    title: row.title?.trim() || 'สติกเกอร์',
    previewUrl: preview.url,
    previewWidth: toInt(preview.width) || 200,
    previewHeight: toInt(preview.height) || 200,
    sendUrl: send.url,
    sendBytes: send.bytes,
  }
}

export class GiphyError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message)
    this.name = 'GiphyError'
  }
}

/**
 * ค้นหา / trending — `q` ว่าง = trending (ตรงกับพฤติกรรมแผงในแอป IG ที่เปิดมาเห็นของฮิตก่อน)
 *
 * ไม่ throw เมื่อ GIPHY คืนผลว่าง (คืน [] ปกติ) — throw เฉพาะตอน "ถามไม่สำเร็จ" เพื่อให้หน้าจอ
 * แยก "ไม่มีผลลัพธ์" (บอกให้ลองคำอื่น) ออกจาก "ระบบมีปัญหา" (บอกให้กดใหม่) ได้จริง
 */
export async function searchGiphy(params: {
  kind: GiphyKind
  q?: string
  limit?: number
  offset?: number
  lang?: string
}): Promise<GiphyItem[]> {
  const apiKey = process.env.GIPHY_API_KEY
  // fail-closed: ไม่มีคีย์ = ฟีเจอร์ยังไม่ถูกตั้งค่า ไม่ใช่ "ไม่มีสติกเกอร์"
  if (!apiKey) throw new GiphyError('GIPHY_API_KEY_MISSING', 500)

  const q = params.q?.trim() ?? ''
  const path = q ? `${params.kind}/search` : `${params.kind}/trending`
  const query = new URLSearchParams({
    api_key: apiKey,
    limit: String(Math.min(Math.max(params.limit ?? 24, 1), 50)),
    offset: String(Math.max(params.offset ?? 0, 0)),
    rating: RATING,
  })
  if (q) query.set('q', q)
  if (params.lang) query.set('lang', params.lang)

  const res = await fetch(`${GIPHY_BASE}/${path}?${query.toString()}`, {
    // ผลลัพธ์ trending/ค้นหาเปลี่ยนช้า แต่ไม่อยากให้ค้างข้ามวัน — cache สั้น ๆ ลดโควตาคีย์ beta
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new GiphyError(`GIPHY ${res.status}`, res.status)

  const json = (await res.json().catch(() => ({}))) as { data?: GiphyRow[] }
  return (json.data ?? []).map(normalize).filter((x): x is GiphyItem => x !== null)
}
