-- feature 00018 fix: ย้าย Facebook/Instagram Page จากร้านหนึ่งไปอีกร้านไม่ได้
--
-- ปัญหาเดิม: @@unique([provider, externalId]) คลุมทั้งตาราง แม้แถวจะถูก "ถอด" แล้ว
-- (status='DISCONNECTED') ก็ยังกอด unique key ไว้ตลอดกาล → เชื่อมเพจเดิมเข้าร้านใหม่ชน P2002
-- ถูกตีความว่า "ร้านอื่นยึดไปแล้ว" (skipped) ทั้งที่จริง ๆ ร้านเดิม "ปล่อย" เพจนี้ไปแล้ว
--
-- แก้โดยเปลี่ยนขอบเขตกติกาจาก "1 เพจ 1 ร้านตลอดกาล" → "1 เพจ ACTIVE ได้ทีละร้านเดียว"
-- (BR-FBC-01 เปลี่ยนขอบเขต ไม่ใช่ยกเลิก) ด้วย partial unique index ที่กรองเฉพาะแถวที่ยังไม่ถูกถอด
--
-- ห้าม DROP TABLE/COLUMN และไม่มี data migration ต้องทำ (ไม่มีการลบ/ย้าย/backfill ข้อมูลใด ๆ
-- แถวเดิมทุกแถว รวมแถว DISCONNECTED ที่มีอยู่ ยังอยู่ครบ — ประวัติแชทของร้านเดิมไม่กระทบ)
--
-- ก่อน apply เช็คแล้ว (2026-07-22): ไม่มี 2 แถว ACTIVE/TOKEN_INVALID ที่ (provider, externalId)
-- ซ้ำกันอยู่ในข้อมูลปัจจุบัน — ปลอดภัยที่จะสร้าง partial unique index

-- 1) ลบ unique constraint เดิมที่คลุมทั้งตาราง (รวมแถว DISCONNECTED ด้วย) — คือตัวบล็อกการย้ายเพจ
DROP INDEX "ShopChannel_provider_externalId_key";

-- 2) index ปกติ (ไม่ unique) แทนที่ไว้ ให้ query ที่ filter (provider, externalId) ยังเร็วเหมือนเดิม
--    ตรงกับ @@index([provider, externalId]) ใน schema.prisma — ใช้โดย getChannelByExternalId
--    (webhook หา channel จาก pageId) และ upsertChannel (เช็คว่าใครยึด externalId นี้อยู่)
CREATE INDEX "ShopChannel_provider_externalId_idx" ON "ShopChannel"("provider", "externalId");

-- 3) partial unique index — unique เฉพาะแถวที่ "ยังไม่ถูกถอด" (ACTIVE หรือ TOKEN_INVALID)
--    ยังกัน 2 ร้านแย่งเชื่อมเพจเดียวกันพร้อมกันได้เหมือนเดิม (BR-FBC-01) แต่แถว DISCONNECTED
--    เก่าจะไม่ถูกนับ — ร้านใหม่เชื่อมเพจเดิมได้โดยสร้างแถวใหม่ (แถวเก่ายังอยู่เพื่อประวัติแชท เพราะ
--    Conversation.shopChannelId เป็น onDelete: Cascade ถ้าลบแถวเก่าจะลากแชท+ลูกค้าทั้งหมดหายไปด้วย)
CREATE UNIQUE INDEX "ShopChannel_provider_externalId_active_key"
  ON "ShopChannel"("provider", "externalId")
  WHERE "status" <> 'DISCONNECTED';

-- Rollback note: ถ้าต้องย้อนกลับ ต้อง DROP INDEX ทั้งสองตัวข้างบนก่อน แล้ว
-- CREATE UNIQUE INDEX "ShopChannel_provider_externalId_key" ON "ShopChannel"("provider","externalId")
-- ทำได้เฉพาะตอนไม่มีแถวซ้ำ (provider, externalId) ข้าม status อยู่ในตาราง — ถ้ามี (เช่น หลัง
-- เชื่อมเพจเดิมเข้าร้านใหม่ตาม fix นี้ไปแล้ว) ต้องลบ/รวมแถวซ้ำก่อน ไม่งั้น CREATE UNIQUE จะ fail
