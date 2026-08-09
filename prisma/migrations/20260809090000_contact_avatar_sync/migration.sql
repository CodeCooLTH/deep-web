-- รูปโปรไฟล์ผู้ติดต่อ: คุมรอบการลองดึงใหม่ (feature 00018 ส่วนขยาย 2026-08-09)
--
-- additive ล้วน: คอลัมน์ใหม่ nullable ไม่มี default ไม่แตะข้อมูลเดิม
-- แถวเดิมทั้ง 1,454 แถวได้ NULL = "ยังไม่เคยลอง" → รอบแรกหลัง deploy จะลองให้ทุกคนหนึ่งครั้ง
-- แล้วเว้นไป 7 วันตาม AVATAR_RETRY_INTERVAL_MS (ดู channel-chat.service.ts)
ALTER TABLE "ExternalContact"
  ADD COLUMN "avatarSyncedAt" TIMESTAMP(3);

COMMENT ON COLUMN "ExternalContact"."avatarSyncedAt" IS
  'เวลาที่ลองดึงรูปโปรไฟล์จาก Graph ครั้งล่าสุด (สำเร็จหรือไม่ก็ตาม) — NULL = ยังไม่เคยลอง';

COMMENT ON COLUMN "ExternalContact"."avatarUrl" IS
  'fileId ใน storage เรา (mirror แล้ว ไม่หมดอายุ) — ค่าที่ขึ้นต้น http คือ URL ดิบของ Meta ที่ mirror ไม่ผ่านและหมดอายุได้';
