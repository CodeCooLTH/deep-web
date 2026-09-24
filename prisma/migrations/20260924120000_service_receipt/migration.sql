-- feature 00065 — พิมพ์ใบเสร็จรับเงิน (Service Receipt Printing)
--
-- 🛑 ทุกคำสั่งในไฟล์นี้เป็น CREATE TABLE / ADD CONSTRAINT ล้วน — ไม่มี ALTER ตารางเดิม
--    (Shop/Order มีแถวจริงบน prod) ตารางใหม่ทั้ง 3 ว่างอยู่แล้วตอน migrate ⇒ ไม่ต้องใช้
--    CREATE INDEX CONCURRENTLY (ซึ่งใช้ในทรานแซกชันไม่ได้อยู่แล้ว — `prisma migrate deploy`
--    ห่อทุกไฟล์ไว้ในทรานแซกชันเดียว)
--
-- ลำดับเลขที่ใบเสร็จ: service layer ต้องออกเลขด้วย
--   INSERT INTO "ShopReceiptCounter" ("shopId","period","lastSeq")
--   VALUES ($shopId, $period, 1)
--   ON CONFLICT ("shopId","period")
--   DO UPDATE SET "lastSeq" = "ShopReceiptCounter"."lastSeq" + 1
--   RETURNING "lastSeq"
-- ในทรานแซกชันเดียวกับ INSERT "OrderReceipt" — atomic ⇒ ไม่ซ้ำ ไม่ข้าม แม้กดออกพร้อมกัน

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. "ShopReceiptProfile" — ข้อมูลออกใบเสร็จของร้าน (1:1 กับ Shop, ทุกฟิลด์ optional)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE "ShopReceiptProfile" (
  "id"        TEXT NOT NULL,
  "shopId"    TEXT NOT NULL,
  "legalName" TEXT,
  "address"   TEXT,
  "taxId"     TEXT,
  "phone"     TEXT,
  "stamp"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopReceiptProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopReceiptProfile_shopId_key" ON "ShopReceiptProfile"("shopId");

-- เลขผู้เสียภาษี 13 หลัก — NULL ผ่านได้เสมอ (ร้านยังไม่กรอกก็ยังพิมพ์ใบเสร็จได้)
ALTER TABLE "ShopReceiptProfile" ADD CONSTRAINT "ShopReceiptProfile_taxId_check"
  CHECK ("taxId" IS NULL OR "taxId" ~ '^[0-9]{13}$');

ALTER TABLE "ShopReceiptProfile" ADD CONSTRAINT "ShopReceiptProfile_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. "OrderReceipt" — ใบเสร็จรับเงินที่ออกแล้ว (1:1 กับ Order)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE "OrderReceipt" (
  "id"             TEXT NOT NULL,
  "orderId"        TEXT NOT NULL,
  "shopId"         TEXT NOT NULL,
  "receiptNo"      TEXT NOT NULL,
  "issuedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedByUserId" TEXT,
  CONSTRAINT "OrderReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderReceipt_orderId_key" ON "OrderReceipt"("orderId");
-- กันเลขที่ใบเสร็จซ้ำภายในร้านเดียวกัน — เป็น unique index เดียวที่บังคับความไม่ซ้ำจริง
-- (receiptNo ไม่มี CHECK รูปแบบที่ DB — "CA"+period+lastSeq ประกอบที่ app layer)
CREATE UNIQUE INDEX "OrderReceipt_shopId_receiptNo_key" ON "OrderReceipt"("shopId", "receiptNo");
-- ประวัติใบเสร็จของร้าน เรียงตามเวลาออก (หน้ารายการใบเสร็จ)
CREATE INDEX "OrderReceipt_shopId_issuedAt_idx" ON "OrderReceipt"("shopId", "issuedAt");

ALTER TABLE "OrderReceipt" ADD CONSTRAINT "OrderReceipt_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderReceipt" ADD CONSTRAINT "OrderReceipt_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- audit เบา (pattern เดียวกับ Order.createdByUserId) — ผู้ใช้ถูกลบ ใบเสร็จยังอยู่ แค่ไม่รู้ว่าใครออก
ALTER TABLE "OrderReceipt" ADD CONSTRAINT "OrderReceipt_issuedByUserId_fkey"
  FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. "ShopReceiptCounter" — ตัวนับเลขที่ใบเสร็จต่อร้านต่อเดือน (PK composite)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE "ShopReceiptCounter" (
  "shopId"  TEXT NOT NULL,
  "period"  TEXT NOT NULL,
  "lastSeq" INTEGER NOT NULL,
  CONSTRAINT "ShopReceiptCounter_pkey" PRIMARY KEY ("shopId", "period")
);

-- รูปแบบ YYYYMM (ค.ศ., ตัดเดือนตามเวลาไทย)
ALTER TABLE "ShopReceiptCounter" ADD CONSTRAINT "ShopReceiptCounter_period_check"
  CHECK ("period" ~ '^[0-9]{6}$');
ALTER TABLE "ShopReceiptCounter" ADD CONSTRAINT "ShopReceiptCounter_lastSeq_check"
  CHECK ("lastSeq" > 0);

ALTER TABLE "ShopReceiptCounter" ADD CONSTRAINT "ShopReceiptCounter_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
