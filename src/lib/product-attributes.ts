import type { OptionSelection } from '@/lib/chat-memory-types'

/** แยกค่า "แดง, น้ำเงิน" → ['แดง','น้ำเงิน'] (trim + ตัดค่าว่าง) — SSOT ของฟอร์มสินค้าและความจำแชท */
export function splitAttributeValues(raw: string): string[] {
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

/** กฎเดียวกับ serializeProduct: ไม่ใช่ object หรือเป็น array → {} */
export function normalizeAttributes(raw: unknown): Record<string, string> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, string>) : {}
}

/** ประกอบป้ายตัวเลือก "สี ครีม · ขนาด L" ตามลำดับ key ของ attrs — key/value ต้องมีจริง และเลือกได้ 1 ค่าต่อ key */
export function buildOptionLabel(
  attrs: Record<string, string>,
  selections: OptionSelection[],
): { ok: true; label: string } | { ok: false } {
  const chosen = new Map<string, string>()
  for (const { key, value } of selections) {
    if (!Object.prototype.hasOwnProperty.call(attrs, key) || chosen.has(key)) return { ok: false }
    if (typeof attrs[key] !== 'string' || !splitAttributeValues(attrs[key]).includes(value)) return { ok: false }
    chosen.set(key, value)
  }
  const label = Object.keys(attrs)
    .filter((k) => chosen.has(k))
    .map((k) => `${k} ${chosen.get(k)}`)
    .join(' · ')
  return { ok: true, label }
}
