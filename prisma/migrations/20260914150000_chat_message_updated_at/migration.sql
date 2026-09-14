-- ChatMessage.updatedAt — แกนที่ 2 ของ delta (ดูคอมเมนต์ใน schema.prisma)
--
-- 🛑 ห้ามเขียนเป็น ADD COLUMN + UPDATE ทุกแถว + SET NOT NULL: Prisma ห่อไฟล์นี้ในทรานแซกชันเดียว
-- และ ADD COLUMN ถือ ACCESS EXCLUSIVE lock ไว้จน COMMIT ⇒ UPDATE ทั้งตาราง (prod 2026-09-14:
-- ~106,000 แถว / heap 112 MB) จะทำให้ทุกการอ่าน/เขียน ChatMessage ค้างทั้งระบบตลอดช่วงนั้น
--
-- ใช้ fast default ของ Postgres 11+ แทน: ค่าตั้งต้นที่เป็นค่าคงที่ = เขียนแค่ metadata ไม่ rewrite
-- ไม่ scan ⇒ lock สั้นระดับเสี้ยววินาที · แถวเดิมจึงได้ 1970-01-01 (= "ไม่เคยถูกแก้ตั้งแต่เริ่มติดตาม")
-- ซึ่งฝั่งอ่านต้องใช้ max(createdAt, updatedAt) เป็น watermark เสมอ (src/lib/chat-message-store.ts)
-- ไม่งั้นแถวเก่าจะหลุดเข้า delta ทั้งเธรด
ALTER TABLE "ChatMessage" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00';
ALTER TABLE "ChatMessage" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "ChatMessage_conversationId_updatedAt_idx" ON "ChatMessage"("conversationId", "updatedAt");

-- Conversation.metaBackfilledAt — ธง "ไล่ย้อนจาก Meta ครบถึงวันสร้างเธรดแล้ว"
ALTER TABLE "Conversation" ADD COLUMN "metaBackfilledAt" TIMESTAMP(3);
