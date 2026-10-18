-- feature 00080 M2 — จังหวะแจ้งเลขพัสดุส่งเอง (SDS TD-003) · ไม่มีแถว config = ON_SAVE ในโค้ด
-- DEFAULT คงที่ใน PG16 = catalog-only ไม่ rewrite · CHECK แบบ NOT VALID แล้วค่อย VALIDATE
-- รันซ้ำได้ (IF NOT EXISTS + duplicate_object)
SET LOCAL lock_timeout = '5s';

ALTER TABLE "AutoNotifyConfig" ADD COLUMN IF NOT EXISTS "trackingNoticeTiming" TEXT NOT NULL DEFAULT 'ON_SAVE';

DO $$ BEGIN
  ALTER TABLE "AutoNotifyConfig" ADD CONSTRAINT "AutoNotifyConfig_trackingNoticeTiming_check"
    CHECK ("trackingNoticeTiming" IN ('ON_SAVE','ON_DISPATCH')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "AutoNotifyConfig" VALIDATE CONSTRAINT "AutoNotifyConfig_trackingNoticeTiming_check";
