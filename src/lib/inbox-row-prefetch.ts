/**
 * ตัดสินว่าแถวรายการแชทไหน prefetch เต็ม (`<Link prefetch>`) ตอนเข้าจอ
 *
 * ทำไม: prefetch เต็มยิง RSC ทั้งหน้าห้องแชทให้ "ทุกแถวที่อยู่ในจอ" — บน WebView มือถือแย่งแบนด์วิดท์
 * กับของที่ผู้ใช้กำลังดู (audit 2026-09-29 L1). แถวบนสุดคือที่ที่ผู้ใช้กดบ่อยสุดจึงคง prefetch ไว้
 * ที่เหลือ prefetch ตอน pointerdown (`router.prefetch`) แทน — ได้เวลาช่วงนิ้วกดค้างก่อน click
 */
export const INBOX_PREFETCH_TOP_ROWS = 5

export function shouldPrefetchRow(index: number): boolean {
  return index >= 0 && index < INBOX_PREFETCH_TOP_ROWS
}
