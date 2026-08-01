-- feature 00023 · แยก Auto Reply กับ ChatBot เป็นคนละเมนู (user ตัดสิน 2026-08-01)
--
-- Auto Reply = ตอบเป๊ะตามเงื่อนไข ไม่มีค่าใช้จ่าย · ChatBot = ส่วนเสริม AI ที่ครอบทุก webhook
-- และ "Auto Reply Enhance" ย้ายจากสวิตช์รายกลุ่มคำขึ้นมาเป็น option ระดับร้านในเมนู ChatBot
--
-- ADDITIVE ล้วน — AutoReplyKeyword.aiEnhanceEnabled ไม่ถูกลบ (เลิกใช้แต่ปล่อยนอนเฉย
-- การถอดคอลัมน์บนฐานที่ใช้งานจริงแพงกว่าปล่อยไว้ และเผื่อต้องการ override รายกลุ่มภายหลัง)
ALTER TABLE "AutoReplyConfig"
  ADD COLUMN "aiEnhanceEnabled"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aiChatbotStartTime" TEXT,
  ADD COLUMN "aiChatbotEndTime"   TEXT;
