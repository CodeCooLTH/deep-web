-- 00095 ส่วนต่อขยาย FR-FA-8/BR-FA-11 — ตั้งได้ว่า "ห้องติดแท็กไหนให้บอทหยุด" · additive ล้วน (default '{}' = พฤติกรรมเดิม)
ALTER TABLE "SalesFollowBot" ADD COLUMN "stopTagKeys" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_stopTagKeys_check" CHECK (cardinality("stopTagKeys") <= 20);
-- ขยายชุดค่า stopReason เพิ่ม STOP_TAG_ADDED (ค่าเดิมครบ — ไม่มีแถวเก่าผิด)
ALTER TABLE "SalesFollowRun" DROP CONSTRAINT "SalesFollowRun_stopReason_check";
ALTER TABLE "SalesFollowRun" ADD CONSTRAINT "SalesFollowRun_stopReason_check" CHECK ("stopReason" IS NULL OR "stopReason" IN ('STAGE_CHANGED','TAG_REMOVED','BOT_DISABLED','BOT_EDITED','BOT_DELETED','CUSTOMER_REPLIED','WINDOW_CLOSED','NOT_INTERESTED','OUT_OF_SCOPE','CONTACT_BLOCKED','ADMIN_STOPPED','STOP_TAG_ADDED'));
