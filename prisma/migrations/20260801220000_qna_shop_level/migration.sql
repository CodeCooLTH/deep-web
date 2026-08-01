-- feature 00023 · คลังคำตอบเป็นคลังกลางของร้าน เลิกบังคับผูกกลุ่มคำ (user ตัดสิน 2026-08-01)
--
-- เดิมบังคับผูกเพราะออกแบบให้เป็น "วิธีจับคู่ทางที่สอง" ของกลุ่มคำนั้น ๆ
-- พอคลังกลายเป็นความรู้ของ ChatBot ที่ตอบทุกคำถาม การบังคับผูกจึงไม่มีความหมาย
--
-- ADDITIVE: คลาย NOT NULL อย่างเดียว แถวเดิมที่มี keywordId ยังถูกต้องและทำงานเหมือนเดิมทุกแถว
ALTER TABLE "AutoReplyQna" ALTER COLUMN "keywordId" DROP NOT NULL;

-- query ของ ChatBot: ข้อที่ใช้งานอยู่ทั้งร้าน (ไม่สนกลุ่ม) — index เดิมขึ้นต้นด้วย keywordId
-- จึงใช้กับ query นี้ไม่ได้
CREATE INDEX IF NOT EXISTS "AutoReplyQna_shopId_isActive_useCount_idx"
  ON "AutoReplyQna"("shopId", "isActive", "useCount" DESC);
