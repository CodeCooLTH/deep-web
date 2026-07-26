-- feature 00018 E5 รอบสอง (user report prod 2026-07-26): แบนเนอร์โชว์ "video v3"/"โพสแนวตั้ง"
-- ซึ่งเป็น **ชื่อ ad ที่ร้านตั้งใน Ads Manager** ไม่ใช่ข้อความโฆษณา — ผู้ขายอ่านแล้วไม่รู้ว่าเป็น
-- โฆษณาชิ้นไหน
--
-- ข้อความจริงที่ลูกค้าเห็น (ตัวเดียวกับที่แอป Messenger แสดง) อยู่ที่ "โพสต์" ของโฆษณา ต้องดึงเพิ่ม
-- ด้วย GET /{pageId}_{postId}?fields=message,full_picture (ทดสอบกับเพจจริงแล้ว) — เก็บแยกจาก
-- adTitle เพราะชื่อ ad ยังมีประโยชน์ตอนไล่เทียบใน Ads Manager คู่กับ adId
--
-- additive ล้วน. DB dev/prod ใช้ร่วมกัน — apply ด้วย `prisma migrate deploy` เท่านั้น
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "referralAdBody" TEXT;
ALTER TABLE "ConversationAdReferral" ADD COLUMN IF NOT EXISTS "adBody" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "referralAdPermalink" TEXT;
ALTER TABLE "ConversationAdReferral" ADD COLUMN IF NOT EXISTS "adPermalink" TEXT;
