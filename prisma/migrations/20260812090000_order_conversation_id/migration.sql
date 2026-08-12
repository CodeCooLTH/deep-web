-- ผูกออเดอร์ ↔ เธรดแชทที่สร้างออเดอร์นี้จริง ๆ (2026-08-12)
--
-- ทำไมต้องมีทั้งที่มี Order.shopChannelId (2026-08-10) อยู่แล้ว: shopChannelId ชี้ระดับ
-- "เพจ/LINE OA" เท่านั้น — ปุ่ม "เปิดแชท" ในหน้า /orders (OrdersTable.tsx) ต้องรู้ระดับ "ห้อง"
-- (เธรดของคนคนเดียว) ปัจจุบัน resolve ผ่าน Order → Customer → Conversation โดย join ด้วย
-- เบอร์โทร (orders/page.tsx: convByCustomer.get(o.customerId) ?? convByBuyer.get(o.buyerUserId))
-- ลูกค้าที่มีมากกว่า 1 เธรด (ทัก FB แล้วย้ายไป LINE, หรือร้านมี ≥2 เพจ) จึงพาไปเธรดที่ผิดได้
-- เพราะ map คืนเธรดไหนก็ได้ของลูกค้าคนนั้น ไม่ใช่เธรดที่สร้างออเดอร์ใบนี้จริง
--
-- 🛑 จงใจ "ไม่ backfill" ออเดอร์เก่า: วิธีเดียวที่จะเติมค่าย้อนหลังได้คือ derive ด้วยวิธีเดิม
-- (เดาจากเบอร์โทร) ซึ่งเป็นต้นเหตุของบั๊กนี้เอง — เขียนค่าที่รู้อยู่แล้วว่าอาจชี้ผิดใบลงฐานถาวร
-- จะทำให้แยกไม่ออกอีกต่อไปว่าแถวไหนเป็นข้อเท็จจริงจากตอนสร้างออเดอร์ แถวไหนเป็นการเดา
-- ออเดอร์เก่าทุกใบปล่อย NULL แล้วให้ฝั่งอ่าน fallback ไปใช้ map เดิม (พฤติกรรมเดิมทุกประการ)
--
-- เขียนมือทั้งไฟล์ ไม่ได้ใช้ `prisma migrate dev` (Hard Rule 14 — คำสั่งนั้นต้องมี shadow DB
-- ซึ่ง Prisma drop schema ทิ้งเสมอ และเคยล้างฐาน prod มาแล้วทั้ง 64 ตาราง 2026-07-31)
--
-- additive ล้วน: เพิ่มคอลัมน์ nullable เดียว ไม่มี default → ไม่ rewrite ตาราง ไม่แตะข้อมูลเดิม
-- ไม่มี UPDATE/DELETE/ALTER ใด ๆ ต่อแถวที่มีอยู่ — แถวเก่าทุกใบได้ NULL = "ไม่รู้เธรดต้นทาง"
-- `IF NOT EXISTS` ทุกคำสั่ง เผื่อไฟล์นี้ถูกรันซ้ำบนฐานที่ apply ไปแล้วบางส่วน (dev/prod คนละฐาน)
--
-- 🛑 conversationId ≠ shopChannelId — ดูคอมเมนต์เต็มที่ field ใน prisma/schema.prisma (model Order)
--    shopChannelId  = ระดับเพจ/LINE OA (ช่องทาง)
--    conversationId = ระดับห้องแชทเดียวเป๊ะ (เธรดของคนคนเดียว) — เขียนครั้งเดียวตอน createOrder
--    จาก conversationId ที่ caller ส่งเข้ามาอยู่แล้ว ไม่มีหน้าจอให้ร้านแก้ทีหลัง
--
-- 🛑 ห้ามแตะ Conversation.customerId หรือ relinkThreadCustomer — คนละกลไก ไม่เกี่ยวกับ migration นี้

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "conversationId" TEXT;

-- รองรับปุ่ม "เปิดแชท" หาเธรดต้นทางของออเดอร์นี้ตรง ๆ (แทนการเดาจาก Customer)
CREATE INDEX IF NOT EXISTS "Order_conversationId_idx" ON "Order" ("conversationId");

-- ON DELETE SET NULL: ร้านลบ/ถอดเธรดได้ตลอด (เช่นลบบัญชีลูกค้า/ล้างประวัติแชท) ออเดอร์เดิม
-- ต้องไม่หายตาม (ประวัติการขายของร้าน) และต้องไม่บล็อกการลบเธรด (ห้าม Restrict/Cascade เด็ดขาด
-- — แพตเทิร์นเดียวกับ Order_shopChannelId_fkey)
DO $$ BEGIN
    ALTER TABLE "Order"
        ADD CONSTRAINT "Order_conversationId_fkey"
        FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Rollback (manual, ไม่ต้องใช้ตอน deploy ปกติ):
--   ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_conversationId_fkey";
--   DROP INDEX IF EXISTS "Order_conversationId_idx";
--   ALTER TABLE "Order" DROP COLUMN IF EXISTS "conversationId";
