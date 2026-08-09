-- Feature 00025 (LINE OA Chat Integration) — S-2 Migration + Schema
--
-- 100% additive: 12 คอลัมน์ใหม่ใน 4 ตารางเดิม (ShopChannel, ExternalContact, Conversation,
-- ChatMessage). ทุกคอลัมน์ nullable หรือมี default — ไม่มี backfill, ไม่มีตารางใหม่, ไม่มี index ใหม่
-- (partial unique index เดิมจาก migration 20260722000200 ครอบ BR-LINE-01 อยู่แล้ว)
--
-- อ้างอิง: docs/20 - Features/00025 - LINE OA Chat Integration/DATABASE.md §5.1
-- (timestamp ในเอกสารเดิมล้าสมัย — ดู doc-fix D-01 ใน DATABASE.md v1.2)

-- ShopChannel: credential ของ LINE (channel secret + basic ID) + quota cache
ALTER TABLE "ShopChannel" ADD COLUMN IF NOT EXISTS "channelSecretEnc" TEXT;
ALTER TABLE "ShopChannel" ADD COLUMN IF NOT EXISTS "basicId" TEXT;
ALTER TABLE "ShopChannel" ADD COLUMN IF NOT EXISTS "quotaValue" INTEGER;
ALTER TABLE "ShopChannel" ADD COLUMN IF NOT EXISTS "quotaUsed" INTEGER;
ALTER TABLE "ShopChannel" ADD COLUMN IF NOT EXISTS "quotaFetchedAt" TIMESTAMP(3);

-- ExternalContact: สถานะบล็อก/unfollow + กันดึงโปรไฟล์ถี่
ALTER TABLE "ExternalContact" ADD COLUMN IF NOT EXISTS "isBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExternalContact" ADD COLUMN IF NOT EXISTS "profileFetchedAt" TIMESTAMP(3);

-- Conversation: หน้าต่าง reply token ของ LINE (60s, TD-005)
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "replyToken" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "replyTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "replyTokenUsedAt" TIMESTAMP(3);

-- ChatMessage: หลักฐานวิธีส่ง (REPLY/PUSH) + การจัดกลุ่ม batch (parts[])
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "sendMethod" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "sendBatchId" TEXT;

-- ============================================================================
-- ROLLBACK (ไม่ auto-run — เก็บไว้เป็นเอกสารอ้างอิง รันมือเท่านั้นถ้าต้อง revert)
--
-- 🛑 ข้อควรระวัง: ถ้ามีร้านเชื่อม LINE ไปแล้ว การ DROP "channelSecretEnc" = ทำลาย credential
-- ที่กู้คืนไม่ได้ (ร้านต้องวาง secret ใหม่ทั้งหมด) — หลังมีผู้ใช้จริง ให้ปิดฟีเจอร์ด้วย feature flag
-- แทนการ drop คอลัมน์นี้ ไม่ใช่รัน rollback ตรง ๆ
-- ============================================================================
--
-- ALTER TABLE "ChatMessage" DROP COLUMN IF EXISTS "sendBatchId";
-- ALTER TABLE "ChatMessage" DROP COLUMN IF EXISTS "sendMethod";
-- ALTER TABLE "Conversation" DROP COLUMN IF EXISTS "replyTokenUsedAt";
-- ALTER TABLE "Conversation" DROP COLUMN IF EXISTS "replyTokenExpiresAt";
-- ALTER TABLE "Conversation" DROP COLUMN IF EXISTS "replyToken";
-- ALTER TABLE "ExternalContact" DROP COLUMN IF EXISTS "profileFetchedAt";
-- ALTER TABLE "ExternalContact" DROP COLUMN IF EXISTS "isBlocked";
-- ALTER TABLE "ShopChannel" DROP COLUMN IF EXISTS "quotaFetchedAt";
-- ALTER TABLE "ShopChannel" DROP COLUMN IF EXISTS "quotaUsed";
-- ALTER TABLE "ShopChannel" DROP COLUMN IF EXISTS "quotaValue";
-- ALTER TABLE "ShopChannel" DROP COLUMN IF EXISTS "basicId";
-- ALTER TABLE "ShopChannel" DROP COLUMN IF EXISTS "channelSecretEnc";
