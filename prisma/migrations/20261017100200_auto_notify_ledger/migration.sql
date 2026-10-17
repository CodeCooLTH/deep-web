-- feature 00078 M3 — AutoNotifyLedger: กันส่งซ้ำ + ผลการแจ้ง + เพดานต่อวัน + ให้ sweeper รับช่วง (DATABASE.md §3.4)
-- เหตุผลเพิ่มจาก PRD §4.3: UNCERTAIN_SEND (claimedAt ค้างไม่รู้ผล) · RESEND_LIMIT (เลขพัสดุใหม่ครั้งที่ 4+ — SDS D-4)
-- claimedAt: NULL = ยังไม่เคยเริ่มยิง (ยิงได้ไม่ซ้ำ) · มีค่า = ห้ามยิงซ้ำอัตโนมัติ
-- ไม่เก็บเนื้อข้อความ/เบอร์/ชื่อ · ไม่ backfill

CREATE TABLE IF NOT EXISTS "AutoNotifyLedger" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "conversationId" TEXT,
    "kind" TEXT NOT NULL,
    "valueKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INTENT',
    "reason" TEXT,
    "chatMessageId" TEXT,
    "claimedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMPTZ(3),

    CONSTRAINT "AutoNotifyLedger_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AutoNotifyLedger_kind_check" CHECK ("kind" IN ('ORDER_SUMMARY','TRACKING','SERVICE_BOOKED','SERVICE_STARTED','SERVICE_CLOSED')),
    CONSTRAINT "AutoNotifyLedger_status_check" CHECK ("status" IN ('INTENT','SENT','FAILED','SKIPPED')),
    CONSTRAINT "AutoNotifyLedger_reason_check" CHECK ("reason" IS NULL OR "reason" IN ('DAILY_CAP','EMPTY_MESSAGE','WINDOW_CLOSED','QUOTA_EXCEEDED','REJECTED_BY_PLATFORM','NOT_ELIGIBLE_ANYMORE','UNCERTAIN_SEND','RESEND_LIMIT')),
    CONSTRAINT "AutoNotifyLedger_status_reason_shape" CHECK (("status" IN ('INTENT','SENT') AND "reason" IS NULL) OR ("status" IN ('FAILED','SKIPPED') AND "reason" IS NOT NULL)),
    CONSTRAINT "AutoNotifyLedger_settled_shape" CHECK (("status" = 'INTENT') = ("settledAt" IS NULL)),
    CONSTRAINT "AutoNotifyLedger_valueKey_len" CHECK (char_length("valueKey") BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS "AutoNotifyLedger_key" ON "AutoNotifyLedger"("shopId", "orderId", "kind", "valueKey");
CREATE INDEX IF NOT EXISTS "AutoNotifyLedger_orderId_idx" ON "AutoNotifyLedger"("orderId");
CREATE INDEX IF NOT EXISTS "AutoNotifyLedger_conversationId_createdAt_idx" ON "AutoNotifyLedger"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutoNotifyLedger_status_createdAt_idx" ON "AutoNotifyLedger"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "AutoNotifyLedger_chatMessageId_idx" ON "AutoNotifyLedger"("chatMessageId");

DO $$ BEGIN
  ALTER TABLE "AutoNotifyLedger" ADD CONSTRAINT "AutoNotifyLedger_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoNotifyLedger" ADD CONSTRAINT "AutoNotifyLedger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoNotifyLedger" ADD CONSTRAINT "AutoNotifyLedger_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoNotifyLedger" ADD CONSTRAINT "AutoNotifyLedger_chatMessageId_fkey" FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
