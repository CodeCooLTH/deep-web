-- feature 00024 (Service Appointment Booking) — FR-RSV-13 หน่วยเวลาของการนัด
--
-- ลูกค้ากลุ่มแรกคือร้านรับตกแต่งไฟหน้ารถยนต์ — ลูกค้า "จองวันเข้ามาใช้" ไม่ได้นัดเป็นชั่วโมง
-- การบังคับกรอกเวลาเริ่ม-สิ้นสุดจึงเป็นภาระที่ไม่ได้ให้ประโยชน์ แต่ร้านเดียวกันก็อาจต้องระบุ
-- เวลาในบางงาน (เช่น วันเดียวกัน 09:00-12:00 / 13:00-14:00 / 14:00-15:00) จึงต้องเลือกได้
--
-- 🛑 ห้ามรัน `prisma migrate dev` (dev = prod ตัวเดียวกัน จะ reset ลบข้อมูลทิ้ง)
-- 🛑 ห้ามรัน `prisma db pull` — จะลบ EXCLUDE constraint ของ 00008/00017/00024 ทิ้ง
--
-- ค่าเริ่มต้น DAY = แบบที่กรอกน้อยที่สุด ร้านที่มีอยู่แล้วได้ค่านี้อัตโนมัติ
-- IMPORTANT: ไม่กระทบนัดที่บันทึกไว้แล้ว — คอลัมน์นี้บอกแค่ "ฟอร์มควรถามอะไร" (BR-RSV-55)
--   ทั้งสองโหมดเก็บด้วย Order.serviceStart/serviceEnd ชุดเดียวกัน ไม่มีคอลัมน์ใหม่บน Order
--
-- ปลอดภัย: ADD COLUMN ที่มี DEFAULT + NOT NULL บน PostgreSQL 11+ ไม่ rewrite ตาราง

ALTER TABLE "Shop"
  ADD COLUMN "appointmentGranularity" TEXT NOT NULL DEFAULT 'DAY';

-- BR-RSV-53: มีได้ 2 แบบเท่านั้น
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_appointment_granularity"
  CHECK ("appointmentGranularity" IN ('DAY', 'TIME'));
