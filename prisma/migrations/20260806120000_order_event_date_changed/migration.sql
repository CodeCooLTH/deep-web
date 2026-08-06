-- prisma/migrations/20260806120000_order_event_date_changed/migration.sql
-- feature 00033 — เพิ่มชนิดเหตุการณ์ ORDER_DATE_CHANGED (เลื่อนวันที่คำสั่งซื้อ)
--
-- CHECK นี้เป็น unmanaged SQL: Prisma DSL ประกาศไม่ได้ จึงต้องเขียนมือทุกครั้งที่รายชื่อเปลี่ยน
-- และห้าม `prisma db pull` เด็ดขาด (introspect ไม่เห็น แล้วจะสร้าง migration ที่ DROP ทิ้ง)
--
-- ตารางนี้มีข้อมูลแล้ว จึงใช้ NOT VALID + VALIDATE ตามแบบเดียวกับ Shop_vertical_check:
-- ADD ... NOT VALID จับล็อกสั้น ๆ, VALIDATE สแกนแถวเดิมโดยไม่บล็อกการเขียน
-- (แถวเดิมทุกแถวผ่านอยู่แล้วเพราะรายชื่อใหม่เป็น superset ของเดิม)

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
    'ORDER_DATE_CHANGED'
)) NOT VALID;

ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";
