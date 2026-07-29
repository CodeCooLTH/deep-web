-- feature 00023 — Chat Auto-Reply (ตอบแชทอัตโนมัติจาก Keyword)
-- SSOT: docs/20 - Features/00023 - Chat Auto-Reply/DATABASE.md (FROZEN CONTRACT)
--
-- เขียนด้วยมือ (ไม่ใช่ `prisma migrate dev`) ตาม docs/conventions/prisma-shared-db-drift.md —
-- DB dev/prod เป็น instance เดียวกันบน Supabase. apply ด้วย `prisma migrate deploy -e .env.local`
-- เท่านั้น และต้องขอ user ยืนยันก่อนทุกครั้ง (ห้าม `migrate dev`/`db push`/`db pull` เด็ดขาด)
--
-- additive ล้วน: สร้าง 6 ตารางใหม่ + เพิ่มคอลัมน์ใน Conversation (10) และ ChatMessage (1) — ไม่แก้/
-- ไม่ลบโครงสร้างเดิมแม้แต่คอลัมน์เดียว ทุกคอลัมน์ใหม่ nullable หรือมี DEFAULT ครบ ไม่ต้อง backfill
-- ปิดฟีเจอร์ได้ทั้งหมดด้วยสวิตช์เดียว (AutoReplyConfig.isEnabled = false) โดยไม่ต้องแตะ DB เลย
--
-- รวมทุกอย่างในไฟล์เดียวเพราะ DB dev=prod แชร์กัน — ALTER หลายรอบมีต้นทุนความเสี่ยงมากกว่าเพิ่มทีเดียวจบ
-- (เหตุผลเดียวกับ S-7 ของ feature 00018 / DATABASE.md §5.1)

-- ============================================================================
-- 1) CREATE TABLE — 6 ตารางใหม่
-- ============================================================================

-- AutoReplyConfig — การตั้งค่าระดับร้าน 1:1 กับ Shop (ดู DATABASE.md §3.1)
CREATE TABLE "AutoReplyConfig" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "testModeExpiresAt" TIMESTAMP(3),
    "testModeEnabledByUserId" TEXT,
    "humanTakeoverPauseMode" TEXT NOT NULL DEFAULT '2H',
    "keywordCooldownSec" INTEGER NOT NULL DEFAULT 300,
    "maxRepliesPerConversation" INTEGER NOT NULL DEFAULT 10,
    "adsContextMode" TEXT NOT NULL DEFAULT 'UNTIL_RESOLVED',
    "adsContextHours" INTEGER,
    "handoffPhrases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoReplyConfig_pkey" PRIMARY KEY ("id")
);

-- AutoReplyKeyword — กลุ่มคำ (DATABASE.md §3.2)
CREATE TABLE "AutoReplyKeyword" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'CONTAINS',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoReplyKeyword_pkey" PRIMARY KEY ("id")
);

-- AutoReplyPhrase — คำตรวจจับภายในกลุ่ม (DATABASE.md §3.3)
CREATE TABLE "AutoReplyPhrase" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "normalizedPhrase" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoReplyPhrase_pkey" PRIMARY KEY ("id")
);

-- AutoReplyRule — กฎคำตอบทุกระดับในตารางเดียว เงื่อนไขเป็นคอลัมน์ nullable (DATABASE.md §3.4)
CREATE TABLE "AutoReplyRule" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "keywordId" TEXT,
    "shopChannelId" TEXT,
    "adId" TEXT,
    "adLabel" TEXT,
    "productId" TEXT,
    "replyText" TEXT NOT NULL,
    "specificity" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activeFrom" TIMESTAMP(3),
    "activeUntil" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoReplyRule_pkey" PRIMARY KEY ("id")
);

-- AutoReplyJob — คิวงานตอบอัตโนมัติ + กลไกกันตอบซ้ำ (DATABASE.md §3.5, ตารางสำคัญที่สุดของฟีเจอร์)
CREATE TABLE "AutoReplyJob" (
    "id" TEXT NOT NULL,
    "chatMessageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoReplyJob_pkey" PRIMARY KEY ("id")
);

-- AutoReplyLog — บันทึกการตัดสินใจทุกครั้ง ทั้งตอบและไม่ตอบ (DATABASE.md §3.6)
-- 🛑 chatMessageId/outboundMessageId เป็น String ดิบ ไม่มี FK โดยตั้งใจตาม DATABASE.md (ไม่มี relation
-- field ประกาศไว้ในสัญญา) — เก็บไว้ debug/trace เท่านั้น ไม่ต้องรักษา referential integrity
CREATE TABLE "AutoReplyLog" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "chatMessageId" TEXT,
    "rawText" TEXT,
    "normalizedText" TEXT,
    "keywordId" TEXT,
    "matchedPhrase" TEXT,
    "matchType" TEXT,
    "matchTrace" JSONB,
    "ruleId" TEXT,
    "resolutionLevel" TEXT,
    "shopChannelId" TEXT,
    "adId" TEXT,
    "productId" TEXT,
    "decision" TEXT NOT NULL,
    "skipReason" TEXT,
    "replyText" TEXT,
    "outboundMessageId" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoReplyLog_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- 2) ALTER TABLE "Conversation" ADD COLUMN × 10 (feature 00023, additive)
--    ทุกคอลัมน์ nullable หรือมี DEFAULT — ไม่ต้อง backfill, ไม่ rewrite ตาราง (PG11+)
-- ============================================================================
ALTER TABLE "Conversation" ADD COLUMN "autoReplyEnabled" BOOLEAN;
ALTER TABLE "Conversation" ADD COLUMN "autoReplyTestEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "autoReplyPausedUntil" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "autoReplyCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Conversation" ADD COLUMN "lastAutoReplyAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "handoffAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "handoffReason" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "contextProductId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "contextProductSource" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "contextProductAt" TIMESTAMP(3);

-- ============================================================================
-- 3) ALTER TABLE "ChatMessage" ADD COLUMN (feature 00023, additive)
--    null = คนส่ง — ข้อความเดิมทุกแถวก่อนฟีเจอร์นี้ถูกต้องแล้วโดยปริยาย (ไม่เคยมีระบบตอบเอง)
-- ============================================================================
ALTER TABLE "ChatMessage" ADD COLUMN "autoReplyKind" TEXT;

-- ============================================================================
-- 4) CREATE INDEX / CREATE UNIQUE INDEX (compound) — ทั้งหมด
--    (ยกเว้น NULLS NOT DISTINCT ของ AutoReplyRule = ขั้น 5 และ 1:1 unique หลักของ
--    AutoReplyJob/AutoReplyConfig = ขั้น 6 ที่แยกเน้นเพราะเป็น invariant หลักของฟีเจอร์)
-- ============================================================================

-- AutoReplyKeyword
CREATE UNIQUE INDEX "AutoReplyKeyword_shopId_name_key" ON "AutoReplyKeyword"("shopId", "name"); -- AC-001-04 ชื่อกลุ่มห้ามซ้ำในร้านเดียวกัน
CREATE INDEX "AutoReplyKeyword_shopId_isActive_priority_idx" ON "AutoReplyKeyword"("shopId", "isActive", "priority"); -- query หลัก: โหลดกลุ่มที่เปิดใช้เรียงลำดับความสำคัญ

-- AutoReplyPhrase
CREATE UNIQUE INDEX "AutoReplyPhrase_keywordId_normalizedPhrase_key" ON "AutoReplyPhrase"("keywordId", "normalizedPhrase"); -- AC-002-03 คำซ้ำในกลุ่มเดียวกันต้องถูกปฏิเสธ
CREATE INDEX "AutoReplyPhrase_keywordId_idx" ON "AutoReplyPhrase"("keywordId");

-- AutoReplyRule
CREATE INDEX "AutoReplyRule_shopId_keywordId_isActive_specificity_idx" ON "AutoReplyRule"("shopId", "keywordId", "isActive", "specificity"); -- query หลักของ rule resolution
CREATE INDEX "AutoReplyRule_shopId_shopChannelId_adId_idx" ON "AutoReplyRule"("shopId", "shopChannelId", "adId"); -- หน้าตั้งค่า: ดูกฎของเพจ/โฆษณาหนึ่ง ๆ
CREATE INDEX "AutoReplyRule_productId_idx" ON "AutoReplyRule"("productId");

-- AutoReplyJob
CREATE INDEX "AutoReplyJob_status_createdAt_idx" ON "AutoReplyJob"("status", "createdAt"); -- cron sweeper: หางานค้างเรียงเก่าสุดก่อน
CREATE INDEX "AutoReplyJob_conversationId_createdAt_idx" ON "AutoReplyJob"("conversationId", "createdAt");

-- AutoReplyLog (5 index — ครอบทุกเงื่อนไขค้นหาใน AC-024-03; ตารางนี้โตเร็วที่สุด ต้องมีนโยบายลบย้อนหลัง 90 วัน — DATABASE.md §6)
CREATE INDEX "AutoReplyLog_shopId_createdAt_idx" ON "AutoReplyLog"("shopId", "createdAt");
CREATE INDEX "AutoReplyLog_conversationId_createdAt_idx" ON "AutoReplyLog"("conversationId", "createdAt");
CREATE INDEX "AutoReplyLog_shopId_decision_createdAt_idx" ON "AutoReplyLog"("shopId", "decision", "createdAt");
CREATE INDEX "AutoReplyLog_shopId_keywordId_createdAt_idx" ON "AutoReplyLog"("shopId", "keywordId", "createdAt");
CREATE INDEX "AutoReplyLog_shopId_adId_createdAt_idx" ON "AutoReplyLog"("shopId", "adId", "createdAt");

-- Conversation (2 index ใหม่)
CREATE INDEX "Conversation_shopId_autoReplyTestEnabled_idx" ON "Conversation"("shopId", "autoReplyTestEnabled"); -- หา allowlist โหมดทดสอบ
-- 🛑 GAP-06 (คำตัดสิน Controller 2026-07-29): sweeper fallback pass ไล่หาข้อความลูกค้าล่าสุดที่ไม่มี
-- งานผูก ต้องสแกนจาก lastInboundAt — เพิ่มตอนนี้เพราะ ALTER ตารางใหญ่รอบสองบน DB ที่ dev/prod
-- แชร์กันมีต้นทุนความเสี่ยงมากกว่า แม้ sweeper fallback pass เองจะยังไม่ถูก implement ใน S-01 นี้
CREATE INDEX "Conversation_shopId_lastInboundAt_idx" ON "Conversation"("shopId", "lastInboundAt");

-- ChatMessage (1 index ใหม่)
CREATE INDEX "ChatMessage_conversationId_autoReplyKind_createdAt_idx" ON "ChatMessage"("conversationId", "autoReplyKind", "createdAt"); -- หา "ข้อความคนล่าสุด" ของเธรด เพื่อเช็ค human takeover

-- ============================================================================
-- 5) 🛑 UNIQUE NULLS NOT DISTINCT บน AutoReplyRule — Prisma DSL ประกาศไม่ได้
--    (Postgres ถือว่า NULL ต่างกันเสมอ ทำให้ @@unique ธรรมดายอมให้มีแถวซ้ำที่มี NULL ได้
--    ซึ่งทำให้ AC-006-02 "1 กลุ่มคำ 1 คำตอบต่อ 1 เพจ" บังคับไม่ได้จริง)
--    Postgres 15+ รองรับ NULLS NOT DISTINCT บน CREATE UNIQUE INDEX — Supabase รัน PG16 ผ่านแน่นอน
--    (precedent เดียวกับ partial unique index ของ ShopChannel migration 20260722000200)
-- ============================================================================
CREATE UNIQUE INDEX "AutoReplyRule_shopId_keywordId_shopChannelId_adId_productId_key"
    ON "AutoReplyRule"("shopId", "keywordId", "shopChannelId", "adId", "productId")
    NULLS NOT DISTINCT;

-- ============================================================================
-- 6) UNIQUE INDEX หลักของฟีเจอร์ — 1:1 invariant ที่ DB บังคับแทนวินัยของโค้ด
-- ============================================================================

-- 🛑 หัวใจของ BR-AR-21 / AC-017-01 "หนึ่งข้อความ หนึ่งคำตอบ" — ข้อความลูกค้า 1 แถว สร้างงานได้ครั้งเดียว
-- ตลอดกาล กัน Meta redeliver / cron ทำซ้ำ / after() กับ sweeper ชนกันพร้อมกันโดยไม่ต้องพึ่ง
-- distributed lock (หลักการเดียวกับ ChatMessage.externalMessageId @unique ของ feature 00018)
CREATE UNIQUE INDEX "AutoReplyJob_chatMessageId_key" ON "AutoReplyJob"("chatMessageId");

-- 1 ร้าน 1 ชุดตั้งค่า — บังคับที่ DB ไม่พึ่งวินัยของโค้ด และเป็น index ของ query หลัก (findUnique/upsert)
CREATE UNIQUE INDEX "AutoReplyConfig_shopId_key" ON "AutoReplyConfig"("shopId");

-- ============================================================================
-- 7) FOREIGN KEY constraints
-- ============================================================================

-- AutoReplyConfig
ALTER TABLE "AutoReplyConfig" ADD CONSTRAINT "AutoReplyConfig_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SetNull: ลบผู้ใช้ที่เคยแก้ไขการตั้งค่า ต้องไม่ลบการตั้งค่าของร้านทิ้ง
ALTER TABLE "AutoReplyConfig" ADD CONSTRAINT "AutoReplyConfig_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AutoReplyKeyword
ALTER TABLE "AutoReplyKeyword" ADD CONSTRAINT "AutoReplyKeyword_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AutoReplyPhrase — ลบกลุ่มคำ ลบคำตรวจจับของกลุ่มนั้นด้วย
ALTER TABLE "AutoReplyPhrase" ADD CONSTRAINT "AutoReplyPhrase_keywordId_fkey"
    FOREIGN KEY ("keywordId") REFERENCES "AutoReplyKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AutoReplyRule
ALTER TABLE "AutoReplyRule" ADD CONSTRAINT "AutoReplyRule_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Cascade: ลบกลุ่มคำ ลบกฎของกลุ่มนั้นด้วย (กฎที่ไม่มีกลุ่มไม่มีความหมาย)
ALTER TABLE "AutoReplyRule" ADD CONSTRAINT "AutoReplyRule_keywordId_fkey"
    FOREIGN KEY ("keywordId") REFERENCES "AutoReplyKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SetNull: ถอดเพจไม่ลบกฎทิ้ง (AC-006-05) — กฎกลายเป็นกว้างขึ้น ให้ service ตัดสินเองว่ายังใช้ได้ไหม
ALTER TABLE "AutoReplyRule" ADD CONSTRAINT "AutoReplyRule_shopChannelId_fkey"
    FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- SetNull: ลบสินค้าไม่ลบกฎทิ้ง (AC-008-03)
ALTER TABLE "AutoReplyRule" ADD CONSTRAINT "AutoReplyRule_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AutoReplyJob
ALTER TABLE "AutoReplyJob" ADD CONSTRAINT "AutoReplyJob_chatMessageId_fkey"
    FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutoReplyJob" ADD CONSTRAINT "AutoReplyJob_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutoReplyJob" ADD CONSTRAINT "AutoReplyJob_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AutoReplyLog
ALTER TABLE "AutoReplyLog" ADD CONSTRAINT "AutoReplyLog_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutoReplyLog" ADD CONSTRAINT "AutoReplyLog_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SetNull: ลบกลุ่มคำ/กฎ ไม่ลบบันทึกการตัดสินใจในอดีตทิ้ง (audit trail ต้องอยู่ถาวร)
ALTER TABLE "AutoReplyLog" ADD CONSTRAINT "AutoReplyLog_keywordId_fkey"
    FOREIGN KEY ("keywordId") REFERENCES "AutoReplyKeyword"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutoReplyLog" ADD CONSTRAINT "AutoReplyLog_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "AutoReplyRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Conversation.contextProductId (คอลัมน์ใหม่จากขั้น 2) — SetNull: ลบสินค้าไม่ลบบริบทของเธรดทิ้งทั้งหมด
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contextProductId_fkey"
    FOREIGN KEY ("contextProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- ROLLBACK NOTE (DATABASE.md §5.2) — additive ล้วน ย้อนกลับได้ทุกขั้นโดยไม่กระทบข้อมูลเดิม
-- ============================================================================
-- ระดับแอป (แนะนำ): UPDATE "AutoReplyConfig" SET "isEnabled" = false; — หยุดตอบทันทีโดยไม่แตะ DB
--
-- ระดับ schema (ถ้าต้องย้อนจริง):
--   DROP TABLE IF EXISTS "AutoReplyLog";
--   DROP TABLE IF EXISTS "AutoReplyJob";
--   DROP TABLE IF EXISTS "AutoReplyRule";
--   DROP TABLE IF EXISTS "AutoReplyPhrase";
--   DROP TABLE IF EXISTS "AutoReplyKeyword";
--   DROP TABLE IF EXISTS "AutoReplyConfig";
--   ALTER TABLE "ChatMessage" DROP COLUMN IF EXISTS "autoReplyKind";
--   ALTER TABLE "Conversation"
--     DROP COLUMN IF EXISTS "autoReplyEnabled",
--     DROP COLUMN IF EXISTS "autoReplyTestEnabled",
--     DROP COLUMN IF EXISTS "autoReplyPausedUntil",
--     DROP COLUMN IF EXISTS "autoReplyCount",
--     DROP COLUMN IF EXISTS "lastAutoReplyAt",
--     DROP COLUMN IF EXISTS "handoffAt",
--     DROP COLUMN IF EXISTS "handoffReason",
--     DROP COLUMN IF EXISTS "contextProductId",
--     DROP COLUMN IF EXISTS "contextProductSource",
--     DROP COLUMN IF EXISTS "contextProductAt";
-- ไม่มีตารางเดิมใดพึ่งพาคอลัมน์เหล่านี้ ข้อมูลเดิมไม่ถูกแตะเลยไม่ว่าจะย้อนระดับไหน
