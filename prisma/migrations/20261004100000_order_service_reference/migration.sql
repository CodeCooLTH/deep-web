-- ข้อมูลอ้างอิงของงานร้านบริการ (SERVICE_QUEUE) — ข้อความสั้นไว้ค้นหางาน เช่น ทะเบียนรถ
-- additive + nullable: ไม่ rewrite ตาราง ไม่แตะแถวเดิม (ร้านทุกประเภทเดิมได้ NULL)
ALTER TABLE "Order" ADD COLUMN "serviceReference" VARCHAR(100);
