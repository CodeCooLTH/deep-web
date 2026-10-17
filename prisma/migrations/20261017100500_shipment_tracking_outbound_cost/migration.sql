-- feature 00078 M6 — ต้นทุนส่งเอง (ขาออก) บน ShipmentTracking · ชื่อ outbound… เพราะ OrderReturn.shippingCost = ขากลับ
-- NULL = ยังไม่ระบุ ≠ 0 = ไม่มีค่าใช้จ่ายจริง → ห้าม backfill เป็น 0
ALTER TABLE "ShipmentTracking" ADD COLUMN IF NOT EXISTS "outboundShippingCost" DECIMAL(12,2);

DO $$ BEGIN
  ALTER TABLE "ShipmentTracking" ADD CONSTRAINT "ShipmentTracking_outboundShippingCost_nonneg"
    CHECK ("outboundShippingCost" IS NULL OR "outboundShippingCost" >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "ShipmentTracking" VALIDATE CONSTRAINT "ShipmentTracking_outboundShippingCost_nonneg";
