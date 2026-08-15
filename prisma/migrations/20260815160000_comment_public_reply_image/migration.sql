-- 00038 ส่วนขยาย E1 (2026-08-15) — แนบรูปไปกับคำตอบใต้คอมเมนต์อัตโนมัติ
--
-- ที่มา (user): *"สามารถ add image เพื่อ reply + image ได้ไหม"*
--
-- ท่อส่งรูปมีอยู่แล้วและใช้งานจริงบน prod มาตั้งแต่ 2026-08-03: `replyToComment()` รับ `fileId`
-- แล้วแปลงเป็น presigned URL ส่งเป็น `attachment_url` เข้า POST /{comment-id}/comments พร้อม
-- `message` ในคำขอเดียว (คอมเมนต์ Facebook ส่งรูป+ข้อความพร้อมกันได้ ต่างจาก Send API ของแชท)
-- พิสูจน์จากฐาน prod วันที่เขียน migration นี้: คำตอบของเพจ **134 จาก 544 ใบมีรูปแนบจริง**
-- ขาดอย่างเดียวคือโหมด "ตอบอัตโนมัติ" ส่ง fileId เป็น null ทุกครั้ง เพราะไม่มีที่เก็บค่าตั้งต้น
--
-- 🛑 เก็บ **fileId** ห้ามเก็บ URL — presigned URL อายุ 1 ชม. ค่าที่เก็บไว้ในคอลัมน์ตั้งค่าจะตาย
-- ภายในชั่วโมงเดียวโดยไม่มีอะไรฟ้อง (คลาสเดียวกับ FacebookPost.thumbnailUrl ที่หายเองใน 4 วัน)
-- ตัว URL ต้องถูกสร้างใหม่ทุกครั้งที่ยิง ซึ่ง replyToComment() ทำให้อยู่แล้ว
--
-- additive ล้วน: คอลัมน์ nullable ตัวเดียว ไม่มี default ไม่มี constraint ไม่แตะข้อมูลเดิม
-- แถวเดิมทั้งหมดได้ NULL = "ไม่แนบรูป" ซึ่งตรงกับพฤติกรรมวันนี้เป๊ะ

ALTER TABLE "ShopChannel" ADD COLUMN IF NOT EXISTS "commentPublicReplyFileId" TEXT;
