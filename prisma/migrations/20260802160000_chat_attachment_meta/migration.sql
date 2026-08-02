-- feature 00018 ext · แนบไฟล์ได้หลายไฟล์ทุกชนิดในหน้าแชท (user สั่ง 2026-08-02)
--
-- "ตอน attach รูปในหน้า chat มันทำได้ทีละ 1 อยากให้ทำได้ multiple ไม่จำกัด
--  และต้องรองรับทุกรูป ทุกไฟล์"
--
-- storage ตั้งชื่อไฟล์จริงเป็น YYYY/MM/DD/uuid.ext ชื่อที่ผู้ส่งเลือกจึงหายทั้งหมด
-- ตอนที่แนบได้แต่รูปเรื่องนี้ไม่สำคัญ (รูปดูด้วยตา) แต่พอแนบเอกสารได้ "ใบเสนอราคา-สมชาย.pdf"
-- กับ "6f1c….pdf" ต่างกันมากทั้งบนบับเบิลและตอนกดบันทึก
--
-- nullable ทั้งคู่ ไม่มี default ไม่ backfill — แถวเก่าคงเป็น NULL แล้ว UI fallback เป็น
-- "ไฟล์แนบ.<ext>" ให้เอง (attachmentDisplayName ใน src/lib/chat-attachment.ts)
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentName" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentSize" INTEGER;

-- lookup ย้อนกลับ fileId → ข้อความ ให้ auth gate ของเอกสารแนบใน /api/files/[...fileId]
-- (เอกสารที่แนบในแชทต้องล็อกอินถึงเปิดได้ ต่างจากรูปที่ยัง public ตามเดิม)
--
-- CONCURRENTLY ไม่ได้ใช้ตั้งใจ: prisma migrate deploy ห่อทุก statement ในทรานแซกชันเดียว
-- ซึ่ง CREATE INDEX CONCURRENTLY ทำในทรานแซกชันไม่ได้ ตารางนี้ยังอยู่ในระดับหลักหมื่นแถว
-- การล็อกเขียนช่วงสั้น ๆ ตอน deploy จึงรับได้ — ถ้าโตถึงระดับล้านแถวค่อยแยกไปสร้างมือ
CREATE INDEX IF NOT EXISTS "ChatMessage_imageUrl_idx" ON "ChatMessage"("imageUrl");
