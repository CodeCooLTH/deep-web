-- feature 00061 — สร้างออเดอร์อัตโนมัติจากคำสั่งในแชท
--
-- 🛑 ทุกคำสั่งในไฟล์นี้เป็น ADD COLUMN / ADD CONSTRAINT / CREATE TABLE / CREATE INDEX ล้วน
--    ไม่มี DROP ไม่มี DELETE ไม่มี ALTER ที่ทำลายข้อมูล — คอลัมน์ใหม่ทุกตัว nullable หรือมี
--    default คงที่ ⇒ Postgres 11+ ทำ metadata-only ไม่ rewrite ตาราง
--    (ยกเว้นบล็อกเหตุผลยกเลิกท้ายไฟล์ ซึ่ง DROP+ADD ตัว CHECK เดิม — เป็นการเพิ่มค่าแบบ
--     additive ที่อ่านนิยามเดิมมาต่อท้าย ไม่ได้แตะข้อมูลสักแถว)
--
-- 🛑 ไม่ใช้ CREATE INDEX CONCURRENTLY เพราะ `prisma migrate deploy` ห่อทุกไฟล์ไว้ใน
--    ทรานแซกชัน (CONCURRENTLY ใช้ในทรานแซกชันไม่ได้เลย — Postgres error ตรง ๆ ถ้าฝืน)
--    DATABASE.md §5 แนะนำ CONCURRENTLY สำหรับ unique index บน "ChatMessage" โดยให้เหตุผลว่า
--    เป็น "ตารางที่ใหญ่ที่สุดในระบบ" — ข้อเสนอนั้นตกไป 2 ชั้น: (1) ทำไม่ได้ในกรอบของ Prisma
--    (2) migration ก่อนหน้า (20260826090000) วัดไว้แล้วว่า ChatMessage ทั้งฐาน ~40,700 แถว
--    ณ 2026-08-20 ⇒ ระดับมิลลิวินาที · และไฟล์นี้ **ไม่สร้าง unique index บน ChatMessage เลย**
--    (ดูเหตุผลที่ `autoOrderId` ไม่ unique ในบล็อกที่ 2)

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. "Order" — 11 คอลัมน์ใหม่ (ร่าง = status='DRAFTED' ในตารางเดิม ไม่มีตารางแยก)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "isDryRun"               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sourceChatMessageId"    TEXT,
  ADD COLUMN IF NOT EXISTS "matchedTriggerPhrase"   TEXT,
  ADD COLUMN IF NOT EXISTS "draftReasons"           TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "contentHash"            VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "supersedesOrderId"      TEXT,
  ADD COLUMN IF NOT EXISTS "createdVia"             TEXT,
  ADD COLUMN IF NOT EXISTS "expiresAt"              TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "detectionResolvedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "draftRawItems"          JSONB,
  ADD COLUMN IF NOT EXISTS "draftStatedTotalAmount" DECIMAL(12,2);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. "ChatMessage" — การ์ดผลลัพธ์ในเธรด
--
-- 🛑 `autoOrderId` **ไม่ unique** (ต่างจาก DATABASE.md §5 ขั้น 2) — ออเดอร์ใบเดียวมีการ์ดได้
--    หลายใบตามเวลา: ผลลัพธ์ครั้งแรก · แจ้งว่าข้อความต้นทางถูกแก้ · แจ้งว่าถูกถอน (TFR-018)
--    unique จะบล็อกการ์ดใบที่สองทั้งที่มันคือสิ่งที่สเปกสั่งให้เขียน
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE "ChatMessage"
  ADD COLUMN IF NOT EXISTS "autoOrderId"   TEXT,
  ADD COLUMN IF NOT EXISTS "autoOrderKind" TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. "ShopChannel" — สิทธิ์รับข้อความสะท้อนกลับ (message_echoes)
--
-- 🛑 default 'UNKNOWN' ห้ามเป็น 'GRANTED' — เพจเก่าทุกแถวยังไม่เคยถูกตรวจจริงสักครั้ง
--    ตั้ง GRANTED = เปิด "สร้างออเดอร์จริง" ให้ทุกเพจทันทีโดยข้ามด่าน AC-ACO-10 ทั้งข้อ
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE "ShopChannel"
  ADD COLUMN IF NOT EXISTS "messageEchoesStatus"    TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS "messageEchoesCheckedAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "ShopChannel" ADD CONSTRAINT "ShopChannel_message_echoes_status"
    CHECK ("messageEchoesStatus" = ANY (ARRAY['GRANTED','MISSING','UNKNOWN']::text[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. ตารางตั้งค่า 4 ตาราง
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "AutoOrderAgentConfig" (
  "id"              TEXT NOT NULL,
  "shopId"          TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'OFFLINE',
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutoOrderAgentConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutoOrderAgentConfig_status_check"
    CHECK ("status" = ANY (ARRAY['OFFLINE','TEST','LIVE']::text[]))
);
CREATE UNIQUE INDEX IF NOT EXISTS "AutoOrderAgentConfig_shopId_key"
  ON "AutoOrderAgentConfig" ("shopId");

CREATE TABLE IF NOT EXISTS "AutoOrderAgentPhrase" (
  "id"               TEXT NOT NULL,
  "configId"         TEXT NOT NULL,
  "phrase"           TEXT NOT NULL,
  "normalizedPhrase" TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutoOrderAgentPhrase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AutoOrderAgentPhrase_configId_normalizedPhrase_key"
  ON "AutoOrderAgentPhrase" ("configId", "normalizedPhrase");
CREATE INDEX IF NOT EXISTS "AutoOrderAgentPhrase_configId_idx"
  ON "AutoOrderAgentPhrase" ("configId");

CREATE TABLE IF NOT EXISTS "AutoOrderAgentChannel" (
  "id"            TEXT NOT NULL,
  "configId"      TEXT NOT NULL,
  "shopChannelId" TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutoOrderAgentChannel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AutoOrderAgentChannel_configId_shopChannelId_key"
  ON "AutoOrderAgentChannel" ("configId", "shopChannelId");
CREATE INDEX IF NOT EXISTS "AutoOrderAgentChannel_shopChannelId_idx"
  ON "AutoOrderAgentChannel" ("shopChannelId");

CREATE TABLE IF NOT EXISTS "AutoOrderAgentTestThread" (
  "id"             TEXT NOT NULL,
  "configId"       TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutoOrderAgentTestThread_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AutoOrderAgentTestThread_configId_conversationId_key"
  ON "AutoOrderAgentTestThread" ("configId", "conversationId");
CREATE INDEX IF NOT EXISTS "AutoOrderAgentTestThread_conversationId_idx"
  ON "AutoOrderAgentTestThread" ("conversationId");

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Foreign keys
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  -- RESTRICT: ห้ามลบข้อความต้นทางทิ้งจนผลลัพธ์กลายเป็นของกำพร้าเงียบ ๆ
  ALTER TABLE "Order" ADD CONSTRAINT "Order_sourceChatMessageId_fkey"
    FOREIGN KEY ("sourceChatMessageId") REFERENCES "ChatMessage"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_supersedesOrderId_fkey"
    FOREIGN KEY ("supersedesOrderId") REFERENCES "Order"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_autoOrderId_fkey"
    FOREIGN KEY ("autoOrderId") REFERENCES "Order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AutoOrderAgentConfig" ADD CONSTRAINT "AutoOrderAgentConfig_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoOrderAgentConfig" ADD CONSTRAINT "AutoOrderAgentConfig_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoOrderAgentConfig" ADD CONSTRAINT "AutoOrderAgentConfig_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoOrderAgentPhrase" ADD CONSTRAINT "AutoOrderAgentPhrase_configId_fkey"
    FOREIGN KEY ("configId") REFERENCES "AutoOrderAgentConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoOrderAgentChannel" ADD CONSTRAINT "AutoOrderAgentChannel_configId_fkey"
    FOREIGN KEY ("configId") REFERENCES "AutoOrderAgentConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoOrderAgentChannel" ADD CONSTRAINT "AutoOrderAgentChannel_shopChannelId_fkey"
    FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoOrderAgentTestThread" ADD CONSTRAINT "AutoOrderAgentTestThread_configId_fkey"
    FOREIGN KEY ("configId") REFERENCES "AutoOrderAgentConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AutoOrderAgentTestThread" ADD CONSTRAINT "AutoOrderAgentTestThread_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. CHECK constraints บน "Order" — NOT VALID ก่อน แล้ว VALIDATE แยก statement
--    (VALIDATE ใช้ SHARE UPDATE EXCLUSIVE ⇒ ไม่บล็อก SELECT/INSERT/UPDATE/DELETE ปกติ)
--    ทุกตัว validate ผ่านแน่นอนเพราะ default ทำให้ทุกแถวเดิมเป็น NULL/'{}'
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_created_via_check"
    CHECK ("createdVia" IS NULL OR "createdVia" = ANY (ARRAY['MANUAL','CHAT_AUTO_ORDER','ISHIP_LINKED']::text[]))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_created_via_check";

DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_draft_reasons_allowlist"
    CHECK ("draftReasons" <@ ARRAY[
      'NO_PHONE','INVALID_PHONE','ADDRESS_INCOMPLETE','DATE_OUT_OF_WINDOW',
      'NO_ITEMS','ITEM_PRICE_MISSING','ITEM_NOT_MATCHED','TOTAL_MISMATCH','PROCESSING_FAILED'
    ]::text[])
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_draft_reasons_allowlist";

-- PROCESSING_FAILED = "ระบบไม่ได้อ่านจบเลย" ซึ่งเป็นคนละชนิดกับ 8 เหตุผลเชิงเนื้อหา
-- ("ระบบอ่านสำเร็จแต่ข้อมูลไม่ครบ") ⇒ ปนกันไม่ได้ ไม่งั้นร้านจะไปแก้เบอร์ที่ถูกอยู่แล้ว
DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_draft_reasons_system_exclusive"
    CHECK (NOT ('PROCESSING_FAILED' = ANY ("draftReasons")) OR cardinality("draftReasons") = 1)
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_draft_reasons_system_exclusive";

-- เหตุผลตกร่างต้องหายไปเมื่อร่างถูกเลื่อนขั้นเป็นออเดอร์จริง — ไม่งั้นการ์ดจะยังโชว์
-- "ไม่พบเบอร์โทร" บนใบที่มีเบอร์ครบแล้ว
DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_draft_reasons_only_when_drafted"
    CHECK ("status" = 'DRAFTED' OR cardinality("draftReasons") = 0)
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_draft_reasons_only_when_drafted";

DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_source_chat_message_requires_via"
    CHECK ("sourceChatMessageId" IS NULL OR "createdVia" = 'CHAT_AUTO_ORDER')
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_source_chat_message_requires_via";

DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_auto_order_kind_check"
    CHECK ("autoOrderKind" IS NULL OR "autoOrderKind" = ANY (ARRAY['RESULT','SOURCE_EDITED','SOURCE_UNSENT']::text[]))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "ChatMessage" VALIDATE CONSTRAINT "ChatMessage_auto_order_kind_check";

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Index
-- ═══════════════════════════════════════════════════════════════════════════
-- 🛑 ด่าน dedup เดียวที่มีอยู่จริงเมื่อจุดเข้าที่ 1 กับที่ 2 ยิงพร้อมกัน — ต่อรองไม่ได้
--    Postgres ยอม NULL ซ้ำได้เอง ⇒ ออเดอร์ที่ไม่ใช่ของฟีเจอร์นี้ไม่ถูกนับว่าชนกัน
CREATE UNIQUE INDEX IF NOT EXISTS "Order_sourceChatMessageId_key"
  ON "Order" ("sourceChatMessageId");

-- partial: จ่ายต้นทุนเฉพาะแถวของฟีเจอร์นี้ ไม่ใช่ทุกออเดอร์ของทุกร้าน
-- 🛑 กรองด้วย "createdVia" ไม่ใช่ status='DRAFTED' — การเช็คซ้ำต้องจับเคสที่จบเป็นออเดอร์จริงด้วย
--    (ซึ่งเป็นเคสที่อันตรายกว่า: สร้างออเดอร์จริงซ้ำ ไม่ใช่แค่ร่างซ้ำ)
CREATE INDEX IF NOT EXISTS "Order_conversationId_contentHash_partial"
  ON "Order" ("conversationId", "contentHash")
  WHERE "createdVia" = 'CHAT_AUTO_ORDER';

CREATE INDEX IF NOT EXISTS "Order_supersedesOrderId_partial"
  ON "Order" ("supersedesOrderId")
  WHERE "supersedesOrderId" IS NOT NULL;

-- reaper กวาดข้ามทุกร้าน (WHERE status='DRAFTED' AND "expiresAt" <= now()) ซึ่ง index เดิม
-- ไม่ครอบเลย (ไม่มี shopId เดียวให้ query ระดับระบบ · ไม่มี expiresAt)
CREATE INDEX IF NOT EXISTS "Order_drafted_expiry_partial"
  ON "Order" ("expiresAt")
  WHERE "status" = 'DRAFTED';

CREATE INDEX IF NOT EXISTS "ChatMessage_autoOrderId_idx"
  ON "ChatMessage" ("autoOrderId");

-- watchdog กวาดข้ามทุกห้อง ⇒ ไม่รู้ conversationId ล่วงหน้า ⇒ index เดิมที่นำหน้าด้วย
-- conversationId ใช้เร่งไม่ได้เลย
CREATE INDEX IF NOT EXISTS "ChatMessage_senderRole_createdAt_idx"
  ON "ChatMessage" ("senderRole", "createdAt");

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. "Order_cancel_reason" — เพิ่ม 3 ค่าใหม่แบบ additive
--
--    DUPLICATE_ORDER  ผู้ขายกดยกเลิกใบเก่าจากการ์ด "มาแทนใบก่อนหน้า" (มติ OD-ACO-01)
--    DRAFT_EXPIRED    ระบบเก็บกวาดร่างที่ค้างเกิน 7 วัน
--    DRAFT_DISCARDED  ผู้ขายกดปุ่ม "ทิ้งร่างนี้" เอง (มติ user 2026-09-05)
--
-- 🛑 ทั้งสามค่า **ไม่อยู่ใน BUYER_FAULT_CANCEL_REASONS** และไม่นับเข้าอัตราความสำเร็จของร้าน
--    (ดูคอมเมนต์กำกับใน src/lib/cancel-reasons.ts และ src/lib/order-stats.ts)
--
-- อ่านนิยามเดิมจากฐานมาต่อท้าย **ห้าม hardcode รายชื่อทั้งชุด** — สอง branch แก้พร้อมกันแล้ว
-- ลบค่าของกันเองเงียบ ๆ ได้ (เคยเกิดจริง 20260806120000 ชนกับ _order_shipment_cod_settled)
-- docs/conventions/migration-check-constraint-additive.md
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  def     text;
  vals    text;
  missing text[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conname = 'Order_cancel_reason'
    AND conrelid = '"Order"'::regclass;

  IF def IS NULL THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_cancel_reason"
      CHECK ("cancelReason" IS NULL OR "cancelReason" = ANY (ARRAY[
        'BUYER_NO_TRANSFER', 'BUYER_REQUESTED', 'SHOP_ISSUE', 'MUTUAL',
        'BUYER_NO_PAYMENT', 'BUYER_NO_SHOW', 'PARCEL_RETURNED',
        'DUPLICATE_ORDER', 'DRAFT_EXPIRED', 'DRAFT_DISCARDED'
      ]::text[])) NOT VALID;
    ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_cancel_reason";

  ELSE
    SELECT array_agg(v.val ORDER BY v.ord)
    INTO missing
    FROM unnest(ARRAY['DUPLICATE_ORDER','DRAFT_EXPIRED','DRAFT_DISCARDED']) WITH ORDINALITY AS v(val, ord)
    WHERE position(v.val IN def) = 0;

    IF missing IS NOT NULL THEN
      SELECT string_agg(quote_literal(m[1]), ', ')
      INTO vals
      FROM regexp_matches(def, '''([A-Za-z0-9_]+)''', 'g') AS m;

      -- ล้มเสียงดังดีกว่าลบค่าเงียบ ๆ
      IF vals IS NULL
         OR (length(def) - length(replace(def, '''', ''))) / 2
            <> array_length(string_to_array(vals, ', '), 1) THEN
        RAISE EXCEPTION 'ดึงรายชื่อค่าเดิมจาก CHECK ไม่ครบ — หยุดก่อนเขียนทับ (def: %)', def;
      END IF;

      ALTER TABLE "Order" DROP CONSTRAINT "Order_cancel_reason";
      EXECUTE format(
        'ALTER TABLE "Order" ADD CONSTRAINT "Order_cancel_reason" '
        'CHECK ("cancelReason" IS NULL OR "cancelReason" = ANY (ARRAY[%s, %s]::text[])) NOT VALID',
        vals,
        (SELECT string_agg(quote_literal(v), ', ') FROM unnest(missing) AS v)
      );
      ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_cancel_reason";
    END IF;
  END IF;
END $$;
