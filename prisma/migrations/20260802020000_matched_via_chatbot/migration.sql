-- feature 00023 · ChatBot ตอบจากคลังความรู้ — เพิ่มค่า 'CHATBOT' ให้ matchedVia
--
-- CHECK เดิมอนุญาตแค่ KEYWORD/QNA ถ้าไม่แก้ การบันทึกคำตอบจาก ChatBot จะ insert ไม่ผ่าน
-- แล้วทั้ง job ล้ม (บันทึกอยู่ในเส้นทางเดียวกับการตอบ) — ต้องมาก่อนโค้ดที่เขียนค่านี้เสมอ
ALTER TABLE "AutoReplyLog" DROP CONSTRAINT IF EXISTS "AutoReplyLog_matched_via_check";
ALTER TABLE "AutoReplyLog" ADD CONSTRAINT "AutoReplyLog_matched_via_check"
  CHECK ("matchedVia" IS NULL OR "matchedVia" IN ('KEYWORD', 'QNA', 'CHATBOT'));
