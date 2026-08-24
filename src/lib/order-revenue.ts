// order-revenue.ts — SSOT ตัวเดียวของคำถาม "ออเดอร์ใบนี้นับเป็นยอดขายแล้วหรือยัง"
//
// เดิมทุกที่ที่คิดยอดขายเขียน `status: 'CONFIRMED'` ตรง ๆ ซึ่งแปลว่า **ร้านจะเห็นยอดขายก็ต่อเมื่อ
// ผู้ซื้อเข้ามากดยืนยันรับของในแอป** — ผู้ซื้อจำนวนมากไม่เคยกด ทั้งที่ของถึงมือไปแล้วและร้านได้เงิน
// ไปแล้ว ยอดขายบนแดชบอร์ดจึงต่ำกว่าความจริงเรื่อย ๆ
//
// user เคาะ 2026-08-05: ให้ถือว่า "ขนส่งรับของไปแล้วจริง = ขายแล้ว" โดย**กระทบเฉพาะยอดขาย/
// กำไร-ขาดทุน** เท่านั้น — Trust Score, สิทธิ์รีวิว, จำนวนดีลสำเร็จบนการ์ดร้าน (สัญญาณความน่าเชื่อถือ
// ที่ผู้ซื้อเห็น) และ Order.status ยังผูกกับ CONFIRMED เหมือนเดิมทุกประการ
//
// [สำคัญ] ทำไมไม่ใช้แค่ `status === 'SHIPPED'`: สถานะนั้นตั้งได้ด้วยการที่ร้านพิมพ์เลขพัสดุเอง
// ซึ่งยังไม่ได้แปลว่าของออกจากร้านจริง — user เลือกเกณฑ์ "ขนส่งรับของแล้วจริง" คือต้องมีพัสดุที่
// ขนส่งยืนยันสถานะกลับมาแล้วเท่านั้น
//
// [สำคัญ] ของตีกลับไม่นับ: `return` / `return_success` แปลว่าของเดินทางกลับมาหาร้าน = ไม่มีการขาย
// เกิดขึ้นจริง แม้ขนส่งจะเคยรับของไปแล้วก็ตาม จึงไม่อยู่ในลิสต์ข้างล่าง (ต่างจาก impliesDispatched
// ใน lib/iship/status.ts ที่รวม 2 ตัวนี้ด้วย เพราะมันตอบคนละคำถาม — "ของออกจากร้านไปแล้วไหม")

/**
 * carrierStatus ที่ถือว่า "ขนส่งรับของไปแล้วจริง และของยังเดินหน้าไปหาผู้ซื้อ"
 * ตรงกับ status_code ของ iShip (ยืนยันกับ GET /api/order_statuses ของบัญชีจริง 2026-08-04)
 */
import { ACTIVE_FORWARD_SHIPMENT } from '@/lib/shipment-direction'

export const REVENUE_CARRIER_STATUSES = [
  "picked_up", // พัสดุเข้าระบบ
  "with_branch", // พัสดุถึงสถานีคัดแยก
  "in_transit", // อยู่ระหว่างขนส่ง
  "progress", // อยู่ระหว่างจัดส่ง
  "delivered", // จัดส่งแล้ว
  "payment_success", // เก็บเงินปลายทางสำเร็จ
] as const;

/**
 * เงื่อนไข Prisma สำหรับ "ใบที่นับเป็นยอดขาย" — เอาไป spread ใน `where` ได้ตรง ๆ
 *
 * ต้องใช้ตัวนี้ทุกที่ที่คิดยอดขาย ห้ามเขียน `status: 'CONFIRMED'` ซ้ำเอง ไม่งั้นวันหนึ่งกราฟยอดขาย
 * กับรายงานกำไร-ขาดทุนบนหน้าจอเดียวกันจะให้ตัวเลขคนละตัวโดยไม่มีอะไรเตือน
 */
// ไม่ใส่ `as const` โดยตั้งใจ — Prisma ต้องการ `OrderWhereInput[]` ที่แก้ไขได้ ถ้าเป็น readonly
// tuple จะ assign ไม่ผ่านแล้ว TS จะเลิก infer ทั้ง query (error ลามไปถึง select ที่ไม่เกี่ยวเลย)
export const revenueOrderWhere = {
  OR: [
    { status: "CONFIRMED" },
    {
      status: "SHIPPED",
      shipments: {
        some: {
          // พัสดุทดสอบต้องไม่เข้าสถิติทุกชนิด (BR-ISHIP-60/61) + ต้องเป็นพัสดุ **ขาไป**
          // เท่านั้น (feature 00056) — พัสดุขากลับของใบคืนไม่ใช่หลักฐานว่าขายได้
          ...ACTIVE_FORWARD_SHIPMENT,
          carrierStatus: { in: [...REVENUE_CARRIER_STATUSES] },
        },
      },
    },
  ],
};

/**
 * เวอร์ชันเช็คในหน่วยความจำ — ใช้กับที่ที่ดึงออเดอร์มาแล้วค่อยกรอง (แดชบอร์ด/กราฟยอดขาย)
 * ต้องให้ผลตรงกับ `revenueOrderWhere` เสมอ
 */
export function countsAsRevenue(order: {
  status: string;
  /**
   * 🛑 `direction` เป็น field **บังคับ** (feature 00056) — ไม่ใช่ optional
   * ผู้เรียกที่ลืม `select` มาจะ compile ไม่ผ่าน ซึ่งคือด่านเดียวที่กันพัสดุขากลับของใบคืน
   * ไม่ให้ถูกนับเป็นหลักฐานว่า "ขายได้" (ทำเป็น optional แล้วมันจะ undefined เงียบ ๆ
   * แล้วเงื่อนไขข้างล่างเป็นเท็จตลอด = ยอดขายหายทั้งระบบ หรือถ้าเขียนกลับด้านก็เฟ้อทั้งระบบ)
   */
  shipments?:
    | { status: string; isDryRun: boolean; carrierStatus: string | null; direction: string }[]
    | null;
}): boolean {
  if (order.status === "CONFIRMED") return true;
  if (order.status !== "SHIPPED") return false;
  return (order.shipments ?? []).some(
    (s) =>
      s.status === "CREATED" &&
      !s.isDryRun &&
      s.direction === "FORWARD" &&
      s.carrierStatus != null &&
      (REVENUE_CARRIER_STATUSES as readonly string[]).includes(s.carrierStatus),
  );
}
