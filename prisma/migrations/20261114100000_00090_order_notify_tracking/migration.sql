-- feature 00090 — สวิตช์รายใบ "ส่งเลขพัสดุให้ลูกค้า" (Order.notifyTracking)
-- additive · DEFAULT true = ใบเดิมทั้งหมดส่งเหมือนเดิม · PG ≥11 เพิ่มคอลัมน์ที่มี DEFAULT คงที่โดยไม่ rewrite ตาราง
SET LOCAL lock_timeout = '5s';
ALTER TABLE "Order" ADD COLUMN "notifyTracking" BOOLEAN NOT NULL DEFAULT true;
