-- การ์ดสินค้าหลายชิ้นในข้อความเดียว (ส่วนขยาย 2026-08-11)
--
-- additive ล้วน: เพิ่มคอลัมน์ array ที่มี DEFAULT '{}' — แถวเดิมทั้งหมดได้ค่าว่างทันที
-- ไม่แตะ CHECK constraint ใด ๆ จึงไม่มีทางลบค่าของ migration สาขาอื่นที่รันคาบเกี่ยวกัน
-- (บทเรียน docs/conventions/migration-check-constraint-additive.md)
--
-- ไม่ใช่ FK โดยตั้งใจ — Postgres ทำ FK บนคอลัมน์ array ไม่ได้ และการ์ดที่ชี้สินค้าที่ถูกลบต้องขึ้น
-- "ไม่พบสินค้านี้แล้ว" อยู่แล้วตอน enrich (พฤติกรรมเดียวกับ productRefId ที่โดน ON DELETE SET NULL)
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "productRefIds" TEXT[] NOT NULL DEFAULT '{}';
