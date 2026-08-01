-- feature 00023 · phase `00023-ai-enhance` — AI ChatBot (สวิตช์ระดับร้าน)
-- user ตัดสิน 2026-08-01: ข้อความที่ไม่ตรงกลุ่มคำไหนเลย ให้ AI อ่านคลังคำตอบแล้วตอบเอง
--
-- ADDITIVE ล้วน: คอลัมน์ใหม่มี DEFAULT ที่แปลว่า "ปิด" และการคลาย NOT NULL
-- ไม่กระทบแถวเดิม (แถวที่มี keywordId อยู่แล้วยังถูกต้องทุกแถว)

ALTER TABLE "AutoReplyConfig"
  ADD COLUMN "aiChatbotEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aiChatbotTone"    TEXT;

-- keywordId = NULL แปลว่า "กฎระดับร้าน" ใช้กับ ChatBot ซึ่งไม่มีกลุ่มคำให้ผูก
ALTER TABLE "AutoReplyGuardrail" ALTER COLUMN "keywordId" DROP NOT NULL;

-- query ของ ChatBot: กฎระดับร้านที่เปิดใช้งานอยู่ (keywordId IS NULL) — index บางส่วน
CREATE INDEX "AutoReplyGuardrail_shopId_shopLevel_idx"
  ON "AutoReplyGuardrail"("shopId", "isActive") WHERE "keywordId" IS NULL;
