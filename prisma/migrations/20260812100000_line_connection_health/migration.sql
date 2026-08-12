-- ความทนของการเชื่อมต่อ LINE (ส่วนขยาย 00025, 2026-08-12)
--
-- additive ล้วน: เพิ่ม 5 คอลัมน์บน "ShopChannel" ไม่มี backfill ไม่มี index ใหม่ ไม่แตะ
-- constraint เดิม — แถวที่มีอยู่ได้ NULL (และ 0 สำหรับตัวนับ) ซึ่งแปลว่า "ยังไม่เคยตรวจ"
-- ตรงตามความหมายที่ resolveLineChannelHealth() คาดไว้พอดี (ยังไม่เคยตรวจ ≠ ตรวจแล้วไม่ผ่าน)
--
-- 🛑 ห้ามแก้ไฟล์นี้เป็นการ "ลบแล้วสร้างใหม่" ของคอลัมน์ใด ๆ — คอลัมน์กลุ่มนี้อยู่แถวเดียวกับ
-- accessTokenEnc/channelSecretEnc ซึ่งเป็น credential ของร้านจริง

ALTER TABLE "ShopChannel" ADD COLUMN IF NOT EXISTS "lineTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "ShopChannel" ADD COLUMN IF NOT EXISTS "lineTokenCheckedAt" TIMESTAMP(3);
ALTER TABLE "ShopChannel" ADD COLUMN IF NOT EXISTS "lineLastInboundFailAt" TIMESTAMP(3);
ALTER TABLE "ShopChannel" ADD COLUMN IF NOT EXISTS "lineLastInboundFailReason" TEXT;
ALTER TABLE "ShopChannel" ADD COLUMN IF NOT EXISTS "lineInboundFailCount" INTEGER NOT NULL DEFAULT 0;
