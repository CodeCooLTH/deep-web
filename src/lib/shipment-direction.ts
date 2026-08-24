/**
 * shipment-direction — ทิศทางของพัสดุ และตัวกรอง "พัสดุของออเดอร์นี้" (feature 00056)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 ทำไมต้องมีไฟล์นี้
 *
 * ระบบคืนของเก็บพัสดุขากลับไว้ใน `OrderShipment` **ตารางเดียวกับขาไป** (เพื่อใช้
 * `createShipment()` ที่ถือตรรกะทั้งหมดของการเปิดพัสดุ — ตรวจที่อยู่/เครดิต/retry/เก็บหลักฐาน/
 * ต้นทุนจริง — ซ้ำ) แต่ในระบบมี **14 จุด** ที่ค้นหา "พัสดุของออเดอร์นี้" ด้วย
 * `{ status: 'CREATED', isDryRun: false }` (10 จุด Prisma + 4 จุด raw SQL)
 *
 * ถ้าจุดไหนไม่ระบุทิศทาง มันจะหยิบพัสดุขากลับมาเป็นพัสดุของออเดอร์ ⇒
 *   - ออเดอร์ที่คืนของแล้วกลับไปขึ้น "กำลังจัดส่ง"
 *   - ไทล์กองงานนับซ้ำ
 *   - หลักฐานข้อพิพาท (00055) ผูกผิดใบ
 * ทั้งหมดนี้ **เงียบสนิท** — ไม่มี error ไม่มี type ผิด มีแค่ตัวเลขที่ผิดบนจอ
 *
 * ⇒ ทุกจุดต้อง import ตัวกรองจากที่นี่ ห้ามพิมพ์ object เอง · มีเทส `[blocker]` สแกนซอร์ส
 */

export const FORWARD_SHIPMENT = 'FORWARD' as const
export const RETURN_SHIPMENT = 'RETURN' as const

export type ShipmentDirection = typeof FORWARD_SHIPMENT | typeof RETURN_SHIPMENT

/**
 * ตัวกรอง "พัสดุขาไปที่มีอยู่จริงของออเดอร์นี้" — ชุดเดียวของทั้งระบบ
 *
 * `status: 'CREATED'` = เปิดสำเร็จจริง (ไม่ใช่ FAILED/CANCELLED) · `isDryRun: false` = ไม่ใช่
 * ของทดสอบ (BR-ISHIP-60/61) · `direction: 'FORWARD'` = ไม่ใช่พัสดุขากลับของใบคืน
 */
/**
 * 🛑 **ห้ามใส่ `as const`** — `revenueOrderWhere` ใน `lib/order-revenue.ts` spread ตัวนี้เข้าไป
 * ใน `where` ของ Prisma และไฟล์นั้นเขียนเตือนไว้เองว่า readonly tuple/object จะทำให้ Prisma
 * assign ไม่ผ่าน แล้ว **TS เลิก infer ทั้ง query — error ลามไปถึง `select` ที่ไม่เกี่ยวเลย**
 * (เจอจริงตอนเขียนรอบนี้: ใส่ `as const` แล้ว `sales/page.tsx` ฟ้องว่า `shipments` ไม่มีอยู่
 * ทั้งที่ไม่ได้แตะไฟล์นั้นสักตัวอักษร)
 */
export const ACTIVE_FORWARD_SHIPMENT = {
  status: 'CREATED',
  isDryRun: false,
  direction: FORWARD_SHIPMENT as string,
}

/** ตัวกรองเดียวกันในรูป SQL — สำหรับ 4 จุดที่เป็น raw query (Prisma แสดงเงื่อนไขนั้นไม่ได้) */
export const ACTIVE_FORWARD_SHIPMENT_SQL = `"status" = 'CREATED' AND "isDryRun" = false AND "direction" = '${FORWARD_SHIPMENT}'`
