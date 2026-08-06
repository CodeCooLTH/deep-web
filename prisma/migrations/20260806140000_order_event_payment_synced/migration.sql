-- ส่วนขยาย 00022 (2026-08-06): ระบบแก้วิธีชำระเงินของคำสั่งซื้อให้ตรงกับพัสดุที่เปิดจริง
--
-- PAYMENT_METHOD_SYNCED — พัสดุเปิดแบบเก็บเงินปลายทางแต่คำสั่งซื้อไม่ได้บอกอย่างนั้น
-- ระบบจึงแก้ให้ตรงความจริง · เป็นการเปลี่ยนข้อมูลเรื่องเงิน จึงต้องมีรอยไว้ให้ตรวจย้อนหลัง
-- ไม่ใช้ ORDER_EDITED เพราะอันนั้นแปลว่า "คนแก้" ซึ่งตอบไม่ได้ว่าแก้อะไรเพราะอะไร
--
-- CHECK constraint นี้เป็น unmanaged SQL — เพิ่มค่าใหม่ต้อง drop แล้วสร้างใหม่ทั้งก้อนเสมอ
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
    'SYSTEM_CONFIRMED',
    'PAYMENT_METHOD_SYNCED'
));
