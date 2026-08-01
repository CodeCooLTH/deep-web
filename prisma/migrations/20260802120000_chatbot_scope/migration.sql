-- feature 00023 · ขอบเขตการตอบของ ChatBot + คำสั่งเพิ่มเติมที่ร้านเขียนเอง (user 2026-08-01)
--
-- "มันจะมีแบบเขียนเป็น Prompt ไว้ไหม ว่าถ้าไม่ได้ถามเกี่ยวกับข้อมูลร้านค้า จะไม่ตอบ"
-- ช่องบุคลิก AI เขียนสั่งได้ก็จริง แต่ prompt จัดให้น้ำเสียงอยู่ใต้กฎข้อมูลเสมอ
-- จึงไม่แรงพอจะบังคับขอบเขต ต้องเป็นสวิตช์ที่ฉีดเข้า prompt คนละที่กัน
ALTER TABLE "AutoReplyConfig"
  ADD COLUMN IF NOT EXISTS "aiChatbotShopOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "aiChatbotOutOfScopeText" TEXT,
  ADD COLUMN IF NOT EXISTS "aiChatbotExtraPrompt" TEXT;
