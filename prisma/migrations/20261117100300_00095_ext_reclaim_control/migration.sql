-- 00095 ส่วนต่อขยาย FR-FA-5/BR-FA-8 — บอทดึงสิทธิ์คุมเธรดคืนจาก Business Suite แล้วส่ง · additive ล้วน
-- 1) เหตุผลใหม่ 2 ค่า (เพจไม่ได้ตั้ง Conversation Routing · token เพจตาย) → ขยาย CHECK ของ reason (ชื่อเดิม ค่าเดิมครบ ไม่กระทบแถวเก่า)
-- 2) ธง "ดึงสิทธิ์คืนแล้วส่ง" ต่อรอบ (ประวัติการส่ง) default false = พฤติกรรมเดิม
ALTER TABLE "SalesFollowSend" DROP CONSTRAINT "SalesFollowSend_reason_check";
ALTER TABLE "SalesFollowSend" ADD CONSTRAINT "SalesFollowSend_reason_check" CHECK ("reason" IS NULL OR "reason" IN ('PLATFORM_REJECTED','UNCERTAIN_SEND','OTHER_APP_CONTROLS','LINE_QUOTA_FULL','META_WINDOW_REJECTED','IMAGE_MISSING','EMPTY_MESSAGE','ROUTING_NOT_ENABLED','CHANNEL_TOKEN_INVALID'));

-- AlterTable
ALTER TABLE "SalesFollowSend" ADD COLUMN "controlReclaimed" BOOLEAN NOT NULL DEFAULT false;
