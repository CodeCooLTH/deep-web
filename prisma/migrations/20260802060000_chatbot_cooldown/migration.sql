-- feature 00023 · เพดานการตอบของ ChatBot ต่อห้องแชท (user สั่ง 2026-08-01)
--
-- ChatBot ทำงานตอน "ไม่เข้ากลุ่มคำไหนเลย" จึงไม่มี cooldown ของกลุ่มคำมาคุม
-- คนที่พิมพ์คำถามต่างกันรัว ๆ ในห้องเดียวเรียก AI ได้ทุกครั้งจนกว่าจะชนเพดานเงินต่อวัน
--
-- ADD COLUMN พร้อม DEFAULT — ไม่แตะข้อมูลเดิม ร้านที่มีอยู่ได้ค่าเริ่มต้นทันที
ALTER TABLE "AutoReplyConfig"
  ADD COLUMN IF NOT EXISTS "aiChatbotCooldownSec" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "aiChatbotMaxPerHour" INTEGER NOT NULL DEFAULT 10;
