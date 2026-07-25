-- feature 00018 Phase 2: reaction บนข้อความ + ที่มาแรกเข้าจากโฆษณา/ลิงก์ (user request 2026-07-25)
-- additive ล้วน (เพิ่มคอลัมน์ nullable) — ปลอดภัยกับ shared DB dev=prod ไม่ทำลายข้อมูลเดิม

-- AlterTable: reaction emoji ล่าสุดบนข้อความ (message_reactions webhook)
ALTER TABLE "ChatMessage" ADD COLUMN "reactionEmoji" TEXT;

-- AlterTable: context "แรกเข้า" ของเธรด (ทักจากโฆษณา/ลิงก์)
ALTER TABLE "Conversation" ADD COLUMN "referralSource" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "referralAdTitle" TEXT;
