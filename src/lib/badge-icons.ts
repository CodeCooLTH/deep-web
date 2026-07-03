// Shared SSOT: resolve icon ของ badge สำหรับ fallback เมื่อ badge.imageUrl ว่าง
// ใช้ร่วมทั้ง seller (Paces) และ buyer (Vuexy) เพื่อ parity + no-emoji (Hard Rule 12)
// เดิม map นี้อยู่ที่ src/app/(paces)/seller/(dashboard)/_constants/badge-icons.ts — ย้ายมา lib เพื่อให้ทั้ง 2 surface import ได้

/** map ชื่อ badge (nameEN) → lucide icon — ใช้เมื่อ DB icon เป็น emoji/ว่าง (legacy badges) */
export const LUCIDE_FOR_BADGE: Record<string, string> = {
  'First Sale':          'lucide:store',
  'Trusted Seller 50':   'lucide:star',
  'Century Club':        'lucide:trophy',
  'Perfect Rating':      'lucide:gem',
  'Highly Rated':        'lucide:sparkles',
  'Zero Complaint':      'lucide:shield-check',
  'Veteran':             'lucide:medal',
  'Speed Demon':         'lucide:zap',
  'Fully Verified':      'lucide:badge-check',
  'Community Favorite':  'lucide:heart',
  // ── P1 — 7 badge ใหม่ (fallback เมื่อ imageUrl ว่าง; ปกติ render รูป asset จาก badge.imageUrl) ──
  'Getting Started':     'lucide:sprout',
  'Rising Seller':       'lucide:trending-up',
  'Well Rated':          'lucide:thumbs-up',
  'Getting Noticed':     'lucide:eye',
  'Spotless 100':        'lucide:sparkles',
  '3 Months Strong':     'lucide:calendar-check',
  'Same-Day Hero':       'lucide:rocket',
}

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
  return (
    normalizeIconifyName(dbIcon) ||
    (nameEN ? LUCIDE_FOR_BADGE[nameEN] : undefined) ||
    FALLBACK_LUCIDE
  )
}

/** legacy helper (name-only) — คง compat กับ seller BadgeImage ที่ยังไม่ thread DB icon */
export function lucideForBadge(nameEN: string | null | undefined): string {
  return (nameEN && LUCIDE_FOR_BADGE[nameEN]) || FALLBACK_LUCIDE
}
