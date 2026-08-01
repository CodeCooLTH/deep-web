-- feature 00023 · ChatBot ตอบทุกคำถามในช่วงเวลาที่ตั้งไว้ (user สั่ง 2026-08-01)
--
-- เดิมคลังไม่มีคำตอบ = เงียบ ซึ่งแปลว่าลูกค้าถูกปล่อยทิ้ง ตอนนี้ร้านเลือกได้ว่าจะให้
-- ทำอะไรแทน และเลือกได้ว่าจะให้บอทดึงอะไรมาประกอบการตอบบ้าง
--
-- ADD COLUMN พร้อม DEFAULT — ไม่แตะข้อมูลเดิม
-- ค่าเริ่มต้นเลือกฝั่งปลอดภัย: ตอบข้อความสำรอง (ไม่ใช่ปล่อย AI ตอบอิสระ)
-- และเปิดเฉพาะแหล่งข้อมูลที่เป็นของร้านเอง ส่วนค้นเว็บต้องกดเปิดเอง
ALTER TABLE "AutoReplyConfig"
  ADD COLUMN IF NOT EXISTS "aiChatbotFallbackMode" TEXT NOT NULL DEFAULT 'MESSAGE',
  ADD COLUMN IF NOT EXISTS "aiChatbotFallbackText" TEXT,
  ADD COLUMN IF NOT EXISTS "aiChatbotUseShopData" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "aiChatbotUseChatHistory" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "aiChatbotUseWebSearch" BOOLEAN NOT NULL DEFAULT false;

-- กันค่าหลุดจากที่ UI/โค้ดรู้จัก — หลักเดียวกับ CHECK ของ aiChatbotStatus
ALTER TABLE "AutoReplyConfig" DROP CONSTRAINT IF EXISTS "AutoReplyConfig_ai_chatbot_fallback_mode_check";
ALTER TABLE "AutoReplyConfig" ADD CONSTRAINT "AutoReplyConfig_ai_chatbot_fallback_mode_check"
  CHECK ("aiChatbotFallbackMode" IN ('SILENT', 'MESSAGE', 'AI_FREE'));
