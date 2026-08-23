-- feature 00053 — ตัวควบคุมการแสดงผลหน้าร้านสาธารณะ (Public Profile Display Controls)
-- DATABASE.md §5.1 · additive ล้วน ไม่มี backfill ไม่แตะ CHECK constraint ใด
--
-- PostgreSQL 11+ เพิ่มคอลัมน์ที่มี DEFAULT โดยไม่ rewrite ตาราง → ไม่ล็อกยาวแม้ "Product"
-- จะมีแถวจริงบน prod อยู่แล้ว

-- ค่าเดียวคุมทั้งร้าน: หน้าร้านสาธารณะจะพิมพ์ราคาไหม
-- 🛑 default false ตามมติผู้ใช้ 2026-08-23 ⇒ ทุกร้านหยุดโชว์ราคาทันทีที่ deploy จนกว่าเจ้าของ
--    จะเข้าไปเปิดเองที่ /public-profile (ตั้งใจ ไม่ใช่ผลข้างเคียง)
ALTER TABLE "ShopPageLayout" ADD COLUMN "showPrices" BOOLEAN NOT NULL DEFAULT false;

-- ค่าต่อรายการ: โชว์บนหน้าร้านไหม — คนละเรื่องกับ "ขายอยู่ไหม" (isActive)
-- default true ⇒ ร้านเดิมไม่มีอะไรเปลี่ยน
ALTER TABLE "Product"         ADD COLUMN "showOnProfile" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Room"            ADD COLUMN "showOnProfile" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ServiceResource" ADD COLUMN "showOnProfile" BOOLEAN NOT NULL DEFAULT true;
