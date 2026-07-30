-- feature 00023 Chat Auto-Reply — ยุบ isActive+mode เป็น status เดียว 3 ค่า
-- และย้ายโหมดทดสอบจาก "ระดับร้าน" มาเป็น "รายกลุ่มคำ"
--
-- ที่มา: user 2026-07-29 "เอาระดับทั้งหมดออกไปเลย ยกเลิก" + "ให้ตั้งค่าทดสอบได้ทีละอัน"
--   OFFLINE = ไม่ตอบใครเลย ตั้งค่าไว้เฉย ๆ (ลองได้ผ่านแผงพรีวิวในหน้าตั้งค่า)
--   TEST    = ตอบเฉพาะเธรดที่ระบุไว้ของกลุ่มนั้น (ต้องระบุอย่างน้อย 1 เธรดเสมอ)
--   LIVE    = ตอบทุกเธรดตามเงื่อนไขที่ตั้งไว้
--
-- ทำไมต้องยุบ: ของเดิมต้องอ่าน 4 ค่าถึงจะตอบได้ว่า "ทำไมชุดนี้ไม่ตอบ" —
-- AutoReplyConfig.testMode + Conversation.autoReplyTestEnabled + Keyword.isActive + Keyword.mode
-- และ "TEST" กับ "ปิดอยู่" แยกกันไม่ออกในสายตาคนใช้ (บทเรียนจริงจากการลองใช้บน prod วันเดียวกัน)
--
-- 🛑 migration นี้ "ทำลายข้อมูล" (DROP COLUMN) — ยอมรับได้เพราะฟีเจอร์นี้ deploy วันเดียวกัน
-- และมีข้อมูลจริงเฉพาะร้านทดสอบของเจ้าของระบบ. backfill ด้านล่างรักษาพฤติกรรมเดิมทุกแถว
-- ก่อนจะ DROP เสมอ — ห้ามสลับลำดับ

-- ── 1) AutoReplyKeyword: เพิ่ม status แล้ว backfill จากคู่ (isActive, mode) ──
ALTER TABLE "AutoReplyKeyword" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'OFFLINE';

UPDATE "AutoReplyKeyword"
SET "status" = CASE
  WHEN "isActive" = false THEN 'OFFLINE'
  WHEN "mode" = 'TEST'    THEN 'TEST'
  ELSE 'LIVE'
END;

DROP INDEX IF EXISTS "AutoReplyKeyword_shopId_isActive_priority_idx";
DROP INDEX IF EXISTS "AutoReplyKeyword_shopId_mode_idx";

ALTER TABLE "AutoReplyKeyword" DROP COLUMN "isActive";
ALTER TABLE "AutoReplyKeyword" DROP COLUMN "mode";

CREATE INDEX "AutoReplyKeyword_shopId_status_priority_idx"
  ON "AutoReplyKeyword"("shopId", "status", "priority");

-- ── 2) ตารางเธรดทดสอบรายกลุ่มคำ ──
CREATE TABLE "AutoReplyKeywordTestThread" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoReplyKeywordTestThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutoReplyKeywordTestThread_keywordId_conversationId_key"
  ON "AutoReplyKeywordTestThread"("keywordId", "conversationId");
CREATE INDEX "AutoReplyKeywordTestThread_conversationId_idx"
  ON "AutoReplyKeywordTestThread"("conversationId");

ALTER TABLE "AutoReplyKeywordTestThread"
  ADD CONSTRAINT "AutoReplyKeywordTestThread_keywordId_fkey"
  FOREIGN KEY ("keywordId") REFERENCES "AutoReplyKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutoReplyKeywordTestThread"
  ADD CONSTRAINT "AutoReplyKeywordTestThread_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ย้าย allowlist เดิมของร้านที่เปิดโหมดทดสอบไว้ ให้กลุ่มคำที่เป็น TEST อยู่ —
-- ไม่ให้ร้านที่กำลังทดสอบค้างอยู่ต้องมาตั้งใหม่หลัง deploy
INSERT INTO "AutoReplyKeywordTestThread" ("id", "keywordId", "conversationId", "createdAt")
SELECT gen_random_uuid()::text, k."id", c."id", CURRENT_TIMESTAMP
FROM "AutoReplyKeyword" k
JOIN "Conversation" c ON c."shopId" = k."shopId" AND c."autoReplyTestEnabled" = true
WHERE k."status" = 'TEST'
ON CONFLICT DO NOTHING;

-- ── 3) ตัดโหมดทดสอบระดับร้านทิ้งทั้งชั้น ──
DROP INDEX IF EXISTS "Conversation_shopId_autoReplyTestEnabled_idx";
ALTER TABLE "Conversation" DROP COLUMN "autoReplyTestEnabled";

ALTER TABLE "AutoReplyConfig" DROP COLUMN "testMode";
ALTER TABLE "AutoReplyConfig" DROP COLUMN "testModeExpiresAt";
ALTER TABLE "AutoReplyConfig" DROP COLUMN "testModeEnabledByUserId";
