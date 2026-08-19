-- ส่วนขยาย feature 00038 (2026-08-19) — "ทำเครื่องหมายว่าจัดการแล้ว" สำหรับคอมเมนต์
--
-- ทำไม: สถานะคอมเมนต์ทุกค่าถูก derive จาก "คำตอบที่ระบบเรามองเห็น" เท่านั้น คอมเมนต์ที่พ้น
-- หน้าต่าง 7 วันของ Meta (ตอบไม่ได้แล้ว) หรือที่ผู้ขายตั้งใจข้าม จึงค้างในคิว "ยังไม่ตอบ"
-- ตลอดไป — และคอมเมนต์ที่เพจเคยทัก private reply ไปแล้วจาก Business Suite โดยตรงก็เช่นกัน
-- (Facebook ตอบ `(#10900) Activity already replied to` ตอนเรากดทัก แต่เดิมเราไม่ได้จำอะไรไว้
-- จึงเชิญให้กดซ้ำได้เรื่อย ๆ ทั้งที่ไม่มีวันผ่าน)
--
-- Additive ล้วน: ทุกคอลัมน์ nullable ไม่มี default ไม่มี backfill — แถวเดิมทั้งหมดคงความหมาย
-- เดิมเป๊ะ (resolvedAt IS NULL = ยังไม่จบงาน ซึ่งเป็นสถานะเดิมของทุกแถวอยู่แล้ว)

ALTER TABLE "PageComment"
  ADD COLUMN IF NOT EXISTS "resolvedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "resolvedReason"   TEXT;

-- fail-closed ที่ชั้นฐาน: ค่าที่ไม่รู้จักเขียนไม่ลง (แพตเทิร์นเดียวกับ Shop_vertical_check)
--
-- 🛑 ถ้าวันหน้าต้องเพิ่มเหตุผลใหม่ ต้อง DROP แล้ว ADD ใหม่โดย **อ่านรายชื่อเดิมมาต่อท้าย**
-- ห้าม hardcode เฉพาะค่าใหม่ (บทเรียน 00033: migration 2 ตัวจากคนละ branch ลบค่าของกันเอง
-- เงียบ ๆ โดย migrate สำเร็จทุกไฟล์ ไปโผล่เป็น insert ล้มบนฐานจริง)
-- ดู docs/conventions/migration-check-constraint-additive.md
ALTER TABLE "PageComment"
  DROP CONSTRAINT IF EXISTS "PageComment_resolvedReason_check";

ALTER TABLE "PageComment"
  ADD CONSTRAINT "PageComment_resolvedReason_check"
  CHECK ("resolvedReason" IS NULL OR "resolvedReason" IN ('MANUAL', 'ALREADY_REPLIED_EXTERNALLY'));

-- คู่ที่ต้องไปด้วยกันเสมอ: มีเวลา = ต้องมีเหตุผล / ไม่มีเวลา = ต้องไม่มีเหตุผลค้าง
-- (กัน unresolve ที่ล้างเวลาแต่ลืมล้างเหตุผล แล้วแถวนั้นจะอ่านได้สองแบบตลอดไป)
ALTER TABLE "PageComment"
  DROP CONSTRAINT IF EXISTS "PageComment_resolved_pair_check";

ALTER TABLE "PageComment"
  ADD CONSTRAINT "PageComment_resolved_pair_check"
  CHECK (("resolvedAt" IS NULL) = ("resolvedReason" IS NULL));
