-- ChatMessage.updatedAt — แกนที่ 2 ของ delta (ดูคอมเมนต์ใน schema.prisma)
--
-- 🛑 lock ที่ไฟล์นี้ถือจริง: Prisma/Postgres รันทุกคำสั่งในไฟล์ migration เดียวกันในทรานแซกชันเดียว
-- ⇒ ACCESS EXCLUSIVE ของ ADD COLUMN บน "ChatMessage" และ "Conversation" ถูกถือไว้จน COMMIT และ
-- ACCESS EXCLUSIVE บล็อก **ทั้งการอ่านและการเขียน** ⇒ ห้ามมีคำสั่งที่ใช้เวลาตามขนาดตารางในไฟล์นี้เลย:
--   · ห้าม ADD COLUMN + UPDATE ทุกแถว + SET NOT NULL (prod 2026-09-14: ~106,000 แถว / heap 112 MB)
--   · ห้าม CREATE INDEX — แยกไปไฟล์ 20260914150100_chat_message_updated_at_index แล้ว (R30):
--     ถ้าอยู่ในไฟล์นี้ lock ที่บล็อกการอ่านจะถูกถือยาวตลอดการสร้าง index ทั้งตาราง
--
-- ใช้ fast default ของ Postgres 11+ แทน: ค่าตั้งต้นที่เป็นค่าคงที่ = เขียนแค่ metadata ไม่ rewrite
-- ไม่ scan ⇒ ทุกคำสั่งในไฟล์นี้เป็น metadata ล้วน เมื่อได้ lock แล้วถือไว้แค่เสี้ยววินาที · แถวเดิมจึงได้
-- 1970-01-01 (= "ไม่เคยถูกแก้ตั้งแต่เริ่มติดตาม") ซึ่งฝั่งอ่านต้องใช้ max(createdAt, updatedAt) เป็น
-- watermark เสมอ (src/lib/chat-message-store.ts) ไม่งั้นแถวเก่าจะหลุดเข้า delta ทั้งเธรด
--
-- ช่วงเสี่ยงเดียวคือ "รอคิว lock": ถ้ามีทรานแซกชันยาวถือ ChatMessage อยู่ ADD COLUMN ต้องรอจนมันจบ
-- และระหว่างรอ คำขอที่มาทีหลัง (รวม SELECT) ต่อคิวหลังมัน ⇒ ห้องแชทค้างชั่วคราว แล้วคลายเองทันที
-- ที่ทรานแซกชันนั้นจบ (ALTER ได้ lock → จบในเสี้ยววินาที → COMMIT)
--
-- 🛑 จงใจไม่ใส่ lock_timeout: migration ที่ล้มเพราะหมดเวลา ถูก Prisma บันทึกเป็น failed ใน
-- _prisma_migrations แล้ว `migrate deploy` ทุกครั้งถัดไปหยุดด้วย P3009 จนกว่าจะมีคนรัน
-- `prisma migrate resolve --rolled-back` ชี้ prod ด้วยมือ — "push ใหม่" แก้ไม่ได้ ซึ่งขัด HR15
-- (ห้ามต้องสั่งคำสั่ง Prisma ชี้ prod จากเครื่อง dev ไม่ว่ากรณีใด) ⇒ ยอมค้างชั่วคราวที่คลายเอง
-- ดีกว่า deploy ที่ติดตายรอคนแก้บน prod

ALTER TABLE "ChatMessage" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00';
ALTER TABLE "ChatMessage" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Conversation.metaBackfilledAt — ธง "ไล่ย้อนจาก Meta ครบถึงวันสร้างเธรดแล้ว"
ALTER TABLE "Conversation" ADD COLUMN "metaBackfilledAt" TIMESTAMP(3);
