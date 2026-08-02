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
 * ป้าย/ข้อความ/สีของ "กำไรสุทธิ" ที่ต้องเหมือนกันทุก surface
 * ติดลบไม่เรียกว่า "กำไร" เพราะมันไม่ใช่กำไร — เรียก "ผลประกอบการ" แล้วบอกว่า "ขาดทุน N"
 */
export const profitDisplay = (n: number) => {
  const positive = n >= 0
  return {
    positive,
    label: positive ? 'กำไรสุทธิ' : 'ผลประกอบการ',
    text: (positive ? '' : 'ขาดทุน ') + formatBaht(n),
    toneClass: positive ? 'text-success-ink' : 'text-danger-ink',
  }
}
