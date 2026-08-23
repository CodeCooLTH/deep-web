/**
 * image-variants — รูปย่อที่ระบบสร้างข้างไฟล์ต้นฉบับ (feature 00054) · **ส่วนที่ปลอดภัยกับเบราว์เซอร์**
 *
 * 🛑 ไฟล์นี้ห้าม import `sharp` เด็ดขาด — `src/lib/file-url.ts` ต้องเรียก `variantKey()` ได้ และ
 * ไฟล์นั้นถูก import จาก client component (การ์ดสินค้า/ห้องพัก) ⇒ ถ้าลาก sharp (native module)
 * เข้ามา bundle ฝั่งเบราว์เซอร์จะพังทั้งก้อน
 * ตัวสร้างรูปจริงที่ใช้ sharp อยู่ที่ `image-variants.server.ts`
 *
 * ที่มา: รูปที่ผู้ขายอัปโหลดถูกเสิร์ฟกลับเป็นไฟล์ต้นฉบับขนาดเต็มทุกจุด — วัดจาก prod 2026-08-23
 * ไฟล์หนึ่ง 1080×1920 หนัก 210KB ขณะที่การ์ดในกริดหน้าร้านกว้างจริงแค่ ~180–240px ⇒ เปิดแท็บ
 * สินค้าของร้านหนึ่ง (22 ใบ) ดึง ~4.6MB ทุกครั้งที่มีผู้ชมคนใหม่
 *
 * 🛑 **variant คือไฟล์ที่ "เพิ่มเข้ามา" ไม่ใช่ไฟล์ที่ "แทนที่"** — ไฟล์ต้นฉบับห้ามถูกลบหรือ
 * เขียนทับไม่ว่าขั้นตอนใด (กฎถาวรของ user: ห้ามลบอะไรโดยไม่บอกก่อน) แลกกับพื้นที่เก็บที่โตขึ้น
 * ~60% ต่อรูปหนึ่งใบ ซึ่งถูกกว่าการทำลายต้นฉบับที่กู้คืนไม่ได้มาก
 *
 * ไฟล์นี้ **pure** — รับ Buffer คืน Buffer ห้ามแตะ storage/prisma (ผู้เรียกคือฝ่ายที่รู้จัก storage)
 * หลักการเดียวกับ `src/lib/meta/card-image.ts` และ `src/lib/line/preview-image.ts`
 */

export type ImageVariant = 'thumb' | 'lg'

type VariantSpec = {
  /** ด้านที่ยาวที่สุดของผลลัพธ์ (px) — `fit:'inside'` ทำให้สัดส่วนเดิมคงอยู่เสมอ */
  maxEdge: number
  quality: number
}

/**
 * สเปกของแต่ละขนาด — SSOT เดียว เพิ่มขนาดใหม่ที่นี่ที่เดียว
 *
 * thumb 480: การ์ดในกริดกว้างสุด ~240px บนเดสก์ท็อป ⇒ 480 ครอบจอ 2x ได้พอดี
 * lg 1280: ป๊อปอัปดูรูปเต็มบนจอโน้ตบุ๊ก — ใหญ่กว่านี้คือส่งพิกเซลที่ไม่มีใครเห็น
 */
export const IMAGE_VARIANTS: Record<ImageVariant, VariantSpec> = {
  thumb: { maxEdge: 480, quality: 72 },
  lg: { maxEdge: 1280, quality: 80 },
}

/**
 * นามสกุลที่สร้าง variant ได้
 *
 * 🛑 **ไม่มี `gif` โดยตั้งใจ** — sharp จะแปลงเป็นเฟรมเดียวแล้วภาพเคลื่อนไหวหายไป ซึ่งเป็นการ
 * ทำลายเนื้อหาที่ผู้ใช้ตั้งใจอัป (ต่างจากการย่อขนาดที่ยังเป็นรูปเดิม)
 * 🛑 ไม่มี `pdf`/`heic` — pdf ไม่ใช่รูป ส่วน heic ระบบไม่รับตั้งแต่ชั้นอัปโหลดอยู่แล้ว
 */
const VARIANT_SOURCE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp'])

export function canHaveVariants(ext: string): boolean {
  return VARIANT_SOURCE_EXT.has(ext.toLowerCase().replace(/^\./, ''))
}

/**
 * คีย์ของ variant — `2026/08/11/uuid.jpg` + `thumb` → `2026/08/11/uuid.thumb.webp`
 *
 * 🛑 ตัด **เฉพาะจุดสุดท้าย** ไม่ใช่ทุกจุด — คีย์มี `/` และชื่อไฟล์อาจมีจุดได้หลายตัว
 * 🛑 ฟังก์ชันนี้ต้องเป็นตัวเดียวที่ทั้ง server (ตอนเขียน) และ browser (ตอนขอ) ใช้ — ถ้าสองฝั่ง
 * คิดคีย์ต่างกันแม้แต่ตัวอักษรเดียว หน้าจอจะขอไฟล์ที่ไม่มีอยู่จริง **ตลอดกาลโดยไม่มี error
 * ให้ใครเห็น** เพราะมันตกไป fallback ต้นฉบับเงียบ ๆ = ฟีเจอร์ไม่ทำงานเลยแต่ทุกอย่างดูปกติ
 */
export function variantKey(fileKey: string, variant: ImageVariant): string {
  const lastDot = fileKey.lastIndexOf('.')
  const lastSlash = fileKey.lastIndexOf('/')
  // จุดต้องอยู่ในส่วนชื่อไฟล์ ไม่ใช่ในชื่อโฟลเดอร์ (เช่น "a.b/c" ไม่มีนามสกุล)
  const base = lastDot > lastSlash ? fileKey.slice(0, lastDot) : fileKey
  return `${base}.${variant}.webp`
}

/** content-type ของทุก variant — ใช้ตอน PUT ขึ้น storage */
export const VARIANT_CONTENT_TYPE = 'image/webp'
