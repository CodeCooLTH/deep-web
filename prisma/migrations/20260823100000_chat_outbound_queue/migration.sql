-- CR 2026-08-23 (00018): คิวส่งข้อความขาออกฝั่งผู้ขาย
-- SSOT: docs/20 - Features/00018 - Facebook Chat Integration/EXTENSIONS-2026-08-23-outbound-queue.md
--
-- additive ล้วน: ไม่ลบคอลัมน์ ไม่แตะ constraint ไม่ backfill
-- `deliveryStatus` เป็น text เปล่าไม่มี CHECK อยู่แล้ว การเพิ่มค่า 'QUEUED' จึงไม่ต้องแก้ constraint

ALTER TABLE "ChatMessage" ADD COLUMN "sendLockedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN "sendLockedBy" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "sendPayload" JSONB;

-- 🛑 partial index บังคับ: ตารางนี้โต ~24,000 แถว/เดือน แต่แถวที่ค้างคิวจริงมีหลักสิบ
-- index เต็มคือการจ่ายค่าเขียนทุกแถวเพื่อ query ที่แตะหลักสิบ
-- คีย์เป็น (conversationId, createdAt) เพราะ worker หยิบงาน "เป็นห้อง แล้วเรียงเก่าสุดก่อน"
CREATE INDEX "ChatMessage_send_queue_idx"
  ON "ChatMessage" ("conversationId", "createdAt")
  WHERE "deliveryStatus" = 'QUEUED';

-- ROLLBACK NOTE:
-- DROP INDEX IF EXISTS "ChatMessage_send_queue_idx";
-- ALTER TABLE "ChatMessage" DROP COLUMN IF EXISTS "sendPayload";
-- ALTER TABLE "ChatMessage" DROP COLUMN IF EXISTS "sendLockedBy";
-- ALTER TABLE "ChatMessage" DROP COLUMN IF EXISTS "sendLockedAt";
-- ปลอดภัยเมื่อไม่มีแถว deliveryStatus='QUEUED' ค้างอยู่ — ถ้ามี ให้ปิดเป็น FAILED ก่อน
