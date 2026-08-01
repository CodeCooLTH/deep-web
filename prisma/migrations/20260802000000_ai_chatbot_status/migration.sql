-- feature 00023 · ChatBot มี 3 สถานะ + เลือกแชททดสอบ (user สั่ง 2026-08-01)
-- "เพื่อให้เราตั้งค่า AI และทดสอบจริงก่อน"
--
-- ใช้คำเดียวกับ AutoReplyKeyword.status (OFFLINE/TEST/LIVE) เพราะร้านเรียนความหมาย
-- ไปแล้วรอบหนึ่งจากกลุ่มคำ — ตั้งชื่อใหม่ให้ของที่ทำงานเหมือนกันคือบังคับให้เรียนซ้ำ

ALTER TABLE "AutoReplyConfig"
  ADD COLUMN "aiChatbotStatus" TEXT NOT NULL DEFAULT 'OFFLINE';

ALTER TABLE "AutoReplyConfig"
  ADD CONSTRAINT "AutoReplyConfig_aiChatbotStatus_check"
  CHECK ("aiChatbotStatus" IN ('OFFLINE', 'TEST', 'LIVE'));

-- ร้านที่เคยเปิดสวิตช์เดิมไว้ = ตั้งใจให้ทำงาน -> ยกขึ้นเป็น LIVE ไม่ใช่ปล่อยเป็น OFFLINE
-- (ปล่อยเป็น OFFLINE = ปิดของที่ร้านเปิดไว้เงียบ ๆ ซึ่งแย่กว่า)
UPDATE "AutoReplyConfig" SET "aiChatbotStatus" = 'LIVE' WHERE "aiChatbotEnabled" = true;

CREATE TABLE "AiChatbotTestThread" (
  "id"             TEXT NOT NULL,
  "shopId"         TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiChatbotTestThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiChatbotTestThread_shopId_conversationId_key"
  ON "AiChatbotTestThread"("shopId", "conversationId");
CREATE INDEX "AiChatbotTestThread_shopId_idx" ON "AiChatbotTestThread"("shopId");

ALTER TABLE "AiChatbotTestThread"
  ADD CONSTRAINT "AiChatbotTestThread_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiChatbotTestThread"
  ADD CONSTRAINT "AiChatbotTestThread_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
