-- ผูกออเดอร์ ↔ ช่องทางที่ลูกค้าทักเข้ามา (user สั่ง 2026-08-10)
--
-- ทำไมต้องมี: หน้า `/orders` แสดง "ที่มา" ของออเดอร์เป็นรูปเพจ + badge แพลตฟอร์ม แต่ตอนนี้
-- หารูปเพจด้วยท่าชั่วคราว (query ShopChannel ของร้านแล้วใช้ได้ต่อเมื่อร้านมีช่องทางเดียว)
-- ร้านหลายเพจหรือช่องทาง LINE จึงตกไปเป็นโลโก้แพลตฟอร์มเปล่า ๆ เสมอ — createOrder รับ
-- conversationId เข้ามาอยู่แล้วแต่ใช้ผูก Customer แล้วทิ้ง ไม่เคยเก็บว่ามาจากช่องทางไหน
--
-- เขียนมือทั้งไฟล์ ไม่ได้ใช้ `prisma migrate dev` (Hard Rule 14 — คำสั่งนั้นต้องมี shadow DB
-- ซึ่ง Prisma drop schema ทิ้งเสมอ และเคยล้างฐาน prod มาแล้วทั้ง 64 ตาราง 2026-07-31)
--
-- additive ล้วน: เพิ่มคอลัมน์ nullable เดียว ไม่มี default → ไม่ rewrite ตาราง ไม่แตะข้อมูลเดิม
-- ไม่มี UPDATE/DELETE/ALTER ใด ๆ ต่อแถวที่มีอยู่ — แถวเก่าทุกใบได้ NULL = "สร้างออกนอกแชท"
-- `IF NOT EXISTS` ทุกคำสั่ง เผื่อไฟล์นี้ถูกรันซ้ำบนฐานที่ apply ไปแล้วบางส่วน (dev/prod คนละฐาน)
--
-- 🛑 shopChannelId ≠ salesChannel — ดูคอมเมนต์เต็มที่ field ใน prisma/schema.prisma (model Order)
--    salesChannel = หมวดที่ร้านเลือก/แก้เองได้ในฟอร์ม (ข้อความอิสระ ไม่ผูก FK)
--    shopChannelId = ข้อเท็จจริงว่ามาจากกล่องแชทไหน (set ครั้งเดียวตอนสร้าง ไม่มีหน้าจอแก้)

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shopChannelId" TEXT;

-- รองรับหน้า /orders คอลัมน์ "ที่มา" (join ShopChannel เพื่อดึงรูป/ชื่อ) + backfill/lookup รายช่องทาง
CREATE INDEX IF NOT EXISTS "Order_shopChannelId_idx" ON "Order" ("shopChannelId");

-- ON DELETE SET NULL: ร้านถอดการเชื่อมต่อเพจ/LINE OA ได้ตลอด ออเดอร์เดิมต้องไม่หายตาม
-- (ประวัติการขายของร้าน) และต้องไม่บล็อกการลบช่องทาง (ห้าม Restrict/Cascade เด็ดขาด)
DO $$ BEGIN
    ALTER TABLE "Order"
        ADD CONSTRAINT "Order_shopChannelId_fkey"
        FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Rollback (manual, ไม่ต้องใช้ตอน deploy ปกติ):
--   ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_shopChannelId_fkey";
--   DROP INDEX IF EXISTS "Order_shopChannelId_idx";
--   ALTER TABLE "Order" DROP COLUMN IF EXISTS "shopChannelId";
