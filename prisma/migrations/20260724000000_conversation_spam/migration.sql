-- Conversation.isSpam — เธรดสแปม (feature 00018, user สั่ง 2026-07-24)
-- hand-written (DB dev=prod แชร์กัน — ห้าม migrate dev, ใช้ migrate deploy) ดู docs/conventions/prisma-shared-db-drift.md
-- additive ล้วน: คอลัมน์ใหม่ NOT NULL DEFAULT false = metadata-only บน Postgres ≥11 (ไม่ rewrite ตาราง)

ALTER TABLE "Conversation" ADD COLUMN "isSpam" BOOLEAN NOT NULL DEFAULT false;

-- inbox list กรอง "ไม่สแปม + ไม่ซ่อน" เป็น query หลัก — index ให้ตรง (เสริมจาก index เดิมที่ไม่มี isSpam)
CREATE INDEX "Conversation_shopId_isSpam_isHidden_lastMessageAt_idx"
  ON "Conversation" ("shopId", "isSpam", "isHidden", "lastMessageAt");
