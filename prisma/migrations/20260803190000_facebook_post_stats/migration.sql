-- feature 00029 — ตัวเลข engagement + ชนิดสื่อของโพสต์ (user สั่ง 2026-08-03 พร้อมภาพหน้าโพสต์
-- ของ Facebook: "ให้มีวิดีโอ เหมือนกัน มียอด like, comment, share เหมือนกัน")
--
-- เก็บเป็นคอลัมน์ ไม่ยิง Graph ทุกครั้งที่เปิดหน้า: รายการซ้ายแสดง 25 โพสต์พร้อมกัน ถ้าดึงสดต่อโพสต์
-- = 25 คำขอต่อการเปิดแท็บหนึ่งครั้ง ชน rate limit แน่นอน. ค่าพวกนี้ "เก่าได้" (ยอดไลก์ช้าไป 5 นาที
-- ไม่มีผลต่อการตัดสินใจตอบคอมเมนต์) จึงรีเฟรชตอนเปิดโพสต์แบบ throttle เหมือน backfill
--
-- ทุกคอลัมน์ nullable ไม่มี default — แยก "ยังไม่เคยดึง" (NULL) ออกจาก "ดึงแล้วได้ 0" ได้จริง
-- ADD COLUMN nullable = metadata-only ใน PostgreSQL 11+ ไม่ rewrite ตาราง

ALTER TABLE "FacebookPost" ADD COLUMN "mediaType" TEXT;
ALTER TABLE "FacebookPost" ADD COLUMN "reactionCount" INTEGER;
ALTER TABLE "FacebookPost" ADD COLUMN "fbCommentCount" INTEGER;
ALTER TABLE "FacebookPost" ADD COLUMN "shareCount" INTEGER;
ALTER TABLE "FacebookPost" ADD COLUMN "statsSyncedAt" TIMESTAMP(3);
