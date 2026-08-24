-- feature 00056 — รูปแบบการคืน: ใครออกค่าส่ง × ที่มาของเลขพัสดุ (หัวหน้าสั่ง 2026-08-24)
--
-- additive ล้วน: คอลัมน์ใหม่ที่มี DEFAULT ทั้งหมด ไม่มี backfill
-- แยกเป็นไฟล์ที่สองแทนการแก้ 20260824150000 เพราะไฟล์นั้น apply ฐาน local ไปแล้ว —
-- การแก้ migration ที่รันไปแล้วทำให้ checksum ใน _prisma_migrations ไม่ตรงและ deploy ล้ม
--
-- 4 รูปแบบที่ต้องรองรับ:
--   1. ร้านออกค่าส่ง + ออกเลขผ่าน iShip   (payer=SHOP  · trackingSource=ISHIP)
--   2. ร้านออกค่าส่ง + ใช้ขนส่งเจ้าอื่น    (payer=SHOP  · trackingSource=MANUAL)
--   3. ลูกค้าออกเอง + ส่งเลขมาให้กรอก     (payer=BUYER · trackingSource=MANUAL)
--   4. ลูกค้าออกเอง + ไม่มีเลขพัสดุ        (payer=BUYER · trackingSource=NONE)

ALTER TABLE "OrderReturn" ADD COLUMN "payer"            TEXT    NOT NULL DEFAULT 'SHOP';
ALTER TABLE "OrderReturn" ADD COLUMN "trackingSource"   TEXT    NOT NULL DEFAULT 'NONE';
ALTER TABLE "OrderReturn" ADD COLUMN "manualTrackingNo" TEXT;
ALTER TABLE "OrderReturn" ADD COLUMN "manualCourier"    TEXT;
ALTER TABLE "OrderReturn" ADD COLUMN "countAsCost"      BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrderReturn" ADD COLUMN "shippingCost"     DECIMAL(12,2);

ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_payer_check"
  CHECK ("payer" IN ('SHOP', 'BUYER'));
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_tracking_source_check"
  CHECK ("trackingSource" IN ('ISHIP', 'MANUAL', 'NONE'));

-- ร้านจ่ายเอง = ต้องเป็นต้นทุนเสมอ · ลูกค้าจ่าย = ร้านเลือกได้ (บางเคสลูกค้าออกเลขเองแล้ว
-- มาเรียกเก็บร้านทีหลัง) — บังคับที่ฐานเพราะเป็นกฎที่ทำให้ตัวเลขกำไรผิดถ้าหลุด
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_shop_pays_is_cost"
  CHECK ("payer" <> 'SHOP' OR "countAsCost" = true);

-- MANUAL ต้องมีเลขพัสดุ · ISHIP/NONE ต้องไม่มีเลขที่กรอกเอง (ป้องกันสองแหล่งความจริงในแถวเดียว)
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_manual_tracking_shape"
  CHECK (
    ("trackingSource" = 'MANUAL' AND "manualTrackingNo" IS NOT NULL)
    OR ("trackingSource" <> 'MANUAL' AND "manualTrackingNo" IS NULL AND "manualCourier" IS NULL)
  );

-- ค่าส่งติดลบไม่ได้ — บั๊กที่ทำให้ "กำไรเพิ่มขึ้นเพราะคืนของ" ต้องชนที่ฐาน
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_shipping_cost_nonneg"
  CHECK ("shippingCost" IS NULL OR "shippingCost" >= 0);
