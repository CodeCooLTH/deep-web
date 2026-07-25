-- feature 00018 Phase 3: reply (ตอบทับข้อความ) + unsend (ผู้ส่งลบข้อความ) — user request 2026-07-25
-- additive ล้วน (เพิ่มคอลัมน์ nullable / boolean default false) — ปลอดภัยกับ shared DB dev=prod

-- AlterTable: externalMessageId ของข้อความที่ถูกตอบทับ (message.reply_to.mid) — แสดง quote
ALTER TABLE "ChatMessage" ADD COLUMN "replyToMid" TEXT;

-- AlterTable: ผู้ส่ง unsend ข้อความ (message.is_deleted) — แสดง "ข้อความถูกลบ" แทนเนื้อหา
ALTER TABLE "ChatMessage" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
