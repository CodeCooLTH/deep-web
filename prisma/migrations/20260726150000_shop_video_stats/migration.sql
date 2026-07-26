-- ShopVideo: ชื่อบัญชีต้นทาง + ยอดไลก์/คอมเมนต์/วิว (2026-07-26)
--
-- เป็น snapshot ณ เวลาที่ร้านกดเลือก ไม่ใช่ค่าสด — การยิง API ของแพลตฟอร์มทุกครั้งที่มีคน
-- เปิดหน้าร้านจะช้าและชนลิมิต ค่าจะอัปเดตเมื่อร้านกดบันทึกใหม่
--
-- viewCount เผื่อไว้ก่อน: Instagram ให้ไม่ได้จนกว่าจะขอ scope instagram_manage_insights
-- (ทดสอบกับบัญชีจริงแล้วได้ error #10 Application does not have permission)
-- ส่วน TikTok video.list ให้ view_count มาพร้อมกันอยู่แล้ว
--
-- nullable ทั้งหมด ไม่ต้อง backfill — แถวเดิมที่ยังไม่มีข้อมูลจะไม่แสดงตัวเลข
ALTER TABLE "ShopVideo" ADD COLUMN "accountName" TEXT;
ALTER TABLE "ShopVideo" ADD COLUMN "likeCount" INTEGER;
ALTER TABLE "ShopVideo" ADD COLUMN "commentCount" INTEGER;
ALTER TABLE "ShopVideo" ADD COLUMN "viewCount" INTEGER;
