/**
 * markup-edit — แก้ข้อความ markup ที่ตำแหน่งเลือกของ textarea (feature 00070 EXT · FR-EXT-11 AC-13) · pure
 *
 * ทำไมแยกจาก JSX: ตำแหน่งเคอร์เซอร์/ช่วงเลือกเป็นตรรกะที่พลาดง่าย (กลับด้านช่วง, เกินความยาว) ต้องมีเทส
 * ค่า start/end คือ selectionStart/End ของ textarea (หน่วย UTF-16) — อ่านตอนกดปุ่มเท่านั้น ไม่เก็บใน state
 */
export type EditResult = { text: string; selStart: number; selEnd: number }

function clampRange(len: number, start: number, end: number): [number, number] {
  const a = Math.min(Math.max(0, Math.min(start, end)), len)
  const b = Math.min(Math.max(0, Math.max(start, end)), len)
  return [a, b]
}

/** แทรกป้ายโทเคนที่เคอร์เซอร์ (มีช่วงเลือก = แทนที่ช่วงนั้น) · เคอร์เซอร์ไปอยู่หลังป้าย */
export function insertAtSelection(src: string, start: number, end: number, label: string): EditResult {
  const [a, b] = clampRange(src.length, start, end)
  const at = a + label.length
  return { text: src.slice(0, a) + label + src.slice(b), selStart: at, selEnd: at }
}

/** ห่อคำที่เลือกด้วย `**`/`^^` · ไม่ได้เลือกอะไร = null (ผู้เรียกแจ้ง "เลือกคำก่อน") · ช่วงเลือกคงไว้ที่คำเดิม */
export function wrapSelection(src: string, start: number, end: number, marker: '**' | '^^'): EditResult | null {
  const [a, b] = clampRange(src.length, start, end)
  if (a === b) return null
  return {
    text: src.slice(0, a) + marker + src.slice(a, b) + marker + src.slice(b),
    selStart: a + marker.length,
    selEnd: b + marker.length,
  }
}

/** ใน textarea บรรทัดเดียว — เปลี่ยนบรรทัดใหม่เป็นช่องว่าง (schema ปฏิเสธ \n จึงกันตั้งแต่ตอนพิมพ์/วาง) */
export const singleLine = (s: string): string => s.replace(/\r\n|\r|\n/g, ' ')
