/**
 * inbox-row-chips — เพดานชิปในบรรทัดป้ายของแถวรายการแชท (00078 S-8 · T24 · Design Spec รอบ 2 ข้อ 3)
 * สูงสุด 2 ใบทุกขนาดจอ ที่เหลือยุบเป็น "+N" (N ≥ 100 = "99+" ตามสเปก §10)
 * ลำดับชิปเป็นหน้าที่ของผู้เรียก: ติดตาม → ตีกลับ/ยกเลิก → DeepBot → สถานะขาย → ad_id (แท็กแยกไปบรรทัดล่างสุดของแถว 2026-10-22)
 * ไม่วัดความกว้าง DOM (measurement-must-not-decide-what-it-measures.md)
 */
export const ROW_CHIP_MAX = 2

export type RowChipOverflow = { visible: number; more: null | { text: string; names: string[] } }

export function rowChipOverflow(names: string[], max = ROW_CHIP_MAX): RowChipOverflow {
  if (names.length <= max) return { visible: names.length, more: null }
  const hidden = names.slice(max)
  return { visible: max, more: { text: hidden.length >= 100 ? '99+' : `+${hidden.length}`, names: hidden } }
}
