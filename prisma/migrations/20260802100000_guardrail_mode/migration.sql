-- feature 00023 · กฎ 2 ชนิด: หยุดไม่ตอบ กับ เลี่ยงคำพูด (user สั่ง 2026-08-01)
--
-- เดิมกฎมีผลเดียวคือบล็อกทั้งคำตอบจนบอทเงียบ ซึ่งใช้กับ "ห้ามพูดว่าไม่มีข้อมูล" ไม่ได้เลย
-- เพราะสิ่งที่ร้านต้องการคือให้พูดใหม่ ไม่ใช่ให้เงียบ
ALTER TABLE "AutoReplyGuardrail"
  ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'BLOCK';

ALTER TABLE "AutoReplyGuardrail" DROP CONSTRAINT IF EXISTS "AutoReplyGuardrail_mode_check";
ALTER TABLE "AutoReplyGuardrail" ADD CONSTRAINT "AutoReplyGuardrail_mode_check"
  CHECK ("mode" IN ('BLOCK', 'AVOID'));
