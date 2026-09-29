// 00066 (e) — ตัวตัดสินของตัวกรอง/ป้าย "ติดตามลูกค้า" ในกล่องแชท เป็นฟังก์ชันบริสุทธิ์
// (ui-boolean-needs-a-testable-home.md) — ห้ามย้ายกลับไปเป็น ternary ใน JSX/route
import type { FilterState } from '@/lib/follow-up-rules'

const STATES: readonly FilterState[] = ['late', 'upcoming', 'done']

/** CSV จาก ?followUp= → ค่าที่รู้จัก (ตัดซ้ำ) · ค่าแปลก/ว่าง = ทิ้ง · ไม่เหลือเลย = undefined (ไม่กรอง ไม่ใช่กรองแล้วว่าง) */
export function parseFollowUpQuery(raw: string | null | undefined): FilterState[] | undefined {
  if (!raw) return undefined
  const out = [...new Set(raw.split(',').map((s) => s.trim()))].filter((s): s is FilterState =>
    (STATES as readonly string[]).includes(s),
  )
  return out.length > 0 ? out : undefined
}

/** ป้ายเดียวต่อแถว — เลยกำหนดชนะค้างอยู่ (UX §(e)) · ไม่มีเปิด = ไม่มีป้าย */
export function rowBadge(c: { open: number; late: number } | null | undefined): 'late' | 'open' | null {
  if (!c) return null
  if (c.late >= 1) return 'late'
  return c.open >= 1 ? 'open' : null
}
