-- feature 00085 — ร้านปิดพัสดุที่มีปัญหา: 8 คอลัมน์ nullable บน OrderShipment + CHECK (SRS §5.1 · SDS §6)
-- additive ล้วน · ไม่มี backfill (ใบเก่า = null = ไม่ปิด) · รันซ้ำได้ (IF NOT EXISTS + เช็ค pg_constraint)
-- rollback: DROP CONSTRAINT 4 ตัว แล้ว DROP COLUMN 8 ตัว (เฉพาะก่อนมีข้อมูลปิดจริง — หลังมีข้อมูลต้องถามก่อน)
SET LOCAL lock_timeout = '5s';

ALTER TABLE "OrderShipment"
  ADD COLUMN IF NOT EXISTS "problemClosedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "problemClosedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "problemCloseReason" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "problemCloseNote" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "problemCloseOutcome" VARCHAR(24),
  ADD COLUMN IF NOT EXISTS "problemCloseBasis" VARCHAR(24),
  ADD COLUMN IF NOT EXISTS "problemCloseRefunded" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "problemCloseExcludesRevenue" BOOLEAN;

DO $$
BEGIN
  -- ปิดแล้วต้องมีครบสามตัวพร้อมกัน / ยังไม่ปิดต้อง null ทั้งสาม
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderShipment_problem_close_coherent' AND conrelid = '"OrderShipment"'::regclass) THEN
    ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_problem_close_coherent" CHECK (
      ("problemClosedAt" IS NULL AND "problemCloseOutcome" IS NULL AND "problemCloseExcludesRevenue" IS NULL)
      OR ("problemClosedAt" IS NOT NULL AND "problemCloseOutcome" IS NOT NULL AND "problemCloseExcludesRevenue" IS NOT NULL)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderShipment_problem_close_outcome_check' AND conrelid = '"OrderShipment"'::regclass) THEN
    ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_problem_close_outcome_check" CHECK (
      "problemCloseOutcome" IS NULL OR "problemCloseOutcome" IN ('DELIVERY_FAILED', 'LOST_ON_RETURN')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderShipment_problem_close_reason_check' AND conrelid = '"OrderShipment"'::regclass) THEN
    ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_problem_close_reason_check" CHECK (
      "problemCloseReason" IS NULL OR "problemCloseReason" IN ('FIRE', 'LOST', 'DAMAGED', 'OTHER')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderShipment_problem_close_basis_check' AND conrelid = '"OrderShipment"'::regclass) THEN
    ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_problem_close_basis_check" CHECK (
      "problemCloseBasis" IS NULL OR "problemCloseBasis" IN ('DELIVERED_AT', 'EVENT', 'ORDER_CONFIRMED', 'NONE')
    );
  END IF;
END $$;
