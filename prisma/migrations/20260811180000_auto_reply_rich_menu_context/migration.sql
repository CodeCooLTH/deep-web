-- feature 00045 FR-RM-09 — บริบทของคำตอบที่มาจากการแตะปุ่มบนเมนูลัด
--
-- additive ล้วน: คอลัมน์เดียว nullable ไม่มี default ไม่มี backfill ไม่แตะแถวเดิม
-- แถวเก่าทั้งหมดเป็น NULL = "คำตอบนี้ไม่ได้มาจากเมนูลัด" ซึ่งถูกต้องอยู่แล้ว
--
-- 🛑 ต้องเก็บ `buttonLabel` จริงที่ร้านตั้งไว้ ไม่ใช่ค่าคงที่ — ร้านแก้คำบนปุ่มเองได้ (FR-RM-02)
--    ถ้า hardcode ป๊อปอัป "ตอบโดย DeepMenu" จะโกหกทันทีที่ร้านเปลี่ยนคำ
ALTER TABLE "AutoReplyLog" ADD COLUMN "richMenuContext" JSONB;
