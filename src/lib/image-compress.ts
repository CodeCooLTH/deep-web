/**
 * image-compress — ตัวกลางเตรียมไฟล์ก่อนอัปโหลด: บีบรูปในเบราว์เซอร์ + แก้ชื่อ .jfif (2026-10-01)
 *
 * spec: docs/superpowers/specs/2026-10-01-image-compress-upload-design.md
 *
 * 🛑 **ทุกการอัปโหลดต้องผ่านที่นี่** — `uploadToStorage` (upload-client.ts) เรียก `prepareUploadFile`
 * ก่อนขอ ticket เสมอ ห้ามหน้าไหนบีบเองหรือยิง ticket เอง (user สั่ง 2026-10-01 · มีเทส guard)
 *
 * ทำไมบีบฝั่งเบราว์เซอร์ ไม่ใช่ server (sharp):
 *   - ได้ความเร็วอัปโหลดด้วย — รูปกล้องมือถือ 3–15MB เหลือ 0.3–1MB ก่อนออกจากเครื่อง
 *   - ไม่มีการเขียนทับอะไรบน server เลย (กฎถาวร: ห้ามลบ/เขียนทับต้นฉบับ — ดู image-variants.ts)
 *     ไฟล์ที่บีบแล้วคือ "ต้นฉบับ" ของระบบตั้งแต่แรก ส่วนไฟล์เก่าในบัคเก็ตไม่ถูกแตะ
 *
 * 🛑 **การอัปโหลดห้ามพังเพราะการบีบ** — ทุก error (มือถือเก่าหน่วยความจำไม่พอ, ไฟล์เสีย, เบราว์เซอร์
 * encode ไม่ได้) = ส่งไฟล์เดิมเงียบ ๆ · อัปไม่ได้คือความเสียหายจริง ส่วนไม่ได้บีบคือช้าเท่าเดิม
 *
 * 🛑 **ไม่ออกเป็น WebP** — รูป purpose IMAGE บางจุด (ข้อความด่วน, รูปตอบคอมเมนต์) ถูกส่งต่อเข้า
 * IG/LINE ที่ไม่รับ webp · ทึบ = JPEG, มีพื้นใส = PNG ปลอดภัยทุกช่องทาง
 *
 * ไฟล์นี้ import ได้จากทุกที่ (ไม่แตะ DOM ตอน import) — ส่วนที่ใช้ canvas ทำงานเฉพาะตอนเรียกในเบราว์เซอร์
 */

import { extFromName, formatSizeMB } from '@/lib/chat-attachment'
import {
  MAX_RAW_IMAGE_INPUT,
  normalizeUploadExt,
  normalizeUploadMime,
  uploadMaxSize,
  type UploadPurpose,
} from '@/lib/upload-policy'

export type CompressProfile = 'standard' | 'document' | 'off'

export type CompressSpec = {
  /** ด้านยาวสุดของผลลัพธ์ (px) — fit-inside ไม่ครอป ไม่ขยาย */
  maxEdge: number
  /** คุณภาพ JPEG 0–1 */
  quality: number
  /** ไฟล์เล็กกว่านี้ไม่บีบ (ได้ไม่คุ้มเสีย) */
  minBytes: number
}

/**
 * SSOT ของระดับการบีบ
 *
 * standard 2048/0.85 — จอมือถือแทบแยกไม่ออกจากต้นฉบับ · variant lg (1280) ของ 00054 ยังสร้างได้เต็มคุณภาพ
 * document 3000/0.92 + ข้าม < 1.5MB — KYC/สลิปต้องอ่านตัวเลขด้วยตา: ภาพหน้าจอสลิป (~1080×2400, < 1MB)
 *   ผ่านไปตามเดิมทั้งไฟล์ (JPEG ทำตัวหนังสือเป็นรอย) · เฉพาะรูปถ่ายเอกสารจากกล้องที่ใหญ่จริงถูกบีบเบา ๆ
 */
export const COMPRESS_PROFILES: Record<Exclude<CompressProfile, 'off'>, CompressSpec> = {
  standard: { maxEdge: 2048, quality: 0.85, minBytes: 300 * 1024 },
  document: { maxEdge: 3000, quality: 0.92, minBytes: 1.5 * 1024 * 1024 },
}

/** ระดับตั้งต้นตาม purpose — จุดที่ต้องการต่างจากนี้ (หลักฐาน, rich menu) ส่ง `compress` เอง */
export function defaultCompressProfile(purpose: UploadPurpose): CompressProfile {
  return purpose === 'DOCUMENT' ? 'document' : 'standard'
}

/**
 * ชนิดที่บีบได้ — 🛑 ไม่มี gif (ภาพเคลื่อนไหวหาย) · heic ไม่อยู่ในนี้เพราะเบราว์เซอร์ส่วนใหญ่ decode ไม่ได้
 * และ server ไม่รับอยู่แล้ว (ไม่อยากให้ผลลัพธ์ต่างกันตามเบราว์เซอร์แบบที่ผู้ใช้เดาไม่ได้)
 */
const COMPRESSIBLE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** ชนิดที่อาจมีพื้นใส — JPEG ไม่มี alpha ไม่ต้องเสียเวลาสแกน */
const ALPHA_CAPABLE_MIME = new Set(['image/png', 'image/webp'])

export function replaceExt(name: string, ext: string): string {
  const dot = name.lastIndexOf('.')
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`
}

/**
 * แก้ชื่อ/ชนิดของ JPEG ที่ใช้ชื่อเรียกอื่น (.jfif/.jpe/…) — ทำเสมอ แม้ profile = off หรือบีบไม่สำเร็จ
 * คืน object เดิมถ้าไม่มีอะไรต้องแก้
 */
export function normalizeUploadFile(file: File): File {
  const ext = extFromName(file.name)
  const nextExt = normalizeUploadExt(ext)
  const nextType = normalizeUploadMime(file.type, ext)
  if (nextExt === ext && nextType === file.type) return file
  const name = nextExt === ext ? file.name : replaceExt(file.name, nextExt)
  return new File([file], name, { type: nextType, lastModified: file.lastModified })
}

export function shouldAttemptCompression(file: File, profile: CompressProfile): boolean {
  if (profile === 'off') return false
  if (!COMPRESSIBLE_MIME.has(file.type)) return false
  return file.size >= COMPRESS_PROFILES[profile].minBytes
}

export function fitInside(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * เพดานขนาดของ "ไฟล์ที่ผู้ใช้เลือก" สำหรับตรวจบนหน้าจอก่อนส่ง
 *
 * รูปที่ตัวบีบย่อได้ใช้ `MAX_RAW_IMAGE_INPUT` (40MB) — เพดาน 5/10MB เดิมของแต่ละหน้าปฏิเสธรูปกล้อง
 * 8–15MB ทิ้งทั้งที่บีบแล้วเหลือไม่ถึง 1MB · ไฟล์อื่น (pdf/gif/วิดีโอ) และ profile off ใช้เพดาน purpose
 * ด่านจริงยังเป็น server ที่ตรวจขนาดหลังบีบ — ตัวนี้แค่กันผู้ใช้รอส่งไฟล์ที่ไม่มีทางผ่าน
 *
 * 🛑 หน้าใหม่ห้ามเขียนเลขเพดานเอง ใช้ตัวนี้ (เลขที่เขียนเองคือที่มาของ 5/10MB ที่ไม่ตรงกันทั้งระบบ)
 */
export function pickSizeLimit(file: File, purpose: UploadPurpose, profile?: CompressProfile): number {
  const p = profile ?? defaultCompressProfile(purpose)
  const compressible = p !== 'off' && COMPRESSIBLE_MIME.has(normalizeUploadFile(file).type)
  return compressible ? MAX_RAW_IMAGE_INPUT : uploadMaxSize(purpose)
}

/** ข้อความพร้อมโชว์เมื่อไฟล์ใหญ่เกิน `pickSizeLimit` — ไม่เกินคืน null */
export function pickSizeError(
  file: File,
  purpose: UploadPurpose,
  profile?: CompressProfile,
  noun = 'ไฟล์',
): string | null {
  const limit = pickSizeLimit(file, purpose, profile)
  return file.size > limit ? `${noun}ใหญ่เกินไป (สูงสุด ${formatSizeMB(limit)} MB)` : null
}

/** ตัว encode — คืน null เมื่อทำไม่ได้ (แยกออกมาให้เทสฉีดตัวปลอมได้) */
export type Encoder = (file: File, spec: CompressSpec) => Promise<File | null>

/**
 * คิวจำกัดการบีบพร้อมกัน — `ProductImagesCardV2` อัปทั้งชุดด้วย `Promise.all` ถ้าผู้ขายลาก 10 รูป
 * 12MP จะ decode พร้อมกัน 10 ใบ (~480MB) → WebView ของแอปผู้ขายโดน OS ฆ่า ซึ่งแย่กว่าไม่บีบเลย
 */
const MAX_CONCURRENT = 2
let active = 0
const waiting: Array<() => void> = []

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve))
  active++
  try {
    return await task()
  } finally {
    active--
    waiting.shift()?.()
  }
}

/** แกนของ `prepareUploadFile` — รับ encoder เข้ามาเพื่อเทส (ของจริงใช้ `encodeWithCanvas`) */
export async function prepareUploadFileWith(
  file: File,
  profile: CompressProfile,
  encode: Encoder,
): Promise<File> {
  const normalized = normalizeUploadFile(file)
  if (!shouldAttemptCompression(normalized, profile) || profile === 'off') return normalized
  const spec = COMPRESS_PROFILES[profile]
  try {
    const out = await withSlot(() => encode(normalized, spec))
    return out && out.size > 0 && out.size < normalized.size ? out : normalized
  } catch {
    return normalized
  }
}

/**
 * เตรียมไฟล์ก่อนอัปโหลด — ไม่ throw ในทุกกรณี
 * ไฟล์ที่ไม่ใช่รูป (pdf/วิดีโอ/เอกสาร) คืนไฟล์เดิม; รูปที่บีบได้คืน File ใหม่ (ชื่อ/ชนิดตรงกับเนื้อไฟล์)
 */
export function prepareUploadFile(file: File, profile: CompressProfile): Promise<File> {
  return prepareUploadFileWith(file, profile, encodeWithCanvas)
}

// ── ส่วนที่ใช้ DOM ─────────────────────────────────────────────────────────

/**
 * decode ด้วย `<img>` ไม่ใช่ `createImageBitmap` — ตัวเลือก `imageOrientation` ของตัวหลังรองรับไม่เท่ากัน
 * (Safari/WKWebView เก่า) ส่วน `<img>` + `drawImage` หมุนตาม EXIF ถูกในทุกเบราว์เซอร์ปัจจุบัน
 * (Chrome 81+, Safari 13.1+, Firefox 77+) = รูปมือถือไม่ตะแคง
 */
async function loadImage(file: File): Promise<{ img: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  try {
    await img.decode()
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
  return { img, release: () => URL.revokeObjectURL(url) }
}

/**
 * มี pixel โปร่งใสไหม — สแกนทีละแถบ 256 แถว (ไม่ดึงทั้งภาพทีเดียว: 3000×3000 = 36MB ต่อก้อน)
 * เจอตัวแรกหยุดทันที
 */
function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const BAND = 256
  for (let y = 0; y < height; y += BAND) {
    const h = Math.min(BAND, height - y)
    const data = ctx.getImageData(0, y, width, h).data
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! < 255) return true
    }
  }
  return false
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

const encodeWithCanvas: Encoder = async (file, spec) => {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null

  const { img, release } = await loadImage(file)
  const canvas = document.createElement('canvas')
  try {
    if (!img.naturalWidth || !img.naturalHeight) return null
    const { width, height } = fitInside(img.naturalWidth, img.naturalHeight, spec.maxEdge)
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: ALPHA_CAPABLE_MIME.has(file.type) })
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, width, height)

    const transparent = ALPHA_CAPABLE_MIME.has(file.type) && hasTransparency(ctx, width, height)
    const outType = transparent ? 'image/png' : 'image/jpeg'
    const blob = await canvasToBlob(canvas, outType, spec.quality)
    // เบราว์เซอร์ที่ encode ชนิดที่ขอไม่ได้จะคืน PNG แทนเงียบ ๆ — ชื่อ/ชนิดต้องตรงกับเนื้อไฟล์เสมอ
    if (!blob || blob.type !== outType) return null

    return new File([blob], replaceExt(file.name, transparent ? 'png' : 'jpg'), {
      type: outType,
      lastModified: file.lastModified,
    })
  } finally {
    // คืนหน่วยความจำ canvas ทันที — iOS จำกัดหน่วยความจำ canvas รวมต่อหน้า
    canvas.width = 0
    canvas.height = 0
    release()
  }
}
