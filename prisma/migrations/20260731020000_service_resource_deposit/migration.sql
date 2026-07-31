-- feature 00024 (Service Appointment Booking) — ส่วนขยาย "มัดจำล็อกวัน" FR-RSV-12
--
-- เพิ่มมัดจำเริ่มต้นต่อทรัพยากร (BR-RSV-43/44/45) เพื่อให้ร้านบริการเก็บมัดจำบางส่วน
-- ตอนล็อกวัน แล้วเก็บส่วนที่เหลือหน้างานได้ — ยอดจริงของแต่ละนัดถูก snapshot ไว้ที่
-- Order.depositAmount (ฟิลด์เดิมจาก feature 00017) ไม่สร้างฟิลด์คู่ขนานใหม่
--
-- 🛑 ห้ามรัน `prisma migrate dev` กับ DB นี้ (dev = prod ตัวเดียวกัน — จะ reset ลบข้อมูลทิ้ง)
--    ไฟล์นี้เขียนมือ ใช้ `prisma migrate deploy` เท่านั้น
-- 🛑 ห้ามรัน `prisma db pull` — จะลบ EXCLUDE constraint ของ 00008/00017/00024 ทิ้งทั้งหมด
--    (unmanaged SQL ที่ introspection ของ Prisma มองไม่เห็น)
--
-- ปลอดภัย: ADD COLUMN ที่มี DEFAULT + NOT NULL บน PostgreSQL 11+ ไม่ rewrite ตาราง
-- (เก็บ default ไว้ใน catalog) ค่าเริ่มต้น FIXED/0 = "ไม่เก็บมัดจำ" ทรัพยากรที่สร้างไปแล้ว
-- จึงมีพฤติกรรมไม่เปลี่ยน (BR-RSV-44)
--
-- ไม่แตะตาราง "Order" เลย — มัดจำใช้ Order.depositAmount ที่มีอยู่แล้ว

ALTER TABLE "ServiceResource"
  ADD COLUMN "depositMode"  TEXT          NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "depositValue" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- BR-RSV-43: รูปแบบมัดจำมีได้ 2 แบบเท่านั้น
ALTER TABLE "ServiceResource" ADD CONSTRAINT "ServiceResource_deposit_mode"
  CHECK ("depositMode" IN ('FIXED', 'PERCENT'));

-- BR-RSV-45: จำนวนเงินห้ามติดลบ; เปอร์เซ็นต์ต้องอยู่ในช่วง 0-100
ALTER TABLE "ServiceResource" ADD CONSTRAINT "ServiceResource_deposit_value"
  CHECK (
    "depositValue" >= 0
    AND ("depositMode" <> 'PERCENT' OR "depositValue" <= 100)
  );
