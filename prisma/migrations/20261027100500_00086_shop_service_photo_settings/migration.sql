-- feature 00086 P3 (S-11 · FR-013) — ตั้งค่ารูปก่อน-หลังงานระดับร้าน (ร้านบริการ)
--   "serviceJobPhotoMode"          = 'REQUIRED' (บังคับ) | 'OPTIONAL' (ไม่บังคับ) | 'NONE' (ไม่ใช้รูป · บันทึกข้อความได้)
--   "serviceJobPhotosBuyerVisible" = ลูกค้าเห็นรูปและบันทึกในหน้า /o/{token} + ได้ข้อความอัตโนมัติ "ทำเสร็จ ดูรูป…"
--
-- ค่าเริ่มของทุกร้าน (เดิม + ใหม่) = ไม่บังคับ + ลูกค้าไม่เห็น (มติ user 2026-10-27 · PRD §10.2)
--   ADD COLUMN NOT NULL DEFAULT ค่าคงที่ ให้ผลนี้กับแถวเดิมทันที (PG11+ ไม่ rewrite ตาราง) ⇒ ไม่มี UPDATE backfill
--   ร้านประเภทอื่นได้ค่าเดียวกันแต่ไม่มีผู้อ่าน (จอ/route กั้นด้วย vertical)
-- ทำไมไม่ใส่ใน reportSettings (JSON): ต้องการ CHECK ระดับฐาน และ query ตรงในหน้า /o/{token} (DATABASE §1.1 ข้อ 6)
--
-- CHECK Shop_serviceJobPhoto_check: ค่าในชุดเท่านั้น + "ไม่ใช้รูป" ⇒ ลูกค้าเห็นไม่ได้
--   (route ตั้งค่าบังคับ false ให้เองอยู่แล้ว — ฐานเป็นด่านที่สอง กันลูกค้าเห็นการ์ดว่างจากข้อมูลเพี้ยน)
-- NOT VALID + VALIDATE ตามแบบแผน (ไฟล์เดียวใน transaction จึงไม่ย่น lock — Shop เล็ก แถวเดิมเป็นค่าเริ่มที่ผ่านแน่นอน)
--
-- additive ล้วน · รันซ้ำได้
-- rollback (ก่อนร้านเริ่มตั้งค่าจริงเท่านั้น): DROP CONSTRAINT "Shop_serviceJobPhoto_check"; DROP COLUMN สองตัว
SET LOCAL lock_timeout = '5s';

ALTER TABLE "Shop"
  ADD COLUMN IF NOT EXISTS "serviceJobPhotoMode" TEXT NOT NULL DEFAULT 'OPTIONAL',
  ADD COLUMN IF NOT EXISTS "serviceJobPhotosBuyerVisible" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Shop" DROP CONSTRAINT IF EXISTS "Shop_serviceJobPhoto_check";
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_serviceJobPhoto_check"
  CHECK ("serviceJobPhotoMode" IN ('REQUIRED','OPTIONAL','NONE')
         AND ("serviceJobPhotoMode" <> 'NONE' OR NOT "serviceJobPhotosBuyerVisible")) NOT VALID;
ALTER TABLE "Shop" VALIDATE CONSTRAINT "Shop_serviceJobPhoto_check";
