-- feature 00038 — แยกเหตุผลความล้มเหลวของ "ตอบใต้คอมเมนต์" กับ "ทักแชท" ออกจากกัน
--
-- ที่มา (user 2026-08-10): "reply ไม่ผ่าน อาจจะทักแชทได้ก็ได้" — สองงานนี้เป็นอิสระต่อกันจริง
-- (BR-CR-A5: public ล้มไม่หยุด private) แต่เดิมใช้คอลัมน์ `errorMessage` ร่วมกันคอลัมน์เดียว
-- ซึ่งพัง 2 ทาง:
--   1. ทั้งคู่ FAILED -> ข้อความของ public ถูก private เขียนทับ (private รันทีหลังเสมอ)
--   2. public FAILED แล้ว private สำเร็จ -> โค้ดเขียน errorMessage = NULL ทับ
--      = เหตุผลของฝั่งสาธารณะถูกล้างทิ้งทุกครั้ง ร้านเห็น "ไม่สำเร็จ" เปล่า ๆ
--
-- additive ล้วน: เพิ่ม 2 คอลัมน์ nullable ไม่แตะ/ไม่ลบคอลัมน์เดิม ไม่มี CHECK/constraint ใหม่
-- คอลัมน์ `errorMessage` ถูกทำเป็น DEPRECATED ในโค้ด (ไม่เขียนเพิ่มแล้ว) แต่คงไว้ในฐานเพื่อ
-- ไม่ทำลายข้อมูลเดิมและให้ย้อนสอบได้

ALTER TABLE "CommentReplyLog" ADD COLUMN IF NOT EXISTS "publicErrorMessage" TEXT;
ALTER TABLE "CommentReplyLog" ADD COLUMN IF NOT EXISTS "privateErrorMessage" TEXT;

-- backfill แถวเก่า — แยกฝั่งได้จาก "ลำดับการเขียนที่โค้ดเดิมรับประกันไว้" ไม่ใช่การเดา:
-- public เขียนก่อน แล้ว private เขียนทับทีหลังเสมอ ดังนั้น
--   * privateReplyStatus = 'FAILED'  -> ค่าที่เหลืออยู่เป็นของ private แน่นอน
--   * ไม่ใช่กรณีข้างบน และ publicReplyStatus = 'FAILED' -> เป็นของ public
-- เคสที่เหลือ (private สำเร็จ) ค่าถูกล้างเป็น NULL ไปแล้วตั้งแต่ตอนนั้น กู้ไม่ได้ ไม่ต้องเดาแทน
UPDATE "CommentReplyLog"
SET "privateErrorMessage" = "errorMessage"
WHERE "errorMessage" IS NOT NULL
  AND "privateReplyStatus" = 'FAILED';

UPDATE "CommentReplyLog"
SET "publicErrorMessage" = "errorMessage"
WHERE "errorMessage" IS NOT NULL
  AND "privateErrorMessage" IS NULL
  AND "publicReplyStatus" = 'FAILED';
