/**
 * flex-preview-tokens — แปลงค่าสี hex ในโหนด Flex เป็นคลาส Paces สำหรับพรีวิว (00070 · addendum E §4.5)
 *
 * ทำไมอยู่นอก `(paces)/**`: hex ในโค้ดหน้าจอชน grep HR7 · ค่า hex อ้างจาก `FLEX_COLORS` ของ builder
 * (ไม่พิมพ์ซ้ำ) เพื่อให้ builder เปลี่ยนสีแล้วพรีวิวไม่ลืมตาม — เทสคุมว่าแต่ละสีมีคลาสของมัน
 */
import { FLEX_COLORS } from '@/lib/line/flex-summary-report'

const BY_HEX: Record<string, string> = {
  [FLEX_COLORS.ACCENT.toLowerCase()]: 'text-primary',
  [FLEX_COLORS.INK.toLowerCase()]: 'text-default-900',
  [FLEX_COLORS.SLATE.toLowerCase()]: 'text-default-700',
  [FLEX_COLORS.DANGER.toLowerCase()]: 'text-danger-ink',
  // GRID_GRAY ใช้เป็นสีพื้นแท่งกราฟเท่านั้น — ถ้าไปอยู่บนตัวอักษรให้เป็นเทากลางแทนหมึก
  [FLEX_COLORS.GRID_GRAY.toLowerCase()]: 'text-default-700',
}

/** สีพื้น (backgroundColor) — GRID_GRAY #D9DBE0 → default-300 (#e7e9eb) คือโทนใกล้สุดใน ramp ของ Paces (default-200 จางเกินบนการ์ด) */
const BG_BY_HEX: Record<string, string> = {
  [FLEX_COLORS.ACCENT.toLowerCase()]: 'bg-primary',
  [FLEX_COLORS.GRID_GRAY.toLowerCase()]: 'bg-default-300',
}

/** ค่า enum ของ Flex → คลาส Paces (เทสสแกน output ของ builder ว่าทุกค่าอยู่ในนี้) — margin ทำเฉพาะแนวตั้ง (builder ใช้ margin ในกล่อง vertical เท่านั้น) */
export const MARGIN: Record<string, string> = { xs: 'mt-0.5', sm: 'mt-1', md: 'mt-2', lg: 'mt-3', xl: 'mt-4' }
export const GAP: Record<string, string> = { xs: 'gap-0.5', sm: 'gap-1', md: 'gap-2', lg: 'gap-3', xl: 'gap-4' }
// xxs (กราฟ) ไม่มีขนาดเล็กกว่า text-xs ใน Paces โดยไม่ใช้ arbitrary value (HR7) → ใช้ xs
export const TEXT_SIZE: Record<string, string> = { xxs: 'text-xs', xs: 'text-xs', sm: 'text-sm', md: 'text-md' }
export const RADIUS: Record<string, string> = { '2px': 'rounded-sm' } // carve-out: มุมแท่งกราฟในพรีวิว = cornerRadius 2px ของ Flex (ไม่ใช่ภาชนะ/ปุ่ม)
export const ITEMS: Record<string, string> = { 'flex-start': 'items-start', center: 'items-center', 'flex-end': 'items-end' }
export const JUSTIFY: Record<string, string> = { 'flex-start': 'justify-start', center: 'justify-center', 'flex-end': 'justify-end' }

/** คุณสมบัติของโหนดที่พรีวิวรู้จักต่อชนิด — composer ปล่อย key นอกนี้ = เทสแดง (พรีวิวต้องตามให้ทัน) */
export const FLEX_SUPPORTED_KEYS: Record<string, readonly string[]> = {
  bubble: ['type', 'size', 'body', 'footer'],
  box: ['type', 'layout', 'contents', 'margin', 'spacing', 'flex', 'height', 'width', 'backgroundColor', 'cornerRadius', 'justifyContent', 'alignItems'],
  text: ['type', 'text', 'contents', 'size', 'color', 'weight', 'wrap', 'align', 'maxLines', 'flex', 'margin'],
  span: ['type', 'text', 'weight', 'color'],
  filler: ['type'],
  separator: ['type', 'margin'],
  button: ['type', 'style', 'color', 'height', 'action'],
}

/** ความกว้าง/สูงที่มาจากข้อมูล (px หรือ %) — ผู้เรียกใส่ใน style พร้อมคอมเมนต์ */
export const isFlexLength = (v: unknown): v is string => typeof v === 'string' && /^\d+(\.\d+)?(px|%)$/.test(v)

export const FLEX_INK_CLASS = 'text-default-900'

/** สีไม่รู้จัก/ไม่ระบุ → หมึกปกติ (ห้าม inline style) */
export function flexColorClass(hex: unknown): string {
  return typeof hex === 'string' ? (BY_HEX[hex.toLowerCase()] ?? FLEX_INK_CLASS) : FLEX_INK_CLASS
}

/** สีพื้นไม่รู้จัก → ไม่ใส่พื้น (โปร่ง) */
export function flexBgClass(hex: unknown): string | undefined {
  return typeof hex === 'string' ? BG_BY_HEX[hex.toLowerCase()] : undefined
}
