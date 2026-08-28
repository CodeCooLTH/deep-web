-- feature 00062 — นัดรับสินค้า: ร้านกด "มอบสินค้าแล้ว" (FR-PKP-03) + ยืนยันรับเงินโอน (FR-PAY-01)
--
-- 4 คอลัมน์ mirror Order.codReceivedAt/codReceivedByUserId ทุกประการ — additive ล้วน, nullable,
-- ไม่มี default, ไม่แตะข้อมูลเดิม ออเดอร์ทุกใบที่มีอยู่ก่อนหน้านี้จะได้ค่า NULL ทั้ง 4 คอลัมน์
-- ซึ่งคือค่าที่ถูกต้อง (ไม่เคยมีการกด "มอบสินค้าแล้ว"/"ได้รับเงินแล้ว" มาก่อน — ห้ามเดา backfill)

ALTER TABLE "Order" ADD COLUMN "handedOverAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "handedOverByUserId" TEXT;
ALTER TABLE "Order" ADD COLUMN "paymentConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "paymentConfirmedByUserId" TEXT;

ALTER TABLE "Order" ADD CONSTRAINT "Order_handedOverByUserId_fkey"
  FOREIGN KEY ("handedOverByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentConfirmedByUserId_fkey"
  FOREIGN KEY ("paymentConfirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- job ปิดงานนัดรับอัตโนมัติ (FR-PKP-04) ต้องคัด "ออเดอร์นัดรับที่ PENDING และมอบของแล้วเกิน grace
-- period" โดยไม่ scan ทั้งตาราง Order — ออเดอร์นัดรับไม่มี OrderShipment เลย จึง query ตรงจาก Order
-- (ต่างจาก autoConfirmDelivered() ที่อาศัย index ของ OrderShipment ได้)
CREATE INDEX "Order_fulfillmentMode_status_handedOverAt_idx"
  ON "Order"("fulfillmentMode", "status", "handedOverAt");

-- mirror Order_shopId_codReceivedAt_idx (20260804200000) — ตัวนับ "โอนเงินแล้วยังไม่ยืนยันรับเงิน"
CREATE INDEX "Order_shopId_paymentConfirmedAt_idx"
  ON "Order"("shopId", "paymentConfirmedAt");

-- 🛑 CHECK ทั้งสองตัวปลอดภัย 100% กับข้อมูลเดิมโดยไม่ต้องนับก่อน apply: paymentConfirmedAt และ
-- handedOverAt เป็นคอลัมน์ที่เพิ่งสร้างในไฟล์นี้เอง ⇒ ทุกแถวเดิมมีค่า NULL แน่นอน ⇒ เงื่อนไข
-- "คอลัมน์ใหม่ IS NULL OR …" ผ่านทุกแถวโดยอัตโนมัติ (ต่างจาก CHECK ที่เพิ่มเงื่อนไขให้คอลัมน์เก่า
-- ที่มีข้อมูลจริงอยู่แล้ว ซึ่งต้องนับเสมอ — กรณีนั้นไม่เกิดในไฟล์นี้)
-- NOT VALID + VALIDATE ตาม convention ของตารางนี้ เพื่อไม่ lock ตารางระหว่าง ALTER

-- D-2: TRANSFER/PROMPTPAY/CASH ใช้ paymentConfirmedAt, COD ใช้ codReceivedAt เดิม — ไม่มีออเดอร์ใด
-- ควรมีทั้งคู่พร้อมกัน (Hard Rule 16 — "ได้เงินแล้ว" ต้องมีนิยามเดียวต่อออเดอร์หนึ่งใบ) บังคับเป็น
-- CHECK เพื่อเป็นด่านที่สองนอกจาก app layer: ถ้า service เขียนพลาด จะได้ error 23514 ทันที
-- แทนที่จะปล่อยให้ข้อมูลขัดแย้งกันเงียบ ๆ
ALTER TABLE "Order" ADD CONSTRAINT "Order_payment_confirm_exclusive_check"
  CHECK ("paymentConfirmedAt" IS NULL OR "codReceivedAt" IS NULL) NOT VALID;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_payment_confirm_exclusive_check";

-- BR-PKP-02: handedOverAt มีความหมายเฉพาะออเดอร์นัดรับ
-- 🛑 ผลข้างเคียงที่ service ต้องจัดการ: ถ้าร้านแก้ fulfillmentMode ออกจาก PICKUP *หลัง* กด
-- "มอบสินค้าแล้ว" ต้อง SET handedOverAt = NULL ในทรานแซกชันเดียวกัน ไม่งั้นได้ 23514 ดิบขึ้นจอผู้ใช้
ALTER TABLE "Order" ADD CONSTRAINT "Order_handedOver_requires_pickup_check"
  CHECK ("handedOverAt" IS NULL OR "fulfillmentMode" = 'PICKUP') NOT VALID;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_handedOver_requires_pickup_check";
