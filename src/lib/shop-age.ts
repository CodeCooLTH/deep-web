/**
 * shop-age — "เปิดร้านมาแล้วนานเท่าไร" เป็นคำไทย
 *
 * อายุร้านเป็นสัญญาณความน่าเชื่อถือที่ปลอมยากที่สุดตัวหนึ่ง (10% ของ Trust Score) แต่ `memberSince`
 * ที่หน้าจอมีอยู่เป็นแค่ "เดือน-ปีที่เปิด" ซึ่งผู้อ่านต้องคำนวณเอง — ฟังก์ชันนี้แปลงให้
 *
 * 🛑 คืน **ส่วนขยายเท่านั้น** ห้ามคืนประโยคเต็ม — ผู้เรียกเติม "เปิดร้านมาแล้ว" ไว้ข้างหน้า
 * เคส `< 1 เดือน` เคยคืน "เปิดเดือนนี้" ซึ่งประกอบออกมาเป็น "เปิดร้านมาแล้วเปิดเดือนนี้"
 * (ร้านที่เพิ่งเปิดคือกลุ่มที่ต้องอ่านบรรทัดนี้มากที่สุด และเป็นกลุ่มเดียวที่เห็นข้อความพัง)
 */
export function monthsSince(createdAtIso: string): number {
  const then = new Date(createdAtIso)
  const now = new Date()
  return Math.max(0, (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth()))
}

/** "1 ปี 3 เดือน" / "5 เดือน" / "ไม่ถึง 1 เดือน" — คำเต็ม ไม่ใช้สัญลักษณ์ (กลุ่มผู้ใช้ตาม PRODUCT.md) */
export function formatShopAge(createdAtIso: string): string {
  const total = monthsSince(createdAtIso)
  if (total < 1) return 'ไม่ถึง 1 เดือน'
  const y = Math.floor(total / 12)
  const m = total % 12
  if (y === 0) return `${m} เดือน`
  if (m === 0) return `${y} ปี`
  return `${y} ปี ${m} เดือน`
}
