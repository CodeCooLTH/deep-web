/**
 * ชื่อสำรองที่ Meta ส่งมาแทน "ยังไม่มีสิทธิ์อ่านโปรไฟล์" — SSOT ของ "ชื่อนี้ใช้ได้จริงหรือยัง"
 *
 * 🛑 ทำไมต้องมีไฟล์นี้ (เกิดจริงบน prod 2026-09-08, user เจอเอง 09-09):
 * บทสนทนาที่ **ธุรกิจเป็นฝ่ายเริ่ม** (private reply ใต้คอมเมนต์ · โฆษณา click-to-Messenger)
 * ยังไม่ได้สิทธิ์อ่านโปรไฟล์ของลูกค้าจนกว่าลูกค้าจะ *ตอบกลับ* — เอกสาร Meta เขียนตรงตัวว่า
 * "the app will be granted permission to access the person's profile after the person replied
 * to the initial message". ในวินาทีนั้น `/me/conversations` **ไม่ตอบ error** แต่ตอบชื่อว่า
 * `"Facebook user"` มาแทน ⇒ เราเก็บลงฐานแล้วมันกลายเป็น "ชื่อที่มีค่า"
 *
 * ที่ทำให้มันไม่หายเอง: `ingestInboundMessage` ถามโปรไฟล์ใหม่เฉพาะตอน `!contact.name` เท่านั้น
 * ⇒ **เคสที่ Meta ตอบ null กลับหายเอง แต่เคสที่ Meta ตอบผิดแบบมีค่าไม่มีวันหาย** (ค้างจนถึงรอบ
 * retry รูป 7 วัน) — เธรดจริง: ฐานเก็บ `Facebook user` ตั้งแต่ 08:20 น. ขณะที่ยิง Graph สดวันถัดมา
 * ได้ `"Somkeat Konkayan"` ด้วย token ใบเดียวกันเป๊ะ
 *
 * ทางแก้คือ **ตัดทิ้งตั้งแต่ตอนอ่านจาก Graph** ให้เป็น null ไปเลย แล้วกลไก "ไม่มีชื่อ = ถามใหม่"
 * ที่มีอยู่แล้วจะเก็บชื่อจริงให้เองในข้อความถัดไป — ไม่ต้องเพิ่มเงื่อนไข retry ใหม่ที่ไหนอีก
 * (คลาสเดียวกับ `docs/conventions/graph-access-depends-on-subject.md` ซึ่งตอนนั้นแก้ให้ "รูป"
 * แล้วแต่ไม่ได้ตามไปแก้ให้ "ชื่อ")
 *
 * 🛑 ต้องเป็น allow-list แบบ **เทียบทั้งสตริง** ห้ามใช้ `includes()` — คนจริงชื่อ
 * "Facebook Marketing" หรือร้านชื่อ "Instagram user shop" ต้องไม่ถูกกลืนหายไปด้วย
 */
const PLACEHOLDER_NAMES = new Set([
  // ตัวที่พบจริงบน prod (Messenger, ตัว u เล็ก) — Meta สลับตัวพิมพ์ใหญ่/เล็กได้ จึงเทียบแบบ lower
  'facebook user',
  'instagram user',
])

/** ชื่อที่ Meta ส่งมาแทน "ยังไม่มีสิทธิ์" — ไม่ใช่ชื่อของคนจริง */
export function isMetaPlaceholderName(name: string | null | undefined): boolean {
  if (!name) return false
  return PLACEHOLDER_NAMES.has(name.trim().toLowerCase())
}

/**
 * ชื่อที่เก็บลงฐานได้ — คืน null เมื่อยังไม่รู้จริง (ชื่อว่าง/ช่องว่างล้วน/ชื่อสำรองของ Meta)
 *
 * null แปลว่า "ยังไม่รู้" ไม่ใช่ "ไม่มีชื่อ" — ฝั่งเรียกต้องถามใหม่รอบหน้า ไม่ใช่เขียนทับของเดิม
 */
export function normalizeMetaContactName(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  return isMetaPlaceholderName(trimmed) ? null : trimmed
}
