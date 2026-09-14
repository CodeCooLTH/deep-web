-- ChatMessage.updatedAt — แกนที่ 2 ของ delta (ดูคอมเมนต์ใน schema.prisma)
-- additive ล้วน: แถวเดิมได้ค่าเริ่มต้นเท่ากับ createdAt เพื่อไม่ให้ delta รอบแรกคว้าทั้งตาราง
ALTER TABLE "ChatMessage" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "ChatMessage" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "ChatMessage" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "ChatMessage" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "ChatMessage_conversationId_updatedAt_idx" ON "ChatMessage"("conversationId", "updatedAt");

-- Conversation.metaBackfilledAt — ธง "ไล่ย้อนจาก Meta ครบถึงวันสร้างเธรดแล้ว"
ALTER TABLE "Conversation" ADD COLUMN "metaBackfilledAt" TIMESTAMP(3);
