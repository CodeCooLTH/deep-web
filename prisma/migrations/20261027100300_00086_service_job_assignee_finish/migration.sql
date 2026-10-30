-- feature 00086 P3 (S-6 · S-10) — ผู้รับผิดชอบงาน + เวลา "ทำเสร็จ" ของร้านบริการ
--   "assignedUserId"    = ผู้รับผิดชอบ (ช่าง) · NULL = ยังไม่มีคนรับ
--   "serviceFinishedAt" = ช่างกด "ทำเสร็จแล้ว" เมื่อไร · ไม่ใช่การปิดงาน (เงิน/ยอดยังนับที่ serviceClosedAt ตาม 00073)
--
-- ทำไมผูก User ไม่ผูก ShopMember (DATABASE §1.1 ข้อ 3):
--   ShopMember ถูกลบ/สร้างใหม่ได้ (ออกแล้วเชิญกลับ) แต่ตัวคนเดิม · FK ไป User ทำให้ชื่อคนยังอ่านได้ตลอด
--   การ "ออกจากร้าน" ล้างผู้รับผิดชอบที่ service (removeShopMember) พร้อมบันทึก OrderEvent — ไม่ใช่หน้าที่ FK
--   ลบบัญชีผู้ใช้ทั้งบัญชี = ON DELETE SET NULL (งานกลับเป็น "ยังไม่มีคนรับ" ไม่ใช่ลบงาน)
--
-- CHECK Order_serviceFinished_requires_started: ทำเสร็จได้ต้องเริ่มแล้ว (ด่านที่สองหลัง service ·
--   กันบั๊กเขียน serviceFinishedAt ข้ามขั้น) · ไม่บังคับกลับทาง — ปิดงานโดยไม่ผ่าน "ทำเสร็จ" ได้ (FR-010)
--
-- ไม่มี backfill: ใบเก่าทุกใบ = ยังไม่มีคนรับ + ยังไม่ทำเสร็จ (คอลัมน์ใหม่ NULL ทั้งหมด)
--
-- ⚠️ Order เป็นตารางใหญ่บน prod:
--   · ADD COLUMN ไม่มี DEFAULT = แก้ metadata อย่างเดียว ไม่เขียนแถวใหม่ (แต่ขอ ACCESS EXCLUSIVE lock — lock_timeout 5s
--     กันยืนรอคิวจนขวางทั้งระบบ · ล้ม = deploy ล้ม ลองใหม่ได้)
--   · FK/CHECK แบบ NOT VALID แล้ว VALIDATE: migrate deploy รันทั้งไฟล์ใน transaction เดียว จึงไม่ได้ย่น lock ของ ADD COLUMN
--     แต่คงไว้ตามแบบแผนเดิม · คอลัมน์ใหม่ NULL ทุกแถว ⇒ VALIDATE สแกนรอบเดียวผ่านแน่นอน
--   · CREATE INDEX ธรรมดา (ไม่ CONCURRENTLY — ใช้ใน transaction ของ migrate ไม่ได้) บล็อกการเขียน Order ระหว่างสร้าง
--     🛑 ก่อน merge: ต้องนับ SELECT count(*) FROM "Order" บน prod (คนที่มีสิทธิ์ — ไม่ใช่ agent) ถ้าเกินหลักล้านแถว
--        ให้ Controller ตัดสินแยก index ไปสร้าง CONCURRENTLY นอก migrate · ขนาดหลักแสน = สร้างเสร็จในไม่กี่วินาที
--
-- additive ล้วน · รันซ้ำได้ (IF NOT EXISTS / DO-guard / DROP CONSTRAINT IF EXISTS ก่อน ADD)
-- rollback (ก่อนมีข้อมูลจริงเท่านั้น): DROP CONSTRAINT "Order_serviceFinished_requires_started", "Order_assignedUserId_fkey";
--   DROP INDEX "Order_assignedUserId_serviceStart_idx"; DROP COLUMN "assignedUserId", "serviceFinishedAt"
SET LOCAL lock_timeout = '5s';

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "assignedUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "serviceFinishedAt" TIMESTAMPTZ(3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_assignedUserId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedUserId_fkey"
      FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_assignedUserId_fkey";

-- "งานของฉันวันนี้" (assignedUserId = me ∧ serviceStart ∈ วันนี้) + หาใบเปิดของคนที่ถูกลบออกจากร้าน
CREATE INDEX IF NOT EXISTS "Order_assignedUserId_serviceStart_idx" ON "Order" ("assignedUserId", "serviceStart");

ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_serviceFinished_requires_started";
ALTER TABLE "Order" ADD CONSTRAINT "Order_serviceFinished_requires_started"
  CHECK ("serviceFinishedAt" IS NULL OR "serviceStartedAt" IS NOT NULL) NOT VALID;
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_serviceFinished_requires_started";
