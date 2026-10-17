/**
 * คำกลางของหน้ารายงานร้านบริการ (feature 00078) — ทุกคำบนการ์ดหน้าแรก · หน้ายอดขายและกำไร · ตั้งค่ารายงาน
 * มาจากไฟล์นี้ที่เดียว (HR16 · impeccable clarify: เรื่องเดียวกันใช้คำเดียวกันทุกจุด)
 *
 * 🛑 ห้ามพิมพ์คำเหล่านี้ซ้ำในไฟล์จอ — เทส `service-report-words.test.ts` ปักว่าไฟล์จอไม่มีคำเก่า
 *    ("รับจริง" "ค้างรับ" "ยังไม่ปิด" ลอย ๆ "บิลยังไม่ปิด" "ยืนยันแล้ว" "รอยืนยัน")
 * 🛑 ร้านบริการเท่านั้น — ร้านขายของ/ที่พักใช้คำของตัวเองในโค้ดเดิม (ไม่ import ไฟล์นี้)
 */
export const SERVICE_REPORT_WORDS = Object.freeze({
  /** ชื่อหน้า (มือถือ: หัวชีต · คอม: หัวหน้า /sales + เมนู) — คำเดียวกับหน้าของร้านขายของ */
  pageTitle: 'ยอดขายและกำไร',
  openPage: 'ดูยอดขายและกำไร',
  sales: 'ยอดขาย',
  profit: 'กำไร',
  loss: 'ขาดทุน',
  closed: 'ปิดงานแล้ว',
  unclosed: 'ยังไม่ปิดงาน',
  /** หน่วยนับของร้านบริการ — "บิล" ใช้เป็นชื่อเอกสาร (บิล …1234) เท่านั้น ไม่ใช่หน่วยนับ */
  jobUnit: 'งาน',
  expense: 'ค่าใช้จ่าย',
  cost: 'ต้นทุนอะไหล่',
  costShort: 'ต้นทุน',
  profitColumn: 'กำไร',
  profitColumnNote: '(งานที่ปิดแล้ว)',
  date: 'วันที่',
  month: 'เดือน',
  daily: 'รายวัน',
  monthly: 'รายเดือน',
  today: 'วันนี้',
  thisMonth: 'เดือนนี้',
  prev: 'ช่วงก่อนหน้า',
  next: 'ช่วงถัดไป',
  up: 'เพิ่มขึ้น',
  down: 'ลดลง',
  compare: 'เทียบ',
  avg14: 'ค่าเฉลี่ย 14 วันล่าสุด',
  bill: 'บิล',
  empty: 'ยังไม่มีงานในช่วงนี้',
  loadFailed: 'โหลดข้อมูลไม่สำเร็จ',
  retry: 'ลองใหม่',
  settings: 'ตั้งค่ารายงาน',
  chartAria: 'กราฟยอดขายรายวัน แตะแท่งเพื่อดูยอดวันนั้น',
  // ── หน้าตั้งค่า (2 ข้อ) ──
  setViewTitle: 'ตัวเลขที่อยากเห็นก่อน',
  setViewHelp: 'แสดงตัวใหญ่บนหน้าแรกและหน้ายอดขายและกำไร',
  setViewSalesHelp: 'รวมงานที่ยังไม่ปิดงานด้วย',
  setViewProfitHelp: 'เฉพาะงานที่ปิดงานแล้ว หักต้นทุนและค่าใช้จ่าย',
  setChartTitle: 'รูปแบบกราฟ',
  setChartHelp: 'ใช้กับกราฟทุกหน้า',
  setChartBar: 'แท่ง',
  setChartLine: 'เส้น',
  setPreview: 'ตัวอย่างบนหน้าแรก',
  saved: 'บันทึกแล้ว',
  saveFailed: 'บันทึกไม่สำเร็จ ลองอีกครั้ง',
})

/** "เพิ่มขึ้น 12% เทียบ 1–16 ก.ย." — ประโยคเต็มที่แปลได้ (clarify: ไม่ต่อเศษคำ) */
export function deltaSentence(direction: 'up' | 'down', pct: number, compareLabel: string): string {
  const w = SERVICE_REPORT_WORDS
  return `${direction === 'up' ? w.up : w.down} ${pct.toLocaleString('en-US')}% ${w.compare} ${compareLabel}`
}
