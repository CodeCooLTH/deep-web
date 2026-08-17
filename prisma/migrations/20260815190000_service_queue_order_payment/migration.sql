-- feature 00050 — เงินที่ "ได้รับจริง" ของออเดอร์ (SERVICE_QUEUE End-to-End)
--
-- ที่มา: ระบบรู้ว่า *ควรเก็บ* มัดจำเท่าไร (Order.depositAmount) และเก็บ *รูปสลิป* ได้
-- (Order.slipFileId) แต่ไม่มีที่บันทึกว่า **ได้รับเงินแล้ว** — โค้ดเขียนสารภาพไว้เองที่
-- src/lib/appointment-summary.ts:34-40 ว่าไม่มีคอลัมน์นี้ จึงต้องเลี่ยงไปใช้คำว่า
-- "มัดจำที่ตกลงไว้" บนการ์ดที่ส่งให้ลูกค้ามาตลอด
--
-- 🛑 additive ล้วน — ไม่แตะคอลัมน์เดิมแม้แต่ตัวเดียว:
--   * Order.slipFileId / Order.depositAmount อยู่ที่เดิม ทำงานเหมือนเดิมทุกประการ
--     (ONLINE_SALES + LODGING ใช้อยู่จริงบน prod ห้ามกระทบ — AC-SQ-07)
--   * ไม่มี CHECK constraint แบบรายชื่อค่า จึงไม่มีทางไปลบค่าของ migration สาขาอื่น
--     (บทเรียน 20260806120000 ที่สองไฟล์ลบค่าของกันเองเงียบ ๆ)
--   * ไม่มี backfill — ออเดอร์เดิมทุกใบเริ่มจาก "ยังไม่มีบันทึกการรับเงิน" ซึ่งเป็นความจริง
--     (ระบบไม่เคยรู้เรื่องนี้มาก่อน การเดาย้อนหลังว่าใบไหนจ่ายแล้วคือการแต่งข้อมูล)

CREATE TABLE IF NOT EXISTS "OrderPayment" (
    "id"               TEXT NOT NULL,
    "orderId"          TEXT NOT NULL,
    "shopId"           TEXT NOT NULL,
    "kind"             TEXT NOT NULL,
    "amount"           DECIMAL(12,2) NOT NULL,
    "method"           TEXT NOT NULL DEFAULT 'TRANSFER',
    "slipFileId"       TEXT,
    "receivedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedByUserId" TEXT NOT NULL,
    "note"             TEXT,
    "voidedAt"         TIMESTAMP(3),
    "voidedByUserId"   TEXT,
    "voidedReason"     TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderPayment_pkey" PRIMARY KEY ("id")
);

-- รวมยอดเงินรับจริงรายวันของร้าน (dashboard) — WHERE shopId + receivedAt BETWEEN + voidedAt IS NULL
CREATE INDEX IF NOT EXISTS "OrderPayment_shopId_receivedAt_idx" ON "OrderPayment"("shopId", "receivedAt");
CREATE INDEX IF NOT EXISTS "OrderPayment_orderId_idx" ON "OrderPayment"("orderId");

-- ลบออเดอร์ = ลบประวัติการเงินของออเดอร์นั้นไปด้วย (เหมือน OrderItem/OrderEvent)
ALTER TABLE "OrderPayment"
  ADD CONSTRAINT "OrderPayment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ยอดเงินต้องเป็นบวกเสมอ — การกลับรายการทำด้วย voidedAt ไม่ใช่ยอดติดลบ
-- (ชื่อ constraint เฉพาะเจาะจงพอที่จะไม่ชนกับของสาขาอื่น)
ALTER TABLE "OrderPayment"
  ADD CONSTRAINT "OrderPayment_amount_positive" CHECK ("amount" > 0);
