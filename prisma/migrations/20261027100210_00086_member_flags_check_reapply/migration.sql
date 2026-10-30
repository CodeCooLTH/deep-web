-- 00086 — ใส่ CHECK "เจ้าของไม่ถือธงติ๊ก" กลับ (ShopMember_flags_admin_only_check)
--
-- ทำไมมีไฟล์นี้: 2026-10-27 migration 20261027100000 ขึ้น prod ก่อน merge โดยไม่ตั้งใจ (เหตุการณ์ใน memory
-- prod-migrate-incident-00086) · backfill ติ๊ก canCloseJob ให้ตอบแชท/ช่างของร้านบริการแล้ว แต่โค้ดเก่าบน prod
-- (changeMemberRole / transferShopOwnership) เลื่อนสมาชิกเป็น OWNER โดยไม่ล้างธง ⇒ CHECK นี้ทำให้ล้ม 500
-- ⇒ เสนอให้ถอด constraint บน prod ด้วยมือชั่วคราว แต่ user เลือกปล่อยไว้ (2026-10-27 · เสี่ยงแค่เลื่อน/โอนเป็นเจ้าของ)
--   ไฟล์นี้จึงต้องปลอดภัยทั้งสองสภาพ: DROP IF EXISTS แล้วใส่ใหม่ — prod จะมีหรือไม่มี CHECK อยู่ก่อนก็ได้ผลเดียวกัน
-- (โค้ด 00086 ล้างธงทุกทางที่เป็น OWNER แล้ว — planMemberRoleChange + transferShopOwnership)
--
-- ช่วงที่ไม่มี CHECK อาจมีแถว OWNER ที่ถือธงค้าง (เลื่อนเป็นเจ้าของด้วยโค้ดเก่า) ⇒ ล้างก่อน VALIDATE
-- เจ้าของได้ทุกอย่างอยู่แล้ว ธงบนแถว OWNER ไม่มีความหมาย — ล้างไม่เปลี่ยนสิทธิ์ใคร
--
-- ลำดับ (review P2 NIT-1): ใส่ CHECK แบบ NOT VALID ก่อน แล้วค่อยล้างแถวผิด แล้วจึง VALIDATE
--   · NOT VALID = ไม่สแกนแถวเดิม แต่บังคับกับ INSERT/UPDATE ใหม่ทันที ⇒ ตั้งแต่บรรทัดนั้น
--     ไม่มีแถวผิดเกิดใหม่แทรกระหว่าง UPDATE กับ VALIDATE ได้ (ถ้า UPDATE ก่อนแล้วค่อยใส่ constraint จะมีช่องนั้น)
--   · UPDATE ล้างเฉพาะแถวผิดที่ค้างมาก่อน · VALIDATE สแกนยืนยันว่าทุกแถวผ่าน
-- รันซ้ำได้ (DROP IF EXISTS · UPDATE เฉพาะแถวที่ผิด)
SET LOCAL lock_timeout = '5s';

ALTER TABLE "ShopMember" DROP CONSTRAINT IF EXISTS "ShopMember_flags_admin_only_check";
ALTER TABLE "ShopMember" ADD CONSTRAINT "ShopMember_flags_admin_only_check"
  CHECK ("role" = 'ADMIN' OR (NOT "canCloseJob" AND NOT "canRecordExpense")) NOT VALID;

UPDATE "ShopMember" SET "canCloseJob" = false, "canRecordExpense" = false
WHERE "role" = 'OWNER' AND ("canCloseJob" OR "canRecordExpense");

ALTER TABLE "ShopMember" VALIDATE CONSTRAINT "ShopMember_flags_admin_only_check";
