-- feature 00078 M5 — เวลาเริ่มงานบริการ (ไม่ใช่สถานะ) · เลียนแบบ serviceClosedAt (00073)
-- ไม่ backfill: เดิมไม่เคยบันทึก ห้ามเดาจาก serviceStart/updatedAt
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "serviceStartedAt" TIMESTAMPTZ(3);
