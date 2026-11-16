-- 00095 ส่วนต่อขยาย FR-FA-7/BR-FA-10 — ตั้งได้ว่าเมื่อลูกค้าตอบกลับ (บอทหยุด) ส่งห้องต่อให้แอดมินหรือ Meta AI · additive ล้วน
-- default 'ADMIN' = พฤติกรรมเดิม (ห้องอยู่กับแอดมิน)
ALTER TABLE "SalesFollowBot" ADD COLUMN "replyHandoff" TEXT NOT NULL DEFAULT 'ADMIN';
ALTER TABLE "SalesFollowBot" ADD CONSTRAINT "SalesFollowBot_replyHandoff_check" CHECK ("replyHandoff" IN ('ADMIN','META_AI'));
