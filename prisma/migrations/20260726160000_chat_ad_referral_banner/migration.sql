-- feature 00018 E5 (user request 2026-07-26): ป้ายบอกที่มาโฆษณาแบบ Messenger (รูป + ชื่อโฆษณา)
--
-- ต่อยอดจาก 20260725100000_chat_reaction_referral ที่มี referralSource/referralAdTitle อยู่แล้ว
-- additive ล้วน: เพิ่มคอลัมน์ nullable + ตารางใหม่ ไม่แตะ/ไม่ลบของเดิม → ข้อมูล referral ที่เก็บ
-- ไว้แล้วในเธรดเก่ายังใช้ได้ทันที (แบนเนอร์แสดงได้แม้ยังไม่มีรูป)
--
-- ทำไมต้องมีตารางประวัติ (ไม่ใช่แค่คอลัมน์): Meta ส่ง referral มาทาง webhook รอบเดียวและไม่มี
-- Graph API ให้อ่านย้อนหลัง — ถ้าค่าล่าสุดทับของเดิมทิ้งไปเรื่อย ๆ ประวัติ "ลูกค้าคนนี้เคยมาจาก
-- โฆษณาตัวไหนบ้าง" จะหายถาวร (เป็นข้อมูลดิบของรายงาน "ads ตัวไหนพาลูกค้ามา" ในเฟสถัดไป)
--
-- DB dev/prod ใช้ร่วมกัน (docs/conventions/prisma-shared-db-drift.md) — apply ด้วย
-- `prisma migrate deploy` เท่านั้น ห้าม migrate dev (จะ reset ข้อมูลจริง)
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "referralAdId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "referralPhotoFileId" TEXT;

CREATE TABLE IF NOT EXISTS "ConversationAdReferral" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "source" TEXT,
    "adId" TEXT,
    "adTitle" TEXT,
    "photoFileId" TEXT,
    "photoUrl" TEXT,
    "videoUrl" TEXT,
    "postId" TEXT,
    "productId" TEXT,
    "flowId" TEXT,
    "refPayload" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationAdReferral_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConversationAdReferral_conversationId_receivedAt_idx"
    ON "ConversationAdReferral"("conversationId", "receivedAt");

-- ลบเธรด → ลบประวัติที่มาตาม (ไม่มีความหมายเมื่อไม่มีเธรด)
ALTER TABLE "ConversationAdReferral"
    ADD CONSTRAINT "ConversationAdReferral_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
