-- feature 00078 M2 — ตั้งค่าแจ้งลูกค้าอัตโนมัติ 3 ตาราง (DATABASE.md §3.3)
-- ไม่มีแถว = ปิด / ค่าตั้งต้น ⇒ ไม่ INSERT อะไร · แยกจาก AutoReplyConfig โดยเจตนา

CREATE TABLE IF NOT EXISTS "AutoNotifyConfig" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "dailyCapPerRoom" INTEGER NOT NULL DEFAULT 5,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AutoNotifyConfig_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AutoNotifyConfig_dailyCap_range" CHECK ("dailyCapPerRoom" BETWEEN 1 AND 20)
);

CREATE TABLE IF NOT EXISTS "AutoNotifySwitch" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMPTZ(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AutoNotifySwitch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AutoNotifySwitch_kind_check" CHECK ("kind" IN ('ORDER_SUMMARY','TRACKING','SERVICE_BOOKED','SERVICE_STARTED','SERVICE_CLOSED')),
    -- สวิตช์ที่เปิดอยู่ต้องมี enabledAt เสมอ (ด่าน "ไม่ย้อนหลัง" เทียบเวลาจากค่านี้)
    CONSTRAINT "AutoNotifySwitch_enabled_has_enabledAt" CHECK (NOT "enabled" OR "enabledAt" IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS "AutoNotifyTemplate" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AutoNotifyTemplate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AutoNotifyTemplate_kind_check" CHECK ("kind" IN ('ORDER_SUMMARY','TRACKING','SERVICE_BOOKED','SERVICE_STARTED','SERVICE_CLOSED')),
    -- char_length = นับ Unicode code point (ไม่ใช่ bytes) — ฝั่ง JS ต้องนับด้วย [...s].length
    CONSTRAINT "AutoNotifyTemplate_body_len" CHECK (char_length("body") BETWEEN 1 AND 500 AND btrim("body", E' \t\r\n') <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS "AutoNotifyConfig_shopId_key" ON "AutoNotifyConfig"("shopId");
CREATE INDEX IF NOT EXISTS "AutoNotifyConfig_updatedByUserId_idx" ON "AutoNotifyConfig"("updatedByUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "AutoNotifySwitch_shopId_kind_key" ON "AutoNotifySwitch"("shopId", "kind");
CREATE INDEX IF NOT EXISTS "AutoNotifySwitch_updatedByUserId_idx" ON "AutoNotifySwitch"("updatedByUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "AutoNotifyTemplate_shopId_kind_key" ON "AutoNotifyTemplate"("shopId", "kind");
CREATE INDEX IF NOT EXISTS "AutoNotifyTemplate_updatedByUserId_idx" ON "AutoNotifyTemplate"("updatedByUserId");

DO $$ BEGIN
  ALTER TABLE "AutoNotifyConfig" ADD CONSTRAINT "AutoNotifyConfig_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoNotifyConfig" ADD CONSTRAINT "AutoNotifyConfig_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoNotifySwitch" ADD CONSTRAINT "AutoNotifySwitch_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoNotifySwitch" ADD CONSTRAINT "AutoNotifySwitch_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoNotifyTemplate" ADD CONSTRAINT "AutoNotifyTemplate_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoNotifyTemplate" ADD CONSTRAINT "AutoNotifyTemplate_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
