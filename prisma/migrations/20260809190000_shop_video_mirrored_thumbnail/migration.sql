-- ShopVideo: สำเนารูปปกคลิปในสตอเรจของเรา
--
-- ทำไม: thumbnailUrl ที่เก็บอยู่เป็น URL ของ fbcdn/cdninstagram ซึ่งมีอายุจำกัด (สังเกตจริง ~4 วัน)
-- พอหมดอายุ กริดคลิปในหน้าร้านสาธารณะจะกลายเป็นช่องเทาเปล่าทั้งแผงโดยไม่มี error ที่ไหนเลย
-- (ProfileHero/ShopVideos ใช้ onError ซ่อนรูป = ล้มเงียบตามดีไซน์) คู่คอลัมน์นี้เหมือนกับ
-- FacebookPost.mirroredFileId/mirroredAt ที่ feature 00035 ทำไว้แล้วสำหรับบล็อกโพสต์
--
-- additive ล้วน: ไม่มี NOT NULL ไม่มี default ไม่แตะแถวเดิม — แถวที่มีอยู่ยังใช้ thumbnailUrl
-- เป็น fallback ต่อไปจนกว่าร้านจะกดบันทึกคลิปใหม่ (ตอนนั้น service จะ mirror ให้เอง)
ALTER TABLE "ShopVideo" ADD COLUMN "mirroredFileId" TEXT;
ALTER TABLE "ShopVideo" ADD COLUMN "mirroredAt" TIMESTAMP(3);
