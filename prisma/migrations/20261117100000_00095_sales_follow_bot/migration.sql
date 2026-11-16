-- feature 00095 บอทติดตามยอดขาย — 5 ตาราง (DATABASE.md · SRS §5)
-- ส่วนที่ 1 = ผลจาก `prisma migrate diff` (schema เก่า → ใหม่) ไม่แก้มือ · ส่วนที่ 2 = CHECK/partial index ที่ Prisma DSL ประกาศไม่ได้
-- ตารางใหม่ล้วน ไม่แตะตารางเดิม ไม่ backfill · ChatMessage.autoReplyKind='AUTO_FOLLOW' / type='FOLLOW_BOT_NOTE' ไม่มี CHECK จึงไม่ต้อง migration
-- 🛑 ขยายเพดานขั้นในอนาคตต้องไล่ CHECK 3 ตัวพร้อมกัน: SalesFollowBot_steps_check · SalesFollowRun_nextStep_check · SalesFollowSend_step_check · SalesFollowSend_stepCount_check


-- CreateTable
CREATE TABLE "SalesFollowBot" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "salesStatuses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tagKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tagMatch" TEXT NOT NULL DEFAULT 'ANY',
    "steps" JSONB NOT NULL,
    "structureRev" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SalesFollowBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesFollowBotChannel" (
    "botId" TEXT NOT NULL,
    "shopChannelId" TEXT NOT NULL,

    CONSTRAINT "SalesFollowBotChannel_pkey" PRIMARY KEY ("botId","shopChannelId")
);

-- CreateTable
CREATE TABLE "SalesFollowBotTestRoom" (
    "botId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesFollowBotTestRoom_pkey" PRIMARY KEY ("botId","conversationId")
);

-- CreateTable
CREATE TABLE "SalesFollowRun" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "stageStamp" TIMESTAMPTZ(3) NOT NULL,
    "structureRev" INTEGER NOT NULL,
    "nextStep" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMPTZ(3),
    "nextDueAt" TIMESTAMPTZ(3),
    "holdReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "stopReason" TEXT,
    "stoppedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SalesFollowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesFollowSend" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "stepCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "chatMessageId" TEXT,
    "messageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMPTZ(3),

    CONSTRAINT "SalesFollowSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesFollowBot_shopId_deletedAt_idx" ON "SalesFollowBot"("shopId", "deletedAt");

-- CreateIndex
CREATE INDEX "SalesFollowBot_createdByUserId_idx" ON "SalesFollowBot"("createdByUserId");

-- CreateIndex
CREATE INDEX "SalesFollowBot_updatedByUserId_idx" ON "SalesFollowBot"("updatedByUserId");

-- CreateIndex
CREATE INDEX "SalesFollowBotChannel_shopChannelId_idx" ON "SalesFollowBotChannel"("shopChannelId");

-- CreateIndex
CREATE INDEX "SalesFollowBotTestRoom_conversationId_idx" ON "SalesFollowBotTestRoom"("conversationId");

-- CreateIndex
CREATE INDEX "SalesFollowBotTestRoom_createdByUserId_idx" ON "SalesFollowBotTestRoom"("createdByUserId");

-- CreateIndex
CREATE INDEX "SalesFollowRun_conversationId_createdAt_idx" ON "SalesFollowRun"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesFollowRun_shopId_idx" ON "SalesFollowRun"("shopId");

-- CreateIndex
CREATE INDEX "SalesFollowRun_stoppedByUserId_idx" ON "SalesFollowRun"("stoppedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesFollowRun_botId_conversationId_stageStamp_key" ON "SalesFollowRun"("botId", "conversationId", "stageStamp");

-- CreateIndex
CREATE INDEX "SalesFollowSend_shopId_createdAt_id_idx" ON "SalesFollowSend"("shopId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "SalesFollowSend_conversationId_createdAt_idx" ON "SalesFollowSend"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesFollowSend_chatMessageId_idx" ON "SalesFollowSend"("chatMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesFollowSend_runId_step_key" ON "SalesFollowSend"("runId", "step");

-- AddForeignKey
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowBotChannel" ADD CONSTRAINT "SalesFollowBotChannel_botId_fkey" FOREIGN KEY ("botId") REFERENCES "SalesFollowBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowBotChannel" ADD CONSTRAINT "SalesFollowBotChannel_shopChannelId_fkey" FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowBotTestRoom" ADD CONSTRAINT "SalesFollowBotTestRoom_botId_fkey" FOREIGN KEY ("botId") REFERENCES "SalesFollowBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowBotTestRoom" ADD CONSTRAINT "SalesFollowBotTestRoom_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowBotTestRoom" ADD CONSTRAINT "SalesFollowBotTestRoom_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowRun" ADD CONSTRAINT "SalesFollowRun_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowRun" ADD CONSTRAINT "SalesFollowRun_botId_fkey" FOREIGN KEY ("botId") REFERENCES "SalesFollowBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowRun" ADD CONSTRAINT "SalesFollowRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowRun" ADD CONSTRAINT "SalesFollowRun_stoppedByUserId_fkey" FOREIGN KEY ("stoppedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowSend" ADD CONSTRAINT "SalesFollowSend_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SalesFollowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowSend" ADD CONSTRAINT "SalesFollowSend_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFollowSend" ADD CONSTRAINT "SalesFollowSend_chatMessageId_fkey" FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

-- ============================================================================
-- ส่วนที่ 2 — ที่ Prisma ไม่รู้จัก
-- ============================================================================

-- Prisma ไม่ใส่ NOT NULL ให้ scalar list · บังคับเองเพราะ CHECK ด้านล่าง (cardinality(NULL) ทำให้ CHECK ผ่านเงียบ)
ALTER TABLE "SalesFollowBot" ALTER COLUMN "salesStatuses" SET NOT NULL;
ALTER TABLE "SalesFollowBot" ALTER COLUMN "tagKeys" SET NOT NULL;
-- messageIds = ทุกฟองของรอบ (TFR-FB-25) · chatMessageId = ฟองแรก
ALTER TABLE "SalesFollowSend" ALTER COLUMN "messageIds" SET NOT NULL;

-- SalesFollowBot
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_name_check" CHECK (btrim("name") <> '' AND char_length("name") <= 60);
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_status_check" CHECK ("status" IN ('CLOSED','TESTING','ACTIVE'));
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_tagMatch_check" CHECK ("tagMatch" IN ('ANY','ALL'));
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_salesStatuses_check" CHECK ("salesStatuses" <@ ARRAY['NOT_BOUGHT','BILLED','ORDER_CONFIRMED','SHIPPED','COMPLETED','PARCEL_PROBLEM','CANCELLED']::TEXT[]);
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_tagKeys_check" CHECK (cardinality("tagKeys") <= 20);
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_steps_check" CHECK (jsonb_typeof("steps") = 'array' AND jsonb_array_length("steps") BETWEEN 1 AND 10);
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_condition_check" CHECK (cardinality("salesStatuses") > 0 OR cardinality("tagKeys") > 0);
-- ลิสต์บอทของร้าน (ไม่นับที่ลบ) + ตัวหยิงบอทที่เปิด
CREATE INDEX "SalesFollowBot_shopId_status_active_idx" ON "SalesFollowBot"("shopId", "status") WHERE "deletedAt" IS NULL;

-- SalesFollowRun
ALTER TABLE "SalesFollowRun" ADD CONSTRAINT "SalesFollowRun_stageKey_check" CHECK ("stageKey" IN ('NOT_BOUGHT','BILLED','ORDER_CONFIRMED','SHIPPED','COMPLETED','PARCEL_PROBLEM','CANCELLED'));
ALTER TABLE "SalesFollowRun" ADD CONSTRAINT "SalesFollowRun_nextStep_check" CHECK ("nextStep" BETWEEN 0 AND 10);
ALTER TABLE "SalesFollowRun" ADD CONSTRAINT "SalesFollowRun_status_check" CHECK ("status" IN ('ACTIVE','DONE','STOPPED'));
ALTER TABLE "SalesFollowRun" ADD CONSTRAINT "SalesFollowRun_stopReason_check" CHECK ("stopReason" IS NULL OR "stopReason" IN ('STAGE_CHANGED','TAG_REMOVED','BOT_DISABLED','BOT_EDITED','BOT_DELETED','CUSTOMER_REPLIED','WINDOW_CLOSED','NOT_INTERESTED','OUT_OF_SCOPE','CONTACT_BLOCKED','ADMIN_STOPPED'));
ALTER TABLE "SalesFollowRun" ADD CONSTRAINT "SalesFollowRun_holdReason_check" CHECK ("holdReason" IS NULL OR "holdReason" IN ('SHOP_NOT_ENABLED','META_AI_HOLDING','AUTO_REPLY_OFF','CHANNEL_NOT_ACTIVE'));
ALTER TABLE "SalesFollowRun" ADD CONSTRAINT "SalesFollowRun_status_shape" CHECK (
  ("status" = 'ACTIVE' AND "stopReason" IS NULL AND "finishedAt" IS NULL)
  OR ("status" = 'DONE' AND "stopReason" IS NULL AND "finishedAt" IS NOT NULL)
  OR ("status" = 'STOPPED' AND "stopReason" IS NOT NULL AND "finishedAt" IS NOT NULL)
);
-- ห้องละ 1 ACTIVE (BR-FB-08) — ตัวตัดสินเมื่อหลายบอทแข่งกัน INSERT … ON CONFLICT DO NOTHING
CREATE UNIQUE INDEX "SalesFollowRun_conversation_active_key" ON "SalesFollowRun"("conversationId") WHERE "status" = 'ACTIVE';
-- ตัวหยิง evaluate (tick) และนับ run ต่อบอท
CREATE INDEX "SalesFollowRun_active_updatedAt_idx" ON "SalesFollowRun"("updatedAt") WHERE "status" = 'ACTIVE';
CREATE INDEX "SalesFollowRun_botId_active_idx" ON "SalesFollowRun"("botId") WHERE "status" = 'ACTIVE';

-- SalesFollowSend
ALTER TABLE "SalesFollowSend" ADD CONSTRAINT "SalesFollowSend_step_check" CHECK ("step" BETWEEN 0 AND 9);
-- ป้ายฟอง "บอทติดตาม n/N" อ่านจากแถวนี้ (snapshot) · step < stepCount เสมอ
ALTER TABLE "SalesFollowSend" ADD CONSTRAINT "SalesFollowSend_stepCount_check" CHECK ("stepCount" BETWEEN 1 AND 10 AND "step" < "stepCount");
ALTER TABLE "SalesFollowSend" ADD CONSTRAINT "SalesFollowSend_status_check" CHECK ("status" IN ('SENDING','SENT','FAILED','SKIPPED'));
ALTER TABLE "SalesFollowSend" ADD CONSTRAINT "SalesFollowSend_reason_check" CHECK ("reason" IS NULL OR "reason" IN ('PLATFORM_REJECTED','UNCERTAIN_SEND','OTHER_APP_CONTROLS','LINE_QUOTA_FULL','META_WINDOW_REJECTED','IMAGE_MISSING','EMPTY_MESSAGE'));
ALTER TABLE "SalesFollowSend" ADD CONSTRAINT "SalesFollowSend_reason_shape" CHECK (("status" IN ('FAILED','SKIPPED')) = ("reason" IS NOT NULL));
ALTER TABLE "SalesFollowSend" ADD CONSTRAINT "SalesFollowSend_settled_shape" CHECK (("status" = 'SENDING') = ("settledAt" IS NULL));
-- sweeper: หา SENDING ที่ค้าง
CREATE INDEX "SalesFollowSend_sending_createdAt_idx" ON "SalesFollowSend"("createdAt") WHERE "status" = 'SENDING';
