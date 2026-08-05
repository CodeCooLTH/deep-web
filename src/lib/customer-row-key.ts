import { createHash } from 'crypto'

/**
 * สร้าง row key สำหรับ dedupe ลูกค้าในหน้า `/customers` — ไม่สามารถย้อนกลับเป็น raw contact ได้
 * (PDPA: ค่านี้ใช้แค่เพื่อ Map grouping (server) และ React list identity เท่านั้น ไม่มีข้อมูล
 * ส่วนตัวข้ามไปยัง RSC payload)
 *
 * ลำดับความสำคัญ (ทำไม):
 * 1. `customerId` — SSOT ของลูกค้าจาก feature 00014 (Customer กลาง) ชนะเสมอ เพราะเป็น identity
 *    ที่ผูกลูกค้าคนเดียวกันข้ามออเดอร์ได้แม่นที่สุด แม้ผู้ซื้อจะพิมพ์เบอร์/ที่อยู่ต่าง format กัน
 *    ในแต่ละครั้งที่สั่งซื้อ (raw contact เดิมทำให้ลูกค้าคนเดียวกันโผล่หลายแถว)
 * 2. `buyerUserId` — ลูกค้าที่เป็นสมาชิกแต่ยังไม่ถูกผูกกับ Customer (เช่นออเดอร์เก่าก่อน 00014)
 *    ยังมี identity ที่แน่นอนจาก user id
 * 3. contact hash — guest ที่ไม่มีทั้งสองอย่างข้างต้น ใช้ SHA-256 ของ contact (16 hex แรก)
 *    เป็น opaque key ที่ย้อนกลับเป็น raw contact ไม่ได้
 * 4. ไม่มี contact เลย → fallback คงที่ 'guest-unknown' (ไม่ crash ไม่ throw)
 *
 * prefix (c-/u-/g-) กันไม่ให้ id จากคนละแหล่งชนกันโดยบังเอิญ (เช่น customerId กับ buyerUserId
 * เป็น uuid รูปแบบเดียวกัน)
 */
export function makeCustomerRowKey(
  customerId: string | null | undefined,
  buyerUserId: string | null | undefined,
  contact: string | null | undefined
): string {
  if (customerId) return 'c-' + customerId
  if (buyerUserId) return 'u-' + buyerUserId
  if (!contact) return 'guest-unknown'
  return 'g-' + createHash('sha256').update(contact).digest('hex').slice(0, 16)
}
