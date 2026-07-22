-- feat 00017 Lodging Vertical — Migration M2 (Phase 2: การจอง)
--
-- hand-written (shared dev/prod DB — ห้าม prisma migrate dev; ดู docs/conventions/prisma-shared-db-drift.md)
-- อ้างอิง: docs/20 - Features/00017 - Lodging Vertical/DATABASE.md §5.1 M2
--
-- ความปลอดภัย:
--   - คอลัมน์ใหม่ทั้ง 5 เป็น nullable ไม่มี default → ADD COLUMN ไม่ rewrite ตาราง ไม่ล็อกนาน
--   - EXCLUDE + CHECK มี WHERE/เงื่อนไขที่ทำให้ "ออเดอร์สินค้าเดิมทุกแถวไม่ถูกแตะเลย" (BR-LODG-27)
--   - CHECK บน "Order" ใช้ NOT VALID แล้วค่อย VALIDATE แยกคำสั่ง เพราะตารางมีข้อมูล prod อยู่แล้ว
--     (NOT VALID = ไม่สแกนของเดิมตอน ALTER → ไม่ล็อกยาว; VALIDATE = สแกนแบบ lock เบา)

-- ---------------------------------------------------------------------------
-- 1) คอลัมน์การจองบน Order — additive nullable ทั้งหมด
-- ---------------------------------------------------------------------------
-- การจอง = Order ที่ type = 'BOOKING' ไม่ใช่ตารางแยก (BR-LODG-08)
ALTER TABLE "Order" ADD COLUMN "roomId"        TEXT;
ALTER TABLE "Order" ADD COLUMN "checkIn"       DATE;
ALTER TABLE "Order" ADD COLUMN "checkOut"      DATE;
ALTER TABLE "Order" ADD COLUMN "depositAmount" DECIMAL(12,2);
ALTER TABLE "Order" ADD COLUMN "cancelReason"  TEXT;

-- ON DELETE RESTRICT: ลบห้องที่มีการจองไม่ได้ที่ระดับฐานข้อมูล (BR-LODG-06)
-- คู่กับ app layer ที่ไม่มี deleteRoom ให้เรียกอยู่แล้ว — กันสองชั้น
ALTER TABLE "Order" ADD CONSTRAINT "Order_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2) Index
-- ---------------------------------------------------------------------------
CREATE INDEX "Order_roomId_checkIn_idx"      ON "Order"("roomId", "checkIn");
CREATE INDEX "Order_shopId_type_checkIn_idx" ON "Order"("shopId", "type", "checkIn");
-- นับประวัติการยกเลิกต่อลูกค้า (BR-LODG-38) — เสริม Order_customerId_idx เดิมที่มีคอลัมน์เดียว
CREATE INDEX "Order_customerId_status_idx"   ON "Order"("customerId", "status");

-- ---------------------------------------------------------------------------
-- 3) 🛑 EXCLUDE constraint — กลไก "เดียว" ที่กันจองทับได้จริง
-- ---------------------------------------------------------------------------
-- ทำไมไม่ใช้แค่การตรวจก่อนบันทึกที่ระดับแอป: มีช่องว่างระหว่าง "ตรวจ" กับ "เขียน" เสมอ
-- ผู้ใช้สองคนกดพร้อมกันจะผ่านการตรวจทั้งคู่แล้วเขียนทับกัน (BR-LODG-11)
--
-- btree_gist จำเป็นเพราะ "roomId" WITH = เป็นการเทียบ equality บน gist index
-- ตรวจแล้ว 2026-07-22: extension มีให้ใช้บน PostgreSQL 17.6 ของ Supabase (default_version 1.7)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- อ่าน constraint นี้:
--   daterange(checkIn, checkOut, '[)')  = รวมวันเข้าพัก ไม่รวมวันเช็คเอาท์
--        → จอง 5-8 กันวันที่ 5,6,7 เท่านั้น คนถัดไปเช็คอินวันที่ 8 ได้ (BR-LODG-31)
--   WHERE status <> 'CANCELLED'          = การจองที่ยกเลิกแล้วไม่กินคิว (BR-LODG-13)
--   WHERE roomId IS NOT NULL             = ออเดอร์สินค้าปกติไม่ถูกแตะเลย (zero-regression)
--
-- ทดสอบพฤติกรรมทั้ง 6 เคสบน DB จริงแล้วก่อนเขียน migration นี้ (DATABASE.md §4.2.1)
ALTER TABLE "Order" ADD CONSTRAINT "Order_room_no_overlap"
    EXCLUDE USING gist (
        "roomId" WITH =,
        daterange("checkIn", "checkOut", '[)') WITH &&
    ) WHERE ("roomId" IS NOT NULL AND "status" <> 'CANCELLED');

-- ---------------------------------------------------------------------------
-- 4) CHECK constraints — NOT VALID ก่อน แล้วค่อย VALIDATE
-- ---------------------------------------------------------------------------
-- ทุกตัวเขียนให้ "ผ่านอัตโนมัติ" สำหรับแถวเดิมที่คอลัมน์ใหม่เป็น NULL ทั้งหมด

-- วันเช็คเอาท์ต้องอยู่หลังวันเข้าพักอย่างน้อย 1 คืน (BR-LODG-12)
ALTER TABLE "Order" ADD CONSTRAINT "Order_stay_range"
    CHECK ("checkIn" IS NULL OR "checkOut" IS NULL OR "checkOut" > "checkIn") NOT VALID;

-- ขอบล่างของมัดจำ; ขอบบน (<= totalAmount) บังคับที่ service layer เพราะเทียบข้ามคอลัมน์
-- ที่แก้ไขได้ทั้งคู่ — CHECK ระดับแถวจะบล็อกการแก้ยอดรวมทีหลังโดยไม่จำเป็น
ALTER TABLE "Order" ADD CONSTRAINT "Order_deposit_nonneg"
    CHECK ("depositAmount" IS NULL OR "depositAmount" >= 0) NOT VALID;

-- เหตุผลการยกเลิกต้องอยู่ใน 4 ค่าที่กำหนด (BR-LODG-36)
-- คุมที่ DB ด้วยเพราะค่านี้เป็นตัวตัดสินว่าผู้จองติดประวัติหรือไม่ — ค่าเพี้ยน = ตัดสินผิด
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancel_reason"
    CHECK ("cancelReason" IS NULL OR "cancelReason" IN
        ('BUYER_NO_TRANSFER', 'BUYER_REQUESTED', 'SHOP_ISSUE', 'MUTUAL')) NOT VALID;

-- ความสอดคล้องของการจอง: type='BOOKING' ต้องมีห้องและช่วงวันครบเสมอ (TFR-009)
-- กันการจองครึ่ง ๆ ที่ปฏิทินจะแสดงผลไม่ได้
ALTER TABLE "Order" ADD CONSTRAINT "Order_booking_fields"
    CHECK ("type" <> 'BOOKING' OR
           ("roomId" IS NOT NULL AND "checkIn" IS NOT NULL AND "checkOut" IS NOT NULL)) NOT VALID;

ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_stay_range";
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_deposit_nonneg";
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_cancel_reason";
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_booking_fields";
