// Shared SSOT: resolve icon ของ badge จากค่าในคอลัมน์ `Badge.icon`
// ใช้ร่วมทั้ง seller (Paces) และ buyer (Vuexy) เพื่อ parity + no-emoji (Hard Rule 12)
//
// 🛑 2026-08-21 (00052 P1): `LUCIDE_FOR_BADGE` และ `lucideForBadge` ถูกลบแล้ว
// map นั้นเคยทำหน้าที่แปลง emoji ในคอลัมน์เป็นชื่อไอคอนตอนเรนเดอร์ — ตอนนี้ชื่อไอคอนถูกเขียนลง
// คอลัมน์ `Badge.icon` จริงแล้ว (migration `20260821090000_badge_v2_taxonomy` เขียนค่าเดียวกับ
// ที่ map เคยให้เป๊ะ ๆ) ⇒ map กลายเป็น dead code และการเก็บไว้คือการมีนิยาม 2 ที่ให้ค่าเดียวกัน
// ซึ่งจะหลุดจากกันวันที่มีคนแก้ฝั่งเดียว (Hard Rule 16)
//
// ลำดับที่ทำให้ปลอดภัย: เขียนค่าลงคอลัมน์ → ย้ายผู้เรียกให้ thread ค่าจากฐาน → ค่อยลบ map
// ถ้าลบก่อน เหรียญเดิมทุกใบจะตกไป FALLBACK_LUCIDE กลายเป็นไอคอนเดียวกันหมดโดยไม่มี error

export const FALLBACK_LUCIDE = 'lucide:award'

const ICON_PREFIXES = /^(tabler|lucide|solar|mdi|ph|ri|hugeicons|iconamoon)-(.+)$/i

/**
 * normalize ค่า badge.icon จาก DB ให้เป็น iconify id ที่ render ได้ — คืน null ถ้าไม่ใช่ชื่อ icon
 * - emoji (ค่าที่ไม่ขึ้นต้นด้วย ascii letter) => null
 * - "tabler:gavel" (มี colon แล้ว) => คงเดิม
 * - "tabler-gavel" (bare dash — convention เก่าใน DB) => "tabler:gavel"
 * - prefix ไม่รู้จัก => null (กัน render พัง)
 */
export function normalizeIconifyName(icon?: string | null): string | null {
  if (!icon) return null
  const s = icon.trim()
  if (!/^[a-z]/i.test(s)) return null       // emoji/สัญลักษณ์ → ไม่ผ่าน
  if (s.includes(':')) return s             // เช่น "tabler:gavel" ใช้ได้เลย
  const m = s.match(ICON_PREFIXES)          // "tabler-gavel" → "tabler:gavel"
  return m ? `${m[1].toLowerCase()}:${m[2]}` : null
}

/**
 * resolve iconify id สำหรับ badge (no-emoji — Hard Rule 12):
 * precedence: DB icon ที่เป็นชื่อ iconify → map ตามชื่อ badge → FALLBACK_LUCIDE
 * ทิ้ง emoji ใน DB icon เสมอ (map ชื่อแทน)
 */
export function badgeIconName(nameEN?: string | null, dbIcon?: string | null): string {
  // nameEN ยังรับไว้เป็นพารามิเตอร์เพื่อไม่ให้ผู้เรียกทั้ง 5 จุดต้องแก้ signature พร้อมกัน
  // และเพื่อให้ยังใช้เป็นที่แขวน logic รายเหรียญได้ถ้าวันหนึ่งต้องมี — วันนี้ไม่ได้ใช้
  void nameEN
  return normalizeIconifyName(dbIcon) || FALLBACK_LUCIDE
}
