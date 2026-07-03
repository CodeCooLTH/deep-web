-- Migration: add_deep_chat_schema | Feature: 00011-DeepChat | drafted 2026-07-03
-- SAFETY: additive only — 2 table ใหม่ทั้งคู่ (Conversation, ChatMessage), ไม่มี ALTER/DROP บน table เดิม
-- (Notification ถูก reuse ผ่าน kind="chat_message" ที่ app layer เท่านั้น — ไม่มี DDL เปลี่ยนแปลง)
-- ROLLBACK: ดู DATABASE.md §6 — table ใหม่ทั้งคู่ ว่างตอนสร้าง ปลอดภัย DROP ได้ทันทีหลัง apply
-- ถ้ายังไม่มีข้อความจริงเกิดขึ้น; หลัง launch ต้อง export ก่อน DROP (data loss)

-- 1) Conversation — 1 ห้องต่อคู่ (buyerUserId, shopId), shop-anchored (BR-CHAT-02)
CREATE TABLE "Conversation" (
    "id"                  TEXT NOT NULL,
    "buyerUserId"         TEXT NOT NULL,
    "shopId"              TEXT NOT NULL,
    "lastMessageAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessagePreview"  TEXT,
    "lastSenderRole"      TEXT,
    "buyerLastReadAt"     TIMESTAMP(3),
    "shopLastReadAt"      TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_buyerUserId_shopId_key" ON "Conversation"("buyerUserId", "shopId");
CREATE INDEX "Conversation_shopId_lastMessageAt_idx" ON "Conversation"("shopId", "lastMessageAt");
CREATE INDEX "Conversation_buyerUserId_lastMessageAt_idx" ON "Conversation"("buyerUserId", "lastMessageAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_buyerUserId_fkey"
    FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) ChatMessage — ข้อความ 1 รายการ (TEXT หรือ IMAGE, 1 รูป/ข้อความ — BR-CHAT-05), append-only
CREATE TABLE "ChatMessage" (
    "id"             TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderUserId"   TEXT NOT NULL,
    "senderRole"     TEXT NOT NULL,
    "type"           TEXT NOT NULL DEFAULT 'TEXT',
    "body"           TEXT,
    "imageUrl"       TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderUserId_fkey"
    FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Notification: ไม่มี DDL — reuse kind (TEXT, ไม่ constrain) ค่าใหม่ "chat_message" ที่ app layer เท่านั้น
-- (ดู DATABASE.md §3.3)
