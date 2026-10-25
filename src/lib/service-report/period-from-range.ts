/**
 * ช่วงเวลาจาก URL → ช่วงของรายงานร้านบริการ (รายวันทั้งเดือน / รายเดือนทั้งปี)
 * เดิมเปิดเดือนปัจจุบันเสมอ ⇒ ลิงก์ที่พกช่วงมา (ภาพรวมทุกธุรกิจ `?tab=pnl&range=...`) เห็นตัวเลขคนละช่วง
 * ช่วงที่ไม่ใช่เดือน/ปีเต็ม (7 วัน · กำหนดเอง) รายงานแสดงไม่ได้ → เดือนของวันสุดท้าย (ช่วงล่าสุดที่ผู้ใช้ดู)
 */
export function serviceReportPeriodFromRange(label: { start: string; end: string }): { mode: 'daily' | 'monthly'; year: number; month?: number } {
  const [sy, sm, sd] = label.start.split('-').map(Number)
  const [ey, em, ed] = label.end.split('-').map(Number)
  if (sy === ey && sm === 1 && sd === 1 && em === 12 && ed === 31) return { mode: 'monthly', year: sy }
  return { mode: 'daily', year: ey, month: em }
}
