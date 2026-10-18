-- feature 00080 M1 — เวลา "จัดส่งแล้ว" ของพัสดุส่งเอง (SDS TD-002)
-- NULL = ยังไม่กดจัดส่ง / ใบเก่า (ผู้อ่านใช้ dispatchedAt ?? createdAt) → ห้าม backfill
-- lock_timeout: ยอมให้ migrate ล้มดีกว่ารอคิวล็อกแล้วบล็อกทั้งระบบ · รันซ้ำได้ (IF NOT EXISTS)
SET LOCAL lock_timeout = '5s';

ALTER TABLE "ShipmentTracking" ADD COLUMN IF NOT EXISTS "dispatchedAt" TIMESTAMPTZ(3);
