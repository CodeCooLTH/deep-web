-- 00095 ส่วนต่อขยาย FR-FA-8/BR-FA-11 — การ์ด "เงื่อนไขการเริ่มติดตาม" เป็นตัวสร้างกฎแบบแถว (สถานะการขาย/แท็ก × เป็น/ไม่ใช่/มี/ไม่มี)
-- additive + backfill: คอลัมน์เก่า salesStatuses/tagKeys/tagMatch เก็บไว้ ไม่ใช้อ่านแล้ว (ไม่ DROP — ถอยกลับได้)
ALTER TABLE "SalesFollowBot" ADD COLUMN "conditionMatch" TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "SalesFollowBot" ADD COLUMN "conditionRules" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- backfill: สถานะเดิม → แถว stage is · แท็กเดิม → แถว tag has_all/has_any ตาม tagMatch · เชื่อมกันด้วย ALL (เดิมคือ "สถานะ และ แท็ก")
UPDATE "SalesFollowBot" SET "conditionRules" = COALESCE((
  SELECT jsonb_agg(x.r ORDER BY x.o) FROM (
    SELECT 1 AS o, jsonb_build_object('field', 'stage', 'op', 'is', 'values', to_jsonb("salesStatuses")) AS r WHERE cardinality("salesStatuses") > 0
    UNION ALL
    SELECT 2 AS o, jsonb_build_object('field', 'tag', 'op', CASE WHEN "tagMatch" = 'ALL' THEN 'has_all' ELSE 'has_any' END, 'values', to_jsonb("tagKeys")) AS r WHERE cardinality("tagKeys") > 0
  ) x
), '[]'::jsonb);

ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_conditionMatch_check" CHECK ("conditionMatch" IN ('ALL','ANY'));
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_conditionRules_check" CHECK (jsonb_typeof("conditionRules") = 'array' AND jsonb_array_length("conditionRules") <= 10);
-- เงื่อนไขอย่างน้อยหนึ่งอย่างย้ายไปตรวจที่ Valibot (กฎ "จำกัดวง" ซับซ้อนเกิน CHECK) · ตัวประเมินถือ "ไม่มีกฎ = ไม่ตรง" (fail-closed)
ALTER TABLE "SalesFollowBot" DROP CONSTRAINT "SalesFollowBot_condition_check";

-- stopReason ใหม่ CONDITION_UNMATCHED (ค่าเก่า รวม TAG_REMOVED ที่ prod มีแถวอยู่ ยังต้องรับ)
ALTER TABLE "SalesFollowRun" DROP CONSTRAINT "SalesFollowRun_stopReason_check";
ALTER TABLE "SalesFollowRun" ADD CONSTRAINT "SalesFollowRun_stopReason_check" CHECK ("stopReason" IS NULL OR "stopReason" IN ('STAGE_CHANGED','TAG_REMOVED','BOT_DISABLED','BOT_EDITED','BOT_DELETED','CUSTOMER_REPLIED','WINDOW_CLOSED','NOT_INTERESTED','OUT_OF_SCOPE','CONTACT_BLOCKED','ADMIN_STOPPED','CONDITION_UNMATCHED'));

-- ล้างของรอบก่อนที่ apply บนเครื่อง local (prod ไม่มีคอลัมน์นี้)
ALTER TABLE "SalesFollowBot" DROP CONSTRAINT IF EXISTS "SalesFollowBot_stopTagKeys_check";
ALTER TABLE "SalesFollowBot" DROP COLUMN IF EXISTS "stopTagKeys";
