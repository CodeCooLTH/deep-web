/**
 * format-money.ts — SSOT ของการแสดง "จำนวนเงินบาท" ฝั่ง seller/admin
 *
 * ก่อนหน้านี้ feature 00016 มี 3 นโยบายพร้อมกันในฟีเจอร์เดียว:
 *   /expenses        Intl {2,2}                     → ฿1,123.70
 *   /sales           Intl currency {max:0}          → ฿1,124
 *   การ์ด/ชีตยอดขาย   n.toLocaleString('th-TH')       → ฿1,123.7   ← ตัดศูนย์ท้ายทิ้ง อ่านไม่ออก
 * เงินก้อนเดียวกันจึงแสดงไม่เหมือนกันสามแบบในสามหน้า (พบตอน user ใช้จริงบน prod 2026-08-02)
 *
 * นโยบายเดียวจากนี้ไป: **ทศนิยมโผล่เฉพาะเมื่อมีสตางค์จริง** → `฿3,680` และ `฿1,123.70`
 * (ไม่มี `฿3,680.00` ที่เป็น noise และไม่มี `฿1,123.7` ที่เป็นบั๊ก)
 *
 * และห้าม render `฿-1,123.7` — เครื่องหมายลบชนสัญลักษณ์สกุลเงินบังคับให้ผู้อ่านถอดรหัสก่อนเข้าใจ
 * ทิศทางเป็นหน้าที่ของ **คำ + สี** ไม่ใช่เครื่องหมาย (PRODUCT.md §Users: digital-literacy ต่ำ/ผู้สูงวัย)
 */
const GROUP_0 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const GROUP_2 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const hasSatang = (n: number) => Math.round(n * 100) % 100 !== 0

/** ขนาดของจำนวนเงิน — คืนค่าสัมบูรณ์เสมอ ไม่มีเครื่องหมาย (ทิศทาง = หน้าที่ของ label + สี) */
export const formatBaht = (n: number): string => {
  const abs = Math.abs(n)
  return '฿' + (hasSatang(abs) ? GROUP_2 : GROUP_0).format(abs)
}

/**
 * นิยามของกำไรสุทธิ — เขียนที่เดียว ให้ทุก surface import ไปใช้
 * เดิมเขียนไว้ 2 ที่ด้วยคำไม่เหมือนกัน ("รายได้" ที่หนึ่ง "ยอดขายที่ยืนยันแล้ว" อีกที่หนึ่ง)
 * ทั้งที่หมายถึงเงินก้อนเดียวกันเป๊ะ
 */
export const NET_PROFIT_FORMULA = 'กำไรสุทธิ = ยอดขายที่ยืนยันแล้ว − ต้นทุนสินค้า − ค่าใช้จ่าย'

/**
 * ป้าย/ข้อความ/สีของกำไรสุทธิ ที่ต้องเหมือนกันทุก surface
 *
 * ชื่อตัวชี้วัดใช้คู่คำขนาน "กำไรสุทธิ ↔ ขาดทุนสุทธิ" — เดิมทางลบเรียก "ผลประกอบการ" ซึ่ง
 * (ก) เป็นศัพท์ทางการที่ขัดน้ำเสียงแบรนด์ และ (ข) ทำให้ดูเหมือนเป็นตัวเลขคนละตัวกับตอนเป็นบวก
 * `text` ไม่มีคำนำหน้า — ทิศทางสื่อผ่าน label + สี ทุก surface จึงต้อง render label ด้วยเสมอ
 */
export const profitDisplay = (n: number) => {
  const positive = n >= 0
  return {
    positive,
    label: positive ? 'กำไรสุทธิ' : 'ขาดทุนสุทธิ',
    text: formatBaht(n),
    toneClass: positive ? 'text-success-ink' : 'text-danger-ink',
  }
}

/**
 * %เปลี่ยนแปลงเทียบช่วงก่อนหน้า — helper กลาง กันสูตรหลุดกันตามจุดที่ใช้ (ตอนนี้ 5 จุด)
 * คืน null เมื่อ "เทียบแล้วอ่านไม่รู้เรื่อง": ไม่มีฐาน (null) หรือฐาน ≤ 0 ซึ่งเปอร์เซ็นต์อ่านกลับหัว
 * UI ต้องซ่อน badge ทั้งก้อนเมื่อได้ null — ห้ามแสดง 0% หรือ +100% จากฐานศูนย์
 */
export const pctChangeVsPrev = (current: number, prev: number | null): number | null =>
  prev != null && prev > 0 ? Math.round(((current - prev) / prev) * 1000) / 10 : null
