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
}

export const FLEX_INK_CLASS = 'text-default-900'

/** สีไม่รู้จัก/ไม่ระบุ → หมึกปกติ (ห้าม inline style) */
export function flexColorClass(hex: unknown): string {
  return typeof hex === 'string' ? (BY_HEX[hex.toLowerCase()] ?? FLEX_INK_CLASS) : FLEX_INK_CLASS
}
