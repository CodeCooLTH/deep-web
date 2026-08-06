-- ส่วนขยาย 00022 (2026-08-06): ปิดงาน COD อัตโนมัติจาก settlement_at ของ iShip
--
-- เก็บวันเวลาที่ขนส่งแจ้งว่าโอนเงินเก็บปลายทางเข้าระบบร้านแล้ว
-- ใช้ 2 อย่าง: (1) หลักฐานว่าการยืนยันอัตโนมัติเกิดจากอะไร (2) กุญแจกันรอบ sync
-- ประมวลผลใบเดิมซ้ำ — มีค่าแล้วแปลว่าเคยทำไปแล้ว ข้ามได้เลย
--
-- additive ล้วน: ไม่มี default ไม่ backfill ไม่แตะแถวเดิมสักแถว
ALTER TABLE "OrderShipment" ADD COLUMN "codSettledAt" TIMESTAMP(3);

-- เหตุการณ์ใหม่ 2 ตัวสำหรับไทม์ไลน์คำสั่งซื้อ (BR-ISHIP-47)
--   COD_SETTLED      — ขนส่งโอนเงินเก็บปลายทางเข้าร้านแล้ว
--   SYSTEM_CONFIRMED — ระบบยืนยันคำสั่งซื้อให้อัตโนมัติเพราะเงินเข้าแล้ว
-- ห้ามใช้ BUYER_CONFIRMED แทน: ผู้ซื้อไม่ได้กด การบันทึกแบบนั้นคือข้อมูลเท็จ
--
-- CHECK constraint นี้เป็น unmanaged SQL (Prisma ไม่รู้จัก) — เพิ่มค่าใหม่ต้อง drop
-- แล้วสร้างใหม่ทั้งก้อนเสมอ ห้าม ALTER เฉพาะบางค่า
ALTER TABLE "OrderEvent" DROP CONSTRAINT IF EXISTS "OrderEvent_type_check";
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" IN (
    'ORDER_CREATED',
    'ORDER_EDITED',
    'ORDER_CANCELLED',
    'TRACKING_ADDED',
    'SHIPMENT_CREATED',
    'SHIPMENT_CANCELLED',
    'SHIPMENT_LINKED',
    'SMS_LINK_SENT',
    'BUYER_CONFIRMED',
    'COD_SETTLED',
    'SYSTEM_CONFIRMED'
));
