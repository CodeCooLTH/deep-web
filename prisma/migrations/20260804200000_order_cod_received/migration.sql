-- ร้านกดยืนยันเองว่า "ได้รับเงินเก็บปลายทางแล้ว" (2026-08-04)
--
-- additive ล้วน: คอลัมน์ใหม่ 2 ช่อง nullable ไม่มี default ไม่แตะข้อมูลเดิม ไม่มี backfill
-- ออเดอร์ COD ทุกใบที่มีอยู่จะเป็น NULL = "ยังไม่ได้รับเงิน" ซึ่งเป็นค่าที่ถูกต้องอยู่แล้ว
-- (เราไม่เคยเก็บข้อมูลนี้มาก่อน จึงไม่มีทางรู้ย้อนหลังว่าใบไหนได้เงินแล้ว — ห้ามเดา)
--
-- onDelete SET NULL: ลบบัญชีพนักงานแล้วต้องไม่ลบข้อเท็จจริงว่า "ออเดอร์นี้ได้เงินแล้ว"
-- (codReceivedAt คงอยู่ เหลือแค่ไม่รู้ว่าใครกด) — pattern เดียวกับ Order.createdByUserId
ALTER TABLE "Order" ADD COLUMN "codReceivedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "codReceivedByUserId" TEXT;

ALTER TABLE "Order" ADD CONSTRAINT "Order_codReceivedByUserId_fkey"
  FOREIGN KEY ("codReceivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ไทล์ "รอเงิน COD" ถามว่า "ออเดอร์ของร้านนี้ที่ยังไม่ได้รับเงินมีใบไหนบ้าง"
CREATE INDEX "Order_shopId_codReceivedAt_idx" ON "Order"("shopId", "codReceivedAt");
